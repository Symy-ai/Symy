/**
 * 降级链 + 周界翻转 — 公开快照盲区补测 (batch126-a testgap scan)
 *
 * 审计见 doc/transparency-chain-result.md: 降级骨架的「键面即契约」与跨年周界无人钉。
 * 1. emptyTransparency 与 aggregateTransparency 同键面 (名 + 序) — 消费端 (页面/OG/API/
 *    defense 集体行) 可无分支读键, 漂移即静默 undefined。零值、weekStart 恒为 UTC 周一
 *    00:00、序列化零用户级字段、降级快照能过公开回读校验 (能落快照表)。
 * 2. 周界 2026-12-28 → 2027-01-04 跨年: lastWeekStart 推导、周窗切分、ISO 单调。
 */
import { describe, it, expect } from 'vitest';
import {
  aggregateTransparency,
  asTransparencySnapshot,
  emptyTransparency,
  type TransparencyHealthRow,
  type TransparencyPassedChallengeRow,
  type TransparencyProfileRow,
} from '../transparency-weekly';

const SNAPSHOT_KEYS = [
  'weekStart', 'weekEnd', 'intercepts', 'savedUsd', 'hoursWon', 'co2SavedKg', 'lastWeek', 'guards', 'generatedAt', 'degraded',
] as const;
const METRIC_KEYS = ['intercepts', 'savedUsd', 'hoursWon', 'co2SavedKg'] as const;

const NOW = new Date('2026-09-18T12:00:00.000Z');
const health = (o: Partial<TransparencyHealthRow> = {}): TransparencyHealthRow => ({
  id: 'h-1', user_id: 'u-1', event_type: 'challenge_completed', trigger_id: null, created_at: NOW.toISOString(), ...o,
});
const passed = (amount: number, completedAt: string): TransparencyPassedChallengeRow => ({ amount, completed_at: completedAt });
const profile = (createdAt: string): TransparencyProfileRow => ({ created_at: createdAt });
const allNumbers = (value: unknown): number[] =>
  typeof value === 'number' ? [value]
    : Array.isArray(value) ? value.flatMap(allNumbers)
    : value && typeof value === 'object' ? Object.values(value).flatMap(allNumbers) : [];

describe('降级链 — emptyTransparency 是与实时聚合同形的公开快照', () => {
  it('shares the exact key surface (names and order) with a real aggregation', () => {
    const live = aggregateTransparency([health()], [passed(100, NOW.toISOString())], [profile(NOW.toISOString())], NOW);
    const degraded = emptyTransparency(NOW, true);

    // 键名 + 键序完全一致: 消费端可无分支读键
    expect([Object.keys(degraded).join(), Object.keys(live).join()]).toEqual([SNAPSHOT_KEYS.join(), SNAPSHOT_KEYS.join()]);
    for (const key of METRIC_KEYS) expect(Object.keys(degraded[key]).join()).toBe('week,total');
    expect(degraded).not.toEqual(live); // 值不同, 形相同
    expect([live.degraded, degraded.degraded]).toEqual([false, true]);
  });

  it('keeps every bucket at exactly 0 for both degraded flags', () => {
    for (const flag of [true, false] as const) {
      const snap = emptyTransparency(NOW, flag);
      for (const key of METRIC_KEYS) expect(snap[key]).toEqual({ week: 0, total: 0 });
      expect([snap.guards, snap.degraded]).toEqual([0, flag]);
    }
  });

  it('anchors weekStart at UTC Monday 00:00:00.000 and keeps the honest data age', () => {
    // 全周六个锚点 (含周一 +1ms 与下周一 00:00) 都必须落在同一 UTC 周一起点
    const anchors = [
      '2026-09-14T00:00:00.000Z', '2026-09-14T00:00:00.001Z', '2026-09-15T09:30:00.000Z',
      '2026-09-18T12:00:00.000Z', '2026-09-19T23:59:59.999Z', '2026-09-20T00:00:00.000Z',
    ];
    const weekStarts = anchors.map((iso) => {
      const snap = emptyTransparency(new Date(iso), true);
      expect(snap.weekStart).toBe('2026-09-14T00:00:00.000Z');
      // 数据年龄诚实: 降级不伪造"刚生成"
      expect([snap.weekEnd, snap.generatedAt]).toEqual([iso, iso]);
      return snap.weekStart;
    });
    expect(weekStarts).toEqual(Array.from({ length: 6 }, () => '2026-09-14T00:00:00.000Z')); // 整周锚定
  });

  it('serializes with zero user-level fields and amount-shaped keys (red line)', () => {
    const json = JSON.stringify(emptyTransparency(NOW, true));
    expect(json).not.toMatch(/user/i);
    // 用户级金额字段名一旦被塞进骨架即打红 (平台桶只有 week/total 两层)
    expect(json).not.toMatch(/"(amount|userAmount|perUser[A-Za-z]*)"/i);
  });

  it('passes the public read-back validator — a degraded skeleton is still a valid stored payload', () => {
    const restored = asTransparencySnapshot(emptyTransparency(NOW, true));
    expect(restored).not.toBeNull();
    // lastWeek=null = 无上周基线 (中性态), 不得被回读校验改写成假基线
    expect([restored?.degraded, restored?.lastWeek]).toEqual([true, null]);
    expect(allNumbers(restored).every((n) => n === 0)).toBe(true);
  });

  it('leaves no per-user drilldown key in a real aggregation either', () => {
    const snap = aggregateTransparency(
      [health({ id: 'h-a', user_id: 'u-77' }), health({ id: 'h-b', user_id: 'u-78', event_type: 'challenge_failed' })],
      [passed(33.3, NOW.toISOString())],
      [profile(NOW.toISOString())],
      NOW,
    );
    // 两个用户 → 快照里只有计数, 没有任何可回推单人的桶
    expect([snap.intercepts.week, snap.intercepts.total, Object.keys(snap.savedUsd).join()]).toEqual([
      2, 2, 'week,total',
    ]);
    expect(JSON.stringify(snap)).not.toMatch(/u-77|u-78/);
  });
});

