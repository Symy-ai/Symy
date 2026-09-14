/**
 * impulse-forecast-context — 冲动风险预报的事件装载 + chat 注入点 (batch62-c)
 *
 * 双职责, 皆为只读:
 * 1. loadImpulseForecastEvents: 拉 forecastImpulseRisk 需要的三类可读事件
 *    (challenge_completed / challenge_failed / manual_adjustment), 供
 *    parts/impulse-forecast-turn.ts 的纯函数消费 — 查询失败 → 空数组降级
 *    (预报卡走 insufficient 引导态), 绝不阻塞聊天。
 * 2. loadImpulseForecastContextLine: 把预报结果压成单行英文摘要, 由
 *    letta-turn-context 拼为 `symy_impulse_forecast` 字段 (与
 *    symy_impulse_profile 同级 best-effort 通道)。样本不足与查询失败同路径:
 *    输出明确降级行 (不编造规律); 未登录/store 缺失 → undefined 字段整个省略。
 *
 * 口径红线:
 * - 零 DDL / 不新增 cron / 不自动推送: 只在这里被 chat 轮按需调用。
 * - 摘要只含星期序/时段 id/品类 id (固定枚举) + 次数, 无金额无自由文本,
 *   无 prompt 注入面; 明示 "preparation hints, not predictions"。
 */

import { logger } from '@/lib/logger';
import { forecastImpulseRisk, type ImpulseRiskForecast } from '@/lib/impulse-forecast';

/** 拉取行数上限 — 8 周回看窗最坏场景 + 去重余量, 500 行单查询可控 (与 57-c 同约定) */
const FORECAST_EVENT_LIMIT = 500;

/** 预报聚合涉及的 health_events 事件类型 — 只统计可读拦截/手记, 不含 reward/采纳 */
export const IMPULSE_FORECAST_EVENT_TYPES = [
  'challenge_completed',
  'challenge_failed',
  'manual_adjustment',
] as const;

/** 聚合 lib 的最小事件形状 (camelCase 子集) */
export interface ImpulseForecastEvent {
  eventType: string;
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
  /** supabase thenable — await 兼容 */
  then: (onFulfilled: (res: { data: unknown }) => unknown, onRejected: (err: unknown) => unknown) => unknown;
}

export interface ImpulseForecastStore {
  from: (table: 'health_events') => HealthEventsRead;
}

interface EventRow {
  event_type: unknown;
  metadata: Record<string, unknown> | null;
  created_at: string;
}

/**
 * 拉取预报聚合事件。未登录 / store 缺失 / 查询失败 → 空数组
 * (调用方走 insufficient 引导态), 绝不抛错阻塞聊天。
 */
export async function loadImpulseForecastEvents({
  userId,
  store,
}: {
  userId: string | undefined;
  store: ImpulseForecastStore | null | undefined;
}): Promise<ImpulseForecastEvent[]> {
  if (!userId || !store) return [];
  try {
    const res = await store
      .from('health_events')
      .select('event_type, metadata, created_at')
      .eq('user_id', userId)
      .in('event_type', IMPULSE_FORECAST_EVENT_TYPES)
      .order('created_at', { ascending: false })
      .limit(FORECAST_EVENT_LIMIT);
    const rows = (res?.data || []) as EventRow[];
    return rows.map((r) => ({
      eventType: typeof r.event_type === 'string' ? r.event_type : '',
      metadata: r.metadata,
      createdAt: r.created_at,
    }));
  } catch (err) {
    // safe to ignore: 预报装载是 best-effort — 失败静默降级为空窗, 绝不阻塞聊天
    logger.warn('[ImpulseForecastContext] load failed:', err instanceof Error ? err.message : String(err));
    return [];
  }
}

/**
 * 预报 → 单行英文摘要 (prompt 侧既有约定: context 行用英文; 字段全为
 * 固定枚举 + 计数)。样本不足时输出明确降级行, 禁止编造规律 — 该行
 * 指示小象如实说数据还不够。恒返回字符串 (降级也是一行), 供测试断言。
 */
export function buildImpulseForecastLine(forecast: ImpulseRiskForecast): string {
  if (forecast.status !== 'ok') {
    return `symy_impulse_forecast: insufficient sample (${forecast.totalSample} guard moments in 8 weeks) — no forecast available; do NOT invent patterns; if asked, say honestly there is not enough data yet.`;
  }
  const risky = forecast.days.filter((d) => d.level === 'high' || d.level === 'medium');
  const riskiest = risky.length > 0 ? risky.reduce((a, b) => (b.sample > a.sample ? b : a)) : null;
  const segments: string[] = [
    `next-7-day risk outlook from the user's own past-8-weeks same-weekday patterns (${forecast.totalSample} guard moments)`,
    `high-risk days ${forecast.highDays}, medium ${forecast.mediumDays}, low ${forecast.lowDays}`,
  ];
  if (forecast.topCategory) segments.push(`most triggered category ${forecast.topCategory}`);
  if (riskiest) {
    segments.push(
      `watch out day-${riskiest.weekday} (Monday=0, ${riskiest.level})${riskiest.dangerWindow ? ` peak window ${riskiest.dangerWindow}` : ''}`,
    );
  }
  return `symy_impulse_forecast: ${segments.join(', ')} — preparation hints from past patterns, NOT predictions; suggest arranging alternatives ahead on risky days; never shame, never promise accuracy, no diagnosis.`;
}

/**
 * 读取 → 聚合 → 单行摘要 (chat 每轮 context 构建时 await)。
 * 未登录/store 缺失 → undefined (字段省略); 样本不足/查询失败 → 明确降级行
 * (查询失败在装载层已降级为空数组, 与空样本同路径, 不编造规律)。
 */
export async function loadImpulseForecastContextLine({
  userId,
  store,
}: {
  userId: string | undefined;
  store: ImpulseForecastStore | null | undefined;
}): Promise<string | undefined> {
  if (!userId || !store) return undefined;
  try {
    const events = await loadImpulseForecastEvents({ userId, store });
    return buildImpulseForecastLine(forecastImpulseRisk(events, new Date()));
  } catch (err) {
    // safe to ignore: 预报注入是 best-effort — 装载层不抛错, 这里仅防御聚合意外, 绝不阻塞聊天
    logger.warn('[ImpulseForecastContext] line build failed:', err instanceof Error ? err.message : String(err));
    return undefined;
  }
}
