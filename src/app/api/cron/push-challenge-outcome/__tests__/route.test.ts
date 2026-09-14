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
  sendPushToUsers: vi.fn(async () => ({ sent: 1, failed: 0, removed: 0 })),
}));
vi.mock('@/lib/user-hourly-rate', () => ({ getUserHourlyRate: vi.fn(async () => 20) }));

const { GET, buildChallengeOutcomeCopy } = await import('../route');
import { createAdminClient } from '@/lib/supabase-admin';
import { sendPushToUsers } from '@/lib/push/push-sender';
import { getUserHourlyRate } from '@/lib/user-hourly-rate';

type Result = { data: unknown; error: unknown };

function makeBuilder(result: Result = { data: [], error: null }) {
  const builder = {
    select: vi.fn(() => builder),
    eq: vi.fn(() => builder),
    in: vi.fn(() => builder),
    lte: vi.fn(() => builder),
    gte: vi.fn(() => builder),
    order: vi.fn(() => builder),
    limit: vi.fn(() => builder),
    upsert: vi.fn(() => Promise.resolve(result)),
    then: (resolve: (value: Result) => unknown) => Promise.resolve(result).then(resolve),
  };
  return builder;
}

function challenge(overrides: Record<string, unknown> = {}) {
  const ageHours = (overrides.ageHours as number | undefined) ?? 30;
  return {
    id: 'challenge-1',
    user_id: 'u1',
    item_name: 'Concert ticket',
    amount: 40,
    status: 'passed',
    created_at: new Date(Date.now() - (ageHours + 1) * 3_600_000).toISOString(),
    updated_at: new Date(Date.now() - ageHours * 3_600_000).toISOString(),
    ...overrides,
  };
}

function setupRoute(opts: { challenges?: unknown[]; logs?: unknown[]; profiles?: unknown[]; rate?: number } = {}) {
  const challengeBuilder = makeBuilder({ data: opts.challenges ?? [], error: null });
  const logBuilder = makeBuilder({ data: opts.logs ?? [], error: null });
  const profileBuilder = makeBuilder({ data: opts.profiles ?? [], error: null });
  const fakeSupabase = {
    from: vi.fn((table: string) => {
      if (table === 'active_challenges') return challengeBuilder;
      if (table === 'push_notification_log') return logBuilder;
      return profileBuilder;
    }),
  };
  (createAdminClient as ReturnType<typeof vi.fn>).mockReturnValue({ supabase: fakeSupabase, error: null });
  (getUserHourlyRate as ReturnType<typeof vi.fn>).mockResolvedValue(opts.rate ?? 20);
  return { challengeBuilder, logBuilder, fakeSupabase };
}

function makeRequest(auth?: string) {
  return new NextRequest('http://localhost/api/cron/push-challenge-outcome', {
    method: 'GET',
    headers: auth ? { authorization: `Bearer ${auth}` } : {},
  });
}

function sentCalls() {
  return (sendPushToUsers as ReturnType<typeof vi.fn>).mock.calls as unknown[][];
}

function sentPayloads() {
  return sentCalls().map((call) => call[1] as Record<string, unknown>);
}

function expectNoMoneyChars(payloads: Array<Record<string, unknown>>) {
  for (const payload of payloads) {
    expect(JSON.stringify(payload)).not.toMatch(/[¥$￥]|元|美元|40/);
  }
}

beforeEach(() => vi.clearAllMocks());

describe('GET /api/cron/push-challenge-outcome', () => {
  it('sends and logs one passed challenge with lock-screen honor copy', async () => {
    const { logBuilder } = setupRoute({
      challenges: [challenge()],
      profiles: [{ id: 'u1', locale: 'zh' }],
      rate: 20,
    });

    const res = await GET(makeRequest('test-cron-secret'));
    const json = await res.json();
    expect(json).toEqual({ success: true, notified: 1, sent: 1, failed: 0, removed: 0 });
    expect(sentPayloads()).toEqual([
      {
        title: '🎉 守护成功！赢回 ≈2 小时',
        body: '你守住了「Concert ticket」，赢回 ≈2 小时自由人生 · 点开看守护战果',
        url: '/zh?tab=chat',
      },
    ]);
    expectNoMoneyChars(sentPayloads());
    expect(logBuilder.upsert).toHaveBeenCalledWith(
      {
        user_id: 'u1',
        notification_type: 'challenge_outcome',
        reference_id: 'challenge-1',
        milestone: null,
        sent_at: expect.any(String),
      },
      { onConflict: 'user_id,notification_type,reference_id,milestone' },
    );
  });

  it('skips an already logged challenge on the next scan', async () => {
    setupRoute({
      challenges: [challenge()],
      logs: [{ reference_id: 'challenge-1' }],
      profiles: [{ id: 'u1', locale: 'zh' }],
    });

    const res = await GET(makeRequest('test-cron-secret'));
    const json = await res.json();
    expect(json).toEqual({ success: true, notified: 0 });
    expect(sendPushToUsers).not.toHaveBeenCalled();
  });

  it('never sends failed or expired challenges', async () => {
    const { challengeBuilder } = setupRoute({
      challenges: [challenge({ id: 'failed', status: 'failed' })],
    });

    const res = await GET(makeRequest('test-cron-secret'));
    expect(res.status).toBe(200);
    expect(sendPushToUsers).not.toHaveBeenCalled();
    expect(challengeBuilder.eq).toHaveBeenCalledWith('status', 'passed');
    expect(challengeBuilder.lte).toHaveBeenCalledWith('updated_at', expect.any(String));
  });

  it('does not log a push when the challenge preference opts out', async () => {
    const { logBuilder } = setupRoute({
      challenges: [challenge()],
      profiles: [{ id: 'u1', locale: 'zh' }],
    });
    (sendPushToUsers as ReturnType<typeof vi.fn>).mockResolvedValue({ sent: 0, failed: 0, removed: 0 });

    const res = await GET(makeRequest('test-cron-secret'));
    const json = await res.json();
    expect(json).toEqual({ success: true, notified: 0, sent: 0, failed: 0, removed: 0 });
    expect(logBuilder.upsert).not.toHaveBeenCalled();
  });

  it('uses minute copy below one hour and supports en locale', async () => {
    setupRoute({
      challenges: [challenge({ amount: 5 })],
      profiles: [{ id: 'u1', locale: 'en' }],
      rate: 20,
    });

    const res = await GET(makeRequest('test-cron-secret'));
    expect(res.status).toBe(200);
    expect(sentPayloads()).toEqual([
      {
        title: '🎉 Guard succeeded! ≈15 minutes won back',
        body: 'You held your ground on "Concert ticket" and won back ≈15 minutes of freedom — tap to see your guard result',
        url: '/en?tab=chat',
      },
    ]);
    expectNoMoneyChars(sentPayloads());
  });

  it('routes through the explicit challenge bucket — never gated by daily pacing (batch60-b)', async () => {
    setupRoute({
      challenges: [challenge()],
      profiles: [{ id: 'u1', locale: 'zh' }],
    });

    await GET(makeRequest('test-cron-secret'));

    const calls = (sendPushToUsers as ReturnType<typeof vi.fn>).mock.calls as unknown[][];
    expect(calls.length).toBeGreaterThan(0);
    for (const call of calls) {
      expect(call[2]).toBe('challenge');
    }
  });
});

describe('buildChallengeOutcomeCopy', () => {
  it('uses at least one minute and never shows zero hours', () => {
    const zh = buildChallengeOutcomeCopy('zh', 'Book', 0.001);
    expect(zh.title).toContain('≈1 分钟');
    expect(zh.body).not.toContain('0 小时');
  });
});
