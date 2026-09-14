/**
 * impulse-forecast — 未来 7 天冲动风险预报 (纯函数, batch62-c)
 *
 * 从既有可读守护事件 (challenge_completed / challenge_failed /
 * manual_adjustment) 归纳「近 8 周同星期几 × 同时段」的触发规律, 输出
 * 未来 7 天逐日的风险等级 (high/medium/low) + 主要类别 + 主要危险窗口,
 * 供 chat 预报卡 (parts/impulse-forecast-turn.ts) 与 symy_impulse_forecast
 * context 摘要消费。
 *
 * 口径红线:
 * - 零 DDL / 只读: 只消费事件 createdAt + metadata, 不碰任何写路径。
 * - 可解释规则: 近 8 周同星期几统计, 近 4 周事件权重加倍 (FORECAST_RECENT_WEEKS);
 *   阈值全部集中在本文件常量, 表驱动测试锁死。
 * - 稳定降级: 总样本 < MIN_TOTAL_SAMPLE 或单日样本 < MIN_DAY_SAMPLE 时该
 *   粒度恒 'insufficient', 不生成伪确定性结论。
 * - 只统计次数/天数/星期/时段, 输出结构上无金额/百分比收益/碳数值字段。
 * - 不做心理诊断或风险人格标签: 等级只描述消费触发规律, 文案层用
 *   "容易/可以提前准备" 框架 (见卡片 i18n)。
 * - 时区沿用项目现有时间工具: 本地时区 new Date(y, m, d), 星期序
 *   Monday=0 与 weekly-guard-heatmap 同约定; 测试注入固定本地 Date。
 */

import { hourToWindow, WINDOW_IDS, type ImpulseWindowId } from './impulse-window';
import { resolveGuardCategory } from './guard-category-insight';
import { dayKey } from './monthly-guard-heatmap';

/** 预报视界: 未来 7 天 (含今天, day 0 = 今天) */
export const FORECAST_HORIZON_DAYS = 7;

/** 回看窗口: 近 8 周同星期几 */
export const FORECAST_LOOKBACK_WEEKS = 8;

/** 近期加权带: 最近 4 周事件权重加倍 */
export const FORECAST_RECENT_WEEKS = 4;

/** 近期带权重 */
export const RECENT_WEIGHT = 2;

/** 较旧带权重 */
export const BASE_WEIGHT = 1;

/** 总样本阈值: 近 8 周可读事件少于该数 → 整体 insufficient (与 48-c MIN_SAMPLE_SIZE 同量级) */
export const MIN_TOTAL_SAMPLE = 8;

/** 单日样本阈值: 某星期几近 8 周原始事件少于该数 → 该日 insufficient (孤例不成规律) */
export const MIN_DAY_SAMPLE = 2;

/** 等级边界 (加权计数): ≥ HIGH → high (近 4 周事件权重加倍) */
export const HIGH_WEIGHT_THRESHOLD = 7;

/** 等级边界 (加权计数): ≥ MEDIUM → medium, 否则 low */
export const MEDIUM_WEIGHT_THRESHOLD = 4;

/** 参与统计的可读事件类型 — 与任务口径一致, 其余类型 (reward/采纳等) 不计入 */
const READABLE_EVENT_TYPES: ReadonlySet<string> = new Set([
  'challenge_completed',
  'challenge_failed',
  'manual_adjustment',
]);

/** 预报可答品类 — 与 dimension-query 五类同源 (other 兜底桶不参与 primary/top) */
export type ForecastCategory = 'electronics' | 'clothing' | 'beauty' | 'home' | 'food';

/** 并列时的固定裁决顺序 — 表驱动测试锁死 (先出现者赢) */
const CATEGORY_TIE_ORDER: readonly ForecastCategory[] = ['electronics', 'clothing', 'beauty', 'home', 'food'];

/** 聚合输入: 一条守护事件的最小形状 (health_events camelCase 子集) */
export interface ImpulseForecastEventInput {
  eventType?: string | null;
  metadata?: Record<string, unknown> | null;
  createdAt?: string | Date | null;
}

export type ForecastRiskLevel = 'high' | 'medium' | 'low' | 'insufficient';

export interface ForecastDayRisk {
  /** 本地日期 key (monthly-guard-heatmap dayKey 同款 y-m-d) */
  dayKey: string;
  /** 星期序 Monday=0 (与 WEEKDAYS_EN/ZH 同约定) */
  weekday: number;
  level: ForecastRiskLevel;
  /** 该星期几的主要类别 (五类之一; insufficient/无记录时 null) */
  primaryCategory: ForecastCategory | null;
  /** 该星期几的主要危险窗口 (时段桶; insufficient/无记录时 null) */
  dangerWindow: ImpulseWindowId | null;
  /** 近 8 周该星期几的原始样本数 */
  sample: number;
}

