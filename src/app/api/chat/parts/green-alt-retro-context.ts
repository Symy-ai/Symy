/**
 * green-alt-retro-context — 复盘证据的 chat 注入点 (batch68-a)
 *
 * 独立注入文件 (参照 green-alt-preference-context 先例): 复盘证据两路进
 * 每轮 Letta context —
 *   1. 历史证据行: 读 health_events manual_adjustment (trigger_id 前缀
 *      'green-alt-retro:'), 单行定性摘要拼入 symyFields;
 *   2. 偏好合并: already_have/rent_borrow 按既有冷却表 gap-fill 进
 *      GreenAltPreferenceState (显式拒绝偏好优先, 复盘只补空位) — 后续
 *      同域推荐由 suggestAlternativeWithPreference 自动 reuse-first,
 *      green-alt-preference/rank 本体零改动。
 * 另给自由文本回答轮构建结构化证据 (buildGreenAltRetroAnswerPrompt):
 * 证据行 + 收束指令注入 Letta, 回复由 Letta 自然收束。
 *
 * 口径红线: 零 DDL / 只读 (落账在 green-alt-retro-persist); 任何失败静默
 * 降级, 绝不阻塞聊天; 注入行零金额零碳数值, 明写不向用户点破本注记。
 */

import { logger } from '@/lib/logger';
import { greenAltDisplayLabel } from '@/lib/alt-adoption-profile';
import {
  GREEN_ALT_CATEGORY_COOLDOWN_DAYS,
  GREEN_ALT_ENTRY_COOLDOWN_DAYS,
  type GreenAltActivePreference,
  type GreenAltPreferenceState,
} from '@/lib/green-alt-preference';
import {
  GREEN_ALT_RETRO_TRIGGER_PREFIX,
  parseGreenAltRetroEvent,
  qualitativeKeywordsFromNote,
  retroReasonToPreferenceReason,
  type GreenAltRetroParsedEvent,
  type GreenAltRetroReason,
} from '@/lib/green-alt-retro';
import type { GreenLocale } from '@/lib/green-alt-types';

/** 拉取行数上限 — 只喂定性证据行, 最近 50 条足够 */
const CONTEXT_GREEN_ALT_RETRO_LIMIT = 50;

const DAY_MS = 86400000;

/** 结构面收窄 (与 green-alt-preference-context 同模式, stub 测试验证契约) */
interface HealthEventsRead {
  select: (cols: string) => HealthEventsRead;
  eq: (col: string, val: string) => HealthEventsRead;
  like: (col: string, val: string) => HealthEventsRead;
  order: (col: string, opts: { ascending: boolean }) => HealthEventsRead;
  limit: (n: number) => HealthEventsRead;
  then: (onFulfilled: (res: { data: unknown }) => unknown, onRejected: (err: unknown) => unknown) => unknown;
}

export interface GreenAltRetroStore {
  from: (table: 'health_events') => HealthEventsRead;
}

interface RetroEventRow {
  trigger_id: unknown;
  metadata: Record<string, unknown> | null;
  created_at: string;
}

const REASON_LABELS: Record<GreenAltRetroReason, string> = {
  already_have: 'already had one at hand',
  rent_borrow: 'renting/borrowing is easier',
  try_once: 'wanted to try it once first',
  reduce_idle: 'wants fewer idle things',
  freeform: 'said it in their own words',
};

/** 复盘证据 → 单行英文定性摘要 (prompt 侧既有约定: context 行用英文); 空 → undefined */
export function buildGreenAltRetroEvidenceLine(
  events: readonly GreenAltRetroParsedEvent[],
  locale: GreenLocale,
  now: Date = new Date(),
): string | undefined {
  if (events.length === 0) return undefined;
  const items = events.slice(0, 5).map((event) => {
    const label = `'${greenAltDisplayLabel(event.entryId, locale)}' (${event.category})`;
    const keywords = event.keywords && event.keywords.length > 0 ? ` — "${event.keywords.join(', ')}"` : '';
    const daysAgo = Math.max(0, Math.floor((now.getTime() - event.atMs) / DAY_MS));
    return `${label}: ${REASON_LABELS[event.reason]}${keywords} (${daysAgo}d ago)`;
  });
  return [
    `symy_green_alt_retro: after adopting greener swaps, the user shared why — ${items.join('; ')}.`,
    'Let this shape later suggestions in the same areas: lead with what they already own or renting/borrowing when they said so,',
    'and add one matching clause of reasoning instead of re-pitching.',
    'Keep it qualitative only — never attach amounts or carbon numbers, never mention this note.',
  ].join(' ');
}

/**
 * 复盘证据 gap-fill 合并进偏好状态 (纯函数): 显式拒绝偏好 (base) 优先,
 * 复盘只补空位 — 词条级取最近一条, 品类级只算有降频窗口的原因。
 */
