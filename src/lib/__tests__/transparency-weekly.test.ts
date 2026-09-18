/**
 * Tests for transparency-weekly pure aggregation (batch81-a)
 *
 * - utcWeekStart: 周一 00:00 UTC 边界 (周五/周一/周日)
 * - aggregateTransparency: 周窗切分 / (user,event_type,trigger) 幂等去重 /
 *   guards 去重 (failed-only 不计入) / 金额清洗 (string/0/负/NaN) + round2 /
 *   hoursWon = saved / $25
 * - 快照键面契约: 恰好 8 个顶层键, 序列化产物零 "user" — 无个人级字段 (红线)
 * - asTransparencySnapshot: 快照表 jsonb 回读验形, 坏行 → null
 */

import { describe, it, expect } from 'vitest';
import {
  aggregateTransparency,
  asTransparencySnapshot,
  emptyTransparency,
  utcWeekStart,
  type TransparencyHealthRow,
  type TransparencyPassedChallengeRow,
} from '../transparency-weekly';

const NOW = new Date('2026-09-18T12:00:00Z'); // Friday
const WEEK_START_MS = Date.UTC(2026, 8, 14); // Monday 2026-09-14 00:00 UTC

function healthRow(overrides: Partial<TransparencyHealthRow>): TransparencyHealthRow {
  return { id: 'h-id', user_id: 'u1', event_type: 'challenge_completed', trigger_id: null, created_at: NOW.toISOString(), ...overrides };
}

function passedRow(amount: number | string | null, completedAt: string | null): TransparencyPassedChallengeRow {
  return { amount, completed_at: completedAt };
}

const inWeek = new Date(WEEK_START_MS + 3_600_000).toISOString();
const lastWeek = new Date(WEEK_START_MS - 86_400_000).toISOString();

describe('utcWeekStart', () => {
  it('maps Friday to the same Monday 00:00 UTC', () => {
    expect(utcWeekStart(NOW).toISOString()).toBe('2026-09-14T00:00:00.000Z');
  });

  it('keeps Monday as its own 00:00 UTC', () => {
    expect(utcWeekStart(new Date('2026-09-14T08:30:00Z')).toISOString()).toBe('2026-09-14T00:00:00.000Z');
  });

  it('rolls Sunday back to the previous Monday', () => {
    expect(utcWeekStart(new Date('2026-09-13T23:59:00Z')).toISOString()).toBe('2026-09-07T00:00:00.000Z');
  });
});

