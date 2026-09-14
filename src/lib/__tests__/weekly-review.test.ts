/**
 * weekly-review 纯派生测试 (batch52-b)
 *
 * 覆盖: weekKeyOf 周一日期 (复用 localWeekStart, 周中/周日/跨月), 状态机
 * (noData / due / reviewed, week_key 去重 — 一周只主动一次), 候选时刻
 * (本周有结局拦截, triggerId 去重, 最近在前, 截断 4 条), completed 回读。
 */

import { describe, expect, it } from 'vitest';
import {
  WEEKLY_REVIEW_SOURCE,
  deriveWeeklyReview,
  isWeeklyReviewEvent,
  weekKeyOf,
  MAX_PROUD_CANDIDATES,
} from '@/lib/weekly-review';
import type { WeeklyGuardEventInput } from '@/lib/weekly-guard-compare';

/** 2026-09-06 是周日; 2026-09-07 是周一 → 该周 weekKey = 2026-09-07 */
const NOW = new Date(2026, 8, 9, 20, 0, 0); // 周三晚 (周复盘时点)

function intercept(type: 'challenge_completed' | 'challenge_failed', at: Date, triggerId: string, itemName?: string): WeeklyGuardEventInput {
  return {
    eventType: type,
    triggerSource: 'chat',
    triggerId,
    metadata: itemName ? { itemName } : null,
    createdAt: at.toISOString(),
  };
}

function reviewEvent(weekKey: string, rating: string, at: Date, extra: Record<string, unknown> = {}): WeeklyGuardEventInput {
  return {
    eventType: 'manual_adjustment',
    triggerSource: 'manual',
    triggerId: null,
    metadata: { source: WEEKLY_REVIEW_SOURCE, week_key: weekKey, rating, ...extra },
    createdAt: at.toISOString(),
  };
}

describe('weekKeyOf (周界复用 localWeekStart, 禁止自写切周)', () => {
  it('周中任意时刻 → 本周周一日期', () => {
    expect(weekKeyOf(new Date(2026, 8, 9, 23, 30))).toBe('2026-09-07'); // 周三深夜
    expect(weekKeyOf(new Date(2026, 8, 7, 0, 0))).toBe('2026-09-07'); // 周一 00:00
  });

  it('周日 → 上一周周一 (不是下一周)', () => {
    expect(weekKeyOf(new Date(2026, 8, 6, 12, 0))).toBe('2026-08-31');
  });

  it('跨月周 (周一在上月) → 上月日期', () => {
    expect(weekKeyOf(new Date(2026, 8, 2, 12, 0))).toBe('2026-08-31'); // 9/2 周三
  });
});

describe('deriveWeeklyReview 状态机', () => {
  it('本周无任何数据 → noData (引导态, 不假数据)', () => {
    const r = deriveWeeklyReview([], NOW);
    expect(r.status).toBe('noData');
    expect(r.candidates).toEqual([]);
    expect(r.completed).toBeNull();
  });

  it('本周有拦截且未复盘 → due + 候选', () => {
    const events = [
      intercept('challenge_completed', new Date(2026, 8, 8, 10), 't1', '耳机'),
      intercept('challenge_failed', new Date(2026, 8, 7, 21), 't2'),
    ];
    const r = deriveWeeklyReview(events, NOW);
    expect(r.status).toBe('due');
    expect(r.weekKey).toBe('2026-09-07');
    expect(r.compare.thisWeek.intercepts).toBe(2);
    expect(r.candidates).toHaveLength(2);
    // 最近在前
    expect(r.candidates[0]).toEqual({ key: 't1', itemName: '耳机' });
    expect(r.candidates[1]).toEqual({ key: 't2', itemName: null });
  });

  it('已有本周 week_key 复盘事件 → reviewed + completed 回读', () => {
    const events = [
      intercept('challenge_completed', new Date(2026, 8, 8, 10), 't1', '跑鞋'),
      reviewEvent('2026-09-07', 'okay', new Date(2026, 8, 9, 21), { proud_key: 't1', proud_item: '跑鞋' }),
    ];
    const r = deriveWeeklyReview(events, NOW);
    expect(r.status).toBe('reviewed');
    expect(r.completed).toEqual({ rating: 'okay', proudKey: 't1', proudLabel: '跑鞋' });
  });

  it('上周的复盘事件不算本周 (week_key 去重, 一周只主动一次)', () => {
    const events = [
      intercept('challenge_completed', new Date(2026, 8, 8, 10), 't1'),
      reviewEvent('2026-08-31', 'exceeded', new Date(2026, 8, 31, 21)),
    ];
    const r = deriveWeeklyReview(events, NOW);
    expect(r.status).toBe('due');
  });

  it('多条本周复盘取最近一条; 无效 rating 的复盘事件被忽略', () => {
    const events = [
      intercept('challenge_completed', new Date(2026, 8, 8, 10), 't1'),
      reviewEvent('2026-09-07', 'bogus', new Date(2026, 8, 9, 21)),
      reviewEvent('2026-09-07', 'tough', new Date(2026, 8, 9, 22)),
    ];
    const r = deriveWeeklyReview(events, NOW);
    expect(r.status).toBe('reviewed');
    expect(r.completed?.rating).toBe('tough');
  });
});

describe('deriveWeeklyReview 候选时刻', () => {
  it('上周/更早的拦截不进候选; triggerId 去重', () => {
    const events = [
      intercept('challenge_completed', new Date(2026, 8, 3, 10), 'old1', '上周的'),
      intercept('challenge_failed', new Date(2026, 8, 8, 9), 't1'),
      intercept('challenge_failed', new Date(2026, 8, 8, 12), 't1'), // 同 triggerId 重复
    ];
    const r = deriveWeeklyReview(events, NOW);
    expect(r.candidates).toHaveLength(1);
    expect(r.candidates[0].key).toBe('t1');
  });

  it('候选超过上限截断, 且保留最近的', () => {
    const events = Array.from({ length: 7 }, (_, i) =>
      intercept('challenge_completed', new Date(2026, 8, 7, 8 + i), `t${i}`),
    );
    const r = deriveWeeklyReview(events, NOW);
    expect(r.candidates).toHaveLength(MAX_PROUD_CANDIDATES);
    expect(r.candidates[0].key).toBe('t6');
    expect(r.candidates[3].key).toBe('t3');
  });

  it('本周只有转存无拦截 → 有数据 (due), 候选为空', () => {
    const events: WeeklyGuardEventInput[] = [
      {
        eventType: 'challenge_reward',
        triggerSource: 'deposit_api',
        triggerId: 'd1',
        metadata: { source: 'deposit', amount: 50 },
        createdAt: new Date(2026, 8, 8, 10).toISOString(),
      },
    ];
    const r = deriveWeeklyReview(events, NOW, 25);
    expect(r.status).toBe('due');
    expect(r.compare.thisWeek.guardedAmount).toBe(50);
    expect(r.compare.thisWeek.hoursReclaimed).toBe(2);
    expect(r.candidates).toEqual([]);
  });
});

describe('isWeeklyReviewEvent', () => {
  it('只认 manual_adjustment + source=weekly_review', () => {
    expect(isWeeklyReviewEvent(reviewEvent('2026-09-07', 'okay', NOW))).toBe(true);
    expect(isWeeklyReviewEvent({
      eventType: 'manual_adjustment',
      triggerSource: 'manual',
      triggerId: null,
      metadata: { source: 'post_purchase_review' },
      createdAt: NOW.toISOString(),
    })).toBe(false);
    expect(isWeeklyReviewEvent(intercept('challenge_completed', NOW, 't1'))).toBe(false);
  });
});
