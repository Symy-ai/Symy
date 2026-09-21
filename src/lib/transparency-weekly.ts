/**
 * Transparency Weekly — 每周透明度报告纯聚合层 (batch81-a)
 *
 * BP 承诺 (0918 p11): 拦截次数 / 为用户省下的总金额 / CO₂ 减排量 — 北极星指标
 * 全公开, 每周透明度报告 = 内容引擎。本模块是从既有表行到公开快照的纯函数层;
 * 服务端取数 + 降级阶梯在 transparency-weekly-server, HTTP 壳在 api/transparency/weekly。
 *
 * 口径 (全部对齐既有统计, 不新造数):
 * - 拦截次数   = health_events 中 challenge_completed + challenge_failed,
 *                按 (user_id, event_type, trigger_id|id) 去重 — 与 weeklyGuardCompare 同款防御。
 * - 省下金额   = active_challenges status='passed' 的 Σ amount (成功拦下的订单, 平台账本)。
 * - 赢回小时   = 省下金额 / 默认时薪 $25 (moneyToHours — 全局唯一金钱→时间换算口径)。
 * - CO₂ 减排   = 省下金额 × 居民消费碳强度 (co2FromUsdSaved — 估算值非实测,
 *                保守系数与推导链见 co2-estimate.ts 文件头; batch82-b 补全第三指标)。
 * - 守护者总数 = profiles 注册序列的最大序号 (guard number 口径)。
 *
 * 红线 (owner 09-06): 快照是平台级聚合 (我们自己的账), 结构上只有周/累计两个桶 —
 * 无任何用户级字段, 用户级金额永不出现。
 *
 * batch109-a: 拦截数/守护者数/省下金额/赢回小时等平台口径原语收敛到
 * platform-aggregate 单源, 本文件只保留快照键面契约 (类型/零值骨架/回读校验/
 * 周历) 与组合 — 三指标口径改在 platform-aggregate 单点演化。
 */

import { co2FromUsdSaved } from '@/lib/co2-estimate';

import {
  countGuardSignups,
  countInterceptEvents,
  hoursWonFromUsd,
  round2,
  sumPassedUsd,
  type PlatformHealthRow,
  type PlatformPassedChallengeRow,
  type PlatformProfileRow,
} from '@/lib/platform-aggregate';

/** 单指标双桶: 本周 / 累计 */
export interface TransparencyMetric {
  week: number;
  total: number;
}

/** 上周对照段 (batch104-c): 上个完整周 (UTC 周一起 7 天) 的各指标值。
 *  null = 无上周基线 (首周 / 存量快照 / 坏行) — 页面对应中性态, 不渲染箭头 */
export interface TransparencyLastWeek {
  intercepts: number;
  savedUsd: number;
  hoursWon: number;
  co2SavedKg: number;
}

/** 公开快照 — 键面即契约, 结构上无用户级字段 (红线) */
export interface TransparencySnapshot {
  weekStart: string;
  weekEnd: string;
  intercepts: TransparencyMetric;
  savedUsd: TransparencyMetric;
  hoursWon: TransparencyMetric;
  /** 估算减排量 (kg CO₂e) — 由 savedUsd 派生, 估算值非实测 (口径见 co2-estimate.ts) */
  co2SavedKg: TransparencyMetric;
  /** 上周对照 (batch104-c) — 环比箭头数据源, 与本周同为平台聚合桶 */
  lastWeek: TransparencyLastWeek | null;
  guards: number;
  generatedAt: string;
  /** true = 聚合失败, 当前值来自缓存/降级快照而非实时聚合 */
  degraded: boolean;
}

/** health_events 聚合输入最小列 — 单源见 platform-aggregate (batch109-a) */
export type TransparencyHealthRow = PlatformHealthRow;

/** profiles 聚合输入最小列 — 单源见 platform-aggregate (batch109-a) */
export type TransparencyProfileRow = PlatformProfileRow;

/** active_challenges passed 聚合输入最小列 — 单源见 platform-aggregate (batch109-a) */
export type TransparencyPassedChallengeRow = PlatformPassedChallengeRow;

/** 本周起点 — UTC 周一 00:00 (生产 Vercel 与测试均 UTC, 不吃部署机本地时区) */
export function utcWeekStart(now: Date): Date {
  const dayStart = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const dow = (new Date(dayStart).getUTCDay() + 6) % 7; // Monday=0
  return new Date(dayStart - dow * 86_400_000);
}

const WEEK_MS = 7 * 86_400_000;

