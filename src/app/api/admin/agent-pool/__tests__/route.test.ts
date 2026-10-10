import { beforeEach, describe, expect, it, vi } from 'vitest';

const M = vi.hoisted(() => ({
  verifyAdminAuth: vi.fn(),
  withAdminAudit: vi.fn((_r: unknown, _a: unknown, fn: () => unknown, _tag: string) => fn()),
  logUnauthorized: vi.fn(),
  getPoolStatus: vi.fn(),
  checkAndRefill: vi.fn(),
  createAdminClient: vi.fn(),
}));

vi.mock('@/lib/admin-auth', () => ({ verifyAdminAuth: M.verifyAdminAuth }));
vi.mock('@/lib/admin-audit', () => ({
  withAdminAudit: M.withAdminAudit,
  logUnauthorizedAdminAttempt: M.logUnauthorized,
}));
vi.mock('@/lib/letta-agent-pool', () => ({
  getPoolStatus: M.getPoolStatus,
  checkAndRefill: M.checkAndRefill,
}));
vi.mock('@/lib/supabase-admin', () => ({ createAdminClient: M.createAdminClient }));
vi.mock('@/lib/logger', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));

import { GET, POST } from '../route';

function postReq(body: unknown, hasBody = true) {
  return {
    headers: new Headers(hasBody ? { 'content-length': '10' } : {}),
    json: () => Promise.resolve(body),
  } as never;
}

/**
 * admin/agent-pool route (92行) — 池子管理 (ARCH-2 #2: verifyAdminAuth+withAdminAudit)。
 *
 * 锁定:
 * - 401+审计 (GET/POST)
 * - GET: status null → 500; 成功透传
 * - POST: 空 body 跳过 json 解析 (audit #16); 坏 JSON → 400
 * - setPoolSize>0 → config 表 UPDATE; ≤0 → 忽略仍 refill
 */
describe('admin/agent-pool (API key 版)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    M.verifyAdminAuth.mockReturnValue({ authorized: true, provider: 'key' });
    M.withAdminAudit.mockImplementation((_r, _a, fn) => fn());
    M.getPoolStatus.mockResolvedValue({ poolSize: 5, available: 3 });
    M.checkAndRefill.mockResolvedValue({ refilled: 1 });
    const chain = { update: vi.fn(() => chain), eq: vi.fn(() => Promise.resolve({ error: null })) };
    M.createAdminClient.mockReturnValue({ supabase: { from: () => chain } });
  });

  it('未授权 → 401+审计 (GET/POST)', async () => {
    M.verifyAdminAuth.mockReturnValue({ authorized: false });
    expect((await GET({} as never)).status).toBe(401);
    expect((await POST(postReq({}, false))).status).toBe(401);
    expect(M.logUnauthorized).toHaveBeenCalledTimes(2);
    expect(M.withAdminAudit).not.toHaveBeenCalled();
  });

  it('GET: status null → 500; 成功透传', async () => {
    M.getPoolStatus.mockResolvedValueOnce(null);
    expect((await GET({} as never)).status).toBe(500);
    const r = await GET({} as never);
    const body = await r.json();
    expect(body.success).toBe(true);
    expect(body.poolSize).toBe(5);
  });

  it('POST 空 body (无 content-length) → 跳过解析直接 refill (audit #16)', async () => {
    const r = await POST(postReq({}, false));
    const body = await r.json();
    expect(body.success).toBe(true);
    expect(body.refilled).toBe(1);
  });

  it('POST 坏 JSON → 400', async () => {
    const req = {
      headers: new Headers({ 'content-length': '20' }),
      json: () => Promise.reject(new Error('bad json')),
    } as never;
    expect((await POST(req)).status).toBe(400);
  });

  it('setPoolSize>0 → config UPDATE; ≤0 忽略', async () => {
    await POST(postReq({ setPoolSize: 8 }));
    const from = M.createAdminClient.mock.results[0].value.supabase.from;
    const chain = from();
    expect(chain.update).toHaveBeenCalledWith(expect.objectContaining({ pool_size: 8 }));
    // ≤0: 不触发 update
    M.createAdminClient.mockClear();
    await POST(postReq({ setPoolSize: -1 }));
    expect(M.createAdminClient).not.toHaveBeenCalled();
    expect(M.checkAndRefill).toHaveBeenCalledTimes(2); // 两轮都 refill
  });
});
