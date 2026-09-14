/* eslint-disable require-await -- test mocks use async for API consistency */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/supabase-admin', () => ({ createAdminClient: vi.fn() }));
vi.mock('@/lib/push/web-push-config', () => ({
  isWebPushConfigured: vi.fn(() => true),
  configureWebPush: vi.fn(),
  sendPushNotification: vi.fn(async () => ({})),
}));
vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

const { sendPushToUser } = await import('../push-sender');
import { createAdminClient } from '@/lib/supabase-admin';
import { sendPushNotification } from '@/lib/push/web-push-config';

function setupSubscription(preferences: Record<string, unknown>) {
  const builder = {
    select: vi.fn(() => builder),
    eq: vi.fn(() => builder),
    delete: vi.fn(() => builder),
    then: (resolve: (value: { data: unknown; error: unknown }) => unknown) =>
      Promise.resolve({ data: [{ id: 'sub1', endpoint: 'https://push.example/1', p256dh_key: 'key', auth_key: 'auth', preferences }], error: null }).then(resolve),
  };
  (createAdminClient as ReturnType<typeof vi.fn>).mockReturnValue({
    supabase: { from: vi.fn(() => builder) },
    error: null,
  });
}

beforeEach(() => vi.clearAllMocks());

describe('sendPushToUser preference buckets', () => {
  it('uses the explicit weeklyGuardian bucket over URL detection', async () => {
    setupSubscription({ dailyAlgorithm: false });

    const result = await sendPushToUser('u1', { title: 'Symy', body: 'weekly', url: '/?tab=chat' }, 'weeklyGuardian');

    expect(result.sent).toBe(1);
    expect(sendPushNotification).toHaveBeenCalledTimes(1);
  });

  it('preserves URL-based bucket detection when no explicit bucket is passed', async () => {
    setupSubscription({ dailyAlgorithm: false });

    const result = await sendPushToUser('u1', { title: 'Symy', body: 'daily', url: '/?tab=chat' });

    expect(result.sent).toBe(0);
    expect(sendPushNotification).not.toHaveBeenCalled();
  });

  it('skips weeklyGuardian only when explicitly false', async () => {
    setupSubscription({ weeklyGuardian: false, missYou: false });

    const skipped = await sendPushToUser('u1', { title: 'Symy', body: 'weekly', url: '/zh' }, 'weeklyGuardian');
    expect(skipped.sent).toBe(0);

    setupSubscription({});
    const allowed = await sendPushToUser('u1', { title: 'Symy', body: 'weekly', url: '/zh' }, 'weeklyGuardian');
    expect(allowed.sent).toBe(1);
  });
});

describe('sendPushToUser device-level frequency gate (batch60-b)', () => {
  it('silences routine channels on devices whose frequency is off or weekly', async () => {
    setupSubscription({ frequency: 'off' });
    expect((await sendPushToUser('u1', { title: 'Symy', body: 'miss you', url: '/' })).sent).toBe(0);

    setupSubscription({ frequency: 'weekly' });
    expect((await sendPushToUser('u1', { title: 'Symy', body: 'daily algo', url: '/?tab=chat' })).sent).toBe(0);
  });

  it('still delivers the weekly guardian at legacy default frequency (daily)', async () => {
    setupSubscription({});
    expect((await sendPushToUser('u1', { title: 'Symy', body: 'weekly', url: '/zh' }, 'weeklyGuardian')).sent).toBe(1);
  });

  it('dreamFund toggle is the only gate for dream-fund pushes — frequency exempt', async () => {
    setupSubscription({ dreamFund: false, frequency: 'daily' });
    expect((await sendPushToUser('u1', { title: 'Symy', body: 'halfway' }, 'dreamFund')).sent).toBe(0);

    setupSubscription({ frequency: 'off' });
    expect((await sendPushToUser('u1', { title: 'Symy', body: 'halfway' }, 'dreamFund')).sent).toBe(1);
  });

  it('challenge toggle is the only gate for challenge-outcome pushes — frequency exempt', async () => {
    setupSubscription({ challenge: false });
    expect((await sendPushToUser('u1', { title: 'Symy', body: 'won' }, 'challenge')).sent).toBe(0);

    setupSubscription({ frequency: 'off' });
    expect((await sendPushToUser('u1', { title: 'Symy', body: 'won' }, 'challenge')).sent).toBe(1);
  });

  it('mixed-frequency devices converge per device: daily row sends, off row stays silent', async () => {
    const builder = {
      select: vi.fn(() => builder),
      eq: vi.fn(() => builder),
      delete: vi.fn(() => builder),
      then: (resolve: (value: { data: unknown; error: unknown }) => unknown) =>
        Promise.resolve({
          data: [
            { id: 'sub-a', endpoint: 'https://push.example/a', p256dh_key: 'k', auth_key: 'a', preferences: { frequency: 'daily' } },
            { id: 'sub-b', endpoint: 'https://push.example/b', p256dh_key: 'k', auth_key: 'a', preferences: { frequency: 'off' } },
          ],
          error: null,
        }).then(resolve),
    };
    (createAdminClient as ReturnType<typeof vi.fn>).mockReturnValue({
      supabase: { from: vi.fn(() => builder) },
      error: null,
    });

    const result = await sendPushToUser('u1', { title: 'Symy', body: 'miss you', url: '/' });
    expect(result.sent).toBe(1);
    expect(result.failed).toBe(0);
  });
});
