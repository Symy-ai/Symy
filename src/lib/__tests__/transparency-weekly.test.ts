/**
 * Tests for transparency-weekly pure aggregation (batch81-a / batch82-b / batch104-c)
 *
 * - utcWeekStart: 周一 00:00 UTC 边界 (周五/周一/周日)
 * - aggregateTransparency: 周窗切分 / (user,event_type,trigger) 幂等去重 /
 *   guards 注册序号 / 金额清洗 (string/0/负/NaN) + round2 /
 *   hoursWon = saved / $25 / co2SavedKg = saved × CO₂ 系数 (batch82-b) /
 *   lastWeek 上周对照段: [weekStart-7d, weekStart) 半开窗 (batch104-c)
 * - transparencyTrend: up/down/flat/neutral 四态, 无基线 → neutral (batch104-c)
 * - 快照键面契约: 恰好 10 个顶层键, 序列化产物零 "user" — 无个人级字段 (红线)
 * - asTransparencySnapshot: 快照表 jsonb 回读验形, 坏行 → null;
 *   batch81-a 存量行 (无 co2SavedKg) 由 savedUsd 回填, 不打穿降级阶梯;
 *   batch104-c 存量行 (无 lastWeek) 归一为 null (中性态)
 */

import { describe, it, expect } from 'vitest';
import {
  aggregateTransparency,
  asTransparencySnapshot,
  emptyTransparency,
  transparencyTrend,
  utcWeekStart,
  type TransparencyHealthRow,
  type TransparencyPassedChallengeRow,
  type TransparencyProfileRow,
} from '../transparency-weekly';

const NOW = new Date('2026-09-18T12:00:00Z'); // Friday
const WEEK_START_MS = Date.UTC(2026, 8, 14); // Monday 2026-09-14 00:00 UTC

function healthRow(overrides: Partial<TransparencyHealthRow>): TransparencyHealthRow {
  return { id: 'h-id', user_id: 'u1', event_type: 'challenge_completed', trigger_id: null, created_at: NOW.toISOString(), ...overrides };
}

function passedRow(amount: number | string | null, completedAt: string | null): TransparencyPassedChallengeRow {
  return { amount, completed_at: completedAt };
}

function profileRow(createdAt: string | null): TransparencyProfileRow {
  return { created_at: createdAt };
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

  it('migrates to the shared local-week primitive without changing the Monday anchor (UTC cross-boundary guard)', () => {
    const sundayLocalNight = new Date('2027-01-03T23:00:00-08:00'); // Sun Jan 3 2027 23:00 PST
    const mondayUtcMidnight = new Date('2027-01-04T08:00:00Z');     // Mon Jan 4 2027 00:00 PST == 08:00Z
    expect(utcWeekStart(sundayLocalNight).toISOString()).toBe('2027-01-04T00:00:00.000Z');
    expect(utcWeekStart(mondayUtcMidnight).toISOString()).toBe('2027-01-04T00:00:00.000Z');
  });
});

