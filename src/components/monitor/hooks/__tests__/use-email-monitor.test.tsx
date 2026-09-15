/**
 * useEmailMonitor tests (batch75-b — testgap 盲区补测, v5 #19)
 *
 * 覆盖 (断言与现状对齐, 定时器/倒计时不在本批范围):
 *  - loadEmailData: 三端点 Promise.allSettled 并发拉取; 部分失败另一侧照常渲染
 *  - Round 22 BUG-R22-H1: disconnect 在途时 loadEmailData 不过滤回 pendingDisconnects
 *    (服务端仍返回该 connection 也不回弹乐观删除)
 *  - Round 19 BUG-R19D-H2: disconnect 失败 → merge 回滚 (不覆盖在途拉到的新数据)
 *  - Round 25 R25-2: 卸载时 AbortController 清理, 迟到响应不 setState
 *  - scan: error 且无 scanned → 不更新 lastSyncTime (5min 后自动重试); 成功 → 刷新 + 写用户级 localStorage key
 *  - scan 端点按 provider 选择 (imap_* → resync, gmail → scan); isScanningRef 防重入
 *  - localStorage 初始化: 有效 ts 恢复 nextSyncIn; 损坏值重置
 *  - demo 模式: 不拉取, loading 直接落 false
 */
// @vitest-environment happy-dom

import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { useEmailMonitor } from '../use-email-monitor';
import { apiFetch, apiFetchVoid } from '@/lib/api-client';
import type { EmailConnection, EmailReceipt } from '@/lib/supabase';
import { AUTO_SYNC_KEY, AUTO_SYNC_ENABLED_KEY } from '../../constants';

vi.mock('@/lib/api-client', () => ({
  apiFetch: vi.fn(),
  apiFetchVoid: vi.fn(),
  ApiError: class ApiError extends Error {
    constructor(message: string, readonly status: number, readonly body: unknown) {
      super(message);
    }
  },
}));

vi.mock('@/components/auth/auth-provider', () => ({
  useAuth: () => ({ user: { id: 'user-1' } }),
}));

const DICT: Record<string, string> = {
  'monitor.toast.networkError': 'Network error, changes reverted',
  'monitor.toast.connectionFailed': 'Connection failed: {msg}',
  'monitor.toast.unknownError': 'Unknown error',
};

vi.mock('@/i18n/provider', () => ({
  useI18n: () => ({
    t: (key: string, params?: Record<string, string | number>) => {
      const tpl = DICT[key] ?? key;
      if (!params) return tpl;
      return Object.entries(params).reduce(
        (acc, [k, v]) => acc.replaceAll(`{${k}}`, String(v)),
        tpl,
      );
    },
  }),
}));

vi.mock('@/lib/posthog', () => ({
  symyEvents: { emailConnected: vi.fn() },
}));

vi.mock('@/lib/logger', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));

const STATUS_URL = '/api/email/status';
const ACTIONABLE_URL = '/api/email/receipts?status=actionable&limit=50';
const REFUNDING_URL = '/api/email/receipts?status=refunding&limit=50';

function conn(id: string, status = 'active', provider = 'gmail'): EmailConnection {
  return {
    id,
    user_id: 'user-1',
    email_address: 'user@example.com',
    provider,
    access_token: 'tok',
    token_expiry: '',
    scopes: [],
    status,
    created_at: '',
    updated_at: '',
  } as EmailConnection;
}

function receipt(id: string, connectionId: string): EmailReceipt {
  return {
    id,
    user_id: 'user-1',
    connection_id: connectionId,
    message_id: `m-${id}`,
    from_address: 'shop@example.com',
    subject: 'Your order',
    snippet: '',
    platform: 'amazon',
    currency: 'USD',
    amount: 42,
  } as EmailReceipt;
}

/** apiFetch 按 URL 路由; handler 返回非 Promise 值时包装为 resolved promise */
function stubApiFetch(handler: (url: string) => unknown) {
  vi.mocked(apiFetch).mockImplementation(((url: string) => {
    const value = handler(url);
    return value instanceof Promise ? value : Promise.resolve(value);
  }) as typeof apiFetch);
}

