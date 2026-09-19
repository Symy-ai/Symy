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
