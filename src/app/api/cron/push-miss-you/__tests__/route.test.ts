/**
 * Tests for GET /api/cron/push-miss-you — i18n 文案 (batch27-c)
 *
 * 覆盖:
 * - 鉴权: 无/错 CRON_SECRET → 401
 * - 文案走 i18n: zh 用户收中文, en 用户收英文 (en 文案与历史硬编码逐字节一致)
 * - locale 读不到 → 默认 zh
 */

/* eslint-disable require-await -- test mocks use async for API consistency */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

process.env.CRON_SECRET = 'test-cron-secret';

vi.mock('@/lib/supabase-admin', () => ({ createAdminClient: vi.fn() }));
vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
vi.mock('@/lib/push/web-push-config', () => ({
  isWebPushConfigured: vi.fn(() => true),
  configureWebPush: vi.fn(),
  sendPushNotification: vi.fn(),
}));
vi.mock('@/lib/push/push-sender', () => ({
  sendPushToUser: vi.fn(async () => ({ sent: 1, failed: 0, removed: 0 })),
  sendPushToUsers: vi.fn(async () => ({ sent: 1, failed: 0, removed: 0 })),
}));

// CRON_SECRET 在 route 模块顶层读取 — 必须先设 env 再动态 import
const { GET } = await import('../route');
import { createAdminClient } from '@/lib/supabase-admin';
import { sendPushToUser } from '@/lib/push/push-sender';

type Result = { data: unknown; error: unknown };

function makeBuilder(result: Result = { data: [], error: null }) {
  const builder = {
    select: vi.fn(() => builder),
    eq: vi.fn(() => builder),
    in: vi.fn(() => builder),
    lt: vi.fn(() => builder),
    gte: vi.fn(() => builder),
    order: vi.fn(() => builder),
    limit: vi.fn(() => builder),
    update: vi.fn(() => builder),
    maybeSingle: vi.fn(async () => result),
    then: (resolve: (value: Result) => unknown) => Promise.resolve(result).then(resolve),
  };
  return builder;
}

function setupRoute(opts: {
  subs?: unknown[];
  buddyStates?: unknown[];
  profiles?: unknown[];
} = {}) {
  const subBuilder = makeBuilder({ data: opts.subs ?? [], error: null });
  const buddyBuilder = makeBuilder({ data: opts.buddyStates ?? [], error: null });
  const profilesBuilder = makeBuilder({ data: opts.profiles ?? [], error: null });
  const fakeSupabase = {
    from: vi.fn((table: string) => {
      if (table === 'push_subscriptions') return subBuilder;
      if (table === 'buddy_state') return buddyBuilder;
      return profilesBuilder;
    }),
  };
  // createAdminClient 是同步函数 (返回 {supabase, error} 而非 Promise) — 用 mockReturnValue
  (createAdminClient as ReturnType<typeof vi.fn>).mockReturnValue({ supabase: fakeSupabase, error: null });
  return { subBuilder };
}

function makeRequest(auth?: string): NextRequest {
  return new NextRequest('http://localhost/api/cron/push-miss-you', {
    method: 'GET',
    headers: auth ? { authorization: `Bearer ${auth}` } : {},
  });
}

function candidate(opts: { locale?: string | null; preferences?: unknown } = {}) {
  return {
    subs: [{ user_id: 'u1', updated_at: new Date(Date.now() - 2 * 24 * 3_600_000).toISOString(), ...(opts.preferences !== undefined ? { preferences: opts.preferences } : {}) }],
    buddyStates: [{ user_id: 'u1', last_active_at: new Date(Date.now() - 5 * 24 * 3_600_000).toISOString() }],
    profiles: [{ id: 'u1', locale: opts.locale ?? 'zh' }],
  };
}

beforeEach(() => vi.clearAllMocks());

describe('GET /api/cron/push-miss-you — auth', () => {
  it('returns 401 without authorization header', async () => {
    setupRoute();
    const res = await GET(makeRequest());
    expect(res.status).toBe(401);
  });

  it('returns 401 with wrong secret', async () => {
    setupRoute();
    const res = await GET(makeRequest('wrong-secret'));
    expect(res.status).toBe(401);
  });
});

describe('GET /api/cron/push-miss-you — i18n copy', () => {
  it('sends zh copy to zh-locale users', async () => {
    setupRoute(candidate({ locale: 'zh' }));

    const res = await GET(makeRequest('test-cron-secret'));
    expect(res.status).toBe(200);

    expect(sendPushToUser).toHaveBeenCalledWith('u1', {
      title: 'Symy',
      body: 'Symy 想你了。今天再拦下一次算法消费吧。',
      url: '/',
    });
  });

  it('sends en copy to en-locale users (byte-identical to the legacy hardcoded body)', async () => {
    setupRoute(candidate({ locale: 'en' }));

    const res = await GET(makeRequest('test-cron-secret'));
    expect(res.status).toBe(200);

    expect(sendPushToUser).toHaveBeenCalledWith('u1', {
      title: 'Symy',
      body: 'Symy misses you. Resist one more algorithm today.',
      url: '/',
    });
  });

  it('defaults to zh when profile locale is missing', async () => {
    setupRoute(candidate({ locale: null }));

    await GET(makeRequest('test-cron-secret'));

    const payload = (sendPushToUser as ReturnType<typeof vi.fn>).mock.calls[0][1];
    expect(payload.body).toBe('Symy 想你了。今天再拦下一次算法消费吧。');
  });
});

describe('GET /api/cron/push-miss-you — preference gating (batch60-b)', () => {
  function subWith(preferences: unknown) {
    return candidate({ preferences });
  }

  it('skips users whose row opted out of missYou', async () => {
    setupRoute(subWith({ missYou: false }));
    const res = await GET(makeRequest('test-cron-secret'));
    const json = await res.json();
    expect(json).toEqual({ success: true, notified: 0 });
    expect(sendPushToUser).not.toHaveBeenCalled();
  });

  it('silences miss-you at frequency weekly and off (daily-channel rhythm)', async () => {
    for (const frequency of ['weekly', 'off'] as const) {
      setupRoute(subWith({ frequency }));
      const res = await GET(makeRequest('test-cron-secret'));
      expect(await res.json()).toEqual({ success: true, notified: 0 });
    }
    expect(sendPushToUser).not.toHaveBeenCalled();
  });

  it('still sends at frequency daily and for legacy rows without frequency', async () => {
    setupRoute(subWith({ frequency: 'daily' }));
    expect((await GET(makeRequest('test-cron-secret')).then((r: { json: () => Promise<{ notified: number }> }) => r.json())).notified).toBe(1);

    setupRoute(subWith({ missYou: true }));
    expect((await GET(makeRequest('test-cron-secret')).then((r: { json: () => Promise<{ notified: number }> }) => r.json())).notified).toBe(1);
  });
});
