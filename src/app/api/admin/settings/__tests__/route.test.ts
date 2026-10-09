import { beforeEach, describe, expect, it, vi } from 'vitest';

const M = vi.hoisted(() => ({
  verifyAdminAuth: vi.fn(),
  withAdminAudit: vi.fn((_req: unknown, _auth: unknown, fn: () => unknown) => fn()),
  logUnauthorized: vi.fn(),
  createAdminClient: vi.fn(),
  checkEnvVars: vi.fn(() => ({ LETTA_API_KEY: true })),
  getMigrationsInfo: vi.fn(() => Promise.resolve({ migrations: [{}, {}] })),
  getCronJobs: vi.fn(() => Promise.resolve([])),
  runHealthChecks: vi.fn(),
}));

vi.mock('@/lib/admin-auth', () => ({ verifyAdminAuth: M.verifyAdminAuth }));
vi.mock('@/lib/admin-audit', () => ({
  withAdminAudit: M.withAdminAudit,
  logUnauthorizedAdminAttempt: M.logUnauthorized,
}));
vi.mock('@/lib/supabase-admin', () => ({ createAdminClient: M.createAdminClient }));
vi.mock('@/lib/admin-settings', () => ({
  checkEnvVars: M.checkEnvVars,
  getCronJobs: M.getCronJobs,
  getMigrationsInfo: M.getMigrationsInfo,
  runHealthChecks: M.runHealthChecks,
}));
vi.mock('@/lib/logger', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));

import { GET, POST } from '../route';

const reqWith = (body?: unknown) =>
  ({ json: () => (body === undefined ? Promise.reject(new Error('no body')) : Promise.resolve(body)) }) as never;

/**
 * admin/settings route (97行) — 系统设置概览+健康探测。
 *
 * 锁定:
 * - 未授权 → 401+审计日志
 * - GET: app_config 只读投影 (hasValue 布尔, value 永不出 — 密钥红线)
 * - POST: 非 health_check action → 400
 * - POST health_check: healthy→ok 映射+latency+条件 error
 */
describe('admin/settings', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    M.verifyAdminAuth.mockReturnValue({ authorized: true, provider: 'key' });
    M.withAdminAudit.mockImplementation((_r: unknown, _a: unknown, fn: () => unknown) => fn());
    M.createAdminClient.mockReturnValue({
      supabase: {
        from: () => ({
          select: () => ({
            order: () => ({
              limit: () =>
                Promise.resolve({
                  data: [
                    { key: 'LETTA_MODEL', value: 'gpt-x' },
                    { key: 'EMPTY_KEY', value: '' },
                    { key: 'WHITESPACE', value: '   ' },
                  ],
                  error: null,
                }),
            }),
          }),
        }),
      },
    });
    M.runHealthChecks.mockResolvedValue([
      { service: 'letta', status: 'healthy', latencyMs: 120 },
      { service: 'supabase', status: 'unhealthy', latencyMs: 0, message: 'conn refused' },
    ]);
  });

  it('未授权 → 401+审计', async () => {
    M.verifyAdminAuth.mockReturnValue({ authorized: false, error: 'bad key' });
    const r = await GET({} as never);
    expect(r.status).toBe(401);
    expect(M.logUnauthorized).toHaveBeenCalledTimes(1);
    const r2 = await POST(reqWith({ action: 'health_check' }));
    expect(r2.status).toBe(401);
    expect(M.logUnauthorized).toHaveBeenCalledTimes(2);
  });

  it('GET: app_config 投影 — hasValue 布尔化, value 永不出 (密钥红线)', async () => {
    const r = await GET({} as never);
    expect(r.status).toBe(200);
    const body = await r.json();
    expect(body.appConfig).toEqual([
      { key: 'LETTA_MODEL', hasValue: true, updatedAt: '' },
      { key: 'EMPTY_KEY', hasValue: false, updatedAt: '' },
      { key: 'WHITESPACE', hasValue: false, updatedAt: '' }, // 空白 trim 后为空
    ]);
    expect(body.migrationCount).toBe(2);
    // 红线: 响应体无任何 value 字段
    expect(JSON.stringify(body)).not.toContain('gpt-x');
  });

  it('GET: app_config 查询失败 → 空列表降级', async () => {
    M.createAdminClient.mockReturnValueOnce({
      supabase: {
        from: () => ({
          select: () => ({
            order: () => ({
              limit: () => Promise.resolve({ data: null, error: { message: 'perm denied' } }),
            }),
          }),
        }),
      },
    });
    const r = await GET({} as never);
    const body = await r.json();
    expect(body.appConfig).toEqual([]);
  });

  it('GET: supabase 不可用 → 空列表 (无 crash)', async () => {
    M.createAdminClient.mockReturnValueOnce({ supabase: null });
    const r = await GET({} as never);
    expect((await r.json()).appConfig).toEqual([]);
  });

  it('POST: 非 health_check → 400; 无 body → 400', async () => {
    expect((await POST(reqWith({ action: 'other' }))).status).toBe(400);
    expect((await POST(reqWith(undefined))).status).toBe(400);
  });

  it('POST health_check: healthy→ok 映射+条件 error', async () => {
    const r = await POST(reqWith({ action: 'health_check' }));
    expect(r.status).toBe(200);
    const body = await r.json();
    expect(body.services).toEqual([
      { name: 'letta', status: 'ok', latency: 120 },
      { name: 'supabase', status: 'error', latency: 0, error: 'conn refused' },
    ]);
  });
});
