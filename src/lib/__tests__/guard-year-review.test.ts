import { describe, expect, it } from 'vitest';
import {
  buildGuardYearReview,
  buildGuardYearReviewShare,
  type GuardYearReviewEventInput,
} from '../guard-year-review';

const NOW = new Date(2026, 11, 15);

function event(overrides: Partial<GuardYearReviewEventInput>): GuardYearReviewEventInput {
  return {
    eventType: 'challenge_completed',
    triggerId: `id:${Math.random()}`,
    metadata: {},
    ...overrides,
    ...(overrides.createdAt === undefined ? { createdAt: new Date(2026, 0, 1).toISOString() } : {}),
  };
}

function intercept(month: number, day = 1, extra: Partial<GuardYearReviewEventInput> = {}) {
  return event({ createdAt: new Date(2026, month, day, 10).toISOString(), ...extra });
}

function at(year: number, month: number, day: number): string {
  return new Date(year, month, day, 10).toISOString();
}

function absolute(year: number, month: number, day: number, extra: Partial<GuardYearReviewEventInput> = {}) {
  return event({ createdAt: at(year, month, day), ...extra });
}

function adoption(month: number, entryId: string, day = 2) {
  return event({
    eventType: 'mindful_recovery',
    createdAt: new Date(2026, month, day, 10).toISOString(),
    metadata: { kind: 'green_alt_adoption', entryId, estSaved: 25 },
  });
}

describe('buildGuardYearReview', () => {
  it('returns a stable insufficient shape for empty data', () => {
    const review = buildGuardYearReview([], { now: NOW, year: 2026 });
    expect(review.status).toBe('insufficient');
    expect(review.months).toHaveLength(12);
    expect(review.months.every((month) => month.intercepts === 0)).toBe(true);
    expect(review.last30Days).toEqual({ actions: 0, activeDays: 0, hoursReclaimed: 0 });
  });

  it('aggregates one-month data without inventing annual conclusions', () => {
    const review = buildGuardYearReview([
      intercept(0, 1, { metadata: { savedAmount: 50 } }),
      intercept(0, 2),
      adoption(0, 'handmade-gift'),
    ], { now: NOW, year: 2026 });
    expect(review.months[0].intercepts).toBe(2);
    expect(review.months[0].adoptions).toBe(1);
    expect(review.private.hoursReclaimed).toBeCloseTo(3, 5);
    expect(review.status).toBe('insufficient');
  });

  it('keeps cross-year data in its own comparison bucket', () => {
    const review = buildGuardYearReview([
      absolute(2025, 5, 1),
      absolute(2025, 6, 1),
      absolute(2026, 1, 1),
      absolute(2027, 1, 1),
    ], { now: NOW, year: 2026 });
    expect(review.totals.intercepts).toBe(1);
    expect(review.yearOverYear.status).toBe('ok');
    expect(review.yearOverYear.intercepts).toBe('down');
  });

  it('skips malformed metadata and invalid dates without throwing', () => {
    const review = buildGuardYearReview([
      event({ createdAt: 'not-a-date', metadata: 'junk' as unknown as Record<string, unknown> }),
      event({ createdAt: null, metadata: { savedAmount: Number.NaN } }),
      intercept(0, 1, { metadata: { savedAmount: 'bad' } }),
    ], { now: NOW, year: 2026 });
    expect(review.totals.intercepts).toBe(1);
    expect(review.private.hoursReclaimed).toBe(0);
  });

  it('builds trends, scenes, streaks and private behavior counts', () => {
    const events = [
      // Previous year baseline
      absolute(2025, 2, 1, { metadata: { category: 'clothing', savedAmount: 50 } }),
      // Three active months and a 3-day streak
      intercept(0, 1, { metadata: { category: 'clothing', savedAmount: 25 } }),
      intercept(0, 2, { metadata: { category: 'clothing', savedAmount: 25 } }),
      intercept(0, 3, { metadata: { category: 'clothing', savedAmount: 25 } }),
      absolute(2026, 1, 1, { eventType: 'challenge_failed', metadata: { category: 'food' } }),
      absolute(2026, 1, 2, { eventType: 'challenge_failed', metadata: { category: 'food' } }),
      absolute(2026, 1, 3, { eventType: 'challenge_failed', metadata: { category: 'food' } }),
      adoption(2, 'ebook_repurchase'),
      adoption(2, 'course_backlog_first'),
      event({
        eventType: 'manual_adjustment',
        createdAt: at(2026, 3, 1),
        metadata: { source: 'green_commitment_settlement', ref_key: '2026-03-01#2026-03-31', outcome: 'kept' },
      }),
      event({
        eventType: 'manual_adjustment',
        createdAt: at(2026, 2, 1),
        metadata: { source: 'green_commitment', category: 'clothing', subject: 'clothes', start_key: '2026-03-01', end_key: '2026-03-31' },
      }),
    ];
    const review = buildGuardYearReview(events, { now: NOW, year: 2026, hourlyRate: 25 });
    expect(review.status).toBe('ok');
    expect(review.activeMonths).toBe(3);
    expect(review.longestStreakDays).toBe(3);
    expect(review.steadiestScenes[0]?.category).toBe('clothing');
    expect(review.needsCareScenes[0]?.category).toBe('food');
    expect(review.alternativeAdoptionCategories[0]).toEqual({ category: 'digital-content', count: 2 });
    expect(review.private.avoidedRepeatPurchases).toBe(1);
    expect(review.private.avoidedHoarding).toBe(1);
    expect(review.monthOverMonth.status).toBe('ok');
    expect(review.yearOverYear.hours).toBe('up');
  });

  it('projects an amount-free and carbon-number-free share shape', () => {
    const review = buildGuardYearReview([intercept(0), intercept(1), absolute(2026, 2, 2, {
      eventType: 'mindful_recovery',
      metadata: { kind: 'green_alt_adoption', entryId: 'handmade-gift', estSaved: 25 },
    })], { now: NOW, year: 2026 });
    const share = buildGuardYearReviewShare(review);
    expect(share).toEqual({
      year: 2026,
      intercepts: 2,
      commitments: 0,
      adoptions: 1,
      longestStreakDays: 1,
      steadiestMonth: 0,
    });
    expect(JSON.stringify(share)).not.toMatch(/amount|money|carbon|savedAmount|estSaved/i);
  });
});
