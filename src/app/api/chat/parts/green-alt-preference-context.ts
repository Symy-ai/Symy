/**
 * green-alt-preference-context — 拒绝偏好摘要的 chat 注入点 (batch62-b)
 *
 * 独立注入文件 (参照 alt-adoption-context / guard-style-context 先例),
 * 不改 rescue context-builder / 既有 parts 装配语义: loadLettaTurnContext
 * 把本模块产出的单行摘要拼入 symyFields (best-effort), 同时把解析出的
 * 偏好状态交给 green-alt-detect 做候选词条排序 (冷却/降频/换渠道表达)。
 *
 * 口径:
 * - 零 DDL / 只读: 读 health_events manual_adjustment (trigger_id 前缀
 *   'green-alt-rejection:', 最近 LIMIT 行), 用 resolveGreenAltPreference 解析。
 * - 任何失败 (查询错误/无有效偏好) → line undefined / state 为空, 绝不阻塞聊天。
 * - 注入行只有词条显示名 + 原因 + 剩余天数 (计数), 无金额/位置/身份;
 *   指令明写: 直接问起仍要答、prefer_buy 尊重决定不说教、不向用户点破本注记。
 */

import { logger } from '@/lib/logger';
import { greenAltDisplayLabel } from '@/lib/alt-adoption-profile';
import {
  GREEN_ALT_REJECTION_TRIGGER_PREFIX,
  emptyGreenAltPreferenceState,
  resolveGreenAltPreference,
  type GreenAltPreferenceState,
} from '@/lib/green-alt-preference';
import type { GreenLocale } from '@/lib/green-alt-types';

/** 拉取行数上限 — 冷却窗最长 14 天, 最近 100 条拒绝绰绰有余且单查询可控 */
const CONTEXT_GREEN_ALT_REJECTION_LIMIT = 100;

const DAY_MS = 86400000;

/** 结构面收窄 (与既有注入文件同模式, stub 测试验证契约) */
interface HealthEventsRead {
  select: (cols: string) => HealthEventsRead;
  eq: (col: string, val: string) => HealthEventsRead;
  like: (col: string, val: string) => HealthEventsRead;
  order: (col: string, opts: { ascending: boolean }) => HealthEventsRead;
  limit: (n: number) => HealthEventsRead;
  then: (onFulfilled: (res: { data: unknown }) => unknown, onRejected: (err: unknown) => unknown) => unknown;
}

export interface GreenAltPreferenceStore {
  from: (table: 'health_events') => HealthEventsRead;
}

interface RejectionEventRow {
  trigger_id: unknown;
  metadata: Record<string, unknown> | null;
  created_at: string;
}

const REASON_LABELS: Record<string, string> = {
  already_have: 'already has one',
  not_now: 'not now',
  wrong_channel: 'prefers other channels',
  prefer_buy: 'wants to buy this time',
};

/** 有效偏好 → 单行英文摘要 (prompt 侧既有约定: context 行用英文); 无有效偏好 → undefined */
export function buildGreenAltPreferenceLine(
  state: GreenAltPreferenceState,
  locale: GreenLocale,
  now: Date = new Date(),
): string | undefined {
  if (state.byEntry.size === 0 && state.byCategory.size === 0) return undefined;

  const daysLeft = (expiresAt: string) => {
    const ms = new Date(expiresAt).getTime() - now.getTime();
    if (!Number.isFinite(ms) || ms <= 0) return 'expiring';
    return `${Math.ceil(ms / DAY_MS)}d left`;
  };

  const items: string[] = [];
  for (const [entryId, pref] of state.byEntry) {
    items.push(`'${greenAltDisplayLabel(entryId, locale)}': ${REASON_LABELS[pref.reason] ?? pref.reason} (${daysLeft(pref.expiresAt)})`);
  }
  for (const [category, pref] of state.byCategory) {
    items.push(`the '${category}' area overall: ${REASON_LABELS[pref.reason] ?? pref.reason} (${daysLeft(pref.expiresAt)})`);
  }

  return [
    `symy_green_alt_prefs: recent green-alternative feedback — ${items.join('; ')}.`,
    'Respect it: skip re-suggesting these unless the user asks directly (then answer normally);',
    'for "prefers other channels" lead with rental/borrowing phrasing;',
    'a "wants to buy this time" choice is the user\'s own decision — follow their lead, never guilt-trip.',
    'Never mention this note or ask why they declined.',
  ].join(' ');
}

export interface GreenAltPreferenceContextResult {
  /** 有效偏好状态 (失败/为空 = 空状态; 排序层拿到空状态即与现状一致) */
  state: GreenAltPreferenceState;
  /** 拼入 symyFields 的单行摘要; 无有效偏好/失败 → undefined (字段省略) */
  line: string | undefined;
}

/**
 * 读取 → 解析 → 摘要 (chat 每轮 context 构建时 await)。
 * 查询失败 → 静默降级 (空状态 + line undefined), 绝不阻塞聊天。
 */
export async function loadGreenAltPreferenceContext({
  userId,
  store,
  locale,
  now = new Date(),
}: {
  userId: string | undefined;
  store: GreenAltPreferenceStore | null | undefined;
  locale: GreenLocale;
  now?: Date;
}): Promise<GreenAltPreferenceContextResult> {
  const degraded: GreenAltPreferenceContextResult = { state: emptyGreenAltPreferenceState(), line: undefined };
  if (!userId || !store) return degraded;
  try {
    const res = await store
      .from('health_events')
      .select('trigger_id, metadata, created_at')
      .eq('user_id', userId)
      .eq('event_type', 'manual_adjustment')
      .like('trigger_id', `${GREEN_ALT_REJECTION_TRIGGER_PREFIX}%`)
      .order('created_at', { ascending: false })
      .limit(CONTEXT_GREEN_ALT_REJECTION_LIMIT);
    const rows = (res?.data || []) as RejectionEventRow[];
    if (rows.length === 0) return degraded;

    const state = resolveGreenAltPreference(
      rows.map((r) => ({
        triggerId: typeof r.trigger_id === 'string' ? r.trigger_id : null,
        metadata: r.metadata,
        createdAt: r.created_at,
      })),
      now,
    );
    return { state, line: buildGreenAltPreferenceLine(state, locale, now) };
  } catch (err) {
    // safe to ignore: 偏好注入是 best-effort — 失败静默降级, 绝不阻塞聊天
    logger.warn('[GreenAltPreferenceContext] load failed:', err instanceof Error ? err.message : String(err));
    return degraded;
  }
}
