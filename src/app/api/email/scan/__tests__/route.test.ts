import { describe, expect, it, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/with-auth', () => ({
  withAuth: vi.fn((handler: (ctx: unknown) => unknown) => handler),
}));

vi.mock('@/lib/distributed-lock', () => ({
  acquireLock: vi.fn(() => Promise.resolve(true)),
  releaseLock: vi.fn(() => Promise.resolve()),
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
});
