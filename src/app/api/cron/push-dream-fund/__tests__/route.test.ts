/* eslint-disable require-await -- test mocks use async for API consistency */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

process.env.CRON_SECRET = 'test-cron-secret';

vi.mock('@/lib/supabase-admin', () => ({ createAdminClient: vi.fn() }));
vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
vi.mock('@/lib/push/web-push-config', () => ({ isWebPushConfigured: vi.fn(() => true) }));
vi.mock('@/lib/push/push-sender', () => ({
  sendPushToUser: vi.fn(async () => ({ sent: 1, failed: 0, removed: 0 })),
}));

const { GET } = await import('../route');
import { createAdminClient } from '@/lib/supabase-admin';
import { sendPushToUser } from '@/lib/push/push-sender';

type Result = { data: unknown; error: unknown };

function makeBuilder(result: Result = { data: [], error: null }) {
  const builder = {
    select: vi.fn(() => builder),
    in: vi.fn(() => builder),
    gt: vi.fn(() => builder),
    eq: vi.fn(() => builder),
    limit: vi.fn(() => builder),
    upsert: vi.fn(() => builder),
    then: (resolve: (value: Result) => unknown) => Promise.resolve(result).then(resolve),
  };
  return builder;
}

function setupRoute(opts: {
  users?: Array<string | { user_id: string; preferences?: unknown }>;
  funds?: unknown[];
  profiles?: unknown[];
  profileError?: unknown;
} = {}) {
  const tables: Record<string, ReturnType<typeof makeBuilder>> = {
    push_subscriptions: makeBuilder({
      data: (opts.users ?? ['u1']).map((u) => (typeof u === 'string' ? { user_id: u } : u)),
      error: null,
    }),
    dream_funds: makeBuilder({ data: opts.funds ?? [], error: null }),
    profiles: makeBuilder({ data: opts.profiles ?? [], error: opts.profileError ?? null }),
    push_notification_log: makeBuilder({ data: [], error: null }),
  };
  const fakeSupabase = { from: vi.fn((table: string) => tables[table]) };
  (createAdminClient as ReturnType<typeof vi.fn>).mockReturnValue({ supabase: fakeSupabase, error: null });
  return tables;
}

function makeRequest(): NextRequest {
  return new NextRequest('http://localhost/api/cron/push-dream-fund', {
    headers: { authorization: 'Bearer test-cron-secret' },
  });
}

function fund(userId: string, id: string, percent: number) {
  return { id, user_id: userId, name: `Fund ${id}`, target: 100, current: percent, emoji: null };
}

function payloads() {
  return (sendPushToUser as ReturnType<typeof vi.fn>).mock.calls.map((call: unknown[]) => call[1]);
}

beforeEach(() => vi.clearAllMocks());

describe('GET /api/cron/push-dream-fund — zh copy / en copy', () => {
  it('sends localized milestone copy to zh and en users', async () => {
    setupRoute({
      users: ['zh-user', 'en-user'],
      funds: [fund('zh-user', 'zh', 50), fund('en-user', 'en', 50)],
      profiles: [{ id: 'zh-user', locale: 'zh' }, { id: 'en-user', locale: 'en' }],
    });

    await GET(makeRequest());

    expect(payloads()).toEqual([
      { title: 'Symy', body: 'Fund zh 已守护过半，继续保持。', url: '/' },
      { title: 'Symy', body: "You're halfway to your Fund en goal! Keep going.", url: '/' },
    ]);
  });

  it('covers all milestone copy and interpolates user-owned fund names', async () => {
    setupRoute({
      users: ['zh-user', 'en-user'],
      funds: [fund('zh-user', 'zh-80', 80), fund('en-user', 'en-100', 100)],
      profiles: [{ id: 'zh-user', locale: 'zh' }, { id: 'en-user', locale: 'en' }],
    });

    await GET(makeRequest());

    expect(payloads()).toEqual([
      { title: 'Symy', body: 'Fund zh-80 已守护过半，继续保持。', url: '/' },
      { title: 'Symy', body: 'Fund zh-80 已守护八成，快要到了。', url: '/' },
      { title: 'Symy', body: "You're halfway to your Fund en-100 goal! Keep going.", url: '/' },
      { title: 'Symy', body: "You're 80% to your Fund en-100 goal! Almost there.", url: '/' },
      { title: 'Symy 🎉', body: 'You did it! Fund en-100 — fully funded! 🎉 The hours you guarded became this. Your elephant is proud.', url: '/' },
    ]);
  });

  it('defaults all users to zh when the locale query fails', async () => {
    setupRoute({
      funds: [fund('u1', 'f1', 50)],
      profileError: new Error('profiles unavailable'),
    });

    await GET(makeRequest());

    expect(payloads()[0]).toEqual({ title: 'Symy', body: 'Fund f1 已守护过半，继续保持。', url: '/' });
  });

  it('keeps zh copy free of amount wording (en legacy dollar copy is exempt)', async () => {
    setupRoute({
      users: ['zh-user', 'en-user'],
      funds: [fund('zh-user', 'zh', 100), fund('en-user', 'en', 100)],
      profiles: [{ id: 'zh-user', locale: 'zh' }, { id: 'en-user', locale: 'en' }],
    });

    await GET(makeRequest());

    expect(JSON.stringify(payloads()[0])).not.toMatch(/[¥$￥]|美元|元/);
  });
});

describe('GET /api/cron/push-dream-fund — preference gating (batch60-b)', () => {
  function fundRow(preferences: unknown) {
    return { user_id: 'u1', preferences };
  }

  it('never sends when the user opted out of dreamFund — the toggle is the gate', async () => {
    setupRoute({
      users: [fundRow({ dreamFund: false })],
      funds: [fund('u1', 'f1', 100)],
    });

    const res = await GET(makeRequest());
    expect(await res.json()).toEqual({ success: true, notified: 0 });
    expect(sendPushToUser).not.toHaveBeenCalled();
  });

  it('sends regardless of frequency (event channel exempt) and passes the explicit dreamFund bucket', async () => {
    for (const preferences of [{ frequency: 'off' }, { frequency: 'weekly' }, {}]) {
      setupRoute({
        users: [fundRow(preferences)],
        funds: [fund('u1', 'f1', 50)],
      });

      const res = await GET(makeRequest());
      expect((await res.json()).notified).toBe(1);
    }
    for (const call of (sendPushToUser as ReturnType<typeof vi.fn>).mock.calls) {
      expect(call[2]).toBe('dreamFund');
    }
  });
});
