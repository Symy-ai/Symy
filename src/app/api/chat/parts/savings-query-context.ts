/**
 * savings-query-context — 问账轮的数据装载 (batch57-c)
 *
 * 只读拉取问账卡聚合所需的 health_events 四类事件 (拦截结算/转存奖励/
 * 替代与复用采纳), 供 savings-query-turn 里的既有聚合 lib 纯函数消费。
 * 零 DDL / 只读 / 查询失败 → 空数组降级 (问账卡走 noData 引导态,
 * 绝不阻塞聊天) — 与 guard-style-context 同款防御。
 */

import { logger } from '@/lib/logger';

/** 拉取行数上限 — 月窗最坏 31 天 + 去重余量, 500 行单查询可控 */
const SAVINGS_QUERY_EVENT_LIMIT = 500;

/** 问账聚合涉及的 health_events 事件类型 */
export const SAVINGS_QUERY_EVENT_TYPES = [
  'challenge_completed',
  'challenge_failed',
  'challenge_reward',
  'mindful_recovery',
] as const;

/** 聚合 lib 的最小事件形状 (camelCase 子集, 与 weekly/monthly 聚合同款) */
export interface SavingsQueryEvent {
  eventType: string;
  triggerSource: string | null;
  triggerId: string | null;
  metadata?: Record<string, unknown> | null;
  createdAt: string;
}

/** 结构面收窄 (与既有注入文件同模式, stub 测试验证契约) */
interface HealthEventsRead {
  select: (cols: string) => HealthEventsRead;
  eq: (col: string, val: string) => HealthEventsRead;
  in: (col: string, vals: readonly string[]) => HealthEventsRead;
  order: (col: string, opts: { ascending: boolean }) => HealthEventsRead;
  limit: (n: number) => HealthEventsRead;
  then: (onFulfilled: (res: { data: unknown }) => unknown, onRejected: (err: unknown) => unknown) => unknown;
}

export interface SavingsQueryStore {
  from: (table: 'health_events') => HealthEventsRead;
}

interface EventRow {
  event_type: unknown;
  trigger_source: unknown;
  trigger_id: unknown;
  metadata: Record<string, unknown> | null;
  created_at: string;
}

export type SavingsQueryEventsResult = SavingsQueryEvent[];

/**
 * 拉取问账窗聚合事件。未登录 / store 缺失 / 查询失败 → 空数组
 * (调用方走 noData 引导态), 绝不抛错阻塞聊天。
 */
export async function loadSavingsQueryEvents({
  userId,
  store,
}: {
  userId: string | undefined;
  store: SavingsQueryStore | null | undefined;
}): Promise<SavingsQueryEventsResult> {
  if (!userId || !store) return [];
  try {
    const res = await store
      .from('health_events')
      .select('event_type, trigger_source, trigger_id, metadata, created_at')
      .eq('user_id', userId)
      .in('event_type', SAVINGS_QUERY_EVENT_TYPES)
      .order('created_at', { ascending: false })
      .limit(SAVINGS_QUERY_EVENT_LIMIT);
    const rows = (res?.data || []) as EventRow[];
    return rows.map((r) => ({
      eventType: typeof r.event_type === 'string' ? r.event_type : '',
      triggerSource: typeof r.trigger_source === 'string' ? r.trigger_source : null,
      triggerId: typeof r.trigger_id === 'string' ? r.trigger_id : null,
      metadata: r.metadata,
      createdAt: r.created_at,
    }));
  } catch (err) {
    // safe to ignore: 问账装载是 best-effort — 失败静默降级为空窗, 绝不阻塞聊天
    logger.warn('[SavingsQueryContext] load failed:', err instanceof Error ? err.message : String(err));
    return [];
  }
}
