/**
 * platform-aggregate 直测 (batch109-a)
 *
 * 平台聚合口径单源的契约钉: 拦截数/守护者数/省下金额/赢回小时 + 翻页停页规则
 * + 105-b 集体行线格式。边界面: 空快照 (null/undefined/空数组)、部分周缺失
 * (只有上周/只有更早)、半开窗边界、翻页错误即停。
 */

import { describe, it, expect, vi } from 'vitest';
/* eslint-disable require-await -- test mocks use async for API consistency */

import {
  AGGREGATE_PAGE_SIZE,
  collectiveStatsFromSnapshot,
  countGuardSignups,
  countInterceptEvents,
  hoursWonFromUsd,
  isCollectiveStats,
  readAllPages,
  round2,
  sumPassedUsd,
  type PlatformHealthRow,
  type PlatformPassedChallengeRow,
  type PlatformProfileRow,
} from '../platform-aggregate';

const WEEK_START_MS = Date.UTC(2026, 8, 14);
const LAST_WEEK_START_MS = WEEK_START_MS - 7 * 86_400_000;
const WINDOW = { weekStartMs: WEEK_START_MS, lastWeekStartMs: LAST_WEEK_START_MS };

const IN_WEEK = '2026-09-15T00:00:00.000Z';
const PRE_WEEK = '2026-09-09T00:00:00.000Z';
const OLDER = '2026-08-01T00:00:00.000Z';

function health(
  id: string,
  created_at: string,
  opts: Partial<Pick<PlatformHealthRow, 'user_id' | 'event_type' | 'trigger_id'>> = {},
): PlatformHealthRow {
  return { id, user_id: 'u1', event_type: 'challenge_completed', trigger_id: `t${id}`, created_at, ...opts };
}

describe('round2 / hoursWonFromUsd — 派生口径', () => {
  it('round2 keeps at most two decimals', () => {
    expect(round2(2)).toBe(2);
    expect(round2(0.444)).toBe(0.44);
    expect(round2(1 / 3)).toBe(0.33);
  });

  it('hoursWonFromUsd = money ÷ $25, rounded to 2dp; non-positive is honest zero', () => {
    expect(hoursWonFromUsd(25)).toBe(1);
    expect(hoursWonFromUsd(10)).toBe(0.4);
    expect(hoursWonFromUsd(1)).toBe(0.04);
    expect(hoursWonFromUsd(0)).toBe(0);
    expect(hoursWonFromUsd(-5)).toBe(0);
    expect(hoursWonFromUsd(Number.NaN)).toBe(0);
  });
});

describe('countInterceptEvents — 拦截数 (去重 + 双周窗口)', () => {
  it('empty snapshot: null/undefined/[] all honest zeros', () => {
    expect(countInterceptEvents(null, WINDOW)).toEqual({ week: 0, lastWeek: 0, total: 0 });
    expect(countInterceptEvents(undefined, WINDOW)).toEqual({ week: 0, lastWeek: 0, total: 0 });
    expect(countInterceptEvents([], WINDOW)).toEqual({ week: 0, lastWeek: 0, total: 0 });
  });

  it('buckets into week / lastWeek / total; rows older than lastWeek only count toward total', () => {
    const rows = [
      health('a', IN_WEEK),
      health('b', PRE_WEEK),
      health('c', OLDER),
    ];
    expect(countInterceptEvents(rows, WINDOW)).toEqual({ week: 1, lastWeek: 1, total: 3 });
  });

  it('partial weeks: lastWeek-only input keeps week at zero', () => {
    const rows = [health('a', PRE_WEEK), health('b', PRE_WEEK)];
    expect(countInterceptEvents(rows, WINDOW)).toEqual({ week: 0, lastWeek: 2, total: 2 });
  });

  it('dedups by (user_id, event_type, trigger_id|id)', () => {
    const dup = [
      health('a', IN_WEEK),
      health('a', PRE_WEEK), // 同 user+type+trigger → 只计一次
    ];
    expect(countInterceptEvents(dup, WINDOW).total).toBe(1);

    const crossType = [
      health('a', IN_WEEK, { event_type: 'challenge_completed' }),
      health('a', IN_WEEK, { event_type: 'challenge_failed' }), // 同 trigger 不同 type → 计两次
    ];
    expect(countInterceptEvents(crossType, WINDOW).total).toBe(2);

    const nullTrigger = [
      health('x', IN_WEEK, { trigger_id: null }),
      health('y', IN_WEEK, { trigger_id: null }), // trigger 缺失回退 id, 不同 id → 计两次
    ];
    expect(countInterceptEvents(nullTrigger, WINDOW).total).toBe(2);
  });

  it('skips invalid rows: unknown event types and unparsable created_at', () => {
    const rows = [
      health('a', IN_WEEK, { event_type: 'deposit_api' }),
      health('b', 'not-a-date'),
      health('c', ''),
      { ...health('d', IN_WEEK), created_at: null as unknown as string },
    ];
    expect(countInterceptEvents(rows, WINDOW).total).toBe(0);
  });
});

describe('countGuardSignups — 守护者数', () => {
  it('empty snapshot: null/undefined/[] all zero', () => {
    expect(countGuardSignups(null)).toBe(0);
    expect(countGuardSignups(undefined)).toBe(0);
    expect(countGuardSignups([])).toBe(0);
  });

  it('counts rows with a parsable created_at only', () => {
    const rows: PlatformProfileRow[] = [
      { created_at: IN_WEEK },
      { created_at: PRE_WEEK },
      { created_at: null },
      { created_at: 'garbage' },
    ];
    expect(countGuardSignups(rows)).toBe(2);
  });
});

