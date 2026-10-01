import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
vi.mock('@/lib/env-consumers', () => ({ warnPartialEnvOnce: vi.fn() }));

function loadModule() {
  return import('../web-push-config');
}

let pushConfigModule = await loadModule();
const { isWebPushConfigured, getVapidPublicKey } = pushConfigModule;
// 🔧 ESM 兼容: namespace 不可 spyOn — 改 hoisted vi.mock 工厂注入假实现
const webpushMock = vi.hoisted(() => ({
  setVapidDetails: vi.fn(),
  sendNotification: vi.fn().mockResolvedValue({ statusCode: 201 }),
}));
vi.mock('web-push', () => ({ ...webpushMock, default: webpushMock }));
import { logger } from '@/lib/logger';
import { warnPartialEnvOnce } from '@/lib/env-consumers';
const webpush = webpushMock;

const subscription = {
  endpoint: 'https://push.example/1',
  keys: { p256dh: 'p256dh', auth: 'auth' },
};

beforeEach(async () => {
  vi.unstubAllEnvs();
  vi.resetModules();
  pushConfigModule = await loadModule();
  vi.mocked(warnPartialEnvOnce).mockClear();
  vi.mocked(logger.warn).mockClear();
  webpush.setVapidDetails.mockClear().mockImplementation(() => undefined);
  webpush.sendNotification.mockClear().mockResolvedValue({ statusCode: 201 } as never);
  process.env.VAPID_PUBLIC_KEY = undefined;
  process.env.VAPID_PRIVATE_KEY = undefined;
  process.env.VAPID_SUBJECT = undefined;
});

describe('configureWebPush', () => {
  it('configures VAPID details with the subject and remains idempotent', () => {
    process.env.VAPID_PUBLIC_KEY = 'public';
    process.env.VAPID_PRIVATE_KEY = 'private';
    process.env.VAPID_SUBJECT = 'mailto:subject@example.com';

    pushConfigModule.configureWebPush();
    pushConfigModule.configureWebPush();

    expect(webpush.setVapidDetails).toHaveBeenCalledTimes(1);
    expect(webpush.setVapidDetails).toHaveBeenCalledWith('mailto:subject@example.com', 'public', 'private');
  });

  it('uses the mailto fallback and does not initialize partial configuration', () => {
    process.env.VAPID_PUBLIC_KEY = 'public';

    pushConfigModule.configureWebPush();

    expect(warnPartialEnvOnce).toHaveBeenCalledWith('Web Push delivery');
    expect(logger.warn).toHaveBeenCalledWith('[WebPush] VAPID keys not configured. Push notifications disabled.');
    expect(webpush.setVapidDetails).not.toHaveBeenCalled();
  });
});

describe('web push environment accessors', () => {
  it('reflects complete configuration and returns the public key', () => {
    process.env.VAPID_PUBLIC_KEY = 'public';
    process.env.VAPID_PRIVATE_KEY = 'private';

    expect(isWebPushConfigured()).toBe(true);
    expect(getVapidPublicKey()).toBe('public');
  });

  it('returns false and null when either key is missing', () => {
    process.env.VAPID_PUBLIC_KEY = 'public';
    expect(isWebPushConfigured()).toBe(false);

    process.env.VAPID_PUBLIC_KEY = undefined;
    process.env.VAPID_PRIVATE_KEY = 'private';
    expect(isWebPushConfigured()).toBe(false);
    expect(getVapidPublicKey()).toBeNull();
  });
});

describe('sendPushNotification', () => {
  it('throws before calling web-push when keys are missing', async () => {
    await expect(pushConfigModule.sendPushNotification(subscription, '{"title":"Symy"}')).rejects.toThrow('Web Push not configured');
    expect(webpush.sendNotification).not.toHaveBeenCalled();
  });

  it('configures once and delegates the subscription and payload', async () => {
    process.env.VAPID_PUBLIC_KEY = 'public';
    process.env.VAPID_PRIVATE_KEY = 'private';
    vi.mocked(webpush.sendNotification).mockResolvedValue({ statusCode: 201 } as never);

    await pushConfigModule.sendPushNotification(subscription, '{"title":"Symy"}');
    await pushConfigModule.sendPushNotification(subscription, '{"title":"Later"}');

    expect(webpush.setVapidDetails).toHaveBeenCalledTimes(1);
    expect(webpush.sendNotification).toHaveBeenNthCalledWith(1, subscription, '{"title":"Symy"}');
    expect(webpush.sendNotification).toHaveBeenNthCalledWith(2, subscription, '{"title":"Later"}');
  });
});