export interface ImpulseRiskForecast {
  /** 'insufficient' = 总样本不足, 全部天数不渲染伪结论 */
  status: 'ok' | 'insufficient';
  highDays: number;
  mediumDays: number;
  lowDays: number;
  /** 近 8 周加权最高的类别 (五类之一; 全零时 null) */
  topCategory: ForecastCategory | null;
  /** 未来 7 天逐日 (day 0 = 今天), 恒 7 行 */
  days: ForecastDayRisk[];
  /** 近 8 周有效样本总量 (insufficient 时也如实带出) */
  totalSample: number;
}

interface WeekdayStat {
  sample: number;
  weight: number;
  windows: Record<ImpulseWindowId, number>;
  categories: Map<ForecastCategory, number>;
}

function emptyWeekdayStat(): WeekdayStat {
  return { sample: 0, weight: 0, windows: { dawn: 0, daytime: 0, evening: 0, lateNight: 0 }, categories: new Map() };
}

/** 星期序 Monday=0 — 与 heatmap/周对比同约定 */
function mondayIndex(d: Date): number {
  return (d.getDay() + 6) % 7;
}

/** 五类里按固定顺序取加权最大者; 全零返回 null */
function topKnownCategory(weights: Map<ForecastCategory, number>): ForecastCategory | null {
  let best: ForecastCategory | null = null;
  for (const cat of CATEGORY_TIE_ORDER) {
    const w = weights.get(cat) ?? 0;
    if (w <= 0) continue;
    if (best === null || w > (weights.get(best) ?? 0)) best = cat;
  }
  return best;
}

/**
 * 归纳未来 7 天逐日冲动风险。纯函数: 无效条目跳过, 空/undefined 输入恒
 * insufficient, 绝不抛错。等级/窗口/类别只在样本达标的天给出。
 */
export function forecastImpulseRisk(
  events: ImpulseForecastEventInput[] | null | undefined,
  now: Date,
): ImpulseRiskForecast {
  const perWeekday: WeekdayStat[] = Array.from({ length: 7 }, emptyWeekdayStat);
  const globalCategories = new Map<ForecastCategory, number>();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const lookbackDays = FORECAST_LOOKBACK_WEEKS * 7;
  let totalSample = 0;

  for (const e of events || []) {
    if (!e) continue;
    if (!e.eventType || !READABLE_EVENT_TYPES.has(e.eventType)) continue;
    const date = e.createdAt instanceof Date ? e.createdAt : new Date(String(e.createdAt ?? ''));
    const time = date.getTime();
    if (!Number.isFinite(time)) continue;
    const dayStart = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
    const daysAgo = Math.round((todayStart - dayStart) / 86_400_000);
    if (daysAgo < 0 || daysAgo >= lookbackDays) continue;

    const w = mondayIndex(date);
    const stat = perWeekday[w];
    stat.sample += 1;
    const weight = daysAgo < FORECAST_RECENT_WEEKS * 7 ? RECENT_WEIGHT : BASE_WEIGHT;
    stat.weight += weight;
    stat.windows[hourToWindow(date.getHours())] += weight;
    const cat = resolveGuardCategory(e.metadata);
    if (cat !== 'other') {
      stat.categories.set(cat, (stat.categories.get(cat) ?? 0) + weight);
      globalCategories.set(cat, (globalCategories.get(cat) ?? 0) + weight);
    }
    totalSample += 1;
  }

  const days: ForecastDayRisk[] = [];
  let highDays = 0;
  let mediumDays = 0;
  let lowDays = 0;
  const enough = totalSample >= MIN_TOTAL_SAMPLE;

  for (let i = 0; i < FORECAST_HORIZON_DAYS; i++) {
    const date = new Date(now.getFullYear(), now.getMonth(), now.getDate() + i);
    const w = mondayIndex(date);
    const stat = perWeekday[w];
    const row: ForecastDayRisk = {
      dayKey: dayKey(date),
      weekday: w,
      level: 'insufficient',
      primaryCategory: null,
      dangerWindow: null,
      sample: stat.sample,
    };
    if (enough && stat.sample >= MIN_DAY_SAMPLE) {
      row.level = stat.weight >= HIGH_WEIGHT_THRESHOLD ? 'high' : stat.weight >= MEDIUM_WEIGHT_THRESHOLD ? 'medium' : 'low';
      row.primaryCategory = topKnownCategory(stat.categories);
      let bestWindow: ImpulseWindowId | null = null;
      for (const id of WINDOW_IDS) {
        if (stat.windows[id] > 0 && (bestWindow === null || stat.windows[id] > stat.windows[bestWindow])) bestWindow = id;
      }
      row.dangerWindow = bestWindow;
      if (row.level === 'high') highDays += 1;
      else if (row.level === 'medium') mediumDays += 1;
      else lowDays += 1;
    }
    days.push(row);
  }

  return {
    status: enough ? 'ok' : 'insufficient',
    highDays,
    mediumDays,
    lowDays,
    topCategory: enough ? topKnownCategory(globalCategories) : null,
    days,
    totalSample,
  };
}
