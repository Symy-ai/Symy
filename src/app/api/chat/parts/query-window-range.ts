/**
 * query-window-range — 问账类 canned 轮的共享时间窗工具 (batch58-c)
 *
 * 57-c savings-query-turn 的 windowRange/切片逻辑原样抽出共用 (周界
 * Monday-start 复用 localWeekStart, 月界本地自然月), 供 58-c 分类/时段
 * 问句轮复用 — 同一约定不再各抄一份。行为与 57-c 逐字节一致 (纯搬移)。
 */

import { localWeekStart } from '@/lib/weekly-guard-compare';
import type { SavingsQueryWindow } from '@/types/savings-query';

/** 窗口本地时间界 [start, end) — 周界复用 localWeekStart (Monday-start 同约定) */
export function queryWindowRange(window: SavingsQueryWindow, now: Date): { start: Date; end: Date } {
  if (window === 'thisWeek') {
    const start = localWeekStart(now);
    return { start, end: new Date(start.getFullYear(), start.getMonth(), start.getDate() + 7) };
  }
  if (window === 'lastWeek') {
    const end = localWeekStart(now);
    return { start: new Date(end.getFullYear(), end.getMonth(), end.getDate() - 7), end };
  }
  const y = now.getFullYear();
  const m = now.getMonth();
  if (window === 'thisMonth') {
    return { start: new Date(y, m, 1), end: new Date(y, m + 1, 1) };
  }
  return { start: new Date(y, m - 1, 1), end: new Date(y, m, 1) };
}

/** 有 createdAt 的最小事件形状 (camelCase 子集) */
export interface QueryWindowEventLike {
  createdAt: string;
}

/** 时间窗切片 (机械过滤, 聚合口径仍由各聚合 lib 自己定义) */
export function sliceEventsByQueryWindow<T extends QueryWindowEventLike>(
  events: T[] | null | undefined,
  window: SavingsQueryWindow,
  now: Date,
): T[] {
  const { start, end } = queryWindowRange(window, now);
  return (events || []).filter((e) => {
    const t = new Date(e.createdAt).getTime();
    if (!Number.isFinite(t)) return false;
    const d = new Date(t);
    const local = new Date(d.getFullYear(), d.getMonth(), d.getDate(), d.getHours(), d.getMinutes(), d.getSeconds(), d.getMilliseconds());
    return local >= start && local < end;
  });
}

/**
 * 时间窗词表 (R906 收编) — 57-c/58-c 三 detector 逐字相同的 WINDOW_ZH/WINDOW_EN
 * 上收单源。表序=裁决序 (上周/上月 先于 本周/本月, 先中先得); 默认 thisMonth。
 * follow-up-query 的 TIMEWORD 表含「上季度≈上月」近似与「前一周」, 语义不同,
 * 不并入本表 (不同词表不合并)。
 */
export const QUERY_WINDOW_KEYWORDS_ZH: ReadonlyArray<{ re: RegExp; window: SavingsQueryWindow }> = [
  { re: /上周|上一周/, window: 'lastWeek' },
  { re: /本周|这周|这一周/, window: 'thisWeek' },
  { re: /上个?月/, window: 'lastMonth' },
  { re: /本月|这个月|这月/, window: 'thisMonth' },
];

export const QUERY_WINDOW_KEYWORDS_EN: ReadonlyArray<{ re: RegExp; window: SavingsQueryWindow }> = [
  { re: /(?<![\w-])last week(?![\w-])/i, window: 'lastWeek' },
  { re: /(?<![\w-])(?:this|the past|past) week(?![\w-])/i, window: 'thisWeek' },
  { re: /(?<![\w-])last month(?![\w-])/i, window: 'lastMonth' },
  { re: /(?<![\w-])(?:this|the) month(?![\w-])/i, window: 'thisMonth' },
];

/** 从已归一文本解析时间窗 (zh 先 en 后, 先中先得); 未命中返回 null (调用方按约定默认 thisMonth) */
export function resolveQueryWindowFromText(normalized: string): SavingsQueryWindow | null {
  for (const { re, window } of QUERY_WINDOW_KEYWORDS_ZH) {
    if (re.test(normalized)) return window;
  }
  for (const { re, window } of QUERY_WINDOW_KEYWORDS_EN) {
    if (re.test(normalized)) return window;
  }
  return null;
}
