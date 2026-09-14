/**
 * alt-adoption-context — 替代采纳足迹的 chat 注入点 (batch55-c)
 *
 * 独立注入文件 (参照 green-commitment-context / impulse-profile-context 先例),
 * 不改 rescue context-builder / 既有 parts 装配语义: loadLettaTurnContext 在拼
 * symyFields 时把本模块产出的单行摘要作为 `symy_alt_profile` 字段拼入 (best-effort);
 * 用户召回足迹时 (alt-footprint-intent 命中) 额外返回足迹卡 payload
 * (alt_footprint SSE 事件 / JSON altFootprint 字段, 与 green_knowledge 同轨)。
 *
 * 口径:
 * - 零 DDL / 只读: 读 health_events mindful_recovery (trigger_id 前缀
 *   'green-alt-adoption:', 最近 LIMIT 行), 用 aggregateAltAdoptionProfile 聚合。
 * - 任何失败 (查询错误/样本不足) → line undefined / card null, 绝不阻塞聊天。
 * - 注入行只有次数/域数/替代名 (计数), 无金额; 指令明写足迹少时不对比不羞辱。
 * - 足迹卡: public 结构面无金额; savedEstimate 只进 private (App 内私享)。
 */

import { logger } from '@/lib/logger';
import { detectAltFootprintQuery } from '@/lib/alt-footprint-intent';
import {
  aggregateAltAdoptionProfile,
  ALT_ADOPTION_TRIGGER_PREFIX,
  type AltAdoptionProfile,
} from '@/lib/alt-adoption-profile';
import type { AltFootprintCardData } from '@/types/alt-footprint';
import type { GreenLocale } from '@/lib/green-alt-types';

/** 拉取行数上限 — 足迹是全量分布 + 30 天窗口, 最近 200 条采纳足够且单查询可控 */
const CONTEXT_ALT_ADOPTION_LIMIT = 200;

/** 结构面收窄 (与既有注入文件同模式, stub 测试验证契约) */
interface HealthEventsRead {
  select: (cols: string) => HealthEventsRead;
  eq: (col: string, val: string) => HealthEventsRead;
  like: (col: string, val: string) => HealthEventsRead;
  order: (col: string, opts: { ascending: boolean }) => HealthEventsRead;
  limit: (n: number) => HealthEventsRead;
  then: (onFulfilled: (res: { data: unknown }) => unknown, onRejected: (err: unknown) => unknown) => unknown;
}

export interface AltAdoptionStore {
  from: (table: 'health_events') => HealthEventsRead;
}

interface AdoptionEventRow {
  trigger_id: unknown;
  metadata: Record<string, unknown> | null;
  created_at: string;
}

/** 足迹 → 单行英文摘要 (prompt 侧既有约定: context 行用英文; 字段为计数 + 词条原词) */
export function buildAltAdoptionLine(profile: AltAdoptionProfile, locale: GreenLocale): string | undefined {
  if (profile.status !== 'ok') return undefined;
  const label = (id: string, zh: string, en: string) => (locale === 'zh' ? zh : en);
  const tops = profile.topEntries
    .map((e) => `${label(e.entryId, e.labelZh, e.labelEn)} x${e.count}`)
    .join(', ');
  const segments = [
    `${profile.totalAdoptions} green-alternative adoptions total (${profile.last30Days} in the last 30 days)`,
    `covering ${profile.categoriesCovered} life areas`,
  ];
  if (tops) segments.push(`most chosen: ${tops}`);
  return `symy_alt_profile: ${segments.join(', ')} — the user's green-alternative footprint. Alternatives are quietly becoming their default; you can naturally acknowledge this ("you've been picking secondhand and refills a lot"). If the footprint is small, encourage — never compare them to others, never shame.`;
}

/** 足迹 + 私享节省汇总 → 足迹卡 payload (样本不足 → null) */
export function buildAltFootprintCard(
  profile: AltAdoptionProfile,
  savedEstimate: number,
  locale: GreenLocale,
): AltFootprintCardData | null {
  if (profile.status !== 'ok') return null;
  return {
    public: {
      totalAdoptions: profile.totalAdoptions,
      last30Days: profile.last30Days,
      categoriesCovered: profile.categoriesCovered,
      topEntries: profile.topEntries.map((e) => ({
        label: locale === 'zh' ? e.labelZh : e.labelEn,
        count: e.count,
      })),
    },
    private: { savedEstimate },
  };
}

