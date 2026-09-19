/* eslint-disable require-await -- test fetch mocks use async for API consistency */
// @vitest-environment happy-dom
/**
 * batch83-b — usePushNotifications hook 测试 (v9 §十五.2 长尾补测)
 *
 * 锁客户端行为: 不支持环境短路零请求、挂载回显已订阅、subscribe 全链路
 * (权限→SW 注册→VAPID 公钥 base64url 解码→pushManager.subscribe→POST 订阅+
 * 偏好合并)、错误分档文案 (401 登录 / 503 迁移未执行 / 500 透传 / 非 JSON 回落)、
 * unsubscribe 幂等与先浏览器后退订服务端。防重在消费层按钮 disabled (isLoading),
 * hook 本体无重入锁 — 现状如此, 不臆想。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, renderHook, act, waitFor } from '@testing-library/react';
import { usePushNotifications } from '../use-push-notifications';

vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

const fetchMock = vi.fn();

/** 65 字节 ECDSA uncompressed 公钥形制 (0x04 前缀) */
const RAW_KEY = new Uint8Array(65);
RAW_KEY[0] = 0x04;
for (let i = 1; i < RAW_KEY.length; i++) RAW_KEY[i] = i % 256;
const VAPID_B64URL = Buffer.from(RAW_KEY).toString('base64')
  .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

type MockSub = {
  endpoint: string;
  toJSON: () => unknown;
  unsubscribe: ReturnType<typeof vi.fn>;
};

function makeSubscription(endpoint = 'https://push.example/abc'): MockSub {
  return { endpoint, toJSON: () => ({ endpoint }), unsubscribe: vi.fn(async () => {}) };
}

/**
 * 安装"支持推送"的浏览器环境。happy-dom 无 serviceWorker/PushManager,
 * 参照 share-modal-ref 测试用 Object.defineProperty 打桩。
 */
function installSupportedEnv(existing: MockSub | null = null) {
  const registration = {
    pushManager: {
      getSubscription: vi.fn(async () => existing),
      subscribe: vi.fn(async (_options?: unknown) => makeSubscription()),
    },
  };
  const serviceWorker = {
    ready: Promise.resolve(registration),
    register: vi.fn(async () => registration),
  };
  Object.defineProperty(navigator, 'serviceWorker', { configurable: true, value: serviceWorker });
  (window as unknown as Record<string, unknown>).PushManager = {};
  (window as unknown as Record<string, unknown>).Notification = {
    requestPermission: vi.fn(async () => 'granted'),
  };
  return { registration, serviceWorker };
}

function notificationRequestPermission() {
  return (window as unknown as { Notification: { requestPermission: ReturnType<typeof vi.fn> } })
    .Notification.requestPermission;
}

function pushManagerOf(registration: Awaited<ReturnType<typeof installSupportedEnv>>['registration']) {
  return registration.pushManager;
}

beforeEach(() => {
  // mockReset (非 clearAllMocks): once 队列必须清空, 否则残留 ok 响应泄漏进后续用例
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
  // @ts-expect-error 测试打桩的实例属性, 删除以还原 happy-dom 原型链
  delete navigator.serviceWorker;
});

