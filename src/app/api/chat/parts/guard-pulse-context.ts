/**
 * guard-pulse-context — 按小时守护脉搏的事件/时区装载 (服务端 part, batch68-c)
 *
 * loadGuardPulseQueryData: 供 parts/guard-pulse-turn.ts 的纯函数消费 —
 * 拉 health_events 的可读守护事件 (challenge_completed / challenge_failed /
 * mindful_recovery, 采纳按 metadata.kind 在聚合层细分) + profiles.timezone
 * (hour-of-day 归桶的本地时区)。查询失败 → 空/undefined 降级 (聚合层按
 * insufficient 引导态回应, 时区回退运行时本地), 绝不阻塞聊天。
 *
 * 口径红线:
 * - 零 DDL / 不新增 cron / 不自动推送: 只在 chat 轮按需调用, 只读两张既有表。
 * - 本任务不做 letta context 注入 (与 62-c 不同): 脉搏只走数据问句 canned 轮。
 */

import { logger } from '@/lib/logger';

/** 拉取行数上限 — 28 天回看窗 + 去重余量, 500 行单查询可控 (与 57-c/62-c 同约定) */
const GUARD_PULSE_EVENT_LIMIT = 500;

/** 脉搏聚合涉及的 health_events 事件类型 — 拦截轮次 + 采纳轨道 */
export const GUARD_PULSE_EVENT_TYPES = [
  'challenge_completed',
  'challenge_failed',
  'mindful_recovery',
] as const;

/** 聚合 lib 的最小事件形状 (camelCase 子集) */
export interface GuardPulseEvent {
  eventType: string;
  metadata?: Record<string, unknown> | null;
  createdAt: string;
}

/** 结构面收窄 (与既有注入文件同模式, stub 测试验证契约) */
interface GuardPulseBuilder {
  select: (cols: string) => GuardPulseBuilder;
  eq: (col: string, val: string) => GuardPulseBuilder;
  in: (col: string, vals: readonly string[]) => GuardPulseBuilder;
  order: (col: string, opts: { ascending: boolean }) => GuardPulseBuilder;
  limit: (n: number) => GuardPulseBuilder;
  /** profiles 单行读取 (timezone) */
  maybeSingle: () => Promise<{ data: unknown }>;
  /** supabase thenable — await 兼容 */
  then: (onFulfilled: (res: { data: unknown }) => unknown, onRejected: (err: unknown) => unknown) => unknown;
}

/** SupabaseClient 运行时满足的最小结构面 (health_events + profiles 两张只读表) */
export interface GuardPulseStore {
  from: (table: 'health_events' | 'profiles') => GuardPulseBuilder;
}

interface EventRow {
  event_type: unknown;
  metadata: Record<string, unknown> | null;
  created_at: string;
}

export interface GuardPulseQueryData {
  events: GuardPulseEvent[];
  /** IANA 时区; 缺失/查询失败时 undefined (聚合层回退运行时本地) */
  timezone: string | undefined;
}

/**
 * 拉取脉搏聚合事件 + 用户时区。未登录 / store 缺失 / 查询失败 →
 * 空事件 + undefined 时区 (调用方走 insufficient 引导态), 绝不抛错阻塞聊天。
 */
export async function loadGuardPulseQueryData({
  userId,
  store,
}: {
  userId: string | undefined;
  store: GuardPulseStore | null | undefined;
}): Promise<GuardPulseQueryData> {
  if (!userId || !store) return { events: [], timezone: undefined };
  try {
    const [eventsRes, profileRes] = await Promise.all([
      store
        .from('health_events')
        .select('event_type, metadata, created_at')
        .eq('user_id', userId)
        .in('event_type', GUARD_PULSE_EVENT_TYPES)
        .order('created_at', { ascending: false })
        .limit(GUARD_PULSE_EVENT_LIMIT),
      store
        .from('profiles')
        .select('timezone')
        .eq('id', userId)
        .maybeSingle(),
    ]);
    const rows = (eventsRes?.data || []) as EventRow[];
    const events = rows.map((r) => ({
      eventType: typeof r.event_type === 'string' ? r.event_type : '',
      metadata: r.metadata,
      createdAt: r.created_at,
    }));
    const profile = profileRes?.data as { timezone?: unknown } | null;
    const timezone =
      profile && typeof profile.timezone === 'string' && profile.timezone.length > 0
        ? profile.timezone
        : undefined;
    return { events, timezone };
  } catch (err) {
    // safe to ignore: 脉搏装载是 best-effort — 失败静默降级为空窗, 绝不阻塞聊天
    logger.warn('[GuardPulseContext] load failed:', err instanceof Error ? err.message : String(err));
    return { events: [], timezone: undefined };
  }
}
