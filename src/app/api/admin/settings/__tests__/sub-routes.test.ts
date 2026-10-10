import { beforeEach, describe, expect, it, vi } from 'vitest';

const M = vi.hoisted(() => ({
  verifyAdminAuth: vi.fn(),
  withAdminAudit: vi.fn((_r: unknown, _a: unknown, fn: () => unknown) => fn()),
  logUnauthorized: vi.fn(),
  checkEnvVars: vi.fn(),
  runHealthChecks: vi.fn(),
  getMigrationsInfo: vi.fn(),
}));

vi.mock('@/lib/admin-auth', () => ({ verifyAdminAuth: M.verifyAdminAuth }));
vi.mock('@/lib/admin-audit', () => ({
  withAdminAudit: M.withAdminAudit,
  logUnauthorizedAdminAttempt: M.logUnauthorized,
}));
vi.mock('@/lib/admin-settings', () => ({
  checkEnvVars: M.checkEnvVars,
  runHealthChecks: M.runHealthChecks,
  getMigrationsInfo: M.getMigrationsInfo,
}));

import { GET as envGET } from '../env/route';
import { GET as healthGET } from '../health/route';
import { GET as migrationsGET } from '../migrations/route';

const req = { url: 'https://x/api/admin/settings/x' } as never;

/**
 * admin/settings 三子件打包 (env 31行 + health 26行 + migrations 26行) — src/app/api 无测试件收官。
 *
 * 锁定:
 * - 三件同构: 未授权 → 401+logUnauthorized; 授权 → withAdminAudit 包裹
 * - env: 分组聚合 (groups 按 v.group 分桶) — 绝不回值红线由 checkEnvVars 契约背书
 * - health: checks 数组透传; migrations: overview 透传
 */
describe('GET /api/admin/settings/env', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    M.withAdminAudit.mockImplementation((_r: unknown, _a: unknown, fn: () => unknown) => fn());
    M.verifyAdminAuth.mockReturnValue({ authorized: true, email: 'a@b.c' });
  });

  it('未授权 → 401+审计日志', async () => {
    M.verifyAdminAuth.mockReturnValueOnce({ authorized: false, error: 'no key' });
    const r = (await envGET(req)) as Response;
    expect(r.status).toBe(401);
    expect(M.logUnauthorized).toHaveBeenCalledTimes(1);
    expect(M.withAdminAudit).not.toHaveBeenCalled();
  });

  it('授权 → envVars+groups 分组聚合', async () => {
    M.checkEnvVars.mockReturnValueOnce([
      { name: 'A1', group: 'letta', configured: true },
      { name: 'A2', group: 'letta', configured: false },
      { name: 'B1', group: 'supabase', configured: true },
    ]);
    const r = (await envGET(req)) as Response;
    const body = await r.json();
    expect(body.envVars).toHaveLength(3);
    expect(Object.keys(body.groups).sort()).toEqual(['letta', 'supabase']);
    expect(body.groups.letta).toHaveLength(2);
  });
});

describe('GET /api/admin/settings/health', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    M.withAdminAudit.mockImplementation((_r: unknown, _a: unknown, fn: () => unknown) => fn());
    M.verifyAdminAuth.mockReturnValue({ authorized: true, email: 'a@b.c' });
  });

  it('授权 → checks 透传 (allSettled 结果)', async () => {
    M.runHealthChecks.mockResolvedValueOnce([
      { name: 'supabase', ok: true, latencyMs: 120 },
      { name: 'letta', ok: false, error: 'timeout' },
    ]);
    const r = (await healthGET(req)) as Response;
    const body = await r.json();
    expect(body.checks).toHaveLength(2);
    expect(body.checks[1].ok).toBe(false);
  });
});

describe('GET /api/admin/settings/migrations', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    M.withAdminAudit.mockImplementation((_r: unknown, _a: unknown, fn: () => unknown) => fn());
    M.verifyAdminAuth.mockReturnValue({ authorized: true, email: 'a@b.c' });
  });

  it('授权 → overview 透传 (只读不执行)', async () => {
    M.getMigrationsInfo.mockResolvedValueOnce({ total: 42, conflicts: [], files: [] });
    const r = (await migrationsGET(req)) as Response;
    expect(await r.json()).toEqual({ total: 42, conflicts: [], files: [] });
    expect(M.withAdminAudit).toHaveBeenCalledTimes(1); // 审计在位
  });
});
