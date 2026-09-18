/**
 * Transparency Weekly — 每周透明度报告纯聚合层 (batch81-a)
 *
 * BP 承诺 (0918 p11): 拦截次数 / 为用户省下的总金额 / 赢回小时 — 北极星指标全公开,
 * 每周透明度报告 = 内容引擎。本模块是从既有表行到公开快照的纯函数层;
 * 服务端取数 + 降级阶梯在 transparency-weekly-server, HTTP 壳在 api/transparency/weekly。
 *
 * 口径 (全部对齐既有统计, 不新造数):
 * - 拦截次数   = health_events 中 challenge_completed + challenge_failed,
 *                按 (user_id, event_type, trigger_id|id) 去重 — 与 weeklyGuardCompare 同款防御。
 * - 省下金额   = active_challenges status='passed' 的 Σ amount (成功拦下的订单, 平台账本)。
 * - 赢回小时   = 省下金额 / 默认时薪 $25 (moneyToHours — 全局唯一金钱→时间换算口径)。
 * - 守护者总数 = 有过 ≥1 次 challenge_completed 的去重 user_id 数
 *                (guard number 最大值: 最新一名守护者的序号 = 累计守护者数)。
 *
 * 红线 (owner 09-06): 快照是平台级聚合 (我们自己的账), 结构上只有周/累计两个桶 —
 * 无任何用户级字段, 用户级金额永不出现。
 */

import { DEFAULT_HOURLY_RATE, moneyToHours } from '@/lib/freedom-time';

/** 单指标双桶: 本周 / 累计 */
export interface TransparencyMetric {
  week: number;
  total: number;
}

/** 公开快照 — 键面即契约, 结构上无用户级字段 (红线) */
export interface TransparencySnapshot {
  weekStart: string;
  weekEnd: string;
  intercepts: TransparencyMetric;
  savedUsd: TransparencyMetric;
  hoursWon: TransparencyMetric;
  guards: number;
  generatedAt: string;
  /** true = 聚合失败, 当前值来自缓存/降级快照而非实时聚合 */
  degraded: boolean;
}

/** health_events 聚合输入最小列 (id 供 dedup 回退) */
export interface TransparencyHealthRow {
  id: string;
  user_id: string;
  event_type: string;
  trigger_id: string | null;
  created_at: string;
}

/** active_challenges passed 聚合输入最小列 (numeric 可能以 string 透出) */
export interface TransparencyPassedChallengeRow {
  amount: number | string | null;
  completed_at: string | null;
}

/** 本周起点 — UTC 周一 00:00 (生产 Vercel 与测试均 UTC, 不吃部署机本地时区) */
export function utcWeekStart(now: Date): Date {
  const dayStart = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const dow = (new Date(dayStart).getUTCDay() + 6) % 7; // Monday=0
  return new Date(dayStart - dow * 86_400_000);
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** 零值骨架 — 全链路降级的最终兜底 (仍满足键面契约) */
export function emptyTransparency(now: Date, degraded: boolean): TransparencySnapshot {
  return {
    weekStart: utcWeekStart(now).toISOString(),
    weekEnd: now.toISOString(),
    intercepts: { week: 0, total: 0 },
    savedUsd: { week: 0, total: 0 },
    hoursWon: { week: 0, total: 0 },
    guards: 0,
    generatedAt: now.toISOString(),
    degraded,
  };
}

const INTERCEPT_EVENT_TYPES = new Set(['challenge_completed', 'challenge_failed']);

/**
 * 纯函数: 既有表行 → 公开快照。无效行跳过, 拦截按 (user_id, event_type, trigger_id|id)
 * 幂等去重 (与 weeklyGuardCompare 同款防御)。
 */
export function aggregateTransparency(
  healthRows: TransparencyHealthRow[] | null | undefined,
  passedRows: TransparencyPassedChallengeRow[] | null | undefined,
  now: Date,
): TransparencySnapshot {
  const weekStartMs = utcWeekStart(now).getTime();

  let interceptsWeek = 0;
  let interceptsTotal = 0;
  const guardians = new Set<string>();
  const seen = new Set<string>();
  for (const row of healthRows || []) {
    if (!row || !INTERCEPT_EVENT_TYPES.has(row.event_type)) continue;
    const t = new Date(row.created_at ?? '').getTime();
    if (!Number.isFinite(t)) continue;
    const key = `${row.user_id}:${row.event_type}:${row.trigger_id || row.id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    interceptsTotal += 1;
    if (t >= weekStartMs) interceptsWeek += 1;
    if (row.event_type === 'challenge_completed' && row.user_id) guardians.add(row.user_id);
  }

  const sumPassed = (filterWeek: boolean): number => {
    let sum = 0;
    for (const row of passedRows || []) {
      if (!row) continue;
      const amount = Number(row.amount);
      if (!Number.isFinite(amount) || amount <= 0) continue;
      if (filterWeek) {
        const t = new Date(row.completed_at ?? '').getTime();
        if (!Number.isFinite(t) || t < weekStartMs) continue;
      }
      sum += amount;
    }
    return round2(sum);
  };

  const savedWeek = sumPassed(true);
  const savedTotal = sumPassed(false);

  return {
    weekStart: utcWeekStart(now).toISOString(),
    weekEnd: now.toISOString(),
    intercepts: { week: interceptsWeek, total: interceptsTotal },
    savedUsd: { week: savedWeek, total: savedTotal },
    hoursWon: {
      week: round2(moneyToHours(savedWeek, DEFAULT_HOURLY_RATE)),
      total: round2(moneyToHours(savedTotal, DEFAULT_HOURLY_RATE)),
    },
    guards: guardians.size,
    generatedAt: now.toISOString(),
    degraded: false,
  };
}

/** 快照表 payload 回读校验 — 表里是任意 jsonb, 回读必须验形 (坏行视为无快照) */
export function asTransparencySnapshot(value: unknown): TransparencySnapshot | null {
  if (!value || typeof value !== 'object') return null;
  const v = value as Record<string, unknown>;
  const isMetric = (m: unknown): m is TransparencyMetric =>
    !!m && typeof m === 'object' &&
    typeof (m as TransparencyMetric).week === 'number' &&
    typeof (m as TransparencyMetric).total === 'number';
  if (typeof v.weekStart !== 'string' || typeof v.weekEnd !== 'string') return null;
  if (typeof v.generatedAt !== 'string' || typeof v.guards !== 'number') return null;
  if (!isMetric(v.intercepts) || !isMetric(v.savedUsd) || !isMetric(v.hoursWon)) return null;
  return { ...(v as unknown as TransparencySnapshot), degraded: v.degraded === true };
}
