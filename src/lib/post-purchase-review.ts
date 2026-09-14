/**
 * post-purchase-review — 购后复盘纯派生 (batch51-a)
 *
 * 拦截闭环的最后一环: 用户穿过拦截最终买了 (challenge_failed, 与 guard-win-rate
 * 漏斗同口径), 1–2 天后小象回访「用上了吗?」。用户三选一 (真值/还行/有点后悔)
 * 的评价落 health_events (manual_adjustment + metadata.source='post_purchase_review'),
 * 成为后续拦截文案校准的原料。
 *
 * 口径红线:
 * - 零 DDL / 零新持久化: 全部从既有 health_events 只读派生。
 * - 评价是私密自我数据: 只进卡内小结 (纯次数), 永不进分享/荣誉面, 金额永不出现。
 * - 非羞辱铁律最锋利处: 后悔分支的文案分层在卡组件里, 本文件只管数据;
 *   回访只问体验, 绝不回溯「当初拦过你」。
 */

import type { DuePostPurchaseReview, PostPurchaseReviewSummary } from '@/types/post-purchase-review';

/** 评价事件在 metadata.source 的标记 (manual_adjustment 的语义子类型) */
export const POST_PURCHASE_REVIEW_SOURCE = 'post_purchase_review';

/** 回访时窗: challenge_failed 后至少 1 天才回访 (给用上的时间) */
export const REVIEW_DUE_AFTER_MS = 24 * 60 * 60 * 1000;
/** 回访时窗上界: 超过 7 天的破防不再回访 (太久了, 体验记忆已淡) */
export const REVIEW_STALE_AFTER_MS = 7 * 24 * 60 * 60 * 1000;

/** health_events 最小字段 (GET /api/buddy/health-events 返回的 camelCase 子集) */
export interface PostPurchaseEventInput {
  id?: string;
  eventType: string;
  triggerSource: string | null;
  triggerId: string | null;
  metadata?: Record<string, unknown> | null;
  createdAt: string;
}

function metaOf(e: PostPurchaseEventInput): Record<string, unknown> | null {
  return e.metadata && typeof e.metadata === 'object' ? e.metadata : null;
}

/** 已回访 key 集: 评价事件 metadata.review_key (与 challenge_failed 的 triggerId 对齐) */
function reviewedKeysOf(reviewEvents: PostPurchaseEventInput[] | null | undefined): Set<string> {
  const keys = new Set<string>();
  for (const e of reviewEvents || []) {
    if (e.eventType !== 'manual_adjustment') continue;
    const meta = metaOf(e);
    if (!meta || meta.source !== POST_PURCHASE_REVIEW_SOURCE) continue;
    const key = meta.review_key;
    if (typeof key === 'string' && key) keys.add(key);
  }
  return keys;
}

/**
 * 派生到期待回访的「穿过拦截的购买」。
 * 规则: challenge_failed 按 triggerId 去重 (与 guard-win-rate 同款防御), 取
 * createdAt 落在 [1 天, 7 天] 窗口内且尚未评价的最近一条; 无符合 → null。
 */
export function deriveDuePostPurchaseReview(
  failedEvents: PostPurchaseEventInput[] | null | undefined,
  reviewEvents: PostPurchaseEventInput[] | null | undefined,
  now: number = Date.now(),
): DuePostPurchaseReview | null {
  const reviewed = reviewedKeysOf(reviewEvents);
  let due: DuePostPurchaseReview | null = null;
  const seen = new Set<string>();

  for (const e of failedEvents || []) {
    if (!e || e.eventType !== 'challenge_failed') continue;
    const key = e.triggerId || e.id || '';
    if (key) {
      if (seen.has(key)) continue;
      seen.add(key);
    }
    if (key && reviewed.has(key)) continue;

    const at = new Date(e.createdAt).getTime();
    if (!Number.isFinite(at)) continue;
    const age = now - at;
    if (age < REVIEW_DUE_AFTER_MS || age > REVIEW_STALE_AFTER_MS) continue;

    const meta = metaOf(e);
    const itemName = meta && typeof meta.itemName === 'string' && meta.itemName ? meta.itemName : null;
    const record: DuePostPurchaseReview = { key: key || e.createdAt, itemName, failedAt: e.createdAt };
    // 多条符合时取最近的 (createdAt 最大)
    if (!due || record.failedAt > due.failedAt) due = record;
  }

  return due;
}

/** 评价事件是否为本复盘流写入 (供消费方过滤) */
export function isPostPurchaseReviewEvent(e: PostPurchaseEventInput): boolean {
  if (e.eventType !== 'manual_adjustment') return false;
  const meta = metaOf(e);
  return !!meta && meta.source === POST_PURCHASE_REVIEW_SOURCE;
}

function normalizeRating(v: unknown): 'worth' | 'ok' | 'regret' | null {
  return v === 'worth' || v === 'ok' || v === 'regret' ? v : null;
}

/**
 * 卡内小结: 复盘过的购物里值/还行/后悔计数 (纯次数, 无金额无碳数值)。
 * 按幂等去重 (metadata.review_key 优先, 缺失回退 id+createdAt) 防重复落库。
 */
export function deriveReviewSummary(
  reviewEvents: PostPurchaseEventInput[] | null | undefined,
): PostPurchaseReviewSummary {
  const seen = new Set<string>();
  const summary: PostPurchaseReviewSummary = { worth: 0, ok: 0, regret: 0, total: 0 };

  for (const e of reviewEvents || []) {
    if (!isPostPurchaseReviewEvent(e)) continue;
    const meta = metaOf(e)!;
    const rating = normalizeRating(meta.rating);
    if (!rating) continue;
    const key = typeof meta.review_key === 'string' && meta.review_key
      ? `r:${meta.review_key}`
      : `r:${e.id || `${e.createdAt}:${rating}`}`;
    if (seen.has(key)) continue;
    seen.add(key);
    summary[rating] += 1;
    summary.total += 1;
  }

  return summary;
}