describe('周界翻转 — 2026-12-28 → 2027-01-04 跨年', () => {
  const thisMonday = new Date('2026-12-28T00:00:00.000Z');
  const at = (iso: string) => aggregateTransparency([], [], [], new Date(iso)).weekStart;

  it('splits the [2026-12-21, 2026-12-28) window across the year boundary', () => {
    const rows = [
      health({ id: 'pre-year', created_at: '2026-12-21T00:00:00.000Z' }),
      health({ id: 'pre-year-mid', created_at: '2026-12-26T12:00:00.000Z' }),
      health({ id: 'this-week', created_at: '2026-12-28T00:00:00.000Z' }),
      health({ id: 'this-week-eve', created_at: '2026-12-31T23:59:59.999Z' }),
      health({ id: 'two-weeks-ago', created_at: '2026-12-20T23:59:59.999Z' }), // 只进 total
    ];
    const snap = aggregateTransparency(rows, [], [], thisMonday);

    expect(snap.intercepts.week).toBe(2);
    expect(snap.lastWeek?.intercepts).toBe(2);
    expect(snap.intercepts.total).toBe(5);
    // 新年周仍属 2026 (跨年不把 weekStart 推到下一年)
    expect(snap.weekStart).toBe('2026-12-28T00:00:00.000Z');
    // 半开窗宽度恰好一周 (跨年不缩不涨)
    expect(Date.UTC(2026, 11, 28) - Date.UTC(2026, 11, 21)).toBe(7 * 86_400_000);
  });

  it('splits saved amounts by the same cross-year window and keeps the caliber self-consistent', () => {
    const rows = [
      passed(200, '2026-12-21T00:00:00.000Z'),  // lastWeek 起点整点 → lastWeek
      passed(50, '2026-12-27T23:59:59.999Z'),   // lastWeek 末 (边界前 1ms) → lastWeek
      passed(100, '2026-12-28T00:00:00.000Z'),  // weekStart 整点 → week
      passed(25, '2026-12-31T12:00:00.000Z'),   // 跨年内 → week
      passed(999, '2026-12-20T12:00:00.000Z'),  // 上上周 → 只进 total
    ];
    const snap = aggregateTransparency([], rows, [], thisMonday);

    // 三桶自洽: week + lastWeek ≤ total (跨年窗口不重不漏)
    expect([snap.savedUsd.week, snap.lastWeek?.savedUsd, snap.savedUsd.total]).toEqual([125, 250, 1374]);
    expect(snap.savedUsd.week + (snap.lastWeek?.savedUsd ?? 0)).toBeLessThanOrEqual(snap.savedUsd.total);
    // 派生口径同源: hours = $25, co2 = 0.14
    expect([snap.hoursWon.week, snap.lastWeek?.hoursWon, snap.co2SavedKg.week]).toEqual([5, 10, 17.5]);
  });

  /**
   * 当前行为固化 (审计发现, 非本批改动): 本周桶是 [weekStart, ∞) — 没有上界, 所以
   * 2027-01-04 (下周一 00:00) 的行也归本周。现实中只有时钟漂移/未来时间戳会走到这里。
   * 若日后给本周桶加上界, 本用例应随行为一并更新。
   */
  it('treats the current-week bucket as [weekStart, ∞) — a next-Monday row still lands in week', () => {
    const snap = aggregateTransparency(
      [health({ id: 'next-monday', created_at: '2027-01-04T00:00:00.000Z' })],
      [passed(999, '2027-01-04T00:00:00.000Z')],
      [],
      thisMonday,
    );
    // weekEnd = now (本周一 00:00) 早于被计入的行 — 上界不在窗口里, 只在时间戳里
    expect([snap.weekStart, snap.weekEnd, snap.generatedAt]).toEqual([
      '2026-12-28T00:00:00.000Z', '2026-12-28T00:00:00.000Z', '2026-12-28T00:00:00.000Z',
    ]);
    expect([snap.intercepts.week, snap.savedUsd.week, snap.savedUsd.total]).toEqual([1, 999, 999]);
  });

  it('never lets a cross-year week start run backwards', () => {
    const crosses = [
      '2026-12-27T23:59:59.999Z', '2026-12-28T00:00:00.000Z', '2026-12-31T23:59:59.999Z',
      '2027-01-01T00:00:00.000Z', '2027-01-03T23:59:59.999Z', '2027-01-04T00:00:00.000Z',
    ];
    const weekStarts = crosses.map(at);
    for (const iso of weekStarts) expect(iso).toMatch(/T00:00:00\.000Z$/); // 整周锚定
    expect(weekStarts.map((s) => Date.parse(s) % 86_400_000)).toEqual([0, 0, 0, 0, 0, 0]); // 整日对齐
    expect([...weekStarts].sort()).toEqual(weekStarts); // 不倒流
    expect(weekStarts).toEqual([
      '2026-12-21T00:00:00.000Z', '2026-12-28T00:00:00.000Z', '2026-12-28T00:00:00.000Z',
      '2026-12-28T00:00:00.000Z', '2026-12-28T00:00:00.000Z', '2027-01-04T00:00:00.000Z',
    ]);
  });

  it('is order-insensitive (loader 不对行排序是现实) and stamps every field from the same instant', () => {
    const rows = [
      passed(25, '2026-12-31T12:00:00.000Z'),
      passed(999, '2026-12-20T12:00:00.000Z'),
      passed(200, '2026-12-21T00:00:00.000Z'),
      passed(100, '2026-12-28T00:00:00.000Z'),
    ];
    const ordered = aggregateTransparency([], rows, [], thisMonday);
    expect([ordered.savedUsd.week, ordered.lastWeek?.savedUsd, ordered.savedUsd.total]).toEqual([125, 200, 1324]);
    // 行序不影响任何桶 (聚合层不依赖 DB 返回顺序)
    expect(aggregateTransparency([], [...rows].reverse(), [], thisMonday)).toEqual(ordered);

    // 同一 now 推出全部时间戳 — 跨年点无逐字段时钟漂移
    const stamped = aggregateTransparency(
      [health({ created_at: '2026-12-28T00:00:00.001Z' })],
      [passed(25, '2026-12-28T00:00:00.001Z')],
      [profile('2026-12-28T00:00:00.001Z')],
      thisMonday,
    );
    expect([stamped.weekStart, stamped.weekEnd, stamped.generatedAt]).toEqual([
      '2026-12-28T00:00:00.000Z', '2026-12-28T00:00:00.000Z', '2026-12-28T00:00:00.000Z',
    ]);
    expect([stamped.intercepts.week, stamped.savedUsd.week, stamped.guards]).toEqual([1, 25, 1]);
  });
});
