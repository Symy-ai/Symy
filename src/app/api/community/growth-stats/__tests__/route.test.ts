/**
 * Tests for GET /api/community/growth-stats (batch82-c)
 *
 * - 200 成功: mock admin client 聚合 invitations → 键面契约 + K 因子正确
 *   + 公共缓存头 + 序列化零个人字段 (红线)
 * - 分页耗尽: 1000 行满页 + 尾页 → .range() 依次 (0,999)/(1000,1999), 聚合不漏页
 * - 诚实小数字: <10 行照常返回真实值 (7 行 → K=0.43), 不设阈值不美化
 * - 降级 (恒 200 不抛 500): 查询失败 / 无 admin client → degraded 零值骨架
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
/* eslint-disable require-await -- test mocks use async for API consistency */

vi.mock('@/lib/supabase-admin', () => ({
  createAdminClient: vi.fn(),
}));

vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { GET } from '../route';
import { createAdminClient } from '@/lib/supabase-admin';
import { __setGrowthMemoryCacheForTests } from '@/lib/growth-stats-server';
import type { GrowthInvitationRow } from '@/lib/growth-stats';

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

function pagedChain(pages: readonly GrowthInvitationRow[][]) {
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

async function getJson(): Promise<{ status: number; body: Record<string, unknown>; raw: string; cacheControl: string }> {
  const res = await GET();
  const body = (await res.json()) as Record<string, unknown>;
  return {
    status: res.status,
    body,
    raw: JSON.stringify(body),
    cacheControl: res.headers.get('Cache-Control') ?? '',
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  __setGrowthMemoryCacheForTests(null);
});

describe('GET /api/community/growth-stats — success', () => {
  it('aggregates invitations into the public funnel contract with no personal fields', async () => {
    mockAdmin({
      from: () => okChain([
        { referrer_user_id: 'r1', status: 'completed' },
        { referrer_user_id: 'r1', status: 'completed' },
        { referrer_user_id: 'r1', status: 'pending' },
        { referrer_user_id: 'r2', status: 'pending' },
        { referrer_user_id: 'r3', status: 'rejected' },
      ]),
    });

    const { status, body, raw, cacheControl } = await getJson();

    expect(status).toBe(200);
    expect(Object.keys(body)).toEqual(['invites', 'uniqueInviters', 'kFactorApprox', 'generatedAt', 'degraded']);
    expect(body.invites).toEqual({ total: 5, pending: 2, completed: 2 });
    expect(body.uniqueInviters).toBe(3);
    expect(body.kFactorApprox).toBe(0.67); // 2 completed ÷ 3 inviters, 两位小数
    expect(body.degraded).toBe(false); // 契约反转: 成功聚合必须显式非降级
    expect(typeof body.generatedAt).toBe('string');
    // 红线: 聚合输出无个人字段, 无奖励金额 (50 代币不是钱)
    expect(raw).not.toMatch(/user_id|referee|email|reward|amount|token/i);
    expect(cacheControl).toContain('s-maxage');
  });

  it('exhausts pagination: reads full 1000-row page plus tail page', async () => {
    const fullPage: GrowthInvitationRow[] = Array.from({ length: 1000 }, (_, i) => ({
      referrer_user_id: `r${i % 10}`,
      status: 'completed',
    }));
    const tailPage: GrowthInvitationRow[] = [{ referrer_user_id: 'rX', status: 'pending' }];
    const chain = pagedChain([fullPage, tailPage]);
    mockAdmin({ from: () => chain });

    const { status, body } = await getJson();

    expect(status).toBe(200);
    expect(chain.range).toHaveBeenNthCalledWith(1, 0, 999);
    expect(chain.range).toHaveBeenNthCalledWith(2, 1000, 1999);
    expect(chain.range).toHaveBeenCalledTimes(2); // 尾页 1 行 < 1000, 停止翻页
    expect(body.invites).toEqual({ total: 1001, pending: 1, completed: 1000 });
    expect(body.uniqueInviters).toBe(11); // r0..r9 + rX
    expect(body.kFactorApprox).toBe(90.91); // 1000 ÷ 11, 两位小数
  });

  it('returns honest small numbers for a thin table (<10 rows, no threshold prettifying)', async () => {
    mockAdmin({
      from: () => okChain([
        { referrer_user_id: 'r1', status: 'completed' },
        { referrer_user_id: 'r2', status: 'completed' },
        { referrer_user_id: 'r3', status: 'pending' },
        { referrer_user_id: 'r4', status: 'pending' },
        { referrer_user_id: 'r5', status: 'pending' },
        { referrer_user_id: 'r6', status: 'pending' },
        { referrer_user_id: 'r7', status: 'pending' },
      ]),
    });

    const { body } = await getJson();

    expect(body.invites).toEqual({ total: 7, pending: 5, completed: 2 });
    expect(body.uniqueInviters).toBe(7);
    expect(body.kFactorApprox).toBe(0.29); // 2 ÷ 7 — 真实小数字
  });
});

describe('GET /api/community/growth-stats — degrade (always 200)', () => {
  it('falls back to the zeroed skeleton when the query fails', async () => {
    mockAdmin({ from: () => errChain() });

    const { status, body } = await getJson();

    expect(status).toBe(200);
    expect(body.invites).toEqual({ total: 0, pending: 0, completed: 0 });
    expect(body.uniqueInviters).toBe(0);
    expect(body.kFactorApprox).toBe(0);
    expect(body.degraded).toBe(true);
  });

  it('falls back to the zeroed skeleton when there is no admin client', async () => {
    mockAdmin(null);

    const { status, body } = await getJson();

    expect(status).toBe(200);
    expect(body.invites).toEqual({ total: 0, pending: 0, completed: 0 });
    expect(body.kFactorApprox).toBe(0);
    expect(body.degraded).toBe(true);
  });
});
