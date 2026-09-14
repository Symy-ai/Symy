/**
 * post-purchase-review — 购后复盘类型 (batch51-a)
 *
 * 拦截失败 (challenge_failed = 用户穿过拦截完成购买) 后 1–2 天的温柔回访。
 * 评价以 manual_adjustment + metadata.source='post_purchase_review' 落库
 * (客户端唯一允许的纯审计类型, 零 DDL 零 vitality 副作用)。
 */

/** 三档评价: 真值 / 还行 / 有点后悔 */
export type PostPurchaseRating = 'worth' | 'ok' | 'regret';

/** 到期待回访的一次「穿过拦截的购买」(由 challenge_failed 派生) */
export interface DuePostPurchaseReview {
  /** 幂等 key = challenge_failed 的 triggerId (评价事件的 metadata.review_key 与之对齐) */
  key: string;
  /** 买的东西 (challenge_failed metadata.itemName); 缺失时 null → 卡内用通用文案 */
  itemName: string | null;
  /** challenge_failed 的 createdAt (ISO) */
  failedAt: string;
}

/** 卡内小结: 复盘过的购物里值/后悔计数 (纯次数, 无金额) */
export interface PostPurchaseReviewSummary {
  worth: number;
  ok: number;
  regret: number;
  total: number;
}