describe('aggregateTransparency', () => {
  it('splits intercepts into week vs total buckets', () => {
    const rows = [
      healthRow({ id: 'a', created_at: inWeek }),
      healthRow({ id: 'b', user_id: 'u2', event_type: 'challenge_failed', created_at: lastWeek }),
    ];
    const snap = aggregateTransparency(rows, [], [], NOW);
    expect(snap.intercepts).toEqual({ week: 1, total: 2 });
  });

  it('deduplicates intercepts per (user, event_type, trigger_id) — same trigger on two users counts twice', () => {
    const rows = [
      healthRow({ id: 'a', user_id: 'u1', trigger_id: 'tr-1', created_at: inWeek }),
      healthRow({ id: 'a-dup', user_id: 'u1', trigger_id: 'tr-1', created_at: inWeek }),
      healthRow({ id: 'b', user_id: 'u2', trigger_id: 'tr-1', created_at: inWeek }),
      healthRow({ id: 'c', user_id: 'u1', event_type: 'challenge_failed', trigger_id: 'tr-1', created_at: inWeek }),
    ];
    const snap = aggregateTransparency(rows, [], [], NOW);
    expect(snap.intercepts).toEqual({ week: 3, total: 3 });
  });

  it('falls back to row id for dedup when trigger_id is missing', () => {
    const rows = [
      healthRow({ id: 'a', user_id: 'u1', trigger_id: null, created_at: inWeek }),
      healthRow({ id: 'a', user_id: 'u1', trigger_id: null, created_at: inWeek }),
    ];
    expect(aggregateTransparency(rows, [], [], NOW).intercepts.total).toBe(1);
  });

  it('counts guards from the profile registration sequence, independently of challenge events', () => {
    const rows = [
      healthRow({ id: 'a', user_id: 'u1', event_type: 'challenge_completed', created_at: inWeek }),
      healthRow({ id: 'b', user_id: 'u1', event_type: 'challenge_failed', created_at: inWeek }),
      healthRow({ id: 'c', user_id: 'u2', event_type: 'challenge_completed', created_at: lastWeek }),
      healthRow({ id: 'd', user_id: 'u3', event_type: 'challenge_failed', created_at: inWeek }),
      healthRow({ id: 'e', user_id: 'u99', event_type: 'mindful_recovery', created_at: inWeek }),
    ];
    const profiles = [
      profileRow(lastWeek),
      profileRow(inWeek),
      profileRow(null),
      profileRow('not-a-date'),
    ];
    expect(aggregateTransparency(rows, [], profiles, NOW).guards).toBe(2);
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
    const snap = aggregateTransparency([], rows, [], NOW);
    expect(snap.savedUsd.week).toBe(100.3);
    expect(snap.savedUsd.total).toBe(192.8);
  });

  it('derives hoursWon from savedUsd at the $25 default rate', () => {
    const snap = aggregateTransparency([], [passedRow(100, inWeek), passedRow(50, lastWeek)], [], NOW);
    expect(snap.hoursWon).toEqual({ week: 4, total: 6 });
  });

  it('derives co2SavedKg from savedUsd at the single co2 coefficient', () => {
    const snap = aggregateTransparency([], [passedRow(100, inWeek), passedRow('50.5', lastWeek)], [], NOW);
    expect(snap.savedUsd).toEqual({ week: 100, total: 150.5 });
    expect(snap.co2SavedKg).toEqual({ week: 14, total: 21.07 });
  });

  it('keeps the contract keys exactly and serializes with zero user-level fields (red line)', () => {
    const snap = aggregateTransparency(
      [healthRow({ id: 'a', user_id: 'u1', created_at: inWeek })],
      [passedRow(10, inWeek)],
      [profileRow(inWeek)],
      NOW,
    );
    expect(Object.keys(snap)).toEqual([
      'weekStart',
      'weekEnd',
      'intercepts',
      'savedUsd',
      'hoursWon',
      'co2SavedKg',
      'lastWeek',
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
    expect(aggregateTransparency(rows, [], [], NOW).intercepts.total).toBe(1);
  });

  it('tolerates null/undefined inputs', () => {
    const snap = aggregateTransparency(null, undefined, undefined, NOW);
    expect(snap.intercepts).toEqual({ week: 0, total: 0 });
    expect(snap.co2SavedKg).toEqual({ week: 0, total: 0 });
    expect(snap.guards).toBe(0);
  });
});

describe('aggregateTransparency — lastWeek segment (batch104-c)', () => {
  const lastWeekStartMs = WEEK_START_MS - 7 * 86_400_000; // 2026-09-07 00:00 UTC

  it('counts intercepts in the [weekStart-7d, weekStart) half-open window', () => {
    const rows = [
      healthRow({ id: 'this-week', created_at: inWeek }),
      healthRow({ id: 'last-week', created_at: lastWeek }),
      // 边界: 周一 00:00 整点归本周; 差 1ms 归上周; 上周一起点整点归上周
      healthRow({ id: 'boundary-week-start', created_at: new Date(WEEK_START_MS).toISOString() }),
      healthRow({ id: 'boundary-week-start-minus-1', created_at: new Date(WEEK_START_MS - 1).toISOString() }),
      healthRow({ id: 'boundary-last-week-start', created_at: new Date(lastWeekStartMs).toISOString() }),
      // 上上周: 只进 total, 不进 lastWeek
      healthRow({ id: 'two-weeks-ago', created_at: new Date(lastWeekStartMs - 86_400_000).toISOString() }),
    ];
    const snap = aggregateTransparency(rows, [], [], NOW);
    expect(snap.intercepts.week).toBe(2);
    expect(snap.lastWeek?.intercepts).toBe(3);
    expect(snap.intercepts.total).toBe(6);
  });

  it('dedups (user, event_type, trigger) globally — a key seen this week never re-counts in last week', () => {
    const rows = [
      healthRow({ id: 'a', user_id: 'u1', trigger_id: 'tr-1', created_at: inWeek }),
      healthRow({ id: 'a-dup', user_id: 'u1', trigger_id: 'tr-1', created_at: lastWeek }),
      // dedup 键含 event_type — 失败态是独立事件, 各周正常计数
      healthRow({ id: 'b', user_id: 'u1', event_type: 'challenge_failed', trigger_id: 'tr-1', created_at: lastWeek }),
    ];
    const snap = aggregateTransparency(rows, [], [], NOW);
    expect(snap.intercepts.week).toBe(1);
    expect(snap.lastWeek?.intercepts).toBe(1);
    expect(snap.intercepts.total).toBe(2);
  });

  it('sums savedUsd from last week and derives hoursWon / co2SavedKg on the same calibers', () => {
    const rows: TransparencyPassedChallengeRow[] = [
      passedRow(100, inWeek),
      passedRow('50.5', lastWeek),
      passedRow(200, new Date(lastWeekStartMs - 86_400_000).toISOString()), // 上上周
    ];
    const snap = aggregateTransparency([], rows, [], NOW);
    expect(snap.lastWeek).toEqual({ intercepts: 0, savedUsd: 50.5, hoursWon: 2.02, co2SavedKg: 7.07 });
  });

  it('yields an all-zero segment (not null) when history only has this week — first-week honesty', () => {
    const snap = aggregateTransparency([healthRow({ id: 'a', created_at: inWeek })], [], [], NOW);
    expect(snap.lastWeek).toEqual({ intercepts: 0, savedUsd: 0, hoursWon: 0, co2SavedKg: 0 });
  });
});

describe('transparencyTrend (batch104-c)', () => {
  it('maps current vs previous onto up / down / flat', () => {
    expect(transparencyTrend(12, 5)).toBe('up');
    expect(transparencyTrend(3, 20)).toBe('down');
    expect(transparencyTrend(4.8, 4.8)).toBe('flat');
  });

  it('returns neutral when there is no usable baseline (null / NaN on either side)', () => {
    expect(transparencyTrend(7, null)).toBe('neutral');
    expect(transparencyTrend(Number.NaN, 5)).toBe('neutral');
    expect(transparencyTrend(7, Number.NaN)).toBe('neutral');
  });

  it('treats a zero baseline honestly: 0 → 0 is flat, 0 → anything is up', () => {
    expect(transparencyTrend(0, 0)).toBe('flat');
    expect(transparencyTrend(5, 0)).toBe('up');
    expect(transparencyTrend(0, 5)).toBe('down');
  });
});

describe('emptyTransparency', () => {
  it('returns a zeroed snapshot with the given degraded flag and no last-week baseline', () => {
    const snap = emptyTransparency(NOW, true);
    expect(snap.guards).toBe(0);
    expect(snap.savedUsd).toEqual({ week: 0, total: 0 });
    expect(snap.co2SavedKg).toEqual({ week: 0, total: 0 });
    expect(snap.lastWeek).toBeNull();
    expect(snap.degraded).toBe(true);
    expect(snap.weekStart).toBe('2026-09-14T00:00:00.000Z');
  });
});

describe('asTransparencySnapshot', () => {
  it('passes a valid payload through and normalizes degraded to boolean', () => {
    const valid = aggregateTransparency([], [], [], NOW);
    expect(asTransparencySnapshot({ ...valid, degraded: undefined })).toMatchObject({ degraded: false });
    expect(asTransparencySnapshot({ ...valid, degraded: true })?.degraded).toBe(true);
  });

  it('rejects garbage payloads (null / missing fields / wrong metric shape)', () => {
    expect(asTransparencySnapshot(null)).toBeNull();
    expect(asTransparencySnapshot('json')).toBeNull();
    expect(asTransparencySnapshot({})).toBeNull();
    const valid = aggregateTransparency([], [], [], NOW);
    expect(asTransparencySnapshot({ ...valid, guards: 'many' })).toBeNull();
    expect(asTransparencySnapshot({ ...valid, savedUsd: { week: '1', total: 2 } })).toBeNull();
  });

  it('backfills co2SavedKg from savedUsd for legacy batch81-a rows (field missing or malformed)', () => {
    const full = aggregateTransparency([], [passedRow(100, inWeek)], [], NOW);
    const { co2SavedKg: _dropped, ...legacy } = full;
    expect(_dropped).toBeDefined();

    const restored = asTransparencySnapshot(legacy);
    expect(restored?.co2SavedKg).toEqual({ week: 14, total: 14 });
    expect(asTransparencySnapshot({ ...legacy, co2SavedKg: 'garbage' })?.co2SavedKg).toEqual({
      week: 14,
      total: 14,
    });
  });

  it('keeps a valid stored co2SavedKg as-is instead of re-deriving', () => {
    const snap = aggregateTransparency([], [passedRow(100, inWeek)], [], NOW);
    const stored = { ...snap, co2SavedKg: { week: 1, total: 2 } };
    expect(asTransparencySnapshot(stored)?.co2SavedKg).toEqual({ week: 1, total: 2 });
  });

  it('normalizes a missing/garbage lastWeek on legacy rows to null instead of rejecting (batch104-c)', () => {
    const full = aggregateTransparency([], [passedRow(100, inWeek)], [], NOW);
    const { lastWeek: _dropped, ...legacy } = full;
    expect(_dropped).toBeDefined();

    const restored = asTransparencySnapshot(legacy);
    expect(restored).not.toBeNull();
    expect(restored?.lastWeek).toBeNull();
    expect(asTransparencySnapshot({ ...legacy, lastWeek: 'garbage' })?.lastWeek).toBeNull();
    expect(asTransparencySnapshot({ ...legacy, lastWeek: { intercepts: 1 } })?.lastWeek).toBeNull();
  });

  it('round-trips a valid lastWeek segment unchanged', () => {
    const full = aggregateTransparency(
      [healthRow({ id: 'a', created_at: lastWeek })],
      [passedRow(50, lastWeek)],
      [],
      NOW,
    );
    expect(asTransparencySnapshot(full)?.lastWeek).toEqual(full.lastWeek);
  });
});
