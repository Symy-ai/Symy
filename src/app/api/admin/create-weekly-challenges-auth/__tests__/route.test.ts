import { describe, expect, it, vi, beforeEach } from 'vitest';

vi.mock('@/lib/supabase-admin', () => ({
  createAdminClient: vi.fn(),
}));
vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));
vi.mock('next/headers', () => ({
  cookies: vi.fn(() => Promise.resolve({ getAll: () => [], set: vi.fn() })),
}));
const authState = { email: 'boss@x.com' as string | null, err: null as unknown };
vi.mock('@supabase/ssr', () => ({
  createServerClient: () => ({
    auth: {
      getUser: vi.fn(() => Promise.resolve({ data: { user: authState.email ? { email: authState.email } : null }, error: authState.err })),
    },
  }),
}));
vi.mock('../../_lib/create-weekly-challenges-helper', () => ({
  createWeeklyChallengesWithFallback: vi.fn(),
}));

// ADMIN_EMAILS 模块级常量 — stubEnv + 动态 import (R143 惯例)
vi.stubEnv('ADMIN_EMAILS', 'boss@x.com, ops@x.com');
vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://sb.example.com');
vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', 'anon');
const { POST } = await import('../route');

import { createAdminClient } from '@/lib/supabase-admin';
import { createWeeklyChallengesWithFallback } from '../../_lib/create-weekly-challenges-helper';

const mockAdmin = vi.mocked(createAdminClient);
const mockCreate = vi.mocked(createWeeklyChallengesWithFallback);

function makeReq(body?: unknown) {
  return {
    json: () => Promise.resolve(body ?? {}),
  } as never;
}

/**
 * create-weekly-challenges-auth/route.ts (137行) — Supabase auth 白名单 fallback 路由。
 *
 * 锁定:
 * - 未登录 → 401
 * - 邮箱不在白名单 → 403 (timing-safe 比较)
 * - weekOffset 夹取 [-4,4]
 * - admin client 未配置 → 500
 * - helper 失败 → 500
 * - 成功 → success + activeChallenges 回带
 */
describe('create-weekly-challenges-auth POST', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authState.email = 'boss@x.com';
    authState.err = null;
    const chain = {
      from: () => ({
        select: () => ({
          eq: () => ({
            order: () => Promise.resolve({ data: [{ id: 'c1', is_active: true }] }),
          }),
        }),
      }),
    };
    mockAdmin.mockReturnValue({ supabase: chain, error: null } as never);
    mockCreate.mockResolvedValue({ success: true, usedFallback: false } as never);
  });

  it('未登录 → 401', async () => {
    authState.email = null;
    const res = await POST(makeReq());
    expect(res.status).toBe(401);
  });

  it('邮箱不在白名单 → 403', async () => {
    authState.email = 'intruder@x.com';
    const res = await POST(makeReq());
    expect(res.status).toBe(403);
  });

  it('白名单第二邮箱通过 → weekOffset 夹取 [-4,4]', async () => {
    authState.email = 'ops@x.com';
    const res = await POST(makeReq({ weekOffset: 99 }));
    expect(res.status).toBe(200);
    expect(mockCreate).toHaveBeenCalledWith(expect.anything(), 4); // 99 → 4
  });

  it('负 weekOffset 下夹 -4; 非法值默认 0', async () => {
    await POST(makeReq({ weekOffset: -99 }));
    expect(mockCreate).toHaveBeenLastCalledWith(expect.anything(), -4);
    await POST(makeReq({ weekOffset: 'bogus' }));
    expect(mockCreate).toHaveBeenLastCalledWith(expect.anything(), 0);
  });

  it('admin client 未配置 → 500', async () => {
    mockAdmin.mockReturnValueOnce({ supabase: null, error: 'no key' } as never);
    const res = await POST(makeReq());
    expect(res.status).toBe(500);
  });

  it('helper 失败 → 500', async () => {
    mockCreate.mockResolvedValueOnce({ success: false, error: 'rpc down' } as never);
    const res = await POST(makeReq());
    expect(res.status).toBe(500);
  });

  it('成功 → 200 + activeChallenges 回带', async () => {
    const res = await POST(makeReq({ weekOffset: 1 }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.weekOffset).toBe(1);
    expect(body.triggeredBy).toBe('boss@x.com');
    expect(body.activeChallenges).toHaveLength(1);
  });
});