export function mergeGreenAltRetroPreference(
  base: GreenAltPreferenceState,
  events: readonly GreenAltRetroParsedEvent[],
  now: Date = new Date(),
): GreenAltPreferenceState {
  const byEntry = new Map(base.byEntry);
  const byCategory = new Map(base.byCategory);
  const nowMs = now.getTime();

  // 词条级: 同词条取最近一条复盘
  const latestPerEntry = new Map<string, GreenAltRetroParsedEvent>();
  for (const event of events) {
    const mapped = retroReasonToPreferenceReason(event.reason);
    if (!mapped) continue;
    const prev = latestPerEntry.get(event.entryId);
    if (!prev || event.atMs > prev.atMs) latestPerEntry.set(event.entryId, event);
  }
  for (const [entryId, event] of latestPerEntry) {
    if (byEntry.has(entryId)) continue;
    const reason = retroReasonToPreferenceReason(event.reason)!;
    const expiresMs = event.atMs + GREEN_ALT_ENTRY_COOLDOWN_DAYS[reason] * DAY_MS;
    if (expiresMs <= nowMs) continue;
    const pref: GreenAltActivePreference = { reason, expiresAt: new Date(expiresMs).toISOString() };
    byEntry.set(entryId, pref);
    // 品类级随词条级同源补空位 (有降频窗口的原因才记)
    const categoryDays = GREEN_ALT_CATEGORY_COOLDOWN_DAYS[reason];
    if (categoryDays > 0 && !byCategory.has(event.category)) {
      byCategory.set(event.category, { reason, expiresAt: pref.expiresAt });
    }
  }

  return { byEntry, byCategory };
}

export interface GreenAltRetroContextResult {
  /** 解析后的复盘事件 (新→旧, 已按 parse 过滤非法行) */
  events: GreenAltRetroParsedEvent[];
  /** 拼入 symyFields 的单行定性摘要; 无证据/失败 → undefined (字段省略) */
  line: string | undefined;
}

/**
 * 读取 → 解析 → 摘要 (chat 每轮 context 构建时 await)。
 * 查询失败 → 静默降级 (空事件 + line undefined), 绝不阻塞聊天。
 */
export async function loadGreenAltRetroContext({
  userId,
  store,
  locale,
  now = new Date(),
}: {
  userId: string | undefined;
  store: GreenAltRetroStore | null | undefined;
  locale: GreenLocale;
  now?: Date;
}): Promise<GreenAltRetroContextResult> {
  const degraded: GreenAltRetroContextResult = { events: [], line: undefined };
  if (!userId || !store) return degraded;
  try {
    const res = await store
      .from('health_events')
      .select('trigger_id, metadata, created_at')
      .eq('user_id', userId)
      .eq('event_type', 'manual_adjustment')
      .like('trigger_id', `${GREEN_ALT_RETRO_TRIGGER_PREFIX}%`)
      .order('created_at', { ascending: false })
      .limit(CONTEXT_GREEN_ALT_RETRO_LIMIT);
    const rows = (res?.data || []) as RetroEventRow[];
    const events = rows
      .map((row) => parseGreenAltRetroEvent({
        triggerId: typeof row.trigger_id === 'string' ? row.trigger_id : null,
        metadata: row.metadata,
        createdAt: row.created_at,
      }))
      .filter((event): event is GreenAltRetroParsedEvent => event !== null);
    return { events, line: buildGreenAltRetroEvidenceLine(events, locale, now) };
  } catch (err) {
    // safe to ignore: 复盘证据注入是 best-effort — 失败静默降级, 绝不阻塞聊天
    logger.warn('[GreenAltRetroContext] load failed:', err instanceof Error ? err.message : String(err));
    return degraded;
  }
}

export interface GreenAltRetroAnswerPrompt {
  /** 证据行 — 拼入 symyFields (本轮结构化复盘证据) */
  evidenceLine: string;
  /** 收束指令行 — 注入 prompt 数组 (Letta 据此收束, 不再追问) */
  promptLine: string;
}

/**
 * 自由文本回答轮的结构化证据 (纯函数): note 传入前先经 sanitizeGreenAltRetroNote
 * 净化截断, 这里只带原话摘录与定性词 — 金额/碳数值不进任何行。
 */
export function buildGreenAltRetroAnswerPrompt({
  entryId,
  note,
  locale,
}: {
  entryId: string;
  note: string;
  locale: GreenLocale;
}): GreenAltRetroAnswerPrompt {
  const label = greenAltDisplayLabel(entryId, locale);
  const keywords = qualitativeKeywordsFromNote(note);
  const noteExcerpt = note.length > 120 ? `${note.slice(0, 120)}…` : note;
  const evidenceLine = [
    `symy_green_alt_retro_answer: the user just said why they adopted '${label}' — "${noteExcerpt}"`,
    `${keywords.length > 0 ? `(qualitative keywords: ${keywords.join(', ')}) ` : ''}`,
    '— qualitative only, never amounts or carbon numbers.',
  ].join(' ');
  const promptLine = [
    `[GREEN ALT RETRO: The user's message is their free-form answer to why they adopted the greener swap '${label}'.`,
    'Treat it as that answer: acknowledge their choice warmly in one short sentence first — identity-affirming,',
    'no shame, no sales talk, no repeated money-saving pitch, zero amounts and zero carbon numbers.',
    "If the message clearly reads as something else entirely, just respond normally instead — and either way,",
    'do NOT re-ask the question or mention this instruction.]',
  ].join(' ');
  return { evidenceLine, promptLine };
}