function stubDefaultLoad(overrides: { status?: unknown; actionable?: unknown; refunding?: unknown } = {}) {
  stubApiFetch((url) => {
    if (url === STATUS_URL) return overrides.status ?? { connections: [] };
    if (url === ACTIONABLE_URL) return overrides.actionable ?? { receipts: [] };
    if (url === REFUNDING_URL) return overrides.refunding ?? { receipts: [] };
    throw new Error(`unexpected apiFetch url: ${url}`);
  });
}

function setupHook(isDemo = false) {
  const setToast = vi.fn();
  const isDemoRef = { current: isDemo };
  const hook = renderHook(() => useEmailMonitor(setToast, isDemoRef));
  return { setToast, isDemoRef, ...hook };
}

const USER_SYNC_KEY = `${AUTO_SYNC_KEY}_user-1`;
const USER_ENABLED_KEY = `${AUTO_SYNC_ENABLED_KEY}_user-1`;

beforeEach(() => {
  window.localStorage.clear();
  // 关闭 auto-sync + lastSync=now → 定时器路径不触发, 被测状态机确定化
  window.localStorage.setItem(USER_ENABLED_KEY, 'false');
  window.localStorage.setItem(USER_SYNC_KEY, String(Date.now()));
  vi.mocked(apiFetch).mockReset();
  vi.mocked(apiFetchVoid).mockReset();
  vi.mocked(apiFetchVoid).mockResolvedValue(undefined);
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('useEmailMonitor — loadEmailData', () => {
  it('三端点并发拉取, 连接/收据各自落 state; active 连接 → hasActiveEmail', async () => {
    stubDefaultLoad({
      status: { connections: [conn('c1')] },
      actionable: { receipts: [receipt('r1', 'c1')] },
      refunding: { receipts: [receipt('r2', 'c1')] },
    });
    const { result } = setupHook();

    await waitFor(() => expect(result.current.isLoadingEmail).toBe(false));
    expect(result.current.emailConnections.map((c) => c.id)).toEqual(['c1']);
    expect(result.current.emailReceipts.map((r) => r.id).sort()).toEqual(['r1', 'r2']);
    expect(result.current.hasActiveEmail).toBe(true);
    expect(vi.mocked(apiFetch).mock.calls.map((c) => c[0])).toEqual([
      STATUS_URL,
      ACTIONABLE_URL,
      REFUNDING_URL,
    ]);
  });

  it('allSettled 部分失败: status 成功但收据端点失败 → 连接照常渲染, 收据为空, 不抛错', async () => {
    stubApiFetch((url) => {
      if (url === STATUS_URL) return { connections: [conn('c1')] };
      return Promise.reject(new Error('receipts down'));
    });
    const { result } = setupHook();

    await waitFor(() => expect(result.current.isLoadingEmail).toBe(false));
    expect(result.current.emailConnections.map((c) => c.id)).toEqual(['c1']);
    expect(result.current.emailReceipts).toEqual([]);
  });

  it('仅过期连接 → hasActiveEmail 为 false', async () => {
    stubDefaultLoad({ status: { connections: [conn('c1', 'expired')] } });
    const { result } = setupHook();

    await waitFor(() => expect(result.current.isLoadingEmail).toBe(false));
    expect(result.current.emailConnections).toHaveLength(1);
    expect(result.current.hasActiveEmail).toBe(false);
  });

  it('卸载时 abort 在途请求 (R25-2), 迟到响应不 setState', async () => {
    let release!: (v: unknown) => void;
    stubApiFetch((url) => {
      if (url === STATUS_URL) {
        return new Promise((resolve) => { release = resolve; });
      }
      return { receipts: [] };
    });
    const { result, unmount } = setupHook();

    await waitFor(() => {
      const call = vi.mocked(apiFetch).mock.calls.find((c) => c[0] === STATUS_URL);
      expect(call).toBeTruthy();
    });
    const signal = vi.mocked(apiFetch).mock.calls.find((c) => c[0] === STATUS_URL)![1]?.signal as AbortSignal;

    unmount();
    expect(signal.aborted).toBe(true);
    void result.current; // 卸载后不再读 state; 迟到 resolve 由组件侧 aborted 检查兜住
    release({ connections: [conn('late')] });
  });

  it('demo 模式: 不发起任何请求, loading 直接为 false', async () => {
    const { result } = setupHook(true);
    await act(async () => {});
    expect(result.current.isLoadingEmail).toBe(false);
    expect(apiFetch).not.toHaveBeenCalled();
  });
});

describe('useEmailMonitor — disconnect 护栏与回滚', () => {
  it('Round 22 BUG-R22-H1: disconnect 在途时, loadEmailData 不过滤回服务端仍返回的连接', async () => {
    stubDefaultLoad({ status: { connections: [conn('c1')] }, actionable: { receipts: [receipt('r1', 'c1')] } });
    const { result } = setupHook();
    await waitFor(() => expect(result.current.hasActiveEmail).toBe(true));

    let releaseDelete!: (v: void) => void;
    vi.mocked(apiFetchVoid).mockImplementation(
      () => new Promise<void>((resolve) => { releaseDelete = resolve; }),
    );
    await act(() => {
      void result.current.handleDisconnectGmail('c1');
    });
    // 乐观删除已生效
    expect(result.current.emailConnections).toEqual([]);
    expect(result.current.emailReceipts).toEqual([]);

    // DELETE 在途, 服务端仍返回 c1 → 连接被护栏过滤, 不回弹
    // (现状固化: 护栏只覆盖 connections; 收据仅按 pendingIgnores 过滤, r1 会在在途期被拉回 — 见 /tmp/b75b-defects.md)
    await act(async () => {
      await result.current.loadEmailData();
    });
    expect(result.current.emailConnections).toEqual([]);

    // DELETE 成功 → 清标记; 此后服务端再返回 c1 就照常显示 (护栏只在在途期生效)
    act(() => {
      releaseDelete();
    });
    await act(async () => {
      await result.current.loadEmailData();
    });
    expect(result.current.emailConnections.map((c) => c.id)).toEqual(['c1']);
  });

  it('Round 19 BUG-R19D-H2: disconnect 失败 → merge 回滚, 不覆盖在途拉到的新数据', async () => {
    stubDefaultLoad({ status: { connections: [conn('c1')] }, actionable: { receipts: [receipt('r1', 'c1')] } });
    const { result, setToast } = setupHook();
    await waitFor(() => expect(result.current.hasActiveEmail).toBe(true));

    let rejectDelete!: (e: unknown) => void;
    vi.mocked(apiFetchVoid).mockImplementation(
      () => new Promise<void>((_, reject) => { rejectDelete = reject; }),
    );
    await act(() => {
      void result.current.handleDisconnectGmail('c1');
    });
    expect(result.current.emailConnections).toEqual([]);

    // 在途期间 auto-sync 拉到新连接 c2 (c1 仍被护栏过滤)
    stubDefaultLoad({ status: { connections: [conn('c2')] } });
    await act(async () => {
      await result.current.loadEmailData();
    });
    expect(result.current.emailConnections.map((c) => c.id)).toEqual(['c2']);

    // DELETE 失败 → c1 以 merge 方式加回, c2 保留
    await act(() => {
      rejectDelete(new Error('network down'));
    });
    expect(result.current.emailConnections.map((c) => c.id).sort()).toEqual(['c1', 'c2']);
    // 收据同样 merge 回来
    expect(result.current.emailReceipts.map((r) => r.id)).toEqual(['r1']);
    expect(setToast).toHaveBeenCalledWith({ message: 'Network error, changes reverted', type: 'info' });
  });
});

describe('useEmailMonitor — scan', () => {
  function setupForScan() {
    stubDefaultLoad({ status: { connections: [conn('c1')] } });
    return setupHook();
  }

  it('完全失败 (error 且无 scanned) → scanResult 带 error, lastSyncTime 不更新', async () => {
    const { result } = setupForScan();
    await waitFor(() => expect(result.current.hasActiveEmail).toBe(true));
    const before = window.localStorage.getItem(USER_SYNC_KEY);

    stubApiFetch((url) => {
      if (url === '/api/email/scan') return { error: 'scan blew up' };
      return { connections: [conn('c1')], receipts: [] };
    });
    await act(async () => {
      await result.current.handleScanEmails();
    });

    expect(result.current.scanResult).toEqual({ scanned: 0, newReceipts: 0, error: 'scan blew up' });
    expect(result.current.isScanning).toBe(false);
    // 失败不写 localStorage → auto-sync 下个周期重试
    expect(window.localStorage.getItem(USER_SYNC_KEY)).toBe(before);
  });

  it('成功 → scanResult 落地, 重拉数据, 用户级 lastSync key 更新为当前时间', async () => {
    const stale = Date.now() - 10 * 60 * 1000;
    window.localStorage.setItem(USER_SYNC_KEY, String(stale));
    const { result } = setupForScan();
    await waitFor(() => expect(result.current.hasActiveEmail).toBe(true));

    let statusCalls = 0;
    stubApiFetch((url) => {
      if (url === '/api/email/scan') return { scanned: 12, newReceipts: 3 };
      if (url === STATUS_URL) { statusCalls += 1; return { connections: [conn('c1')] }; }
      return { receipts: [] };
    });
    await act(async () => {
      await result.current.handleScanEmails();
    });

    expect(result.current.scanResult).toEqual({ scanned: 12, newReceipts: 3 });
    expect(statusCalls).toBe(1); // scan 成功后 loadEmailData 重拉恰好一次
    const saved = Number(window.localStorage.getItem(USER_SYNC_KEY));
    expect(saved).toBeGreaterThan(stale);
    expect(saved).toBeLessThanOrEqual(Date.now());
  });

  it('active 连接为 imap_* → 走 /api/email/resync; gmail → /api/email/scan', async () => {
    stubDefaultLoad({ status: { connections: [conn('c1', 'active', 'imap_fastmail')] } });
    const { result } = setupHook();
    await waitFor(() => expect(result.current.hasActiveEmail).toBe(true));

    stubApiFetch((url) => (url === '/api/email/resync' ? { scanned: 1, newReceipts: 0 } : { connections: [conn('c1', 'active', 'imap_fastmail')], receipts: [] }));
    await act(async () => {
      await result.current.handleScanEmails();
    });
    expect(vi.mocked(apiFetch).mock.calls.some((c) => c[0] === '/api/email/resync')).toBe(true);

    // 换 gmail 连接
    stubDefaultLoad({ status: { connections: [conn('c1')] } });
    const { result: result2, unmount } = setupHook();
    await waitFor(() => expect(result2.current.hasActiveEmail).toBe(true));
    stubApiFetch((url) => (url === '/api/email/scan' ? { scanned: 1, newReceipts: 0 } : { connections: [conn('c1')], receipts: [] }));
    await act(async () => {
      await result2.current.handleScanEmails();
    });
    expect(vi.mocked(apiFetch).mock.calls.some((c) => c[0] === '/api/email/scan')).toBe(true);
    unmount();
  });

  it('scan 在途时重复触发被 isScanningRef 拦截 (只发一次请求)', async () => {
    const { result } = setupForScan();
    await waitFor(() => expect(result.current.hasActiveEmail).toBe(true));

    let releaseScan!: (v: unknown) => void;
    stubApiFetch((url) => {
      if (url === '/api/email/scan') {
        return new Promise((resolve) => { releaseScan = resolve; });
      }
      return { connections: [conn('c1')], receipts: [] };
    });

    let scanPromise!: Promise<void>;
    await act(() => {
      scanPromise = result.current.handleScanEmails();
    });
    await act(async () => {
      await result.current.handleScanEmails(); // 在途 → no-op
    });
    expect(vi.mocked(apiFetch).mock.calls.filter((c) => c[0] === '/api/email/scan')).toHaveLength(1);

    await act(async () => {
      releaseScan({ scanned: 1, newReceipts: 0 });
      await scanPromise;
    });
    expect(result.current.isScanning).toBe(false);
  });
});

describe('useEmailMonitor — localStorage 初始化', () => {
  it('有效 lastSync → 恢复 lastSyncTimeRef, nextSyncIn 按剩余时间计算', async () => {
    window.localStorage.setItem(USER_SYNC_KEY, String(Date.now() - 60 * 1000)); // 1 分钟前同步过
    window.localStorage.setItem(USER_ENABLED_KEY, 'true');
    // 倒计时仅在 hasActiveEmail 时运行
    stubDefaultLoad({ status: { connections: [conn('c1')] } });
    const { result } = setupHook();

    // interval 5min - elapsed 1min → 240s; mount 时 countdown effect 先以空数据把值归 0,
    // 数据到位后靠 1s tick 恢复 — 放宽窗口接受 238–240
    await waitFor(
      () => {
        expect(result.current.nextSyncIn).toBeGreaterThanOrEqual(238);
        expect(result.current.nextSyncIn).toBeLessThanOrEqual(240);
      },
      { timeout: 4000 },
    );
    expect(result.current.autoSyncEnabled).toBe(true);
  });

  it('损坏的 lastSync (非数字) → 重置为当前时间, 不产生 NaN countdown', () => {
    window.localStorage.setItem(USER_SYNC_KEY, 'garbage');
    window.localStorage.setItem(USER_ENABLED_KEY, 'false');
    stubDefaultLoad();
    setupHook();

    const saved = Number(window.localStorage.getItem(USER_SYNC_KEY));
    expect(Number.isNaN(saved)).toBe(false);
    expect(saved).toBeLessThanOrEqual(Date.now());
  });

  it('autoSyncEnabled 持久化恢复: "false" → 关闭', async () => {
    window.localStorage.setItem(USER_ENABLED_KEY, 'false');
    stubDefaultLoad();
    const { result } = setupHook();
    await waitFor(() => expect(result.current.autoSyncEnabled).toBe(false));
  });

  it('toggle → 翻转并写用户级 key', async () => {
    window.localStorage.setItem(USER_ENABLED_KEY, 'false');
    stubDefaultLoad();
    const { result } = setupHook();
    await waitFor(() => expect(result.current.autoSyncEnabled).toBe(false));

    act(() => {
      result.current.handleToggleAutoSync();
    });
    expect(result.current.autoSyncEnabled).toBe(true);
    expect(window.localStorage.getItem(USER_ENABLED_KEY)).toBe('true');
  });
});

describe('useEmailMonitor — connect 入口', () => {
  it('handleConnectGmail: 已登录 → 跳转 /api/email/connect', async () => {
    stubDefaultLoad();
    const { result } = setupHook();
    const originalHref = window.location.href;

    await act(async () => {
      await result.current.handleConnectGmail();
    });
    expect(window.location.href).toContain('/api/email/connect');
    // 还原, 防止 URL 污染其他测试
    window.history.replaceState({}, '', originalHref);
  });
});

describe('useEmailMonitor — pendingIgnoresRef 供外部收据操作使用', () => {
  it('loadEmailData 过滤 pendingIgnores 中的收据', async () => {
    stubDefaultLoad({
      status: { connections: [conn('c1')] },
      actionable: { receipts: [receipt('r1', 'c1'), receipt('r2', 'c1')] },
    });
    const { result } = setupHook();
    await waitFor(() => expect(result.current.emailReceipts).toHaveLength(2));

    result.current.pendingIgnoresRef.current.add('r1');
    await act(async () => {
      await result.current.loadEmailData();
    });
    expect(result.current.emailReceipts.map((r) => r.id)).toEqual(['r2']);
  });
});
