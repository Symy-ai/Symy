/**
 * Tests for growth-stats-server loader (batch85-c testgap)
 *
 * 路由测试 (api/community/growth-stats) 已透过 HTTP 壳深覆盖本 loader 的
 * 成功/分页/error-field 降级; 本文件钉 loader 本体的契约边界, 补壳测不到的分支:
 * - 降级红线: 任何失败路径返回 degraded 快照 (绝不 throw)
 *   成功后进程内缓存更新: 下次聚合失败时保留原 generatedAt
 * - 查询链 await 时 reject (throw 而非 error field) → 外层 catch → null
 * - data=null 且 error=null (PostgREST 边界) → 按空表聚合并返回, 不降级
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
/* eslint-disable require-await -- test mocks use async for API consistency */

vi.mock('@/lib/supabase-admin', () => ({
  createAdminClient: vi.fn(),
}));

vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { loadGrowthStats, __setGrowthMemoryCacheForTests } from '../growth-stats-server';
import { createAdminClient } from '@/lib/supabase-admin';
import { logger } from '@/lib/logger';

type QueryResult = { data: readonly unknown[] | null; error: { message: string } | null };
type Terminal = () => Promise<QueryResult>;

function makeChain(terminal: Terminal) {
  const chain: Record<string, unknown> = {};
  for (const m of ['select', 'eq', 'order', 'limit', 'range']) chain[m] = vi.fn(() => chain);
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

function mutableAdmin(chain: ReturnType<typeof okChain>) {
  let current: ReturnType<typeof okChain> | ReturnType<typeof errChain> = chain;
  return {
    db: { from: () => current },
    set(next: ReturnType<typeof errChain>) {
      current = next;
    },
  };
}

function throwChain() {
  return makeChain(async () => {
    throw new Error('connection reset');
  });
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

function mockAdmin(db: { from: (table: string) => unknown } | null) {
  (createAdminClient as ReturnType<typeof vi.fn>).mockReturnValue(
    db ? { supabase: db, error: null } : { supabase: null, error: 'missing key' },
  );
}

const NOW = new Date('2026-09-16T12:00:00.000Z');

beforeEach(() => {
  vi.clearAllMocks();
  __setGrowthMemoryCacheForTests(null);
});

describe('loadGrowthStats — degrade red line (returns a snapshot, never throws)', () => {
  it('returns a degraded zeroed snapshot when there is no admin client', async () => {
    mockAdmin(null);

    await expect(loadGrowthStats(NOW)).resolves.toEqual({
      invites: { total: 0, pending: 0, completed: 0 },
      uniqueInviters: 0,
      kFactorApprox: 0,
      generatedAt: NOW.toISOString(),
      degraded: true,
    });
    expect(logger.warn).toHaveBeenCalledWith('[growth-stats] no admin client:', 'missing key');
  });

  it('returns a degraded zeroed snapshot when the invitations query reports an error field', async () => {
    mockAdmin({ from: () => errChain() });

    const stats = await loadGrowthStats(NOW);
    expect(stats).toMatchObject({ degraded: true, generatedAt: NOW.toISOString() });
  });

  it('returns a degraded zeroed snapshot when the query chain rejects instead of resolving an error', async () => {
    // route 壳测试 mock 的链只会 resolve error field, 这条 throw 路径只有 loader 直测能压到
    mockAdmin({ from: () => throwChain() });

    const stats = await loadGrowthStats(NOW);
    expect(stats).toMatchObject({ degraded: true, generatedAt: NOW.toISOString() });
    expect(logger.warn).toHaveBeenCalledWith('[growth-stats] load failed:', 'connection reset');
  });

  it('keeps the last successful generatedAt when a later aggregation fails', async () => {
    const admin = mutableAdmin(okChain([
      { referrer_user_id: 'r1', status: 'completed' },
      { referrer_user_id: 'r1', status: 'pending' },
    ]));
    mockAdmin(admin.db);

    const success = await loadGrowthStats(new Date('2026-09-01T00:00:00.000Z'));
    expect(success?.degraded).toBe(false);

    admin.set(errChain());
    const degraded = await loadGrowthStats(NOW);

    expect(degraded?.degraded).toBe(true);
    expect(degraded?.invites).toEqual(success?.invites);
    expect(degraded?.uniqueInviters).toBe(success?.uniqueInviters);
    expect(degraded?.kFactorApprox).toBe(success?.kFactorApprox);
    expect(degraded?.generatedAt).toBe('2026-09-01T00:00:00.000Z');
  });
});

describe('loadGrowthStats — pagination and aggregation', () => {
  it('exhausts pages: full 1000-row page plus tail, then stops', async () => {
    const fullPage = Array.from({ length: 1000 }, (_, i) => ({ referrer_user_id: `r${i % 10}`, status: 'completed' }));
    const tailPage = [{ referrer_user_id: 'rX', status: 'pending' }];
    const chain = pagedChain([fullPage, tailPage]);
    mockAdmin({ from: () => chain });

    const stats = await loadGrowthStats(NOW);

    expect(chain.range).toHaveBeenNthCalledWith(1, 0, 999);
    expect(chain.range).toHaveBeenNthCalledWith(2, 1000, 1999);
    expect(chain.range).toHaveBeenCalledTimes(2);
    expect(stats?.invites).toEqual({ total: 1001, pending: 1, completed: 1000 });
    expect(stats?.uniqueInviters).toBe(11);
    expect(stats?.kFactorApprox).toBe(90.91);
  });

  it('aggregates a null-data-no-error response as an empty table (honest zeros, not null)', async () => {
    // PostgREST 边界: data=null 且 error=null 不应被打成降级 — 空表聚合并照常返回
    const chain = okChain([]);
    mockAdmin({ from: () => chain });

    const stats = await loadGrowthStats(NOW);

    expect(chain.range).toHaveBeenCalledTimes(1); // 空首页 < PAGE_SIZE, 停止翻页
    expect(stats).not.toBeNull();
    expect(stats?.invites).toEqual({ total: 0, pending: 0, completed: 0 });
    expect(stats?.kFactorApprox).toBe(0);
    expect(stats?.generatedAt).toBe(NOW.toISOString());
    expect(stats?.degraded).toBe(false);
  });

  it('passes the aggregation workload to growth-stats and returns its result', async () => {
    mockAdmin({
      from: () => okChain([
        { referrer_user_id: 'r1', status: 'completed' },
        { referrer_user_id: 'r1', status: 'pending' },
        { referrer_user_id: null, status: 'pending' }, // 无 referrer: 计发出不进分母
      ]),
    });

    const stats = await loadGrowthStats(NOW);

    expect(stats?.invites).toEqual({ total: 3, pending: 2, completed: 1 });
    expect(stats?.uniqueInviters).toBe(1); // r1; null referrer 不虚构活跃邀请者
    expect(stats?.kFactorApprox).toBe(1);
  });
});