describe('usePushNotifications 环境探测', () => {
  it('happy-dom 裸环境不支持推送: subscribe/unsubscribe 直接 false, 零网络请求', async () => {
    const { result } = renderHook(() => usePushNotifications());
    expect(result.current.isSupported).toBe(false);

    let sub = true;
    let unsub = true;
    await act(async () => {
      sub = await result.current.subscribe();
      unsub = await result.current.unsubscribe();
    });
    expect(sub).toBe(false);
    expect(unsub).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(result.current.error).toBeNull();
  });

  it('挂载回显: 已有订阅 → isSubscribed true', async () => {
    installSupportedEnv(makeSubscription());
    const { result } = renderHook(() => usePushNotifications());
    await waitFor(() => expect(result.current.isSupported).toBe(true));
    await waitFor(() => expect(result.current.isSubscribed).toBe(true));
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('挂载检测失败只 warn 不崩: isSubscribed 维持 false', async () => {
    const { logger } = await import('@/lib/logger');
    const { registration } = installSupportedEnv(null);
    registration.pushManager.getSubscription.mockRejectedValueOnce(new Error('sw gone'));
    const { result } = renderHook(() => usePushNotifications());
    await waitFor(() => expect(result.current.isSupported).toBe(true));
    await waitFor(() => expect(logger.warn).toHaveBeenCalled());
    expect(result.current.isSubscribed).toBe(false);
  });
});

describe('usePushNotifications subscribe', () => {
  it('成功链路: 权限→SW→VAPID→pushManager.subscribe→POST 订阅+偏好, 返回 true', async () => {
    const { registration } = installSupportedEnv(null);
    fetchMock
      .mockResolvedValueOnce({ ok: true, json: async () => ({ publicKey: VAPID_B64URL }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ success: true }) });

    const { result } = renderHook(() => usePushNotifications());
    let ok = false;
    await act(async () => {
      ok = await result.current.subscribe({ frequency: 'weekly' });
    });

    expect(ok).toBe(true);
    expect(result.current.isSubscribed).toBe(true);
    expect(result.current.error).toBeNull();
    expect(result.current.isLoading).toBe(false);
    expect(notificationRequestPermission()).toHaveBeenCalledTimes(1);
    expect(registration.pushManager.subscribe).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenNthCalledWith(1, '/api/push/vapid-public-key');

    const [url, init] = fetchMock.mock.calls[1];
    expect(url).toBe('/api/push/subscribe');
    expect(init.method).toBe('POST');
    expect(init.credentials).toBe('include');
    const body = JSON.parse(init.body);
    expect(body.preferences).toEqual({ frequency: 'weekly' });
    expect(body.subscription).toEqual({ endpoint: 'https://push.example/abc' });
  });

  it('VAPID 公钥 base64url → 65 字节 ArrayBuffer, userVisibleOnly: true', async () => {
    const { registration } = installSupportedEnv(null);
    fetchMock
      .mockResolvedValueOnce({ ok: true, json: async () => ({ publicKey: VAPID_B64URL }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ success: true }) });

    const { result } = renderHook(() => usePushNotifications());
    await act(async () => {
      await result.current.subscribe();
    });

    const arg = pushManagerOf(registration).subscribe.mock.calls[0][0] as {
      userVisibleOnly: boolean;
      applicationServerKey: ArrayBuffer;
    } | undefined;
    expect(arg).toBeDefined();
    expect(arg!.userVisibleOnly).toBe(true);
    const decoded = new Uint8Array(arg!.applicationServerKey);
    expect(decoded.byteLength).toBe(65);
    expect(decoded[0]).toBe(0x04);
    expect(Array.from(decoded)).toEqual(Array.from(RAW_KEY));
  });

  it('通知权限被拒: 固定文案 error, 不发起任何 fetch', async () => {
    installSupportedEnv(null);
    (window as unknown as Record<string, unknown>).Notification = {
      requestPermission: vi.fn(async () => 'denied'),
    };
    const { result } = renderHook(() => usePushNotifications());
    let ok = true;
    await act(async () => {
      ok = await result.current.subscribe();
    });
    expect(ok).toBe(false);
    expect(result.current.error).toBe(
      'Notification permission denied. Please enable notifications in your browser settings.',
    );
    expect(fetchMock).not.toHaveBeenCalled();
    expect(result.current.isSubscribed).toBe(false);
  });

  it('VAPID 接口不可用: "not yet configured" 文案', async () => {
    installSupportedEnv(null);
    fetchMock.mockResolvedValueOnce({ ok: false, status: 404, json: async () => ({}) });
    const { result } = renderHook(() => usePushNotifications());
    let ok = true;
    await act(async () => {
      ok = await result.current.subscribe();
    });
    expect(ok).toBe(false);
    expect(result.current.error).toBe('Push notifications are not yet configured on this server.');
  });

  it('订阅接口 401 → 请先登录文案; 500 + JSON error → 透传服务端错误', async () => {
    installSupportedEnv(null);
    fetchMock
      .mockResolvedValueOnce({ ok: true, json: async () => ({ publicKey: VAPID_B64URL }) })
      .mockResolvedValueOnce({ ok: false, status: 401, json: async () => ({}) });
    const { result } = renderHook(() => usePushNotifications());
    await act(async () => {
      await result.current.subscribe();
    });
    expect(result.current.error).toBe('Please sign in to enable push notifications.');

    fetchMock
      .mockClear()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ publicKey: VAPID_B64URL }) })
      .mockResolvedValueOnce({ ok: false, status: 500, json: async () => ({ error: 'db down' }) });
    await act(async () => {
      await result.current.subscribe();
    });
    expect(result.current.error).toBe('db down');
  });

  it('503 空 JSON (migration 121 未执行) → 默认文案; 非 JSON 响应体 → 初始默认文案', async () => {
    installSupportedEnv(null);
    fetchMock
      .mockResolvedValueOnce({ ok: true, json: async () => ({ publicKey: VAPID_B64URL }) })
      .mockResolvedValueOnce({ ok: false, status: 503, json: async () => ({}) });
    const { result } = renderHook(() => usePushNotifications());
    await act(async () => {
      await result.current.subscribe();
    });
    expect(result.current.error).toBe('Push notifications are not yet configured on this server.');

    // json() 抛错进 catch: message 保持 let 初始值 'Failed to save subscription on server.'
    fetchMock
      .mockResolvedValueOnce({ ok: true, json: async () => ({ publicKey: VAPID_B64URL }) })
      .mockResolvedValueOnce({
        ok: false,
        status: 500,
        json: async () => {
          throw new Error('body is not json');
        },
      });
    await act(async () => {
      await result.current.subscribe();
    });
    expect(result.current.error).toBe('Failed to save subscription on server.');
  });

  it('pushManager.subscribe 抛错 → error 透传 message, isLoading 收口 false', async () => {
    const { registration } = installSupportedEnv(null);
    fetchMock
      .mockResolvedValueOnce({ ok: true, json: async () => ({ publicKey: VAPID_B64URL }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ success: true }) });
    registration.pushManager.subscribe.mockRejectedValueOnce(new Error('user dismissed'));

    const { result } = renderHook(() => usePushNotifications());
    let ok = true;
    await act(async () => {
      ok = await result.current.subscribe();
    });
    expect(ok).toBe(false);
    expect(result.current.error).toBe('user dismissed');
    expect(result.current.isLoading).toBe(false);
    expect(result.current.isSubscribed).toBe(false);
  });
});

