/* eslint-disable require-await -- withAuth 直通 mock 的 async 直返 */
// email/seed-test — 测试数据播种（此前 0 测试）
// 契约: 双重锁(admin鉴权+生产环境403)/已有连接复用否则建/
// platform过滤/impulse_score≥60→actionable。
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

let authContext: { supabase: unknown; user: { id: string }; request: NextRequest };
vi.mock('@/lib/with-auth', () => ({
  withAuth: (handler: (ctx: typeof authContext) => Promise<unknown>) =>
    async (_req: NextRequest) => handler(authContext),
}));
vi.mock('@/lib/logger', () => ({
  logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
const verifyAdminAuthMock = vi.fn();
vi.mock('@/lib/admin-auth', () => ({
  verifyAdminAuth: (...a: unknown[]) => verifyAdminAuthMock(...a),
}));

const connsQueryMock = vi.fn();
const insertConnMock = vi.fn();
const insertReceiptsMock = vi.fn();
const fakeSupabase = {
  from: (t: string) => {
    if (t === 'email_connections') {
      return {
        select: () => ({ eq: () => ({ eq: () => ({ limit: () => connsQueryMock() }) }) }),
        insert: () => ({ select: () => ({ maybeSingle: insertConnMock }) }),
      };
    }
    if (t === 'email_receipts') {
      return { insert: () => ({ select: insertReceiptsMock }) };
    }
    if (t === 'impulse_events') {
      return { insert: () => Promise.resolve({ error: null }) };
    }
    throw new Error('unexpected ' + t);
  },
};

import { POST } from '../route';

function ctx(body: unknown = {}, vercelEnv?: string) {
  if (vercelEnv) process.env.VERCEL_ENV = vercelEnv;
  else delete process.env.VERCEL_ENV;
  const request = new NextRequest('http://localhost/api/email/seed-test', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
  });
  authContext = { supabase: fakeSupabase, user: { id: 'u-1' }, request };
  return request;
}

describe('POST /api/email/seed-test', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    verifyAdminAuthMock.mockReturnValue({ authorized: true });
    connsQueryMock.mockResolvedValue({ data: [{ id: 'conn-existing' }], error: null });
    insertReceiptsMock.mockResolvedValue({ data: [], error: null });
  });

  it('非 admin → 401 (防任意数据注入)', async () => {
    verifyAdminAuthMock.mockReturnValue({ authorized: false });
    const res = await POST(ctx());
    expect(res.status).toBe(401);
  });

  it('生产环境 → 403 disabled (双重锁第二道)', async () => {
    const res = await POST(ctx({}, 'production'));
    expect(res.status).toBe(403);
    expect((await res.json()).error).toContain('disabled');
  });

  it('已有连接 → 复用不重建', async () => {
    const res = await POST(ctx());
    expect(res.status).toBe(200);
    expect(insertConnMock).not.toHaveBeenCalled();
    expect(insertReceiptsMock).toHaveBeenCalled();
  });

  it('无连接 → 建测试连接 (gmail placeholder token)', async () => {
    connsQueryMock.mockResolvedValue({ data: [], error: null });
    insertConnMock.mockResolvedValue({ data: { id: 'conn-new' }, error: null });
    const res = await POST(ctx());
    expect(res.status).toBe(200);
    expect(insertConnMock).toHaveBeenCalled();
  });

  it('插入失败 → 500', async () => {
    insertReceiptsMock.mockResolvedValue({ data: null, error: { message: 'rls' } });
    const res = await POST(ctx());
    expect(res.status).toBe(500);
  });
});
