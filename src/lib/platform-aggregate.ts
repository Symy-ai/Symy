/**
 * Platform Aggregate — 平台级聚合口径单源 (batch109-a)
 *
 * transparency-weekly / growth-stats / defense-collective 三处各自实现平台聚合,
 * 口径同源但代码多份 (b90a 钉过 weekly vs growth 三处分歧, 105-b 又接了一层)。
 * 本模块把跨消费端共享的口径原语收敛为单源, 各域特有字段 (快照键面/降级阶梯)
 * 仍留在各自层 — 键面即契约, 本批零键面变化。
 *
 * 单源内容:
 * - round2              两位小数纪律 (b90a: 双边一致靠同一实现而非约定)
 * - countInterceptEvents  拦截数 = health_events completed+failed,
 *                         按 (user_id, event_type, trigger_id|id) 幂等去重
 * - countGuardSignups     守护者数 = profiles 有效注册行数 (guard number 口径)
 * - sumPassedUsd          省下金额 = active_challenges passed Σ amount, [from, to) 半开窗
 * - hoursWonFromUsd       赢回小时 = moneyToHours(默认时薪 $25) + round2
 * - readAllPages          PostgREST 1000 行上限翻页耗尽 (b90a: 两 loader 同一停页规则)
 * - CollectiveStats       105-b 集体行线格式 {hours, guards} — 服务端 pick 与客户端
 *                         校验同源 (collectiveStatsFromSnapshot / isCollectiveStats)
 *
 * 纯模块: 不依赖 server-only / supabase / hooks, 服务端与客户端均可 import。
 */

import { DEFAULT_HOURLY_RATE, moneyToHours } from '@/lib/freedom-time';

/** 两位小数纪律 — 派生指标 (金额/小时/CO₂/K 因子) 的统一取整口径 */
export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** 赢回小时口径: 省下金额 ÷ 默认时薪 $25, 两位小数 (moneyToHours 全局唯一换算) */
export function hoursWonFromUsd(savedUsd: number): number {
  return round2(moneyToHours(savedUsd, DEFAULT_HOURLY_RATE));
}

/** health_events 聚合输入最小列 (id 供 dedup 回退) */
export interface PlatformHealthRow {
  id: string;
  user_id: string;
  event_type: string;
  trigger_id: string | null;
  created_at: string;
}

/** profiles 聚合输入最小列 — created_at 建立全局注册序 */
export interface PlatformProfileRow {
  created_at: string | null;
}

/** active_challenges passed 聚合输入最小列 (numeric 可能以 string 透出) */
export interface PlatformPassedChallengeRow {
  amount: number | string | null;
  completed_at: string | null;
}

const INTERCEPT_EVENT_TYPES = new Set(['challenge_completed', 'challenge_failed']);

function toFiniteTime(value: string | null | undefined): number {
  return new Date(value ?? '').getTime();
}

/** 拦截计数窗口: 本周起点与上周起点 (UTC 周一, ms) — 由消费端用 utcWeekStart 推出 */
export interface AggregateWindow {
  weekStartMs: number;
  lastWeekStartMs: number;
}

/**
 * 拦截数: 无效行跳过, 按 (user_id, event_type, trigger_id|id) 幂等去重
 * (与 weeklyGuardCompare 同款防御); t ≥ 上周起点才入窗, 越界行只进 total。
 */
export function countInterceptEvents(
  rows: PlatformHealthRow[] | null | undefined,
  window: AggregateWindow,
): { week: number; lastWeek: number; total: number } {
  let week = 0;
  let lastWeek = 0;
  let total = 0;
  const seen = new Set<string>();
  for (const row of rows || []) {
    if (!row || !INTERCEPT_EVENT_TYPES.has(row.event_type)) continue;
    const t = toFiniteTime(row.created_at);
    if (!Number.isFinite(t)) continue;
    const key = `${row.user_id}:${row.event_type}:${row.trigger_id || row.id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    total += 1;
    if (t >= window.weekStartMs) week += 1;
    else if (t >= window.lastWeekStartMs) lastWeek += 1;
  }
  return { week, lastWeek, total };
}

/** 守护者数: profiles 有效注册行数 (guard number 口径) — created_at 无效的行跳过 */
export function countGuardSignups(rows: PlatformProfileRow[] | null | undefined): number {
  let guards = 0;
  for (const row of rows || []) {
    if (!row) continue;
    if (!Number.isFinite(toFiniteTime(row.created_at))) continue;
    guards += 1;
  }
  return guards;
}

/**
 * 省下金额: passed 行 Σ amount (成功拦下的订单, 平台账本)。
 * range=null 表示全量 (累计); 否则取 [fromMs, toMs) 半开窗。
 * amount 非正/非有限跳过, 结果 round2。
 */
export function sumPassedUsd(
  rows: PlatformPassedChallengeRow[] | null | undefined,
  range: { fromMs: number; toMs: number } | null,
): number {
  let sum = 0;
  for (const row of rows || []) {
    if (!row) continue;
    const amount = Number(row.amount);
    if (!Number.isFinite(amount) || amount <= 0) continue;
    if (range) {
      const t = toFiniteTime(row.completed_at);
      if (!Number.isFinite(t) || t < range.fromMs || t >= range.toMs) continue;
    }
    sum += amount;
  }
  return round2(sum);
}

/**
 * PostgREST 1000 行上限翻页耗尽: 每页不足 PAGE_SIZE 才停 (b90a 钉的停页规则)。
 * 页错误即停, 返回已累积行 + 错误 (消费端决定降级); data=null 视为空页。
 */
export const AGGREGATE_PAGE_SIZE = 1000;

export async function readAllPages<T>(
  fetchPage: (offset: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
): Promise<{ rows: T[]; error: { message: string } | null }> {
  const rows: T[] = [];
  for (let offset = 0; ; offset += AGGREGATE_PAGE_SIZE) {
    const { data, error } = await fetchPage(offset);
    if (error) return { rows, error };
    rows.push(...(data ?? []));
    if ((data ?? []).length < AGGREGATE_PAGE_SIZE) break;
  }
  return { rows, error: null };
}

/** 105-b 集体行线格式 — defense hero「一起赢回」行的公开契约 */
export interface CollectiveStats {
  /** 平台累计赢回小时 (snapshot.hoursWon.total) */
  hours: number;
  /** 守护者总数 (snapshot.guards) */
  guards: number;
}

/** 快照 → 集体行 pick: 只暴露两个平台桶, 其余键面不出 (零金额/零用户级字段) */
export function collectiveStatsFromSnapshot(snapshot: {
  hoursWon: { total: number };
  guards: number;
}): CollectiveStats {
  return { hours: snapshot.hoursWon.total, guards: snapshot.guards };
}

/** 线格式回读校验 — 非法响应一律 throw, 交给 React Query 重试/降级隐藏 */
export function isCollectiveStats(value: unknown): value is CollectiveStats {
  return (
    !!value &&
    typeof value === 'object' &&
    typeof (value as CollectiveStats).hours === 'number' &&
    typeof (value as CollectiveStats).guards === 'number'
  );
}