describe('usePushNotifications unsubscribe', () => {
  it('无订阅: 幂等返回 true, 不通知服务端', async () => {
    installSupportedEnv(null);
    const { result } = renderHook(() => usePushNotifications());
    await waitFor(() => expect(result.current.isSupported).toBe(true));
    let ok = false;
    await act(async () => {
      ok = await result.current.unsubscribe();
    });
    expect(ok).toBe(true);
    expect(result.current.isSubscribed).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('有订阅: 先浏览器 unsubscribe 再 DELETE /api/push/unsubscribe (endpoint)', async () => {
    const existing = makeSubscription();
    installSupportedEnv(existing);
    fetchMock.mockResolvedValueOnce({ ok: true, json: async () => ({ success: true }) });

    const { result } = renderHook(() => usePushNotifications());
    await waitFor(() => expect(result.current.isSubscribed).toBe(true));
    let ok = false;
    await act(async () => {
      ok = await result.current.unsubscribe();
    });

    expect(ok).toBe(true);
    expect(existing.unsubscribe).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/push/unsubscribe');
    expect(init.method).toBe('DELETE');
    expect(init.credentials).toBe('include');
    expect(JSON.parse(init.body)).toEqual({ endpoint: existing.endpoint });
    expect(result.current.isSubscribed).toBe(false);
  });

  it('服务端 401: 返回 false + 请先登录文案 (浏览器侧已退订为现状)', async () => {
    const existing = makeSubscription();
    installSupportedEnv(existing);
    fetchMock.mockResolvedValueOnce({ ok: false, status: 401, json: async () => ({}) });

    const { result } = renderHook(() => usePushNotifications());
    await waitFor(() => expect(result.current.isSubscribed).toBe(true));
    let ok = true;
    await act(async () => {
      ok = await result.current.unsubscribe();
    });
    expect(ok).toBe(false);
    expect(result.current.error).toBe('Please sign in to manage push notifications.');
    expect(existing.unsubscribe).toHaveBeenCalledTimes(1);
  });
});
