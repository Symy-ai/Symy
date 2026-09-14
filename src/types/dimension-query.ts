/**
 * dimension-query 类型 — 分类/时段维度问答卡 payload (batch58-c)
 *
 * savings-query-detector (57-c) 的维度细化: 用户追问 "这个月奶茶拦截了几次"
 * (分类维度, category-query-detector) 或 "我晚上冲动买的多吗" (时段维度,
 * impulse-time-query-detector) 时, 服务端用既有聚合 lib 纯函数算出数字,
 * canned 生成 (绝不经过 Letta), 随 SSE / 非流式 JSON 附带。
 *
 * 红线:
 * - 卡上数字全部来自聚合 lib (aggregateCategoryGuardCounts /
 *   aggregateImpulseWindows), 本层不做第二遍口径计算。
 * - 本任务无分享面 — 类型层不设 shareFace / private 金额字段。
 * - 无碳数值; 样本不足时 status='insufficient' 引导态, 不造伪结论。
 */

import type { SavingsQueryWindow } from '@/types/savings-query';

/** 分类问句可答品类 — resolveGuardCategory 的已知五类 (不含 other 兜底桶) */
export type DimensionQueryCategory = 'electronics' | 'clothing' | 'beauty' | 'home' | 'food';

export interface CategoryQueryCardData {
  window: SavingsQueryWindow;
  category: DimensionQueryCategory;
  /** 'noData' = 该窗无任何守护事件; 'ok' = 该类计数如实展示 (含 0) */
  status: 'ok' | 'noData';
  /** 该类拦截轮次 (challenge_completed/failed, 与月账单同口径) */
  intercepts: number;
  /** 该类替代采纳次数 (green_alt_adoption) */
  altAdoptions: number;
  /** 该类复用采纳次数 (reuse_adoption) */
  reuseAdoptions: number;
}

/** 时段问句的冲动时段 — 与 impulse-window 的桶 id 同源 */
export type ImpulseTimeWindowId = 'dawn' | 'daytime' | 'evening' | 'lateNight';

export interface ImpulseTimeCardData {
  window: SavingsQueryWindow;
  impulseWindow: ImpulseTimeWindowId;
  /** 'insufficient' = 样本 < aggregateImpulseWindows 阈值, 不渲染伪洞察 */
  status: 'ok' | 'insufficient';
  /** 该时段冲动购买次数 (本地时区分桶) */
  count: number;
  /** 该时段冲动购买覆盖的天数 (去重本地日期) */
  days: number;
  /** 该窗守护事件总量 (分母, 恒展示供对照) */
  total: number;
}
