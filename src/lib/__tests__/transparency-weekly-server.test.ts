/**
 * Tests for transparency-weekly-server loader (batch85-c testgap)
 *
 * 路由/页面/OG 测试已透过 mock supabase 深覆盖本 loader 的成功路径、
 * 分页耗尽与 error-field 降级阶梯; 本文件钉 loader 本体、补壳测不到的分支:
 * - 读/写/聚合链 await 时 reject (throw 而非 error field): readPersistedSnapshot
 *   与 persistSnapshot 的 try/catch、loadTransparencyWeekly 外层 catch
 * - 空表成功 (degraded:false 全零) vs 无 client 零值骨架 (degraded:true) 的对照
 * - 成功后进程内缓存更新: 下次聚合失败时回退到新快照 (非旧值)
 * - best-effort 持久化失败不改变主流程返回值
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
/* eslint-disable require-await -- test mocks use async for API consistency */

vi.mock('@/lib/supabase-admin', () => ({
  createAdminClient: vi.fn(),
}));

vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { loadTransparencyWeekly, __setTransparencyMemoryCacheForTests } from '../transparency-weekly-server';
import { createAdminClient } from '@/lib/supabase-admin';
import {
  aggregateTransparency,
  emptyTransparency,
  type TransparencyHealthRow,
  type TransparencyPassedChallengeRow,
  type TransparencyProfileRow,
  type TransparencySnapshot,
} from '@/lib/transparency-weekly';

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

function makeDb(chains: Record<string, unknown>) {
  return { from: vi.fn((table: string) => chains[table]) };
}

function mockAdmin(db: ReturnType<typeof makeDb> | null) {
  (createAdminClient as ReturnType<typeof vi.fn>).mockReturnValue(
    db ? { supabase: db, error: null } : { supabase: null, error: 'missing key' },
  );
}

const NOW = new Date('2026-09-16T12:00:00.000Z'); // 周三 — 本周一起 2026-09-14

const HEALTH_ROWS: TransparencyHealthRow[] = [
  { id: 'h1', user_id: 'u1', event_type: 'challenge_completed', trigger_id: 't1', created_at: '2026-09-15T00:00:00.000Z' },
  { id: 'h2', user_id: 'u2', event_type: 'challenge_failed', trigger_id: 't2', created_at: '2026-09-15T00:00:00.000Z' },
];
const PASSED_ROWS: TransparencyPassedChallengeRow[] = [
  { amount: 100, completed_at: '2026-09-15T00:00:00.000Z' },
];
const PROFILE_ROWS: TransparencyProfileRow[] = [
  { created_at: '2026-09-15T00:00:00.000Z' },
];

function okChain(rows: readonly unknown[]) {
  return makeChain(async () => ({ data: rows, error: null }));
}

function errChain() {
  return makeChain(async () => ({ data: null, error: { message: 'boom' } }));
}

function throwChain() {
  return makeChain(async () => {
    throw new Error('connection reset');
  });
}

function seededSnapshot(): TransparencySnapshot {
  return {
    ...aggregateTransparency(HEALTH_ROWS, PASSED_ROWS, PROFILE_ROWS, NOW),
    generatedAt: '2026-09-01T00:00:00.000Z',
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  __setTransparencyMemoryCacheForTests(null);
});

