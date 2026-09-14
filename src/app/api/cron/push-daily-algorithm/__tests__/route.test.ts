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
    eq: vi.fn(() => builder),
    limit: vi.fn(() => builder),
    upsert: vi.fn(() => builder),
    then: (resolve: (value: Result) => unknown) => Promise.resolve(result).then(resolve),
  };
  return builder;
}

function setupRoute(opts: { users?: unknown[]; profiles?: unknown[]; profileError?: unknown } = {}) {
  const tables: Record<string, ReturnType<typeof makeBuilder>> = {
    push_subscriptions: makeBuilder({ data: opts.users ?? [{ user_id: 'u1', preferences: null }], error: null }),
    push_notification_log: makeBuilder({ data: [], error: null }),
    profiles: makeBuilder({ data: opts.profiles ?? [], error: opts.profileError ?? null }),
  };
  const fakeSupabase = { from: vi.fn((table: string) => tables[table]) };
  (createAdminClient as ReturnType<typeof vi.fn>).mockReturnValue({ supabase: fakeSupabase, error: null });
}

function makeRequest(): NextRequest {
  return new NextRequest('http://localhost/api/cron/push-daily-algorithm', {
    headers: { authorization: 'Bearer test-cron-secret' },
  });
}

function payload() {
  return (sendPushToUser as ReturnType<typeof vi.fn>).mock.calls[0][1];
}

beforeEach(() => vi.clearAllMocks());

describe('GET /api/cron/push-daily-algorithm — zh copy / en copy', () => {
  it('sends zh copy to zh users and en legacy copy to en users', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-04T00:00:00.000Z'));
    setupRoute({
      users: [{ user_id: 'zh-user', preferences: null }, { user_id: 'en-user', preferences: null }],
      profiles: [{ id: 'zh-user', locale: 'zh' }, { id: 'en-user', locale: 'en' }],
    });

    const response = await GET(makeRequest());
    vi.useRealTimers();
    expect(response.status).toBe(200);
    expect((sendPushToUser as ReturnType<typeof vi.fn>).mock.calls.map((call: unknown[]) => call[1])).toEqual([
      { title: 'Symy 🐘', body: '今日算法：个性化。「为你挑选」——依据是你的数据，不是你的需要。', url: '/?tab=chat' },
      { title: 'Symy 🐘', body: 'Today\'s algorithm: Personalization. "Picked for you" — picked by your data, not your needs.', url: '/?tab=chat' },
    ]);
  });

  it('defaults to zh when profile locale lookup fails', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-04T00:00:00.000Z'));
    setupRoute({ profileError: new Error('profiles unavailable') });

    await GET(makeRequest());
    vi.useRealTimers();

    expect(JSON.stringify(payload())).not.toMatch(/[¥$￥]|美元|元/);
    expect(payload().body).toBe('今日算法：个性化。「为你挑选」——依据是你的数据，不是你的需要。');
  });

  it('rotates through all five semantic algorithm keys', async () => {
    const dates = [
      ['2026-01-01T00:00:00.000Z', 'twelvePeople'],
      ['2026-01-02T00:00:00.000Z', 'almost200'],
      ['2026-01-03T00:00:00.000Z', 'saleEnds'],
      ['2026-01-04T00:00:00.000Z', 'pickedForYou'],
      ['2026-01-05T00:00:00.000Z', 'onlyThree'],
    ] as const;

    vi.useFakeTimers();
    try {
      for (const [date, expectedKey] of dates) {
        vi.setSystemTime(new Date(date));
        setupRoute();
        const response = await GET(makeRequest());
        expect(response.status).toBe(200);
        expect((await response.json()).algorithm).toBe(expectedKey);
        expect((sendPushToUser as ReturnType<typeof vi.fn>).mock.calls.at(-1)?.length).toBe(2);
      }
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('GET /api/cron/push-daily-algorithm — preference gating (batch60-b)', () => {
  it('silences the daily channel at frequency weekly and off', async () => {
    for (const frequency of ['weekly', 'off'] as const) {
      setupRoute({ users: [{ user_id: 'u1', preferences: { frequency } }] });
      const response = await GET(makeRequest());
      expect(await response.json()).toEqual({ success: true, notified: 0 });
    }
    expect(sendPushToUser).not.toHaveBeenCalled();
  });

  it('keeps legacy opt-out (dailyAlgorithm:false) and default rows enabled at daily', async () => {
    setupRoute({ users: [{ user_id: 'u1', preferences: { dailyAlgorithm: false } }] });
    expect((await GET(makeRequest()).then((r) => r.json())).notified).toBe(0);

    setupRoute({ users: [{ user_id: 'u2', preferences: { frequency: 'daily' } }] });
    expect((await GET(makeRequest()).then((r) => r.json())).notified).toBe(1);
  });
});
