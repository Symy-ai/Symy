/**
 * growth-stats ⇆ transparency-weekly 口径一致性守卫 (batch90-a)
 *
 * b82-c (K 因子) 与 b81-a (周报) 各自聚合、口径独立演化; BP p20 验证期对外报数,
 * 两 API 的「数据不足降级 / 分页耗尽 / 诚实零值」三模式必须行为一致:
 * 同一 now → 同一 generatedAt; 同规模输入 → 同为真数字或同为诚实零;
 * >1000 行两边都翻页到底不截断; 失败两边 loader 都 resolve (恒 200, 无一边 500)。
 *
 * 指标本身域不同 (invitations vs health_events/challenges/profiles), 不比对数值;
 * 已发现的口径分歧 (growth 无 degraded 标记 / 降级 generatedAt 语义 / 阶梯深度)
 * 记入 batch90-a 缺陷清单待 owner 裁决, 此处只钉一致面。
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
/* eslint-disable require-await -- test mocks use async for API consistency */

vi.mock('@/lib/supabase-admin', () => ({
  createAdminClient: vi.fn(),
}));

vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { loadGrowthStats } from '../growth-stats-server';
import {
  loadTransparencyWeekly,
  __setTransparencyMemoryCacheForTests,
} from '../transparency-weekly-server';
import { aggregateGrowthStats, emptyGrowthStats } from '../growth-stats';
import {
  aggregateTransparency,
  emptyTransparency,
  type TransparencyHealthRow,
  type TransparencyPassedChallengeRow,
  type TransparencyProfileRow,
} from '../transparency-weekly';
import { createAdminClient } from '@/lib/supabase-admin';

type QueryResult = { data: readonly unknown[] | null; error: { message: string } | null };
type Terminal = () => Promise<QueryResult>;

function makeChain(terminal: Terminal) {
  const chain: Record<string, unknown> = {};
  for (const m of ['select', 'eq', 'order', 'limit', 'range', 'upsert']) chain[m] = vi.fn(() => chain);
  // 链式 builder 被 await 时解析为 terminal 结果
  chain.then = (onFulfilled: (v: unknown) => unknown, onRejected: (e: unknown) => unknown) =>
    Promise.resolve().then(terminal).then(onFulfilled, onRejected);
  return chain as Record<string, ReturnType<typeof vi.fn>> & { then: unknown };
}

function okChain(rows: readonly unknown[]) {
  return makeChain(async () => ({ data: rows, error: null }));
}

function errChain() {
  return makeChain(async () => ({ data: null, error: { message: 'boom' } }));
}

function pagedChain(pages: readonly unknown[][]) {
  let calls = 0;
  return makeChain(async () => {
    const page = pages[Math.min(calls, pages.length - 1)] ?? [];
    const result = { data: page, error: null };
    calls += 1;
    return result;
  });
}

function makeDb(chains: Record<string, unknown>) {
  return { from: vi.fn((table: string) => chains[table]) };
}

function mockAdmin(db: ReturnType<typeof makeDb> | null) {
  (createAdminClient as ReturnType<typeof vi.fn>).mockReturnValue(
    db ? { supabase: db, error: null } : { supabase: null, error: 'missing key' },
  );
}

const NOW = new Date('2026-09-16T12:00:00.000Z'); // 周三 — 本周一起 2026-09-14 (UTC)
const IN_WEEK = '2026-09-15T00:00:00.000Z';
const PRE_WEEK = '2026-09-08T00:00:00.000Z';

