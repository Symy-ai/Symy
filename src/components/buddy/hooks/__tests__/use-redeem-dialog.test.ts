/**
 * useRedeemDialog tests (batch75-b 第四段 — testgap 盲区补测, v9 §十五.2 中高)
 *
 * 覆盖 (断言与现状对齐):
 *  - 初始态 / openRedeemDialog 类型切换
 *  - demo guard: isDemo → 零网络零状态变化
 *  - 成功: success toast ({cost} 插值) + 对话框关闭 + 'symy:challenge-completed' 事件 + 1s 后 reload 恰一次
 *  - 双击防重: redeeming in-flight 时二次调用被吞 (单次 API)
 *  - 余额不足: ApiError message 含 'Insufficient' → info toast, 对话框不关、不 reload
 *  - 其他错误 / 非 Error rejection → 通用 info toast; finally 释放 redeeming
 */
// @vitest-environment happy-dom

import { renderHook, act } from '@testing-library/react';
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { useRedeemDialog } from '../use-redeem-dialog';

vi.mock('@/lib/api-client', () => ({
  apiFetch: vi.fn(),
}));

vi.mock('@/i18n/provider', () => ({
  useI18n: () => ({
    t: (key: string, params?: Record<string, string | number>) => {
      const DICT: Record<string, string> = {
        'buddy.redeemSuccess': '✓ Redeemed! {cost} tokens used',
        'buddy.redeemInsufficient': 'Not enough tokens',
        'buddy.redeemFailed': 'Redeem failed. Try again.',
      };
      const tpl = DICT[key] ?? key;
      if (!params) return tpl;
      return Object.entries(params).reduce(
        (acc, [k, v]) => acc.replaceAll(`{${k}}`, String(v)),
        tpl,
      );
    },
  }),
}));

import { apiFetch } from '@/lib/api-client';

const mockedApiFetch = vi.mocked(apiFetch);