export interface AltAdoptionContextResult {
  /** 拼入 symyFields 的单行摘要; 样本不足/失败 → undefined (字段省略) */
  line: string | undefined;
  /** 足迹召回命中时的卡片 payload; 否则 null */
  card: AltFootprintCardData | null;
  /** 聚合后的足迹 (样本不足为 insufficient 态, 供调用方降级) */
  profile: AltAdoptionProfile;
}

/**
 * 读取 → 聚合 → 单行摘要 + 足迹卡 (chat 每轮 context 构建时 await)。
 * 查询失败 → 静默降级 (line undefined / card null / profile insufficient), 绝不阻塞聊天。
 */
export async function loadAltAdoptionContext({
  userId,
  store,
  userContent,
  locale,
  now = new Date(),
}: {
  userId: string | undefined;
  store: AltAdoptionStore | null | undefined;
  userContent: string;
  locale: GreenLocale;
  now?: Date;
}): Promise<AltAdoptionContextResult> {
  const degraded: AltAdoptionContextResult = {
    line: undefined,
    card: null,
    profile: aggregateAltAdoptionProfile([]),
  };
  if (!userId || !store) return degraded;
  try {
    const res = await store
      .from('health_events')
      .select('trigger_id, metadata, created_at')
      .eq('user_id', userId)
      .eq('event_type', 'mindful_recovery')
      .like('trigger_id', `${ALT_ADOPTION_TRIGGER_PREFIX}%`)
      .order('created_at', { ascending: false })
      .limit(CONTEXT_ALT_ADOPTION_LIMIT);
    const rows = (res?.data || []) as AdoptionEventRow[];
    if (rows.length === 0) return degraded;

    const events = rows.map((r) => ({
      triggerId: typeof r.trigger_id === 'string' ? r.trigger_id : null,
      metadata: r.metadata,
      createdAt: r.created_at,
    }));
    const profile = aggregateAltAdoptionProfile(events, now);
    // estSaved 汇总只进卡内 private 字段 (App 内私享), 不进注入行 / public 面
    let savedEstimate = 0;
    for (const e of events) {
      const saved = Number(e.metadata?.estSaved);
      if (Number.isFinite(saved) && saved > 0) savedEstimate += saved;
    }

    const line = buildAltAdoptionLine(profile, locale);
    const card = profile.status === 'ok' && detectAltFootprintQuery(userContent)
      ? buildAltFootprintCard(profile, savedEstimate, locale)
      : null;
    return { line, card, profile };
  } catch (err) {
    // safe to ignore: 足迹注入是 best-effort — 失败静默降级, 绝不阻塞聊天
    logger.warn('[AltAdoptionContext] load failed:', err instanceof Error ? err.message : String(err));
    return degraded;
  }
}

/** 前端 SSE alt_footprint 事件字节 (data: {...}\n\n) */
export function altFootprintSseEvent(payload: AltFootprintCardData): Uint8Array {
  const event = JSON.stringify({ type: 'alt_footprint', altFootprint: payload });
  return new TextEncoder().encode(`data: ${event}\n\n`);
}

/**
 * 足迹召回命中时在流最前面注入 alt_footprint 事件, 之后逐字节透传 Letta 原始流;
 * 未命中原样返回 inner (零包装开销)。
 */
export function withAltFootprintEvent(
  inner: ReadableStream<Uint8Array>,
  payload: AltFootprintCardData | null,
): ReadableStream<Uint8Array> {
  if (!payload) return inner;
  const event = altFootprintSseEvent(payload);
  return new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(event);
      const reader = inner.getReader();
      const pump = async () => {
        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            controller.enqueue(value);
          }
          controller.close();
        } catch (err) {
          controller.error(err);
        }
      };
      void pump();
    },
    cancel(reason) {
      return inner.cancel(reason);
    },
  });
}
