/**
 * post-purchase-review 纯派生测试 — batch51-a
 *
 * 覆盖: 回访触发时机 (1–7 天窗口内到期, <1 天不到期, >7 天过期),
 * triggerId 去重, 已评价跳过, 评价事件过滤, 小结计数与去重, 非法 rating 忽略。
 */

import { describe, expect, it } from 'vitest';
import {
  POST_PURCHASE_REVIEW_SOURCE,
  REVIEW_DUE_AFTER_MS,
  deriveDuePostPurchaseReview,
  deriveReviewSummary,
  isPostPurchaseReviewEvent,
  type PostPurchaseEventInput,
} from '../post-purchase-review';

const HOUR = 60 * 60 * 1000;
const NOW = Date.parse('2026-09-08T12:00:00');

function iso(offsetHours: number): string {
  return new Date(NOW - offsetHours * HOUR).toISOString();
}

function failedEvent(over: Partial<PostPurchaseEventInput> = {}): PostPurchaseEventInput {
  return {
    eventType: 'challenge_failed',
    triggerSource: 'chat_mcp',
    triggerId: 'cf:u1:ch1',
    metadata: { itemName: '耳机', savedAmount: 128 },
    createdAt: iso(36),
    ...over,
  };
}

function reviewEvent(over: Partial<PostPurchaseEventInput> = {}): PostPurchaseEventInput {
  return {
    eventType: 'manual_adjustment',
    triggerSource: 'manual',
    triggerId: null,
    metadata: { source: POST_PURCHASE_REVIEW_SOURCE, rating: 'worth', review_key: 'cf:u1:ch1' },
    createdAt: iso(10),
    ...over,
  };
}

describe('deriveDuePostPurchaseReview (回访触发时机)', () => {
  it('36h 前的破防 → 到期待回访, 回带 itemName 与 key', () => {
    const due = deriveDuePostPurchaseReview([failedEvent()], [], NOW);
    expect(due).toEqual({ key: 'cf:u1:ch1', itemName: '耳机', failedAt: iso(36) });
  });

  it('不足 1 天 (< 24h) 不回访 — 给用户用上的时间', () => {
    expect(deriveDuePostPurchaseReview([failedEvent({ createdAt: iso(12) })], [], NOW)).toBeNull();
  });

  it('恰满 24h 到期 (边界含)', () => {
    const at = new Date(NOW - REVIEW_DUE_AFTER_MS).toISOString();
    expect(deriveDuePostPurchaseReview([failedEvent({ createdAt: at })], [], NOW)).not.toBeNull();
  });

  it('超过 7 天过期不再回访', () => {
    expect(deriveDuePostPurchaseReview([failedEvent({ createdAt: iso(24 * 8) })], [], NOW)).toBeNull();
  });

  it('已评价过的破防不再回访 (review_key 对齐 triggerId)', () => {
    expect(deriveDuePostPurchaseReview([failedEvent()], [reviewEvent()], NOW)).toBeNull();
  });

  it('评价的是另一单 → 本单仍待回访', () => {
    expect(deriveDuePostPurchaseReview([failedEvent()], [reviewEvent({ metadata: { source: POST_PURCHASE_REVIEW_SOURCE, rating: 'regret', review_key: 'cf:u1:other' } })], NOW)).not.toBeNull();
  });

  it('多条符合时取最近的一条; triggerId 重复按一条算', () => {
    const events = [
      failedEvent({ triggerId: 'cf:u1:a', createdAt: iso(72), metadata: { itemName: '旧款' } }),
      failedEvent({ triggerId: 'cf:u1:b', createdAt: iso(30), metadata: { itemName: '新款' } }),
      failedEvent({ triggerId: 'cf:u1:b', createdAt: iso(30) }),
    ];
    expect(deriveDuePostPurchaseReview(events, [], NOW)?.itemName).toBe('新款');
  });

  it('metadata.itemName 缺失 → itemName null (卡内走通用文案)', () => {
    expect(deriveDuePostPurchaseReview([failedEvent({ metadata: null })], [], NOW)?.itemName).toBeNull();
  });
});

describe('isPostPurchaseReviewEvent / deriveReviewSummary (小结计数)', () => {
  it('只认 manual_adjustment + source=post_purchase_review', () => {
    expect(isPostPurchaseReviewEvent(reviewEvent())).toBe(true);
    expect(isPostPurchaseReviewEvent(reviewEvent({ eventType: 'challenge_reward' }))).toBe(false);
    expect(isPostPurchaseReviewEvent({ eventType: 'manual_adjustment', triggerSource: 'manual', triggerId: null, metadata: { source: 'prepurchase_followup' }, createdAt: iso(1) })).toBe(false);
  });

  it('三分支各计一次, total 汇总', () => {
    const s = deriveReviewSummary([
      reviewEvent(),
      reviewEvent({ metadata: { source: POST_PURCHASE_REVIEW_SOURCE, rating: 'ok', review_key: 'k2' } }),
      reviewEvent({ metadata: { source: POST_PURCHASE_REVIEW_SOURCE, rating: 'regret', review_key: 'k3' } }),
    ]);
    expect(s).toEqual({ worth: 1, ok: 1, regret: 1, total: 3 });
  });

  it('同一 review_key 重复落库只计一次 (幂等去重)', () => {
    const s = deriveReviewSummary([reviewEvent(), reviewEvent({ createdAt: iso(9) })]);
    expect(s).toEqual({ worth: 1, ok: 0, regret: 0, total: 1 });
  });

  it('非法 rating 与无关事件忽略; 空输入零计数', () => {
    const s = deriveReviewSummary([
      reviewEvent({ metadata: { source: POST_PURCHASE_REVIEW_SOURCE, rating: 'meh', review_key: 'k' } }),
      failedEvent(),
    ]);
    expect(s).toEqual({ worth: 0, ok: 0, regret: 0, total: 0 });
    expect(deriveReviewSummary(null)).toEqual({ worth: 0, ok: 0, regret: 0, total: 0 });
  });
});
