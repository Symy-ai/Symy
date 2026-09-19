/**
 * 财务公开数据层 (batch83-a) — 静态 JSON 文件驱动, 零 DDL / 零依赖。
 *
 * BP 0918 p11 三重公开「财务公开」: 月度收支、会员数、成本结构。设计决策
 * (已定): 财务数据不进数据库 — owner 像发周报一样手动月更 src/data/finance/
 * YYYY-MM.json, 数据与代码同仓, git 历史即账本留痕。
 *
 * 降级红线: 目录缺失 / 坏 JSON 一律返回空数组, 公开页显示"待更新", 不炸不装。
 * 数字为平台聚合台账 (我们自己的账), 无任何用户级数据。
 */

import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';

export interface FinanceMonthRaw {
  month: string;
  members: number;
  revenueUsd: { membership: number; other: number };
  costsUsd: { infra: number; ai: number; team: number };
  notes?: string;
}

export interface FinanceMonth extends FinanceMonthRaw {
  /** 当月净利润 = 收入 − 成本 */
  netUsd: number;
  /** 自首月起累计净额 */
  cumulativeNetUsd: number;
}

export interface FinanceSummary {
  totalRevenueUsd: number;
  totalCostsUsd: number;
  cumulativeNetUsd: number;
  isAllZeroPlaceholder: boolean;
}

export const FINANCE_DIR = path.join(process.cwd(), 'src', 'data', 'finance');

/** 纯计算: 按 month 升序 → 逐月净利润 + 累计净额 */
export function computeFinanceMonths(rows: FinanceMonthRaw[]): FinanceMonth[] {
  const sorted = [...rows].sort((a, b) => a.month.localeCompare(b.month));
  let cumulative = 0;
  return sorted.map((m) => {
    const revenue = (m.revenueUsd?.membership ?? 0) + (m.revenueUsd?.other ?? 0);
    const costs = (m.costsUsd?.infra ?? 0) + (m.costsUsd?.ai ?? 0) + (m.costsUsd?.team ?? 0);
    const netUsd = revenue - costs;
    cumulative += netUsd;
    return { ...m, netUsd, cumulativeNetUsd: cumulative };
  });
}

/** 页面展示层用的无符号 USD 数字格式 (zh/en 各自 locale 分组) */
export function formatUsd(value: number, locale: string): string {
  return new Intl.NumberFormat(locale === 'zh' ? 'zh-CN' : 'en-US', {
    maximumFractionDigits: 2,
  }).format(value);
}

/** 净额可为负 (亏损月) — 诚实原则: 负数原样带符号显示, 不钳成 0 不装 */
export function formatSignedUsd(value: number, locale: string): string {
  return value < 0
    ? `-$${formatUsd(Math.abs(value), locale)}`
    : `$${formatUsd(value, locale)}`;
}

/** 会员数为非负整数展示, 四舍五入后按 locale 分组 */
export function formatMemberCount(value: number, locale: string): string {
  return new Intl.NumberFormat(locale === 'zh' ? 'zh-CN' : 'en-US').format(
    Math.max(0, Math.round(value)),
  );
}

/** 全零 = owner 尚未录入首月真实账目 — 诚实标注占位, 不装有数据 */
export function isAllZeroPlaceholder(months: readonly FinanceMonth[]): boolean {
  return months.every(
    (month) =>
      month.members === 0 &&
      month.revenueUsd.membership === 0 &&
      month.revenueUsd.other === 0 &&
      month.costsUsd.infra === 0 &&
      month.costsUsd.ai === 0 &&
      month.costsUsd.team === 0,
  );
}

/** 表尾汇总: 收入 / 成本合计与自首月累计净额保持同源计算 */
export function summarizeFinanceMonths(months: readonly FinanceMonth[]): FinanceSummary {
  return {
    totalRevenueUsd: months.reduce(
      (sum, month) => sum + month.revenueUsd.membership + month.revenueUsd.other,
      0,
    ),
    totalCostsUsd: months.reduce(
      (sum, month) => sum + month.costsUsd.infra + month.costsUsd.ai + month.costsUsd.team,
      0,
    ),
    cumulativeNetUsd: months.at(-1)?.cumulativeNetUsd ?? 0,
    isAllZeroPlaceholder: isAllZeroPlaceholder(months),
  };
}

/** 读 src/data/finance/*.json 全部月份 → 排序 + 累计; 任何失败 → 空数组降级 */
export async function loadFinanceMonths(dir: string = FINANCE_DIR): Promise<FinanceMonth[]> {
  try {
    const files = (await readdir(dir)).filter((f) => f.endsWith('.json')).sort();
    const parsed = await Promise.all(
      files.map(async (f) => {
        return JSON.parse(await readFile(path.join(dir, f), 'utf8')) as FinanceMonthRaw;
      }),
    );
    return computeFinanceMonths(parsed.filter((m) => Boolean(m) && typeof m?.month === 'string'));
  } catch {
    // safe to ignore: 目录缺失 / 坏 JSON — 财务公开按"账目待更新"降级, 不向公开页抛错
    return [];
  }
}
