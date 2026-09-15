/**
 * useReceiptActions tests (batch75-b — testgap 盲区补测, v8 #15 / v7 §十三.3)
 *
 * 覆盖 (断言与现状对齐):
 *  - handleReceiptsIgnore: 乐观删除 + 立即 toast; pendingIgnoresRef 在途去重 + 完成后释放;
 *    healthImpactApplied=false → 2.5s 延迟 toast (不覆盖立即 toast);
 *    失败回滚按 received_at desc 重排 (BUG-R19D-L2, 不追加到末尾)
 *  - handleReceiptsRefund: 乐观置 refunding + 平台名 toast; 失败回滚原 status;
 *    refund/refunded 无在途去重 — 同 id 双击发两个 PATCH (现状固化, v8 #15-②)
 *  - handleMarkRefunded: 乐观删除 + 成功 toast; 失败回滚原 status + 重排
 *  - demo 双 guard: isDemoRef → onAuthPrompt; isDemoModeRef → toast; 均零网络
 *  - 卸载清理: 延迟 toast timer 随卸载清除 (Round 44 R44-A-3)
 */
// @vitest-environment happy-dom

import { renderHook, act } from '@testing-library/react';
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { useReceiptActions, type ReceiptActionsArgs } from '../use-receipt-actions';
import { apiFetch, apiFetchVoid } from '@/lib/api-client';
import type { EmailReceipt } from '@/lib/supabase';

vi.mock('@/lib/api-client', () => ({
  apiFetch: vi.fn(),
  apiFetchVoid: vi.fn(),
}));

const DICT: Record<string, string> = {
  'monitor.toast.receiptIgnored': 'Receipt ignored',
  'monitor.toast.networkError': 'Network error, changes reverted',
  'monitor.toast.demoIgnoreDisabled': 'Demo mode — ignoring disabled',
  'monitor.toast.demoRefundDisabled': 'Demo mode — refunds disabled',
  'monitor.toast.refundMarkedManual': 'Refund for {platform} marked',
  'monitor.toast.refundConfirmed': 'Refund confirmed',
  'monitor.toast.healthImpactDelayed': 'Boost delayed — applies on next sync',
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

function receipt(overrides: Partial<EmailReceipt> = {}): EmailReceipt {
  return {
    id: 'r-1',
    platform: 'amazon',
    status: 'actionable',
    received_at: '2026-09-15T10:00:00Z',
    amount: 42,
    ...overrides,
  } as EmailReceipt;
}

/** received_at 降序的 [a, b, c]; b 居中用于验证回滚重排 */
function threeReceipts(): EmailReceipt[] {
  return [
    receipt({ id: 'a', received_at: '2026-09-15T10:00:00Z' }),
    receipt({ id: 'b', received_at: '2026-09-14T10:00:00Z' }),
    receipt({ id: 'c', received_at: '2026-09-13T10:00:00Z' }),
  ];
}

function setup(receipts: EmailReceipt[] = threeReceipts()) {
  const emailReceiptsRef = { current: [...receipts] };
  let state = [...receipts];
  const setEmailReceipts = vi.fn(((action: Parameters<ReceiptActionsArgs['setEmailReceipts']>[0]) => {
    state = typeof action === 'function' ? action(state) : action;
    return state;
  }) as ReceiptActionsArgs['setEmailReceipts']);
  const pendingIgnoresRef = { current: new Set<string>() };
  const setToast = vi.fn();
  const isDemoRef = { current: false };
  const isDemoModeRef = { current: false };
  const onAuthPrompt = vi.fn();

  const hook = renderHook(() =>
    useReceiptActions({ emailReceiptsRef, setEmailReceipts, pendingIgnoresRef, setToast, isDemoRef, isDemoModeRef, onAuthPrompt }),
  );

  return {
    ...hook,
    emailReceiptsRef,
    setEmailReceipts,
    pendingIgnoresRef,
    setToast,
    isDemoRef,
    isDemoModeRef,
    onAuthPrompt,
    getState: () => state,
  };
}

function patchCalls() {
  return vi.mocked(apiFetch).mock.calls.filter(([url]) => String(url).startsWith('/api/email/receipts'));
}

beforeEach(() => {
  vi.mocked(apiFetch).mockReset();
  vi.mocked(apiFetchVoid).mockReset();
  vi.mocked(apiFetch).mockResolvedValue({ healthImpactApplied: true });
  vi.mocked(apiFetchVoid).mockResolvedValue(undefined);
});

afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
});

