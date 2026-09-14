/**
 * active-guards-share — 进行中守护分享面数据 (batch59-a)
 *
 * 面子/里子铁律: 分享面只收件数/天数/类别名 — ActiveGuardsShareData 类型上
 * 无金额字段, guardedAmount/assistSaved 在本函数入口即被丢弃,
 * 分享导出零金额由类型 + red-line test 双重保证 (58-a/b 先例)。
 */

import type { ActiveGuardsSummary } from '@/lib/active-guards';

/** 分享面数据 — 面子字段 only, 永不含金额 */
export interface ActiveGuardsShareData {
  totalCount: number;
  persistDays: number;
  categoryNames: string[];
}

export function buildActiveGuardsShareData(summary: ActiveGuardsSummary): ActiveGuardsShareData {
  const names = new Set<string>();
  for (const c of summary.challenges) names.add(c.category);
  for (const c of summary.commitments) names.add(c.category);
  return {
    totalCount: summary.totalCount,
    persistDays: summary.persistDays,
    categoryNames: [...names],
  };
}