describe('aggregateTransparency', () => {
  it('splits intercepts into week vs total buckets', () => {
    const rows = [
      healthRow({ id: 'a', created_at: inWeek }),
      healthRow({ id: 'b', user_id: 'u2', event_type: 'challenge_failed', created_at: lastWeek }),
    ];
    const snap = aggregateTransparency(rows, [], NOW);
    expect(snap.intercepts).toEqual({ week: 1, total: 2 });
  });

  it('deduplicates intercepts per (user, event_type, trigger_id) — same trigger on two users counts twice', () => {
    const rows = [
      healthRow({ id: 'a', user_id: 'u1', trigger_id: 'tr-1', created_at: inWeek }),
      healthRow({ id: 'a-dup', user_id: 'u1', trigger_id: 'tr-1', created_at: inWeek }),
      healthRow({ id: 'b', user_id: 'u2', trigger_id: 'tr-1', created_at: inWeek }),
      healthRow({ id: 'c', user_id: 'u1', event_type: 'challenge_failed', trigger_id: 'tr-1', created_at: inWeek }),
    ];
    const snap = aggregateTransparency(rows, [], NOW);
    expect(snap.intercepts).toEqual({ week: 3, total: 3 });
  });

  it('falls back to row id for dedup when trigger_id is missing', () => {
    const rows = [
      healthRow({ id: 'a', user_id: 'u1', trigger_id: null, created_at: inWeek }),
      healthRow({ id: 'a', user_id: 'u1', trigger_id: null, created_at: inWeek }),
    ];
    expect(aggregateTransparency(rows, [], NOW).intercepts.total).toBe(1);
  });

  it('counts guards as distinct users with ≥1 completed challenge (failed-only excluded)', () => {
    const rows = [
      healthRow({ id: 'a', user_id: 'u1', event_type: 'challenge_completed', created_at: inWeek }),
      healthRow({ id: 'b', user_id: 'u1', event_type: 'challenge_failed', created_at: inWeek }),
      healthRow({ id: 'c', user_id: 'u2', event_type: 'challenge_completed', created_at: lastWeek }),
      healthRow({ id: 'd', user_id: 'u3', event_type: 'challenge_failed', created_at: inWeek }),
      healthRow({ id: 'e', user_id: 'u4', event_type: 'mindful_recovery', created_at: inWeek }),
    ];
    expect(aggregateTransparency(rows, [], NOW).guards).toBe(2);
  });

  it('sums savedUsd week/total from passed challenges, coercing numeric strings and skipping invalid amounts', () => {
    const rows: TransparencyPassedChallengeRow[] = [
      passedRow(100, inWeek),
      passedRow('50.5', lastWeek),
      passedRow('0.1', inWeek),
      passedRow('0.2', inWeek),
      passedRow(0, inWeek),
      passedRow(-5, inWeek),
      passedRow(null, inWeek),
      passedRow(Number.NaN, inWeek),
      passedRow(42, null),
    ];
    const snap = aggregateTransparency([], rows, NOW);
    expect(snap.savedUsd.week).toBe(100.3);
    expect(snap.savedUsd.total).toBe(192.8);
  });

  it('derives hoursWon from savedUsd at the $25 default rate', () => {
    const snap = aggregateTransparency([], [passedRow(100, inWeek), passedRow(50, lastWeek)], NOW);
    expect(snap.hoursWon).toEqual({ week: 4, total: 6 });
  });

  it('keeps the contract keys exactly and serializes with zero user-level fields (red line)', () => {
    const snap = aggregateTransparency(
      [healthRow({ id: 'a', user_id: 'u1', created_at: inWeek })],
      [passedRow(10, inWeek)],
      NOW,
    );
    expect(Object.keys(snap)).toEqual([
      'weekStart',
      'weekEnd',
      'intercepts',
      'savedUsd',
      'hoursWon',
      'guards',
      'generatedAt',
      'degraded',
    ]);
    expect(JSON.stringify(snap)).not.toMatch(/user/i);
    expect(snap.degraded).toBe(false);
    expect(snap.weekStart).toBe('2026-09-14T00:00:00.000Z');
    expect(snap.weekEnd).toBe(NOW.toISOString());
  });

  it('skips rows with invalid created_at instead of throwing', () => {
    const rows = [healthRow({ id: 'a', created_at: 'not-a-date' }), healthRow({ id: 'b', created_at: inWeek })];
    expect(aggregateTransparency(rows, [], NOW).intercepts.total).toBe(1);
  });

  it('tolerates null/undefined inputs', () => {
    const snap = aggregateTransparency(null, undefined, NOW);
    expect(snap.intercepts).toEqual({ week: 0, total: 0 });
    expect(snap.guards).toBe(0);
  });
});

describe('emptyTransparency', () => {
  it('returns a zeroed snapshot with the given degraded flag', () => {
    const snap = emptyTransparency(NOW, true);
    expect(snap.guards).toBe(0);
    expect(snap.savedUsd).toEqual({ week: 0, total: 0 });
    expect(snap.degraded).toBe(true);
    expect(snap.weekStart).toBe('2026-09-14T00:00:00.000Z');
  });
});

describe('asTransparencySnapshot', () => {
  it('passes a valid payload through and normalizes degraded to boolean', () => {
    const valid = aggregateTransparency([], [], NOW);
    expect(asTransparencySnapshot({ ...valid, degraded: undefined })).toMatchObject({ degraded: false });
    expect(asTransparencySnapshot({ ...valid, degraded: true })?.degraded).toBe(true);
  });

  it('rejects garbage payloads (null / missing fields / wrong metric shape)', () => {
    expect(asTransparencySnapshot(null)).toBeNull();
    expect(asTransparencySnapshot('json')).toBeNull();
    expect(asTransparencySnapshot({})).toBeNull();
    const valid = aggregateTransparency([], [], NOW);
    expect(asTransparencySnapshot({ ...valid, guards: 'many' })).toBeNull();
    expect(asTransparencySnapshot({ ...valid, savedUsd: { week: '1', total: 2 } })).toBeNull();
  });
});
