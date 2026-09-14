/**
 * 自由时间换算 — 全局金钱→时间显示的唯一权威 helper
 *
 * Owner 铁律 (2026-09-06): 除梦想基金外, 应用内所有原显示金钱的地方
 * 一律改为显示"自由时间"(赢回的生命小时)。金额只在梦想基金语境保留。
 */

/** 默认时薪 ($/h) — U-4 拍板：美国中位数 $25 */
export const DEFAULT_HOURLY_RATE = 25;

/** batch51-b: 设置页自定义时薪的允许区间 */
export const HOURLY_RATE_MIN = 1;
export const HOURLY_RATE_MAX = 500;

/** batch51-b: 钳制时薪到允许区间 — 非法输入 (NaN/Infinity) 回落默认值 */
export function clampHourlyRate(rate: number): number {
  if (!Number.isFinite(rate)) return DEFAULT_HOURLY_RATE;
  return Math.min(HOURLY_RATE_MAX, Math.max(HOURLY_RATE_MIN, rate));
}

/** 金额 (元/美元单位) → 小时 */
export function moneyToHours(amount: number, hourlyRate: number = DEFAULT_HOURLY_RATE): number {
  if (!Number.isFinite(amount) || amount <= 0) return 0;
  const rate = hourlyRate > 0 ? hourlyRate : DEFAULT_HOURLY_RATE;
  return amount / rate;
}

/**
 * 格式化自由时间 — <1h 显示分钟, <10h 一位小数, ≥10h 取整
 * 纯函数: locale ('zh'|'en') 决定单位词, 不依赖 i18n hook (可组件外调用)。
 */
export function formatFreedomTime(hours: number, locale: string = 'zh'): string {
  if (!Number.isFinite(hours) || hours <= 0) {
    return locale === 'zh' ? '0 小时' : '0 hours';
  }
  if (hours < 1) {
    const minutes = Math.max(1, Math.round(hours * 60));
    return locale === 'zh' ? `${minutes} 分钟` : `${minutes} min`;
  }
  const display = hours < 10 ? hours.toFixed(1) : Math.round(hours).toString();
  return locale === 'zh' ? `${display} 小时` : `${display} hours`;
}

/** 一步到位: 金额 → 格式化自由时间字符串 */
export function moneyToFreedomLabel(amount: number, locale: string = 'zh', hourlyRate: number = DEFAULT_HOURLY_RATE): string {
  return formatFreedomTime(moneyToHours(amount, hourlyRate), locale);
}
