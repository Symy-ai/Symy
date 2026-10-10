// admin/settings/health route (26行) — 服务健康检查子路由。
// 锁定: 鉴权 401+审计 / runHealthChecks 透传 / withAdminAudit 包装。
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const M = vi.hoisted(() => ({
  verifyAdminAuth: vi.fn(),
  withAdminAudit: vi.fn((_req: unknown, _auth: unknown, fn: () => unknown) => fn()),
  logUnauthorized: vi.fn(),
  runHealthChecks: vi.fn(),
}));

vi.mock('@/lib/admin-auth', () => ({ verifyAdminAuth: M.verifyAdminAuth }));
vi.mock('@/lib/admin-audit', () => ({
  withAdminAudit: M.withAdminAudit,
  logUnauthorizedAdminAttempt: M.logUnauthorized,
}));
vi.mock('@/lib/admin-settings', () => ({ runHealthChecks: M.runHealthChecks }));

import { GET } from '../route';

const req = () => new NextRequest('http://localhost/api/admin/settings/health');

describe('GET /api/admin/settings/health', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    M.verifyAdminAuth.mockReturnValue({ authorized: true, provider: 'key' });
    M.withAdminAudit.mockImplementation((_r: unknown, _a: unknown, fn: () => unknown) => fn());
  });

  it('未授权 → 401 + 审计记录', async () => {
    M.verifyAdminAuth.mockReturnValue({ authorized: false, error: 'no key' });
    const res = await GET(req());
    expect(res.status).toBe(401);
    expect(M.logUnauthorized).toHaveBeenCalledTimes(1);
    expect(M.runHealthChecks).not.toHaveBeenCalled();
  });

  it('授权 → checks 数组透传 (healthy+unhealthy 原样)', async () => {
    M.runHealthChecks.mockResolvedValue([
      { service: 'supabase', status: 'healthy', latencyMs: 42 },
      { service: 'letta', status: 'unhealthy', latencyMs: 0, message: 'timeout' },
    ]);
    const res = await GET(req());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.checks).toHaveLength(2);
    expect(body.checks[0]).toMatchObject({ service: 'supabase', status: 'healthy' });
    expect(body.checks[1]).toMatchObject({ service: 'letta', status: 'unhealthy' });
  });

  it('runHealthChecks 抛错 → Promise rejection 未被吞 (冒泡到 Next.js 层)', async () => {
    M.runHealthChecks.mockRejectedValue(new Error('probe crashed'));
    // route 无 try/catch — withAdminAudit 返回 rejected Promise。
    // GET 同步返回该 Promise; 断言它 reject 且错误未被吞成 200。
    const pending = GET(req()) as Promise<unknown>;
    await expect(pending).rejects.toThrow('probe crashed');
  });
});