describe('useReceiptActions — handleReceiptsIgnore', () => {
  it('乐观删除 + 立即 info toast; PATCH status=ignored; 成功后 pendingIgnores 释放', async () => {
    const { result, getState, setToast, pendingIgnoresRef } = setup();

    await act(async () => {
      await result.current.handleReceiptsIgnore('b');
    });

    expect(getState().map((r) => r.id)).toEqual(['a', 'c']);
    expect(setToast).toHaveBeenCalledWith({ message: 'Receipt ignored', type: 'info' });
    expect(patchCalls()).toHaveLength(1);
    expect(patchCalls()[0]![0]).toBe('/api/email/receipts?id=b');
    expect(patchCalls()[0]![1]).toMatchObject({ method: 'PATCH', body: { status: 'ignored' } });
    expect(pendingIgnoresRef.current.has('b')).toBe(false);
  });

  it('在途去重: PATCH 未返回期间重复 ignore 只发一次; 完成后可再次 ignore', async () => {
    let release!: (v: unknown) => void;
    vi.mocked(apiFetch).mockImplementation(
      () => new Promise((resolve) => { release = resolve; }),
    );
    const { result, pendingIgnoresRef } = setup();

    act(() => {
      void result.current.handleReceiptsIgnore('b');
    });
    act(() => {
      void result.current.handleReceiptsIgnore('b'); // 在途 → 被 pendingIgnoresRef 拦截
    });
    expect(patchCalls()).toHaveLength(1);

    await act(async () => {
      release({ healthImpactApplied: true });
      await new Promise((r) => setTimeout(r, 0)); // flush PATCH 后续
    });
    expect(pendingIgnoresRef.current.has('b')).toBe(false);

    vi.mocked(apiFetch).mockResolvedValue({ healthImpactApplied: true });
    await act(async () => {
      await result.current.handleReceiptsIgnore('b'); // 已释放 → 可重新 ignore
    });
    expect(patchCalls()).toHaveLength(2);
  });

  it('healthImpactApplied=false → 2.5s 延迟 info toast, 不覆盖立即 toast', async () => {
    vi.useFakeTimers();
    vi.mocked(apiFetch).mockResolvedValue({ healthImpactApplied: false });
    const { result, setToast } = setup();

    await act(async () => {
      await result.current.handleReceiptsIgnore('b');
    });
    expect(setToast).toHaveBeenCalledTimes(1); // 仅立即 toast

    act(() => {
      vi.advanceTimersByTime(2500);
    });
    expect(setToast).toHaveBeenCalledTimes(2);
    expect(setToast).toHaveBeenLastCalledWith({ message: 'Boost delayed — applies on next sync', type: 'info' });
  });

  it('healthImpactApplied=true → 无延迟 toast', async () => {
    vi.useFakeTimers();
    const { result, setToast } = setup();
    await act(async () => {
      await result.current.handleReceiptsIgnore('b');
    });
    act(() => {
      vi.advanceTimersByTime(5000);
    });
    expect(setToast).toHaveBeenCalledTimes(1);
  });

  it('失败 → 回滚按 received_at desc 重排 (b 回到中间, 非末尾追加) + networkError toast + 标记释放', async () => {
    vi.mocked(apiFetch).mockRejectedValue(new Error('down'));
    const { result, getState, setToast, pendingIgnoresRef } = setup();

    await act(async () => {
      await result.current.handleReceiptsIgnore('b');
    });

    expect(getState().map((r) => r.id)).toEqual(['a', 'b', 'c']);
    expect(setToast).toHaveBeenLastCalledWith({ message: 'Network error, changes reverted', type: 'info' });
    expect(pendingIgnoresRef.current.has('b')).toBe(false);
  });

  it('demo 双 guard: isDemoRef → onAuthPrompt("monitor"); isDemoModeRef → toast; 均零网络', async () => {
    const d1 = setup();
    d1.isDemoRef.current = true;
    await act(async () => {
      await d1.result.current.handleReceiptsIgnore('b');
    });
    expect(d1.onAuthPrompt).toHaveBeenCalledWith('monitor');
    expect(patchCalls()).toHaveLength(0);

    const d2 = setup();
    d2.isDemoModeRef.current = true;
    await act(async () => {
      await d2.result.current.handleReceiptsIgnore('b');
    });
    expect(d2.setToast).toHaveBeenCalledWith({ message: 'Demo mode — ignoring disabled', type: 'info' });
    expect(patchCalls()).toHaveLength(0);
    expect(d2.onAuthPrompt).not.toHaveBeenCalled();
  });
});

