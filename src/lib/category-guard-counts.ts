/**
 * category-guard-counts — 单品类守护计数聚合 (纯函数, batch58-c)
 *
 * "这个月奶茶拦截了几次" 式分类问句的数字来源: 把问句品类 (detector 归一
 * 到五类之一) 与事件品类 (resolveGuardCategory: metadata.category 优先,
 * itemTitle 派生兜底) 对上, 数出该类的拦截轮次与替代/复用采纳次数。
 *
 * 口径红线:
 * - 拦截轮次 = challenge_completed + challenge_failed (与月账单/周对比同口径),
 *   不含 challenge_reward (那是转存流水, 不是轮次)。
 * - 采纳 = mindful_recovery + metadata.kind (green_alt_adoption/reuse_adoption,
 *   与 guard-style-profile 同轨道语义)。
 * - 只数次数, 不碰金额/小时 — 分类问答卡天然无金额面。
 */

import { resolveGuardCategory } from '@/lib/guard-category-insight';
import type { DimensionQueryCategory } from '@/types/dimension-query';

/** 聚合输入: 一条守护事件的最小形状 (health_events camelCase 子集) */
export interface CategoryGuardCountEventInput {
  eventType?: string | null;
  metadata?: Record<string, unknown> | null;
}

export interface CategoryGuardCounts {
  /** 该类拦截轮次 (completed + failed) */
  intercepts: number;
  /** 该类替代采纳次数 */
  altAdoptions: number;
  /** 该类复用采纳次数 */
  reuseAdoptions: number;
}

/** 拦截结算事件 (与 buildMonthlyStatement 的 intercepts 同口径) */
function isSettledRound(eventType: string | null | undefined): boolean {
  return eventType === 'challenge_completed' || eventType === 'challenge_failed';
}

/**
 * 数出指定品类在该批事件里的拦截/替代/复用计数。
 * 纯函数: 无效条目跳过, 绝不抛错, 空/undefined 输入恒全零。
 */
export function aggregateCategoryGuardCounts(
  events: CategoryGuardCountEventInput[] | null | undefined,
  category: DimensionQueryCategory,
): CategoryGuardCounts {
  const counts: CategoryGuardCounts = { intercepts: 0, altAdoptions: 0, reuseAdoptions: 0 };
  for (const e of events || []) {
    if (!e) continue;
    if (resolveGuardCategory(e.metadata) !== category) continue;
    if (isSettledRound(e.eventType)) counts.intercepts += 1;
    const kind = e.metadata?.kind;
    if (e.eventType === 'mindful_recovery' && kind === 'green_alt_adoption') counts.altAdoptions += 1;
    if (e.eventType === 'mindful_recovery' && kind === 'reuse_adoption') counts.reuseAdoptions += 1;
  }
  return counts;
}