/** 零值骨架 — 全链路降级的最终兜底 (仍满足键面契约) */
export function emptyTransparency(now: Date, degraded: boolean): TransparencySnapshot {
  return {
    weekStart: utcWeekStart(now).toISOString(),
    weekEnd: now.toISOString(),
    intercepts: { week: 0, total: 0 },
    savedUsd: { week: 0, total: 0 },
    hoursWon: { week: 0, total: 0 },
    co2SavedKg: { week: 0, total: 0 },
    lastWeek: null,
    guards: 0,
    generatedAt: now.toISOString(),
    degraded,
  };
}

/**
 * 环比三态 (batch104-c): up=守护力在增强 (上涨叙事, 非 FOMO); down=平静呈现;
 * flat=持平; neutral=无上周基线 (null/非有限数) — 页面对中性态不渲染箭头。
 */
export type TransparencyTrend = 'up' | 'down' | 'flat' | 'neutral';

export function transparencyTrend(current: number, previous: number | null): TransparencyTrend {
  if (previous === null || !Number.isFinite(previous) || !Number.isFinite(current)) return 'neutral';
  if (current > previous) return 'up';
  if (current < previous) return 'down';
  return 'flat';
}

/**
 * 纯函数: 既有表行 → 公开快照。无效行跳过, 拦截按 (user_id, event_type, trigger_id|id)
 * 幂等去重 (与 weeklyGuardCompare 同款防御)。指标口径单源在 platform-aggregate,
 * 这里只做窗口推导与快照装配。
 */
export function aggregateTransparency(
  healthRows: TransparencyHealthRow[] | null | undefined,
  passedRows: TransparencyPassedChallengeRow[] | null | undefined,
  profileRows: TransparencyProfileRow[] | null | undefined,
  now: Date,
): TransparencySnapshot {
  const weekStart = utcWeekStart(now);
  const weekStartMs = weekStart.getTime();
  const lastWeekStartMs = weekStartMs - WEEK_MS;

  const intercepts = countInterceptEvents(healthRows, { weekStartMs, lastWeekStartMs });
  const guards = countGuardSignups(profileRows);

  const savedWeek = sumPassedUsd(passedRows, { fromMs: weekStartMs, toMs: Number.POSITIVE_INFINITY });
  const savedLastWeek = sumPassedUsd(passedRows, { fromMs: lastWeekStartMs, toMs: weekStartMs });
  const savedTotal = sumPassedUsd(passedRows, null);

  return {
    weekStart: weekStart.toISOString(),
    weekEnd: now.toISOString(),
    intercepts: { week: intercepts.week, total: intercepts.total },
    savedUsd: { week: savedWeek, total: savedTotal },
    hoursWon: {
      week: hoursWonFromUsd(savedWeek),
      total: hoursWonFromUsd(savedTotal),
    },
    co2SavedKg: {
      week: round2(co2FromUsdSaved(savedWeek)),
      total: round2(co2FromUsdSaved(savedTotal)),
    },
    lastWeek: {
      intercepts: intercepts.lastWeek,
      savedUsd: savedLastWeek,
      hoursWon: hoursWonFromUsd(savedLastWeek),
      co2SavedKg: round2(co2FromUsdSaved(savedLastWeek)),
    },
    guards,
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
  // batch104-c 存量快照无 lastWeek — 归一为 null (中性态), 不打穿降级阶梯
  const isLastWeekSegment = (w: unknown): w is TransparencyLastWeek =>
    !!w && typeof w === 'object' &&
    typeof (w as TransparencyLastWeek).intercepts === 'number' &&
    typeof (w as TransparencyLastWeek).savedUsd === 'number' &&
    typeof (w as TransparencyLastWeek).hoursWon === 'number' &&
    typeof (w as TransparencyLastWeek).co2SavedKg === 'number';
  if (typeof v.weekStart !== 'string' || typeof v.weekEnd !== 'string') return null;
  if (typeof v.generatedAt !== 'string' || typeof v.guards !== 'number') return null;
  if (!isMetric(v.intercepts) || !isMetric(v.savedUsd) || !isMetric(v.hoursWon)) return null;
  // batch81-a 存量快照无 co2SavedKg — 由 savedUsd 回填派生 (纯函数同口径),
  // 否则旧行回读失败会把降级阶梯打穿到零值骨架
  const co2SavedKg = isMetric(v.co2SavedKg)
    ? v.co2SavedKg
    : {
        week: round2(co2FromUsdSaved(v.savedUsd.week)),
        total: round2(co2FromUsdSaved(v.savedUsd.total)),
      };
  return {
    ...(v as unknown as TransparencySnapshot),
    co2SavedKg,
    lastWeek: isLastWeekSegment(v.lastWeek) ? v.lastWeek : null,
    degraded: v.degraded === true,
  };
}