describe('useReceiptActions — handleReceiptsRefund', () => {
  it('乐观置 refunding + 平台名 toast (formatPlatformName); PATCH status=refunding', async () => {
    const { result, getState, setToast } = setup([receipt({ id: 'r-1', platform: 'tiktok_shop' })]);

    await act(async () => {
      await result.current.handleReceiptsRefund('r-1');
    });

    expect(getState()[0].status).toBe('refunding');
    expect(setToast).toHaveBeenCalledWith({ message: 'Refund for TikTok Shop marked', type: 'info' });
    expect(vi.mocked(apiFetchVoid)).toHaveBeenCalledWith(
      '/api/email/receipts?id=r-1',
      expect.objectContaining({ method: 'PATCH', body: { status: 'refunding' } }),
    );
  });

  it('id 不存在 → no-op (零请求零 toast)', async () => {
    const { result, setToast } = setup();
    await act(async () => {
      await result.current.handleReceiptsRefund('missing');
    });
    expect(apiFetchVoid).not.toHaveBeenCalled();
    expect(setToast).not.toHaveBeenCalled();
  });

  it('失败 → 回滚原 status + networkError toast', async () => {
    vi.mocked(apiFetchVoid).mockRejectedValue(new Error('down'));
    const { result, getState, setToast } = setup([receipt({ id: 'r-1', status: 'actionable' })]);

    await act(async () => {
      await result.current.handleReceiptsRefund('r-1');
    });

    expect(getState()[0].status).toBe('actionable');
    expect(setToast).toHaveBeenLastCalledWith({ message: 'Network error, changes reverted', type: 'info' });
  });

  it('现状固化 (v8 #15-②): refund 无在途去重 — 同 id 双击发两个 PATCH', async () => {
    const { result } = setup();
    await act(async () => {
      await Promise.all([
        result.current.handleReceiptsRefund('a'),
        result.current.handleReceiptsRefund('a'),
      ]);
    });
    expect(vi.mocked(apiFetchVoid)).toHaveBeenCalledTimes(2);
  });

  it('demo 双 guard: isDemoRef → onAuthPrompt("refund"); isDemoModeRef → toast; 均零网络', async () => {
    const d1 = setup();
    d1.isDemoRef.current = true;
    await act(async () => {
      await d1.result.current.handleReceiptsRefund('a');
    });
    expect(d1.onAuthPrompt).toHaveBeenCalledWith('refund');

    const d2 = setup();
    d2.isDemoModeRef.current = true;
    await act(async () => {
      await d2.result.current.handleReceiptsRefund('a');
    });
    expect(d2.setToast).toHaveBeenCalledWith({ message: 'Demo mode — refunds disabled', type: 'info' });
    expect(apiFetchVoid).not.toHaveBeenCalled();
  });
});

