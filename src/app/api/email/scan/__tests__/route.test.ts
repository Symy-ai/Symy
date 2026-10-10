import { describe, expect, it, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/with-auth', () => ({ withAuth: vi.fn((handler: (ctx: unknown) => unknown) => handler) }));

const acquireLockMock = vi.hoisted(() => vi.fn(() => Promise.resolve(true)));
const releaseLockMock = vi.hoisted(() => vi.fn(() => Promise.resolve()));
vi.mock('@/lib/distributed-lock', () => ({
  acquireLock: acquireLockMock,
  releaseLock: releaseLockMock,
}));

vi.mock('@/lib/crypto-helpers', () => ({
  decryptSensitive: vi.fn((value: string) => `decrypted:${value}`),
  encryptSensitive: vi.fn((value: string) => `encrypted:${value}`),
}));

vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

const refreshAccessToken = vi.fn(() => Promise.reject(new Error('refresh failed')));

vi.mock('googleapis', () => ({
  google: {
    auth: {
      OAuth2: vi.fn(function MockOAuth2() {
        return {
          setCredentials: vi.fn(),
          refreshAccessToken,
        };
      }),
    },
  },
}));

const { POST } = (await import('../route')) as {
  POST: (context: unknown) => Promise<Response>;
};

function connectionResult() {
  const updateBuilder = {
    update: vi.fn(() => updateBuilder),
    eq: vi.fn(() => Promise.resolve({ data: null, error: null })),
  };
  const updateSpy = updateBuilder.update;
  const selectBuilder = {
    select: vi.fn(() => selectBuilder),
    eq: vi.fn(() => selectBuilder),
    update: updateSpy,
    then: (resolve: (value: unknown) => unknown) =>
      Promise.resolve({
        data: [{
          id: 'connection-1',
          access_token: 'encrypted-access',
          refresh_token: 'encrypted-refresh',
          token_expiry: 'garbage',
        }],
        error: null,
      }).then(resolve),
  };

  return { selectBuilder, updateSpy };
}

function setupSupabase() {
  const connection = connectionResult();
  const profileBuilder = {
    select: vi.fn(() => profileBuilder),
    eq: vi.fn(() => profileBuilder),
    maybeSingle: vi.fn(() => Promise.resolve({ data: null, error: null })),
  };

  return {
    updateSpy: connection.updateSpy,
    supabase: {
      from: vi.fn((table: string) => {
        if (table === 'email_connections') return connection.selectBuilder;
        return profileBuilder;
      }),
    },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('POST /api/email/scan', () => {
  it('treats an invalid token expiry as expired and attempts refresh (N2)', async () => {
    const { updateSpy, supabase } = setupSupabase();
    const request = new NextRequest('http://localhost/api/email/scan', {
      method: 'POST',
      body: JSON.stringify({}),
    });

    const response = await POST({ user: { id: 'user-1' }, supabase, request });

    expect(refreshAccessToken).toHaveBeenCalledTimes(1);
    expect(response.status).toBe(401);
    expect(updateSpy).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'expired', error_message: 'Token refresh failed' }),
    );
  });

  it('锁被占 → 429 + 空 receipts + 不触 supabase (180s TTL 防并发双扫)', async () => {
    acquireLockMock.mockResolvedValueOnce(false);
    const { supabase } = setupSupabase();
    const request = new NextRequest('http://localhost/api/email/scan', {
      method: 'POST',
      body: JSON.stringify({}),
    });

    const response = await POST({ user: { id: 'user-1' }, supabase, request });
    const json = (await response.json()) as { error: string; receipts: unknown[]; scanned: number; newReceipts: number };

    expect(response.status).toBe(429);
    expect(json.error).toContain('already in progress');
    expect(json.receipts).toEqual([]);
    // 锁拒绝路径不走 finally? 走 — releaseLock 仍调用
    expect(supabase.from).not.toHaveBeenCalled();
  });

  it('无 active 连接 → 400 提示先连接 (connError 分支)', async () => {
    const { supabase } = setupSupabase();
    // email_connections 查询返回 error
    const builder = {
      select: vi.fn(() => builder),
      eq: vi.fn(() => builder),
      update: vi.fn(() => builder),
      then: (resolve: (v: unknown) => unknown) =>
        Promise.resolve({ data: null, error: 'conn error' }).then(resolve),
    };
    (supabase.from as ReturnType<typeof vi.fn>).mockImplementation((table: string) => {
      if (table === 'email_connections') return builder;
      const p = { select: vi.fn(() => p), eq: vi.fn(() => p), maybeSingle: vi.fn(() => Promise.resolve({ data: null, error: null })) };
      return p;
    });
    const request = new NextRequest('http://localhost/api/email/scan', {
      method: 'POST',
      body: JSON.stringify({}),
    });

    const response = await POST({ user: { id: 'user-1' }, supabase, request });
    const json = (await response.json()) as { error: string };

    expect(response.status).toBe(400);
    expect(json.error).toContain('No active email connection');
  });

  it('daysBack 越界 (0) → 400 Validation failed (zod issues 透传)', async () => {
    const { supabase } = setupSupabase();
    const request = new NextRequest('http://localhost/api/email/scan', {
      method: 'POST',
      body: JSON.stringify({ daysBack: 0 }),
    });

    const response = await POST({ user: { id: 'user-1' }, supabase, request });
    const json = (await response.json()) as { error: string; details: unknown[] };

    expect(response.status).toBe(400);
    expect(json.error).toBe('Validation failed');
    expect(json.details.length).toBeGreaterThan(0);
  });

  it('finally 必 releaseLock (锁不泄漏 — 401 过后锁也释放)', async () => {
    const { supabase } = setupSupabase();
    const request = new NextRequest('http://localhost/api/email/scan', {
      method: 'POST',
      body: JSON.stringify({}),
    });
    await POST({ user: { id: 'user-1' }, supabase, request });
    expect(releaseLockMock).toHaveBeenCalledWith('email-scan:user-1');
  });
});
