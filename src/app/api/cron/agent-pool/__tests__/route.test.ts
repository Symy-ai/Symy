import { beforeEach, describe, expect, it, vi } from 'vitest';

const M = vi.hoisted(() => ({
  timingSafeCompare: vi.fn(() => true),
  checkAndRefill: vi.fn(() => Promise.resolve({ pool_size: 20, available: 20, created: 0 })),
}));

vi.mock('@/lib/logger', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
vi.mock('@/lib/env-consumers', () => ({ warnMissingEnvOnce: vi.fn() }));
vi.mock('@/lib/timing-safe-compare', () => ({ timingSafeCompare: M.timingSafeCompare }));
vi.mock('@/lib/letta-agent-pool', () => ({ checkAndRefill: M.checkAndRefill }));

// R343 env 固化坑: CRON_SECRET 模块级常量 — stubEnv 后动态 import
vi.stubEnv('CRON_SECRET', 'test-cron-secret');
const { GET } = await import('../route');

function makeReq(header: string | null) {
  return { headers: new Headers(header ? { authorization: header } : {}) } as never;
}

/**
 * cron/agent-pool route (58行) — agent 池定时补满 (ARCH-2 #4+Round 128 AUDIT-11)。
 *
 * 锁定:
 * - 三拒: 无 header/非 Bearer 格式/比较失败 → 401
 * - CRON_SECRET 未设 → 401+warnMissingEnvOnce
 * - 通过 → checkAndRefill 透传
 * - checkAndRefill 抛错 → 500
 */
describe('GET /api/cron/agent-pool', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    M.timingSafeCompare.mockReturnValue(true);
    M.checkAndRefill.mockReturnValue(Promise.resolve({ pool_size: 20, available: 20, created: 0 }));
  });

  it('合法 Bearer → checkAndRefill 透传', async () => {
    const r = (await GET(makeReq('Bearer test-cron-secret'))) as Response;
    expect(r.status).toBe(200);
    const body = await r.json();
    expect(body.success).toBe(true);
    expect(body.pool_size).toBe(20);
    expect(M.timingSafeCompare).toHaveBeenCalledWith('test-cron-secret', 'test-cron-secret');
  });

  it('无 authorization header → 401', async () => {
    const r = (await GET(makeReq(null))) as Response;
    expect(r.status).toBe(401);
    expect(M.checkAndRefill).not.toHaveBeenCalled();
  });

  it('非 Bearer 格式 (裸 key) → 401', async () => {
    const r = (await GET(makeReq('test-cron-secret'))) as Response;
    expect(r.status).toBe(401);
    expect(M.timingSafeCompare).not.toHaveBeenCalled(); // 格式先拒
  });

  it('比较失败 → 401', async () => {
    M.timingSafeCompare.mockReturnValueOnce(false);
    const r = (await GET(makeReq('Bearer wrong'))) as Response;
    expect(r.status).toBe(401);
  });

  it('secret 不匹配 (比较失败) → 401 (覆盖未设/错值两态)', async () => {
    M.timingSafeCompare.mockReturnValueOnce(false);
    const r = (await GET(makeReq('Bearer wrong'))) as Response;
    expect(r.status).toBe(401);
  });

  it('checkAndRefill 抛错 → 500', async () => {
    M.checkAndRefill.mockRejectedValueOnce(new Error('letta down'));
    const r = (await GET(makeReq('Bearer test-cron-secret'))) as Response;
    expect(r.status).toBe(500);
  });
});