describe('useReceiptActions — handleMarkRefunded', () => {
  it('乐观删除 + success toast; PATCH status=refunded; healthImpactApplied=false → 延迟 toast', async () => {
    vi.useFakeTimers();
    vi.mocked(apiFetch).mockResolvedValue({ healthImpactApplied: false });
    const { result, getState, setToast } = setup();

    await act(async () => {
      await result.current.handleMarkRefunded('b');
    });
    expect(getState().map((r) => r.id)).toEqual(['a', 'c']);
    expect(setToast).toHaveBeenCalledWith({ message: 'Refund confirmed', type: 'success' });
    expect(patchCalls()[0]![1]).toMatchObject({ method: 'PATCH', body: { status: 'refunded' } });

    act(() => {
      vi.advanceTimersByTime(2500);
    });
    expect(setToast).toHaveBeenLastCalledWith({ message: 'Boost delayed — applies on next sync', type: 'info' });
  });

  it('失败 → 回滚原 status 且按 received_at desc 重排 + networkError toast', async () => {
    vi.mocked(apiFetch).mockRejectedValue(new Error('down'));
    const { result, getState, setToast } = setup([
      receipt({ id: 'a', received_at: '2026-09-15T10:00:00Z', status: 'refunding' }),
      receipt({ id: 'b', received_at: '2026-09-14T10:00:00Z', status: 'refunding' }),
      receipt({ id: 'c', received_at: '2026-09-13T10:00:00Z' }),
    ]);

    await act(async () => {
      await result.current.handleMarkRefunded('b');
    });

    expect(getState().map((r) => r.id)).toEqual(['a', 'b', 'c']);
    expect(getState().find((r) => r.id === 'b')?.status).toBe('refunding'); // 原 status 恢复
    expect(setToast).toHaveBeenLastCalledWith({ message: 'Network error, changes reverted', type: 'info' });
  });

  it('id 不存在 → no-op; demo guard: isDemoRef → onAuthPrompt("monitor") 且零网络', async () => {
    const { result, setToast } = setup();
    await act(async () => {
      await result.current.handleMarkRefunded('missing');
    });
    expect(patchCalls()).toHaveLength(0);
    expect(setToast).not.toHaveBeenCalled();

    const d = setup();
    d.isDemoRef.current = true;
    await act(async () => {
      await d.result.current.handleMarkRefunded('b');
    });
    expect(d.onAuthPrompt).toHaveBeenCalledWith('monitor');
    expect(patchCalls()).toHaveLength(0);
  });
});

describe('useReceiptActions — 延迟 toast timer 生命周期 (Round 44 R44-A-3)', () => {
  it('同 ref 复用: 新延迟 toast 先清旧 timer — 只有最后一个延迟 toast 会发出', async () => {
    vi.useFakeTimers();
    vi.mocked(apiFetch).mockResolvedValue({ healthImpactApplied: false });
    const { result, setToast } = setup();

    await act(async () => {
      await result.current.handleReceiptsIgnore('b');
    });
    await act(async () => {
      await result.current.handleMarkRefunded('c');
    });
    act(() => {
      vi.advanceTimersByTime(2500);
    });
    const delayed = setToast.mock.calls.filter(([t]) => (t as { message: string }).message.includes('delayed'));
    expect(delayed).toHaveLength(1); // ignore 的延迟 toast 被 refunded 的清掉
  });

  it('卸载清 timer: PATCH 成功后、2500ms 到达前卸载 → 延迟 toast 不再发出', async () => {
    vi.useFakeTimers();
    vi.mocked(apiFetch).mockResolvedValue({ healthImpactApplied: false });
    const { result, setToast, unmount } = setup();

    await act(async () => {
      await result.current.handleReceiptsIgnore('b');
    });
    unmount();
    act(() => {
      vi.advanceTimersByTime(5000);
    });
    expect(setToast).toHaveBeenCalledTimes(1); // 仅立即 toast, 延迟的被清
  });
});
