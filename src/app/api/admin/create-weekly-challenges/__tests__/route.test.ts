import { beforeEach, describe, expect, it, vi } from 'vitest';

const M = vi.hoisted(() => ({
  verifyAdminAuth: vi.fn(),
  withAdminAudit: vi.fn((_r: unknown, _a: unknown, fn: () => unknown, _tag: string) => fn()),
  logUnauthorized: vi.fn(),
  createAdminClient: vi.fn(),
  createWeekly: vi.fn(),
}));

vi.mock('@/lib/admin-auth', () => ({ verifyAdminAuth: M.verifyAdminAuth }));
vi.mock('@/lib/admin-audit', () => ({
  withAdminAudit: M.withAdminAudit,
  logUnauthorizedAdminAttempt: M.logUnauthorized,
}));
vi.mock('@/lib/supabase-admin', () => ({ createAdminClient: M.createAdminClient }));
vi.mock('@/lib/logger', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
vi.mock('../../_lib/create-weekly-challenges-helper', () => ({
  createWeeklyChallengesWithFallback: M.createWeekly,
}));

import { POST } from '../route';

function makeReq(body: unknown, hasBody = true) {
  const chain = {
    select: vi.fn(() => chain),
    eq: vi.fn(() => chain),
    order: vi.fn(() => Promise.resolve({ data: [{ id: 'ch1', title: 'T', is_active: true }] })),
  };
  return {
    req: {
      headers: new Headers(hasBody ? { 'content-length': '10' } : {}),
      json: () => Promise.resolve(body),
    } as never,
    chain,
  };
}

/**
 * create-weekly-challenges route (87行) — 每周挑战手动触发 (ARCH-2 #3 + audit P2)。
 *
 * 锁定:
 * - 401+审计; admin client 缺 → 500 'Server not configured' (不回显内部状态)
 * - weekOffset 夹取 [-4,4]+round; 坏 JSON → 400
 * - helper 失败 → 500 'Failed to create challenges' (不回显 SQL)
 * - 成功 → activeChallenges 查询透传
 */
describe('POST /api/admin/create-weekly-challenges', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    M.verifyAdminAuth.mockReturnValue({ authorized: true });
    M.withAdminAudit.mockImplementation((_r, _a, fn) => fn());
    M.createAdminClient.mockImplementation(() => {
      const { chain } = makeReq({}, true);
      return { supabase: { from: () => chain }, error: null };
    });
    M.createWeekly.mockResolvedValue({ success: true, usedFallback: false });
  });

  it('未授权 → 401+审计', async () => {
    M.verifyAdminAuth.mockReturnValueOnce({ authorized: false });
    expect((await POST(makeReq({}).req)).status).toBe(401);
    expect(M.logUnauthorized).toHaveBeenCalledTimes(1);
  });

  it('admin client 缺 → 500 固定文案 (audit P2 不回显)', async () => {
    M.createAdminClient.mockReturnValueOnce({ supabase: null, error: 'missing env' });
    const r = await POST(makeReq({}).req);
    expect(r.status).toBe(500);
    expect((await r.json()).error).toBe('Server not configured'); // 无 'missing env'
  });

  it('weekOffset 夹取 [-4,4]+round; 坏 JSON → 400', async () => {
    await POST(makeReq({ weekOffset: 99 }).req);
    expect(M.createWeekly).toHaveBeenCalledWith(expect.anything(), 4); // 夹到 4
    await POST(makeReq({ weekOffset: -9.6 }).req);
    expect(M.createWeekly).toHaveBeenLastCalledWith(expect.anything(), -4); // round+夹
    const bad = {
      headers: new Headers({ 'content-length': '5' }),
      json: () => Promise.reject(new Error('bad')),
    } as never;
    expect((await POST(bad)).status).toBe(400);
  });

  it('helper 失败 → 500 固定文案 (不回显 SQL/内部状态)', async () => {
    M.createWeekly.mockResolvedValueOnce({ success: false, error: 'PG::syntax error at db.internal' });
    const r = await POST(makeReq({}).req);
    expect(r.status).toBe(500);
    const body = await r.json();
    expect(body.error).toBe('Failed to create challenges');
    expect(JSON.stringify(body)).not.toContain('PG::'); // 内部错误零泄漏
  });

  it('成功 → activeChallenges 透传+usedFallback', async () => {
    M.createWeekly.mockResolvedValueOnce({ success: true, usedFallback: true });
    const r = await POST(makeReq({ weekOffset: 1 }).req);
    const body = await r.json();
    expect(body.success).toBe(true);
    expect(body.usedFallback).toBe(true);
    expect(body.activeChallenges[0].id).toBe('ch1');
    expect(body.message).toContain('fallback');
  });
});
