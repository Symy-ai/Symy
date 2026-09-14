/**
 * Freedom Calculator — 把省下的钱换算成"自由时间"
 *
 * 镜子哲学的核心：钱不是数字，是生命。
 * 默认时薪 $25/hour → 用户用生命换钱，省钱就是找回生命。
 *
 * 用法：
 *   const freedom = calculateFreedom(totalSaved);
 *   // freedom.months = 4.2
 *   // freedom.days = 126
 *   // freedom.hours = totalSaved / 25
 */

/**
 * 默认时薪 — batch51-b: 与 freedom-time 收敛为同一常量 ($25, U-4 拍板)。
 * 全产品默认时薪唯一权威在 freedom-time.ts。
 */
export { DEFAULT_HOURLY_RATE } from './freedom-time';
import { DEFAULT_HOURLY_RATE } from './freedom-time';

/**
 * 每月工作天数：~22 days (5 days/week × 4.4 weeks)
 */
export const WORK_DAYS_PER_MONTH = 22;

/**
 * 每天工作小时数：8 hours
 */
export const WORK_HOURS_PER_DAY = 8;

export interface FreedomData {
  /** 总省下的钱 ($USD) */
  totalSaved: number;
  /** 换算成小时数 (totalSaved / hourlyRate) */
  hours: number;
  /** 换算成天数 (hours / 8) */
  days: number;
  /** 换算成月数 (days / 22) */
  months: number;
  /** 使用的时薪 */
  hourlyRate: number;
}

/**
 * 计算自由时间
 * @param totalSaved 总省下的钱
 * @param hourlyRate 时薪 (默认 $25)
 */
export function calculateFreedom(totalSaved: number, hourlyRate: number = DEFAULT_HOURLY_RATE): FreedomData {
  const safeTotal = Math.max(0, totalSaved || 0);
  // 🔧 ARCH fix (Round 42): Guard against hourlyRate=0 (division by zero → Infinity)
  const safeRate = hourlyRate > 0 ? hourlyRate : DEFAULT_HOURLY_RATE;
  const hours = safeTotal / safeRate;
  const days = hours / WORK_HOURS_PER_DAY;
  const months = days / WORK_DAYS_PER_MONTH;

  return {
    totalSaved: safeTotal,
    hours,
    days,
    months,
    hourlyRate: safeRate,
  };
}

/**
 * 格式化月数：1 decimal place
 * - 0.1 → "0.1"
 * - 4.25 → "4.2" (truncated, not rounded — mirrors don't exaggerate)
 * - 12.0 → "12.0"
 */
export function formatFreedomMonths(months: number): string {
  if (months <= 0) return '0.0';
  return Math.floor(months * 10) / 10 + ''; // truncate to 1 decimal
}

/**
 * 格式化天数：整数
 * - 0.5 → "0" (mirror doesn't exaggerate — half a day is half a day)
 * - 126.7 → "126"
 */
export function formatFreedomDays(days: number): string {
  if (days <= 0) return '0';
  return Math.floor(days) + '';
}
