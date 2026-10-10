import { describe, expect, it, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/admin-auth', () => ({
  verifyAdminAuth: vi.fn(() => ({ authorized: true, actor: 'admin' })),
}));

vi.mock('@/lib/admin-audit', () => ({
  withAdminAudit: vi.fn((_request: unknown, _auth: unknown, handler: () => unknown) => handler()),
  logUnauthorizedAdminAttempt: vi.fn(),
}));

const createAdminClientMock = vi.hoisted(() => vi.fn((): { supabase: { from: () => unknown } } => ({
  supabase: {
    from: vi.fn(() => {
      throw new Error('database must not be touched');
    }),
  },
})));
vi.mock('@/lib/supabase-admin', () => ({
  createAdminClient: createAdminClientMock,
}));

vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { GET, POST } from '../route';
import { createAdminClient } from '@/lib/supabase-admin';

beforeEach(() => {
  vi.clearAllMocks();
});

/** thenable 链式 profiles mock — update().in().select() 记录 patch (R384) */
function setupProfiles(result: { data?: unknown; error?: unknown } = { data: [{ id: 'u1' }, { id: 'u2' }], error: null }) {
  const patchCalls: unknown[] = [];
  const inCalls: unknown[] = [];
  const chain: Record<string, unknown> = {};
  chain.update = vi.fn((patch: unknown) => {
    patchCalls.push(patch);
    return chain;
  });
  chain.in = vi.fn((col: string, ids: unknown) => {
    inCalls.push({ col, ids });
    return chain;
  });
  chain.select = vi.fn(() => chain);
  chain.then = (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) =>
    Promise.resolve(result).then(resolve, reject);
  const from = vi.fn(() => chain);
  createAdminClientMock.mockReturnValue({ supabase: { from } });
  return { patchCalls, inCalls };
}

describe('POST /api/admin/users', () => {
  it('rejects an invalid bannedUntil before any database write (N3)', async () => {
    const request = new NextRequest('http://localhost/api/admin/users', {
      method: 'POST',
      body: JSON.stringify({
        action: 'ban',
        userIds: ['0199f8f5-bc5a-7a0a-9df5-4a1b2c3d4e5f'],
        bannedUntil: 'garbage',
      }),
    });

    const response = await POST(request);

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: 'bannedUntil must be a valid date' });
    expect(createAdminClient).not.toHaveBeenCalled();
  });

  it('userIds 空数组/超 100/非 UUID → 400 拒绝 (batch 上限守卫)', async () => {
    const mk = (userIds: unknown[]) => new NextRequest('http://localhost/api/admin/users', {
      method: 'POST',
      body: JSON.stringify({ action: 'ban', userIds }),
    });
    for (const bad of [[], ['not-uuid'], Array.from({ length: 101 }, () => '0199f8f5-bc5a-7a0a-9df5-4a1b2c3d4e5f')]) {
      const response = await POST(mk(bad));
      expect(response.status).toBe(400);
    }
    expect(createAdminClient).not.toHaveBeenCalled();
  });

  it('未知 action → 400 Invalid action (白名单守卫)', async () => {
    const request = new NextRequest('http://localhost/api/admin/users', {
      method: 'POST',
      body: JSON.stringify({ action: 'delete_all', userIds: ['0199f8f5-bc5a-7a0a-9df5-4a1b2c3d4e5f'] }),
    });
    const response = await POST(request);
    expect(response.status).toBe(400);
    expect(((await response.json()) as { error: string }).error).toContain('Invalid action');
  });

  it('ban → update({banned:true, banned_until ISO}) .in(id) → 200 affected=2', async () => {
    const { patchCalls, inCalls } = setupProfiles();
    const request = new NextRequest('http://localhost/api/admin/users', {
      method: 'POST',
      body: JSON.stringify({
        action: 'ban',
        userIds: ['0199f8f5-bc5a-7a0a-9df5-4a1b2c3d4e5f', '0199f8f5-bc5a-7a0a-9df5-4a1b2c3d4e60'],
        bannedUntil: '2030-01-01T00:00:00.000Z',
        reason: 'spam',
      }),
    });
    const response = await POST(request);
    const json = (await response.json()) as { success: boolean; action: string; affected: number };
    expect(response.status).toBe(200);
    expect(json).toEqual({ success: true, action: 'ban', affected: 2 });
    // patch 锚: banned true + reason + ISO 化 banned_until
    expect(patchCalls[0]).toEqual(expect.objectContaining({
      banned: true,
      banned_reason: 'spam',
      banned_until: '2030-01-01T00:00:00.000Z',
    }));
    expect(inCalls[0]).toEqual({ col: 'id', ids: ['0199f8f5-bc5a-7a0a-9df5-4a1b2c3d4e5f', '0199f8f5-bc5a-7a0a-9df5-4a1b2c3d4e60'] });
  });

  it('unban → 三字段全清 (banned_until/reason null) + set_plan 非 free/premium → 400', async () => {
    const { patchCalls } = setupProfiles();
    const request = new NextRequest('http://localhost/api/admin/users', {
      method: 'POST',
      body: JSON.stringify({ action: 'unban', userIds: ['0199f8f5-bc5a-7a0a-9df5-4a1b2c3d4e5f'] }),
    });
    const response = await POST(request);
    expect(response.status).toBe(200);
    expect(patchCalls[0]).toEqual(expect.objectContaining({
      banned: false,
      banned_until: null,
      banned_reason: null,
    }));

    // set_plan 白名单
    const badPlan = new NextRequest('http://localhost/api/admin/users', {
      method: 'POST',
      body: JSON.stringify({ action: 'set_plan', userIds: ['0199f8f5-bc5a-7a0a-9df5-4a1b2c3d4e5f'], plan: 'vip' }),
    });
    const badResponse = await POST(badPlan);
    expect(badResponse.status).toBe(400);
    expect(((await badResponse.json()) as { error: string }).error).toContain('free or premium');
  });
});

describe('GET /api/admin/users', () => {
  it('admin client 未配置 → 500 (env 缺失守护)', async () => {
    createAdminClientMock.mockReturnValueOnce({ supabase: null } as unknown as { supabase: { from: () => unknown } });
    const request = new NextRequest('http://localhost/api/admin/users');
    const response = await GET(request);
    expect(response.status).toBe(500);
    expect(((await response.json()) as { error: string }).error).toBe('Admin client not configured');
  });
});