describe('loadTransparencyWeekly — success', () => {
  it('returns the fresh snapshot and refreshes the in-memory cache for the next degrade', async () => {
    const snapshots = makeChain(async () => ({ data: null, error: null }));
    const db = makeDb({
      health_events: okChain(HEALTH_ROWS),
      active_challenges: okChain(PASSED_ROWS),
      profiles: okChain(PROFILE_ROWS),
      transparency_snapshots: snapshots,
    });
    mockAdmin(db);

    const first = await loadTransparencyWeekly(NOW);
    expect(first.degraded).toBe(false);
    expect(first.intercepts).toEqual({ week: 2, total: 2 });
    expect(first.savedUsd).toEqual({ week: 100, total: 100 });
    expect(snapshots.upsert).toHaveBeenCalledTimes(1);

    // 第二次聚合失败 → 回退到刚才成功的那份 (generatedAt 保留, 非 generatedAt:now)
    mockAdmin(makeDb({
      health_events: errChain(),
      active_challenges: errChain(),
      profiles: errChain(),
      transparency_snapshots: makeChain(async () => ({ data: null, error: { message: 'no table' } })),
    }));
    const second = await loadTransparencyWeekly(NOW);
    expect(second.degraded).toBe(true);
    expect(second.intercepts).toEqual(first.intercepts);
    expect(second.generatedAt).toBe(first.generatedAt);
  });

  it('aggregates empty tables as an honest zero snapshot with degraded:false', async () => {
    // 与无-client 零值骨架 (degraded:true) 的关键对照: 空表是真实数据, 不是降级
    mockAdmin(makeDb({
      health_events: okChain([]),
      active_challenges: okChain([]),
      profiles: okChain([]),
      transparency_snapshots: makeChain(async () => ({ data: null, error: null })),
    }));

    const snapshot = await loadTransparencyWeekly(NOW);
    const skeleton = emptyTransparency(NOW, true);

    expect(snapshot.degraded).toBe(false);
    expect(snapshot.intercepts).toEqual({ week: 0, total: 0 });
    expect(snapshot.guards).toBe(0);
    expect(snapshot.degraded).not.toBe(skeleton.degraded);
  });

  it('keeps the success result when the snapshot upsert rejects (best-effort persist)', async () => {
    mockAdmin(makeDb({
      health_events: okChain(HEALTH_ROWS),
      active_challenges: okChain(PASSED_ROWS),
      profiles: okChain(PROFILE_ROWS),
      transparency_snapshots: throwChain(), // upsert await 时 reject — 壳测只压过 error-field
    }));

    const snapshot = await loadTransparencyWeekly(NOW);

    expect(snapshot.degraded).toBe(false);
    expect(snapshot.intercepts).toEqual({ week: 2, total: 2 });
  });
});

describe('loadTransparencyWeekly — degrade ladder (always resolves, never throws)', () => {
  it('returns the zeroed skeleton when there is no client, no cache, no persisted row', async () => {
    mockAdmin(null);

    const snapshot = await loadTransparencyWeekly(NOW);

    expect(snapshot.degraded).toBe(true);
    expect(snapshot).toEqual(emptyTransparency(NOW, true));
  });

  it('falls back to memory when aggregation fails and the persisted read rejects', async () => {
    const cached = seededSnapshot();
    __setTransparencyMemoryCacheForTests(cached);
    mockAdmin(makeDb({
      health_events: errChain(),
      active_challenges: errChain(),
      profiles: errChain(),
      transparency_snapshots: throwChain(), // 快照表读 throw → catch 视为无快照
    }));

    const snapshot = await loadTransparencyWeekly(NOW);

    expect(snapshot.degraded).toBe(true);
    expect(snapshot.intercepts).toEqual(cached.intercepts);
    expect(snapshot.generatedAt).toBe('2026-09-01T00:00:00.000Z');
  });

  it('treats a rejecting aggregate query like a failing one (outer catch → ladder)', async () => {
    mockAdmin(makeDb({
      health_events: throwChain(),
      active_challenges: okChain(PASSED_ROWS),
      profiles: okChain(PROFILE_ROWS),
      transparency_snapshots: makeChain(async () => ({ data: null, error: null })),
    }));

    const snapshot = await loadTransparencyWeekly(NOW);

    expect(snapshot.degraded).toBe(true);
    // 无缓存无持久化行 → 零值骨架
    expect(snapshot).toEqual(emptyTransparency(NOW, true));
  });

  it('falls through to the skeleton when the persisted payload fails validation', async () => {
    mockAdmin(makeDb({
      health_events: errChain(),
      active_challenges: errChain(),
      profiles: errChain(),
      transparency_snapshots: makeChain(async () => ({ data: [{ payload: { hello: 'world' } }], error: null })),
    }));

    const snapshot = await loadTransparencyWeekly(NOW);

    expect(snapshot.degraded).toBe(true);
    expect(snapshot.intercepts).toEqual({ week: 0, total: 0 });
  });
});