// <10 行同构场景: 7 行输入, 3 个去重参与者 — 两边各自的域行
const SMALL_INVITATIONS = [
  { referrer_user_id: 'r1', status: 'completed' },
  { referrer_user_id: 'r2', status: 'completed' },
  { referrer_user_id: 'r3', status: 'completed' },
  { referrer_user_id: 'r1', status: 'pending' },
  { referrer_user_id: 'r2', status: 'pending' },
  { referrer_user_id: 'r3', status: 'rejected' },
  { referrer_user_id: null, status: 'pending' },
];
const SMALL_HEALTH: TransparencyHealthRow[] = [
  { id: 'h1', user_id: 'u1', event_type: 'challenge_completed', trigger_id: 't1', created_at: IN_WEEK },
  { id: 'h2', user_id: 'u2', event_type: 'challenge_failed', trigger_id: 't2', created_at: IN_WEEK },
  { id: 'h3', user_id: 'u3', event_type: 'challenge_completed', trigger_id: 't3', created_at: IN_WEEK },
  { id: 'h4', user_id: 'u1', event_type: 'challenge_failed', trigger_id: 't4', created_at: IN_WEEK },
  { id: 'h5', user_id: 'u2', event_type: 'challenge_completed', trigger_id: 't5', created_at: PRE_WEEK },
  { id: 'h6', user_id: 'u3', event_type: 'challenge_failed', trigger_id: 't6', created_at: PRE_WEEK },
  { id: 'h7', user_id: 'u1', event_type: 'challenge_completed', trigger_id: 't7', created_at: PRE_WEEK },
];
const SMALL_PROFILES: TransparencyProfileRow[] = [
  { created_at: PRE_WEEK },
  { created_at: PRE_WEEK },
  { created_at: IN_WEEK },
];
const SMALL_PASSED: TransparencyPassedChallengeRow[] = [
  { amount: '3', completed_at: IN_WEEK },
  { amount: '3', completed_at: IN_WEEK },
  { amount: '3', completed_at: IN_WEEK },
  { amount: 3, completed_at: IN_WEEK },
  { amount: 3, completed_at: PRE_WEEK },
  { amount: 3, completed_at: PRE_WEEK },
  { amount: 3, completed_at: PRE_WEEK },
];

// >1000 行生成器 (跨页 id/trigger 唯一, 去重键不塌缩)
function growthRows(n: number, offset = 0) {
  return Array.from({ length: n }, (_, i) => ({
    referrer_user_id: `r${(offset + i) % 3}`,
    status: i % 3 === 0 ? 'completed' : i % 3 === 1 ? 'pending' : 'rejected',
  }));
}
function bigHealth(n: number, offset = 0): TransparencyHealthRow[] {
  return Array.from({ length: n }, (_, i) => ({
    id: `h${offset + i}`,
    user_id: `u${(offset + i) % 3}`,
    event_type: 'challenge_completed',
    trigger_id: `t${offset + i}`,
    created_at: IN_WEEK,
  }));
}
function bigProfiles(n: number): TransparencyProfileRow[] {
  return Array.from({ length: n }, (_, i) => ({ created_at: i % 2 ? IN_WEEK : PRE_WEEK }));
}
function bigPassed(n: number): TransparencyPassedChallengeRow[] {
  return Array.from({ length: n }, () => ({ amount: 1, completed_at: IN_WEEK }));
}

// 输出树里全部数字必须有限 (NaN/Infinity 任一出现即口径崩坏)
function collectNumbers(value: unknown): number[] {
  const out: number[] = [];
  const walk = (v: unknown): void => {
    if (typeof v === 'number') { out.push(v); return; }
    if (Array.isArray(v)) { v.forEach(walk); return; }
    if (v && typeof v === 'object') { Object.values(v).forEach(walk); }
  };
  walk(value);
  return out;
}

function expectAllFinite(...values: unknown[]): void {
  for (const tree of values) {
    for (const n of collectNumbers(tree)) expect(Number.isFinite(n)).toBe(true);
  }
}

// 两边派生数的共同格式化口径: 最多两位小数 (round2 纪律)
function expectAll2dp(...values: unknown[]): void {
  for (const tree of values) {
    for (const n of collectNumbers(tree)) {
      expect(Math.abs(n * 100 - Math.round(n * 100))).toBeLessThan(1e-6);
    }
  }
}

