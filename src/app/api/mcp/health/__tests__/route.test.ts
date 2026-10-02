// mcp/health — 基础设施诊断（此前 0 测试）
// 契约: admin鉴权(SEC-5)/六项检查聚合/unhealthy→503,
// degraded→200/env缺失各档降级。
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';


const verifyAdminAuthMock = vi.fn();
vi.mock('@/lib/admin-auth', () => ({
  verifyAdminAuth: (...a: unknown[]) => verifyAdminAuthMock(...a),
}));

const tableQueryMock = vi.fn(); // (table) => {error}
vi.mock('@/lib/supabase-admin', () => ({
  createAdminClient: () => ({
    supabase: {
      from: (t: string) => ({
        select: (_c: string, opts?: Record<string, unknown>) => {
          expect(opts?.head).toBe(true);
          return { limit: () => tableQueryMock(t) };
        },
      }),
    },
    error: null,
  }),
}));

import { GET } from '../route';

function req() {
  return new NextRequest('http://localhost/api/mcp/health');
}

describe('GET /api/mcp/health', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    verifyAdminAuthMock.mockReturnValue({ authorized: true });
    tableQueryMock.mockResolvedValue({ error: null });
    process.env.LETTA_API_KEY = 'test-letta-key'; // env_letta 检查需 ok 才能到 healthy
  });

  afterEach(() => {
    delete process.env.LETTA_API_KEY;
  });

  it('非 admin → 401 (SEC-5: 诊断信息不外泄)', async () => {
    verifyAdminAuthMock.mockReturnValue({ authorized: false });
    const res = await GET(req());
    expect(res.status).toBe(401);
  });

  it('全绿 → healthy 200 + 六项检查齐全', async () => {
    const res = await GET(req());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe('healthy');
    expect(body.checks.supabase_admin.status).toBe('ok');
    expect(body.checks.buddy_state_table.status).toBe('ok');
    expect(body.checks.impulse_events_table.status).toBe('ok');
    expect(body.checks.health_events_table.status).toBe('ok');
    expect(body.checks.profiles_onboarding.status).toBe('ok');
  });

  it('任一表 error → unhealthy 503', async () => {
    tableQueryMock.mockImplementation((t: string) =>
      Promise.resolve(t === 'buddy_state' ? { error: { message: 'gone' } } : { error: null }),
    );
    const res = await GET(req());
    expect(res.status).toBe(503);
    expect((await res.json()).status).toBe('unhealthy');
  });

  it('profiles 列问题 → warn 档: degraded 仍 200 (降级不熔断)', async () => {
    tableQueryMock.mockImplementation((t: string) =>
      Promise.resolve(t === 'profiles' ? { error: { message: 'column missing' } } : { error: null }),
    );
    const res = await GET(req());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe('degraded');
    expect(body.checks.profiles_onboarding.status).toBe('warn');
  });

  it('表查询 throw → error 档不炸', async () => {
    tableQueryMock.mockRejectedValue(new Error('conn refused'));
    const res = await GET(req());
    expect(res.status).toBe(503);
    expect((await res.json()).status).toBe('unhealthy');
  });
});
