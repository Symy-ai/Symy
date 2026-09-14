/**
 * recent-wins-context — 小象高光记忆的 chat 注入点 (batch54-a)
 *
 * 独立注入文件 (参照 green-commitment-context / impulse-profile-context 先例),
 * 不改 rescue context-builder / 既有 parts 装配语义: loadLettaTurnContext 在拼
 * symyFields 时把本模块产出的单行摘要作为 `symy_recent_wins` 字段拼入 (best-effort)。
 *
 * 口径:
 * - 零 DDL / 只读: 最近 LIMIT 行 health_events → pickRecentWins 取 14 天高光。
 * - 任何失败 (查询错误/无高光) → undefined, 调用方按字段缺省省略, 绝不阻塞聊天。
 * - 摘要只有天数/次数/主题原词截断, 无金额; 注入指令明写不与失败对比、
 *   不点评绩效 (替他高兴, 不是绩效复盘)。
 */

import { logger } from '@/lib/logger';
import { pickRecentWins, type RecentWinItem, type RecentWinsEventInput } from '@/lib/recent-wins';

/** 拉取行数上限 — 14 天窗口的高光来源事件 + 承诺登记回溯, 近期窗口足够 */
const CONTEXT_RECENT_WINS_LIMIT = 300;

/** 结构面收窄 (与既有两个注入文件同模式, stub 测试验证契约) */
interface HealthEventsRead {
  select: (cols: string) => HealthEventsRead;
  eq: (col: string, val: string) => HealthEventsRead;
  order: (col: string, opts: { ascending: boolean }) => HealthEventsRead;
  limit: (n: number) => HealthEventsRead;
  then: (onFulfilled: (res: { data: unknown }) => unknown, onRejected: (err: unknown) => unknown) => unknown;
}

export interface RecentWinsStore {
  from: (table: 'health_events') => HealthEventsRead;
}

interface EventRow {
  event_type?: unknown;
  trigger_source?: unknown;
  trigger_id?: unknown;
  metadata: Record<string, unknown> | null;
  created_at: string;
}

function describeWin(w: RecentWinItem): string {
  switch (w.kind) {
    case 'kept_promise':
      return `kept a self-promise — no buying ${w.subject ? `"${w.subject}"` : 'a category'} for ${w.days ?? 0} day(s)`;
    case 'guard_streak':
      return `${w.days ?? 0}-day guard streak (resisted impulses every day in a row)`;
    case 'cooldown':
      return `let go of ${w.count ?? 0} wishlist item(s) after a 24h cooldown`;
    case 'worth_review':
      return `looked back at ${w.count ?? 0} purchase(s) and called it worth it`;
  }
}

/** 高光列表 → 单行摘要 (固定枚举字段 + 截断原词 + 天数/次数, 无金额) */
export function buildRecentWinsLine(wins: RecentWinItem[]): string | undefined {
  if (wins.length === 0) return undefined;
  const parts = wins.map((w) => describeWin(w)).join('; ');
  return `symy_recent_wins: ${parts}. You REMEMBER these wins. Mention them naturally and warmly when relevant — you are genuinely happy for the user, like a proud friend, NOT a performance review. Never compare them to failures, never score or grade the user, never bring wins up to guilt-trip.`;
}

/**
 * 读取 → 派生 → 高光单行摘要 (chat 每轮 context 构建时 await)。
 * 失败/无高光 → undefined。
 */
export async function loadRecentWinsContextLine({
  userId,
  store,
}: {
  userId: string | undefined;
  store: RecentWinsStore | null | undefined;
}): Promise<string | undefined> {
  if (!userId || !store) return undefined;
  try {
    const res = await store
      .from('health_events')
      .select('event_type, trigger_source, trigger_id, metadata, created_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(CONTEXT_RECENT_WINS_LIMIT);
    const rows = (res?.data || []) as EventRow[];
    if (rows.length === 0) return undefined;
    const events: RecentWinsEventInput[] = rows.map((r) => ({
      eventType: typeof r.event_type === 'string' ? r.event_type : '',
      triggerSource: typeof r.trigger_source === 'string' ? r.trigger_source : null,
      triggerId: typeof r.trigger_id === 'string' ? r.trigger_id : null,
      metadata: r.metadata,
      createdAt: r.created_at,
    }));
    const wins = pickRecentWins(events, new Date());
    if (!wins || wins.length === 0) return undefined;
    return buildRecentWinsLine(wins);
  } catch (err) {
    // safe to ignore: 高光注入是 best-effort — 失败静默降级, 绝不阻塞聊天
    logger.warn('[RecentWinsContext] load failed:', err instanceof Error ? err.message : String(err));
    return undefined;
  }
}