beforeEach(() => {
  vi.clearAllMocks();
  __setTransparencyMemoryCacheForTests(null);
});

describe('pure aggregates — isomorphic inputs, consistent modes', () => {
  it('empty table: both honest zeros with the same generatedAt (no NaN, no fabricated numbers)', () => {
    const g = aggregateGrowthStats(null, NOW);
    const w = aggregateTransparency(undefined, null, [], NOW);

    expect(g.invites).toEqual({ total: 0, pending: 0, completed: 0 });
    expect(g.uniqueInviters).toBe(0);
    expect(g.kFactorApprox).toBe(0);
    expect(w.intercepts).toEqual({ week: 0, total: 0 });
    expect(w.savedUsd).toEqual({ week: 0, total: 0 });
    expect(w.hoursWon).toEqual({ week: 0, total: 0 });
    expect(w.co2SavedKg).toEqual({ week: 0, total: 0 });
    expect(w.guards).toBe(0);
    // 空表 = 真实数据, 两边都不是降级态
    expect(w.degraded).toBe(false);
    expectAllFinite(g, w);
    expect(g.generatedAt).toBe(NOW.toISOString());
    expect(w.generatedAt).toBe(NOW.toISOString());
  });

  it('zero skeletons: same generatedAt for the same now, both fully zeroed', () => {
    const g = emptyGrowthStats(NOW);
    const w = emptyTransparency(NOW, true);

    expect(g.generatedAt).toBe(w.generatedAt);
    expectAllFinite(g, w);
    for (const n of collectNumbers(g)) expect(n).toBe(0);
    for (const n of collectNumbers(w)) expect(n).toBe(0);
  });

  it('small community (<10 rows): both true numbers, row and actor counts agree', () => {
    const g = aggregateGrowthStats(SMALL_INVITATIONS, NOW);
    const w = aggregateTransparency(SMALL_HEALTH, SMALL_PASSED, SMALL_PROFILES, NOW);

    // 同构 7 行输入 → 两边都如实计满, 无一边丢行
    expect(g.invites.total).toBe(7);
    expect(w.intercepts.total).toBe(7);
    // 去重参与者口径在两域一致: 3 个邀请者 = 3 个守护者
    expect(g.uniqueInviters).toBe(3);
    expect(w.guards).toBe(3);
    expect(g.kFactorApprox).toBe(1); // round2(3/3)
    expect(w.intercepts).toEqual({ week: 4, total: 7 });
    expect(w.savedUsd).toEqual({ week: 12, total: 21 });
    expect(w.degraded).toBe(false);
    expectAllFinite(g, w);
    expectAll2dp(g.kFactorApprox, w.savedUsd, w.hoursWon, w.co2SavedKg);
    expect(g.generatedAt).toBe(w.generatedAt);
  });

  it('>1000 rows: neither pure aggregate truncates internally', () => {
    const g = aggregateGrowthStats(growthRows(1001), NOW);
    const w = aggregateTransparency(bigHealth(1001), bigPassed(1001), bigProfiles(1001), NOW);

    expect(g.invites.total).toBe(1001);
    expect(g.uniqueInviters).toBe(3);
    expect(w.intercepts.total).toBe(1001);
    expect(w.guards).toBe(1001);
    expect(g.invites.total).toBe(w.intercepts.total);
  });
});

