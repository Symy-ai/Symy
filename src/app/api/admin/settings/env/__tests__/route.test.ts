// admin/settings/env route (31行) — 环境变量配置检查子路由。
// 锁定: 鉴权 401+审计 / envVars+groups 双出口 / 值永不出 (密钥红线 — 只 configured 布尔)。
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const M = vi.hoisted(() => ({
  verifyAdminAuth: vi.fn(),
  withAdminAudit: vi.fn((_req: unknown, _auth: unknown, fn: () => unknown) => fn()),
  logUnauthorized: vi.fn(),
  checkEnvVars: vi.fn(),
}));

vi.mock('@/lib/admin-auth', () => ({ verifyAdminAuth: M.verifyAdminAuth }));
vi.mock('@/lib/admin-audit', () => ({
  withAdminAudit: M.withAdminAudit,
  logUnauthorizedAdminAttempt: M.logUnauthorized,
}));
vi.mock('@/lib/admin-settings', () => ({ checkEnvVars: M.checkEnvVars }));

import { GET } from '../route';

const req = () => new NextRequest('http://localhost/api/admin/settings/env');

describe('GET /api/admin/settings/env', () => {
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
    expect(M.checkEnvVars).not.toHaveBeenCalled();
  });

  it('按分组聚合: groups 以 v.group 为键, envVars 平铺原样', async () => {
    M.checkEnvVars.mockReturnValue([
      { name: 'LETTA_API_KEY', group: 'letta', configured: true },
      { name: 'LETTA_AGENT_ID', group: 'letta', configured: false },
      { name: 'SUPABASE_URL', group: 'supabase', configured: true },
    ]);
    const res = await GET(req());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.envVars).toHaveLength(3);
    expect(Object.keys(body.groups).sort()).toEqual(['letta', 'supabase']);
    expect(body.groups.letta).toHaveLength(2);
    expect(body.groups.supabase).toHaveLength(1);
  });

  it('密钥红线: 响应体只含 configured 布尔, 无 env 值字段', async () => {
    M.checkEnvVars.mockReturnValue([
      { name: 'LETTA_API_KEY', group: 'letta', configured: true },
    ]);
    const res = await GET(req());
    const raw = JSON.stringify(await res.json());
    expect(raw).not.toMatch(/"(value|secret|apiKey|token)"/i);
    expect(raw).toContain('"configured":true');
  });

  it('空 envVars → groups 空对象 (无 crash)', async () => {
    M.checkEnvVars.mockReturnValue([]);
    const res = await GET(req());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.envVars).toEqual([]);
    expect(body.groups).toEqual({});
  });
});
