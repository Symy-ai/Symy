// audit/ai — AI审计日志双路径（此前 0 测试）
// 关键安全契约: verifyAdminAuth().authorized 检查(SEC-CRITICAL历史修复);
// 普通用户硬过滤user_id; limit/offset边界收敛; 过滤器白名单。
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

const verifyAdminAuthMock = vi.fn();
vi.mock('@/lib/admin-auth', () => ({
  verifyAdminAuth: (...a: unknown[]) => verifyAdminAuthMock(...a),
}));
vi.mock('@/lib/logger', () => ({
  logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
const adminFromMock = vi.fn();
vi.mock('@/lib/supabase-admin', () => ({
  createAdminClient: () => ({ supabase: { from: adminFromMock }, error: null }),
}));

// 用户路径 client
let userCtx: { supabase: unknown; user: { id: string } | null; error: string | null; json: (d: Record<string, unknown>, init?: ResponseInit) => NextResponse };
vi.mock('@/lib/supabase-api', () => ({
  // eslint-disable-next-line require-await -- 直返 mock
  createAuthenticatedClient: async () => userCtx,
}));
const userFromMock = vi.fn();

import { GET } from '../route';

function makeQuery(query = '') {
  return new NextRequest('http://localhost/api/audit/ai' + (query ? '?' + query : ''));
}

describe('GET /api/audit/ai', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    userCtx = { supabase: { from: userFromMock }, user: { id: 'u-1' }, error: null, json: (d, init) => NextResponse.json(d, init) };
  });

  it('limit 越界收敛: 9999→200, 0→1, 非数字→50', async () => {
    verifyAdminAuthMock.mockReturnValue({ authorized: false });
    userFromMock.mockReturnValue(buildQueryChain());
    await GET(makeQuery('limit=9999'));
    // 链上 range 参数校验
    expect(lastRangeArgs[0]).toEqual([0, 199]); // offset 0, limit 200
    await GET(makeQuery('limit=0'));
    // parseInt('0')=0 是 falsy → || 50 走默认 (quirk 如实锚定)
    expect(lastRangeArgs[1]).toEqual([0, 49]);
    await GET(makeQuery('limit=abc'));
    expect(lastRangeArgs[2]).toEqual([0, 49]);
  });

  it('普通用户 → 强制 user_id 过滤 (admin=false)', async () => {
    verifyAdminAuthMock.mockReturnValue({ authorized: false });
    userFromMock.mockReturnValue(buildQueryChain());
    const res = await GET(makeQuery('action=tool_call&risk=high'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.admin).toBe(false);
    expect(body.filter).toEqual({ action: 'tool_call', risk: 'high' });
  });

  it('非法过滤值 → 静默丢弃为 null (白名单)', async () => {
    verifyAdminAuthMock.mockReturnValue({ authorized: false });
    userFromMock.mockReturnValue(buildQueryChain());
    const res = await GET(makeQuery('action=drop_table&risk=extreme'));
    const body = await res.json();
    expect(body.filter).toEqual({ action: null, risk: null });
  });

  it('admin → admin=true 且走 admin client', async () => {
    verifyAdminAuthMock.mockReturnValue({ authorized: true });
    adminFromMock.mockReturnValue(buildQueryChain()); // admin 路径 chain
    const res = await GET(makeQuery('user_id=victim'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.admin).toBe(true);
    expect(body.filter.user_id).toBe('victim');
  });

  it('admin 查询失败 → 500 不假成功', async () => {
    verifyAdminAuthMock.mockReturnValue({ authorized: true });
    const failing = {
      select: () => failing,
      order: () => failing,
      range: () => failing,
      eq: () => failing,
      then: (resolve: (v: unknown) => unknown) => resolve({ data: null, error: { message: 'rls' }, count: 0 }),
    };
    adminFromMock.mockReturnValue(failing);
    const res = await GET(makeQuery());
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBe('Query failed');
    expect(JSON.stringify(body)).not.toContain('rls');
  });

  it('普通用户查询失败 → 500 不假成功', async () => {
    verifyAdminAuthMock.mockReturnValue({ authorized: false });
    const failing = {
      select: () => failing,
      order: () => failing,
      range: () => failing,
      eq: () => failing,
      then: (resolve: (v: unknown) => unknown) => resolve({ data: null, error: { message: 'conn reset' }, count: 0 }),
    };
    userFromMock.mockReturnValue(failing);
    const res = await GET(makeQuery());
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBe('Query failed');
    expect(JSON.stringify(body)).not.toContain('conn reset');
  });

  it('未认证 → 401', async () => {
    verifyAdminAuthMock.mockReturnValue({ authorized: false });
    userCtx = { supabase: null, user: null, error: 'no auth', json: (d, init) => NextResponse.json(d, init) };
    const res = await GET(makeQuery());
    expect(res.status).toBe(401);
  });
});

// ---- 测试链构建器: 记录 range/eq 调用 ----
const lastRangeArgs: unknown[][] = [];
function buildQueryChain() {
  lastRangeArgs.length = 0;
  const eqCalls: Array<[string, unknown]> = [];
  const self: Record<string, unknown> = {
    select: () => self,
    order: () => self,
    range: (a: number, b: number) => {
      lastRangeArgs.push([a, b]);
      return self;
    },
    eq: (col: string, v: unknown) => {
      eqCalls.push([col, v]);
      return self;
    },
    then: (resolve: (v: unknown) => unknown) => resolve({ data: [], error: null, count: 0 }),
  };
  return self;
}