describe('server loaders — >1000 rows page to exhaustion with the same stop rule', () => {
  it('growth-stats: full 1000-row page + 1-row tail, range(0,999) then range(1000,1999)', async () => {
    const chain = pagedChain([growthRows(1000), growthRows(1, 1000)]);
    mockAdmin(makeDb({ invitations: chain }));

    const stats = await loadGrowthStats(NOW);

    expect(chain.range).toHaveBeenNthCalledWith(1, 0, 999);
    expect(chain.range).toHaveBeenNthCalledWith(2, 1000, 1999);
    expect(chain.range).toHaveBeenCalledTimes(2);
    expect(stats?.invites.total).toBe(1001);
    expect(stats?.uniqueInviters).toBe(3);
  });

  it('transparency-weekly: all three tables page to exhaustion with the same PAGE_SIZE', async () => {
    const health = pagedChain([bigHealth(1000), bigHealth(1, 1000)]);
    const passed = pagedChain([bigPassed(1000), bigPassed(1)]);
    const profiles = pagedChain([bigProfiles(1000), bigProfiles(1)]);
    mockAdmin(makeDb({
      health_events: health,
      active_challenges: passed,
      profiles,
      transparency_snapshots: makeChain(async () => ({ data: null, error: null })),
    }));

    const snapshot = await loadTransparencyWeekly(NOW);

    for (const chain of [health, passed, profiles]) {
      expect(chain.range).toHaveBeenNthCalledWith(1, 0, 999);
      expect(chain.range).toHaveBeenNthCalledWith(2, 1000, 1999);
      expect(chain.range).toHaveBeenCalledTimes(2);
    }
    expect(snapshot.degraded).toBe(false);
    expect(snapshot.intercepts.total).toBe(1001);
    expect(snapshot.guards).toBe(1001);
    expect(snapshot.savedUsd.total).toBe(1001);
  });

  it('same-scale 1001-row input: both loaders return the full count — neither truncates at the PostgREST cap', async () => {
    mockAdmin(makeDb({ invitations: pagedChain([growthRows(1000), growthRows(1, 1000)]) }));
    const stats = await loadGrowthStats(NOW);

    mockAdmin(makeDb({
      health_events: pagedChain([bigHealth(1000), bigHealth(1, 1000)]),
      active_challenges: pagedChain([bigPassed(1000), bigPassed(1)]),
      profiles: pagedChain([bigProfiles(1000), bigProfiles(1)]),
      transparency_snapshots: makeChain(async () => ({ data: null, error: null })),
    }));
    const snapshot = await loadTransparencyWeekly(NOW);

    expect(stats?.invites.total).toBe(1001);
    expect(snapshot.intercepts.total).toBe(1001);
    expect(snapshot.guards).toBe(1001);
    expect(stats?.invites.total).toBe(snapshot.intercepts.total);
  });
});

describe('degradation mode — both loaders resolve (恒 200), honest zeros vs stale snapshot', () => {
  it('query failure: growth resolves null (壳落骨架), weekly resolves degraded snapshot — neither rejects', async () => {
    mockAdmin(makeDb({ invitations: errChain() }));
    await expect(loadGrowthStats(NOW)).resolves.toBeNull();

    mockAdmin(makeDb({
      health_events: errChain(),
      active_challenges: errChain(),
      profiles: errChain(),
      transparency_snapshots: makeChain(async () => ({ data: null, error: { message: 'no table' } })),
    }));
    const snapshot = await loadTransparencyWeekly(NOW);
    expect(snapshot.degraded).toBe(true);
    expect(snapshot.intercepts).toEqual({ week: 0, total: 0 });
  });

  it('PostgREST null-data-no-error edge: both treat it as a real empty table, not a degrade', async () => {
    mockAdmin(makeDb({ invitations: okChain([]) }));
    const stats = await loadGrowthStats(NOW);
    expect(stats).not.toBeNull();
    expect(stats?.invites.total).toBe(0);

    mockAdmin(makeDb({
      health_events: okChain([]),
      active_challenges: okChain([]),
      profiles: okChain([]),
      transparency_snapshots: makeChain(async () => ({ data: null, error: null })),
    }));
    const snapshot = await loadTransparencyWeekly(NOW);
    expect(snapshot.degraded).toBe(false);
    expect(snapshot.intercepts).toEqual({ week: 0, total: 0 });
  });
});