describe('sumPassedUsd — 省下金额 ([from, to) 半开窗)', () => {
  const rows: PlatformPassedChallengeRow[] = [
    { amount: 3, completed_at: IN_WEEK },
    { amount: '4.5', completed_at: PRE_WEEK }, // numeric 可能以 string 透出
    { amount: 10, completed_at: OLDER },
    { amount: 0, completed_at: IN_WEEK },
    { amount: -2, completed_at: IN_WEEK },
    { amount: Number.NaN, completed_at: IN_WEEK },
  ];

  it('empty snapshot: null/undefined/[] all zero', () => {
    expect(sumPassedUsd(null, null)).toBe(0);
    expect(sumPassedUsd(undefined, null)).toBe(0);
    expect(sumPassedUsd([], null)).toBe(0);
  });

  it('range=null sums every valid row; non-positive and NaN amounts skipped', () => {
    expect(sumPassedUsd(rows, null)).toBe(17.5);
  });

  it('half-open window: from inclusive, to exclusive', () => {
    const only = [{ amount: 1, completed_at: IN_WEEK }];
    expect(sumPassedUsd(only, { fromMs: WEEK_START_MS, toMs: Number.POSITIVE_INFINITY })).toBe(1);
    expect(sumPassedUsd(only, { fromMs: WEEK_START_MS, toMs: WEEK_START_MS })).toBe(0);
    expect(sumPassedUsd(rows, { fromMs: LAST_WEEK_START_MS, toMs: WEEK_START_MS })).toBe(4.5);
  });

  it('rows without parsable completed_at fall out of any ranged window', () => {
    const bad = [{ amount: 5, completed_at: null }];
    expect(sumPassedUsd(bad, { fromMs: WEEK_START_MS, toMs: Number.POSITIVE_INFINITY })).toBe(0);
    expect(sumPassedUsd(bad, null)).toBe(5);
  });
});

describe('readAllPages — PostgREST 翻页停页规则 (b90a 单源)', () => {
  it('short first page stops after one fetch', async () => {
    const fetchPage = vi.fn(async () => ({ data: [{ id: 1 }], error: null }));
    const { rows, error } = await readAllPages(fetchPage);
    expect(fetchPage).toHaveBeenCalledTimes(1);
    expect(fetchPage).toHaveBeenCalledWith(0);
    expect(rows).toEqual([{ id: 1 }]);
    expect(error).toBeNull();
  });

  it('full page + tail pages to exhaustion with PAGE_SIZE offsets', async () => {
    const full = Array.from({ length: AGGREGATE_PAGE_SIZE }, (_, i) => ({ id: i }));
    const tail = [{ id: 'tail' }];
    const fetchPage = vi
      .fn()
      .mockResolvedValueOnce({ data: full, error: null })
      .mockResolvedValueOnce({ data: tail, error: null });
    const { rows, error } = await readAllPages(fetchPage);
    expect(fetchPage).toHaveBeenCalledTimes(2);
    expect(fetchPage).toHaveBeenNthCalledWith(1, 0);
    expect(fetchPage).toHaveBeenNthCalledWith(2, AGGREGATE_PAGE_SIZE);
    expect(rows).toHaveLength(AGGREGATE_PAGE_SIZE + 1);
    expect(error).toBeNull();
  });

  it('page error stops paging and returns accumulated rows with the error', async () => {
    const first = Array.from({ length: AGGREGATE_PAGE_SIZE }, (_, i) => ({ id: i }));
    const fetchPage = vi
      .fn()
      .mockResolvedValueOnce({ data: first, error: null })
      .mockResolvedValueOnce({ data: null, error: { message: 'boom' } });
    const { rows, error } = await readAllPages(fetchPage);
    expect(fetchPage).toHaveBeenCalledTimes(2);
    expect(rows).toHaveLength(AGGREGATE_PAGE_SIZE);
    expect(error).toEqual({ message: 'boom' });
  });

  it('null data with no error is an empty page (stops, real empty table)', async () => {
    const fetchPage = vi.fn(async () => ({ data: null, error: null }));
    const { rows, error } = await readAllPages(fetchPage);
    expect(fetchPage).toHaveBeenCalledTimes(1);
    expect(rows).toEqual([]);
    expect(error).toBeNull();
  });
});

describe('collective contract — 105-b 集体行线格式单源', () => {
  it('collectiveStatsFromSnapshot picks hours (hoursWon.total) and guards, nothing else', () => {
    expect(
      collectiveStatsFromSnapshot({
        hoursWon: { total: 1234.5 },
        guards: 9876,
      }),
    ).toEqual({ hours: 1234.5, guards: 9876 });
  });

  it('isCollectiveStats accepts only {hours:number, guards:number}', () => {
    expect(isCollectiveStats({ hours: 1, guards: 2 })).toBe(true);
    expect(isCollectiveStats({ hours: 0, guards: 0 })).toBe(true);
    expect(isCollectiveStats(null)).toBe(false);
    expect(isCollectiveStats(undefined)).toBe(false);
    expect(isCollectiveStats({ hours: 1 })).toBe(false);
    expect(isCollectiveStats({ hours: '1', guards: 2 })).toBe(false);
    expect(isCollectiveStats({ guards: 2 })).toBe(false);
  });
});
