/* eslint-disable require-await -- test mocks use async for API consistency */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/with-auth', () => ({
  withAuth: vi.fn((handler: (ctx: unknown) => unknown) => handler),
}));
vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
vi.mock('@/lib/supabase-admin', () => ({ createAdminClient: vi.fn() }));

const { POST } = await import('../route') as { POST: (ctx: unknown) => Promise<Response> };
import { createAdminClient } from '@/lib/supabase-admin';

type Result = { data: unknown; error: unknown };

function setupRoute(existingPreferences: unknown = null) {
  const upsert = vi.fn((payload: Record<string, unknown>) => {
    void payload;
    return builder;
  });
  const builder = {
    select: vi.fn(() => builder),
    eq: vi.fn(() => builder),
    maybeSingle: vi.fn(async () => ({ data: existingPreferences === null ? null : { preferences: existingPreferences }, error: null }) as Result),
    upsert,
  };
  (createAdminClient as ReturnType<typeof vi.fn>).mockReturnValue({
    supabase: { from: vi.fn(() => builder) },
    error: null,
  });
  return { upsert, builder };
}

function makeRequest(preferences?: unknown) {
  return new NextRequest('http://localhost/api/push/subscribe', {
    method: 'POST',
    body: JSON.stringify({
      subscription: { endpoint: 'https://push.example/1', keys: { p256dh: 'key', auth: 'auth' } },
      ...(preferences !== undefined ? { preferences } : {}),
    }),
    headers: { 'content-type': 'application/json' },
  });
}

beforeEach(() => vi.clearAllMocks());

describe('POST /api/push/subscribe', () => {
  it('accepts and persists weeklyGuardian preference', async () => {
    const { upsert } = setupRoute(null);

    const response = await POST({ user: { id: 'u1' }, request: makeRequest({ weeklyGuardian: false }) });

    expect(response.status).toBe(200);
    expect(upsert.mock.calls[0][0]).toMatchObject({
      preferences: { weeklyGuardian: false, missYou: true, dreamFund: true, challenge: true, frequency: 'daily' },
    });
  });

  it('keeps stored preferences on re-subscribe without a preferences payload (batch60-b)', async () => {
    const { upsert } = setupRoute({ missYou: false, challenge: false, frequency: 'weekly' });

    await POST({ user: { id: 'u1' }, request: makeRequest() });

    expect(upsert.mock.calls[0][0]).toMatchObject({
      preferences: {
        missYou: false,
        challenge: false,
        dreamFund: true,
        weeklyGuardian: true,
        frequency: 'weekly',
      },
    });
  });

  it('lets explicit preferences win over stored ones, preserving untouched fields', async () => {
    const { upsert } = setupRoute({ missYou: false, frequency: 'weekly', dreamFund: true });

    await POST({ user: { id: 'u1' }, request: makeRequest({ missYou: true }) });

    expect(upsert.mock.calls[0][0]).toMatchObject({
      preferences: {
        missYou: true,
        dreamFund: true,
        challenge: true,
        weeklyGuardian: true,
        frequency: 'weekly',
      },
    });
  });

  it('rejects unknown preference fields (endpoint is not writable here)', async () => {
    setupRoute(null);

    const response = await POST({
      user: { id: 'u1' },
      request: makeRequest({ endpoint: 'https://push.example/hijack' }),
    });

    expect(response.status).toBe(400);
  });
});