function deferred<T>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe('useRedeemDialog', () => {
  let onToast: (message: string, type?: 'success' | 'info') => void;
  let reloadSpy: ReturnType<typeof vi.spyOn>;
  let completedEvents: CustomEvent[];

  // 同一函数引用注册/注销, 避免闭包累积导致事件计数污染
  const recordCompleted = (e: Event) => completedEvents.push(e as CustomEvent);

  const renderWith = (isDemo = false) =>
    renderHook(() => useRedeemDialog({ isDemo, onToast }));

  beforeEach(() => {
    vi.useFakeTimers();
    onToast = vi.fn();
    reloadSpy = vi.spyOn(window.location, 'reload').mockImplementation(() => {});
    completedEvents = [];
    window.addEventListener('symy:challenge-completed', recordCompleted);
  });

  afterEach(() => {
    window.removeEventListener('symy:challenge-completed', recordCompleted);
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('初始态: 对话框关闭 / 类型 see_it / 非 redeeming', () => {
    const { result } = renderWith();
    expect(result.current.showRedeemDialog).toBe(false);
    expect(result.current.redeemType).toBe('see_it');
    expect(result.current.redeeming).toBe(false);
  });

  it('openRedeemDialog: 设置类型并打开对话框', () => {
    const { result } = renderWith();
    act(() => result.current.openRedeemDialog('gacha'));
    expect(result.current.redeemType).toBe('gacha');
    expect(result.current.showRedeemDialog).toBe(true);
  });

  it('demo guard: isDemo → 零网络、状态不变', async () => {
    const { result } = renderWith(true);
    await act(async () => {
      await result.current.handleRedeem();
    });
    expect(mockedApiFetch).not.toHaveBeenCalled();
    expect(result.current.showRedeemDialog).toBe(false);
    expect(onToast).not.toHaveBeenCalled();
  });

  it('双击防重: 首次 in-flight 重渲染后 redeeming=true, 二次调用被吞 (单次 API); 成功后释放', async () => {
    const { result } = renderWith();
    act(() => result.current.openRedeemDialog('see_it'));
    const d = deferred<{ success: boolean; tokens: number; cost: number }>();
    mockedApiFetch.mockReturnValueOnce(d.promise as never);

    let first!: Promise<void>;
    await act(async () => {
      first = result.current.handleRedeem();
      await Promise.resolve();
    });
    // setRedeeming(true) 已随重渲染提交 → 新闭包守卫生效 (state 闭包守卫, 非 ref)
    expect(result.current.redeeming).toBe(true);
    await act(async () => {
      await result.current.handleRedeem();
    });
    expect(mockedApiFetch).toHaveBeenCalledTimes(1);
    expect(mockedApiFetch).toHaveBeenCalledWith('/api/buddy/redeem', {
      method: 'POST',
      body: { type: 'see_it' },
    });

    await act(async () => {
      d.resolve({ success: true, tokens: 90, cost: 10 });
      await first;
    });
    expect(mockedApiFetch).toHaveBeenCalledTimes(1);
    expect(result.current.redeeming).toBe(false);
  });

  it('成功: cost 插值 success toast + 关闭 + challenge-completed 事件 + 1s 后 reload 恰一次', async () => {
    const { result } = renderWith();
    act(() => result.current.openRedeemDialog('gacha'));
    mockedApiFetch.mockResolvedValueOnce({ success: true, tokens: 90, cost: 10 } as never);

    await act(async () => {
      await result.current.handleRedeem();
    });

    expect(onToast).toHaveBeenCalledTimes(1);
    expect(onToast).toHaveBeenCalledWith('✓ Redeemed! 10 tokens used', 'success');
    expect(result.current.showRedeemDialog).toBe(false);
    expect(completedEvents).toHaveLength(1);

    await act(async () => {
      vi.advanceTimersByTime(999);
      await Promise.resolve();
    });
    expect(reloadSpy).not.toHaveBeenCalled();
    await act(async () => {
      vi.advanceTimersByTime(1);
      await Promise.resolve();
    });
    expect(reloadSpy).toHaveBeenCalledTimes(1);
    await act(async () => {
      vi.advanceTimersByTime(5000);
      await Promise.resolve();
    });
    expect(reloadSpy).toHaveBeenCalledTimes(1);
  });

  it('余额不足: message 含 Insufficient → info toast, 对话框不关、不 reload', async () => {
    const { result } = renderWith();
    act(() => result.current.openRedeemDialog('see_it'));
    mockedApiFetch.mockRejectedValueOnce(Object.assign(new Error('Insufficient tokens'), { status: 400 }));

    await act(async () => {
      await result.current.handleRedeem();
    });

    expect(onToast).toHaveBeenCalledTimes(1);
    expect(onToast).toHaveBeenCalledWith('Not enough tokens', 'info');
    expect(result.current.showRedeemDialog).toBe(true);
    expect(reloadSpy).not.toHaveBeenCalled();
    expect(completedEvents).toHaveLength(0);
    expect(result.current.redeeming).toBe(false);
  });

  it('其他 ApiError → 通用失败 info toast', async () => {
    const { result } = renderWith();
    mockedApiFetch.mockRejectedValueOnce(Object.assign(new Error('HTTP 500'), { status: 500 }));
    await act(async () => {
      await result.current.handleRedeem();
    });
    expect(onToast).toHaveBeenCalledWith('Redeem failed. Try again.', 'info');
  });

  it('batch80-c: API 500 → toast 恰好一次 + redeeming 复位 (按钮解锁), 立即重试可走通成功路径', async () => {
    // restoreAllMocks 不清 vi.mock 工厂 vi.fn 的历史 — 本用例做精确计数, 先清
    mockedApiFetch.mockClear();
    const { result } = renderWith();
    act(() => result.current.openRedeemDialog('see_it'));
    mockedApiFetch
      .mockRejectedValueOnce(Object.assign(new Error('HTTP 500'), { status: 500 }))
      .mockResolvedValueOnce({ success: true, tokens: 90, cost: 10 } as never);

    await act(async () => {
      await result.current.handleRedeem();
    });

    // toast 恰好一次 (不多不少), 通用失败文案
    expect(onToast).toHaveBeenCalledTimes(1);
    expect(onToast).toHaveBeenCalledWith('Redeem failed. Try again.', 'info');
    // 按钮解锁: redeeming 复位, 对话框未关 (供重试), 不 reload 不派发完成事件
    expect(result.current.redeeming).toBe(false);
    expect(result.current.showRedeemDialog).toBe(true);
    expect(reloadSpy).not.toHaveBeenCalled();
    expect(completedEvents).toHaveLength(0);

    // 解锁的端到端证明: 立即重试无 in-flight 残留卡死, 走通成功路径
    await act(async () => {
      await result.current.handleRedeem();
    });
    expect(mockedApiFetch).toHaveBeenCalledTimes(2);
    expect(onToast).toHaveBeenCalledTimes(2);
    expect(onToast).toHaveBeenLastCalledWith('✓ Redeemed! 10 tokens used', 'success');
    expect(result.current.showRedeemDialog).toBe(false);
    expect(result.current.redeeming).toBe(false);
  });

  it('非 Error rejection (字符串) → 同样走通用失败 toast, 不抛出', async () => {
    const { result } = renderWith();
    mockedApiFetch.mockRejectedValueOnce('boom');
    await expect(
      act(async () => {
        await result.current.handleRedeem();
      })
    ).resolves.toBeUndefined();
    expect(onToast).toHaveBeenCalledWith('Redeem failed. Try again.', 'info');
    expect(result.current.redeeming).toBe(false);
  });
});
