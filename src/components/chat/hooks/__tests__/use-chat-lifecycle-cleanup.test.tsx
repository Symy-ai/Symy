/**
 * useChatLifecycleCleanup tests (batch77-c — testgap v9 §十五.2 中高盲区补测, 纯测试)
 *
 * 覆盖 (断言与现状对齐):
 *  - unmount: 4 类 timer (demoReply/demoAuth/buddyStateRefresh/depositNav) 全清 +
 *    BUG-95 abort in-flight 请求 + 模块级互斥锁释放 (防卸载后锁卡死)
 *  - Round 20 C1 用户切换 (a→b / a→undefined 登出): 清用户相关 state + demo timers +
 *    Round 23 CRITICAL-2 skipNonce + Round 37 C1 pendingContext (防跨用户泄露)
 *  - 挂载与同 userId 重渲染不触发重置
 */
// @vitest-environment happy-dom

import { renderHook } from '@testing-library/react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { useChatLifecycleCleanup } from '../use-chat-lifecycle-cleanup';

function longTimer(): ReturnType<typeof setTimeout> {
  return setTimeout(() => {}, 30_000);
}

function makeSetup(initialUserId: string | undefined) {
  const refs = {
    sendMessageLockRef: { current: { inProgress: false, lastContent: '', lastTime: 0 } },
    abortRef: { current: null as AbortController | null },
    demoReplyTimerRef: { current: null as ReturnType<typeof setTimeout> | null },
    demoAuthTimerRef: { current: null as ReturnType<typeof setTimeout> | null },
    buddyStateRefreshTimerRef: { current: null as ReturnType<typeof setTimeout> | null },
    depositNavTimerRef: { current: null as ReturnType<typeof setTimeout> | null },
    skipNextHistoryLoadRef: { current: false },
    skipNonceRef: { current: 0 },
    pendingContextRef: { current: null as string | null },
    pendingDisplayContentRef: { current: null as string | null },
  };
  const setters = {
    setActiveChallenge: vi.fn(),
    setExpiredChallenge: vi.fn(),
    setMessagesSync: vi.fn(),
    setIsLoading: vi.fn(),
    setHistoryLoadError: vi.fn(),
    setPendingContextReady: vi.fn(),
  };
  const render = () =>
    renderHook(({ uid }: { uid: string | undefined }) => useChatLifecycleCleanup({ ...refs, ...setters, userId: uid }), {
      initialProps: { uid: initialUserId },
    });
  return { refs, setters, render };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('useChatLifecycleCleanup — unmount 清理', () => {
  it('卸载: 4 类 timer 全清 + abort in-flight 请求 + 释放互斥锁', () => {
    const { refs, render } = makeSetup('user-a');
    const timers = {
      demoReply: longTimer(),
      demoAuth: longTimer(),
      buddyRefresh: longTimer(),
      depositNav: longTimer(),
    };
    refs.demoReplyTimerRef.current = timers.demoReply;
    refs.demoAuthTimerRef.current = timers.demoAuth;
    refs.buddyStateRefreshTimerRef.current = timers.buddyRefresh;
    refs.depositNavTimerRef.current = timers.depositNav;

    const controller = new AbortController();
    refs.abortRef.current = controller;
    const abortSpy = vi.spyOn(controller, 'abort');
    refs.sendMessageLockRef.current.inProgress = true;
    const clearTimeoutSpy = vi.spyOn(global, 'clearTimeout');

    const { unmount } = render();
    unmount();

    expect(clearTimeoutSpy).toHaveBeenCalledWith(timers.demoReply);
    expect(clearTimeoutSpy).toHaveBeenCalledWith(timers.demoAuth);
    expect(clearTimeoutSpy).toHaveBeenCalledWith(timers.buddyRefresh);
    expect(clearTimeoutSpy).toHaveBeenCalledWith(timers.depositNav);
    expect(abortSpy).toHaveBeenCalledTimes(1);
    expect(refs.sendMessageLockRef.current.inProgress).toBe(false);
  });

  it('卸载: timer refs 为 null / abortRef 为 null → 不炸, 锁仍释放', () => {
    const { refs, render } = makeSetup('user-a');
    refs.sendMessageLockRef.current.inProgress = true;
    const clearTimeoutSpy = vi.spyOn(global, 'clearTimeout');

    const { unmount } = render();
    expect(() => unmount()).not.toThrow();
    expect(clearTimeoutSpy).not.toHaveBeenCalled();
    expect(refs.sendMessageLockRef.current.inProgress).toBe(false);
  });
});

describe('useChatLifecycleCleanup — 用户切换清理', () => {
  it('挂载与同 userId 重渲染不触发任何重置', () => {
    const { setters, render } = makeSetup('user-a');
    const { rerender } = render();
    rerender({ uid: 'user-a' });
    for (const setter of Object.values(setters)) {
      expect(setter).not.toHaveBeenCalled();
    }
  });

  it('a→b 切换: 清用户 state + demo timers + skip 标记 + pendingContext (防跨用户泄露)', () => {
    const { refs, setters, render } = makeSetup('user-a');
    const demoReply = longTimer();
    const demoAuth = longTimer();
    const buddyRefresh = longTimer(); // H7: 只在 unmount 清, 用户切换不清
    refs.demoReplyTimerRef.current = demoReply;
    refs.demoAuthTimerRef.current = demoAuth;
    refs.buddyStateRefreshTimerRef.current = buddyRefresh;
    refs.sendMessageLockRef.current.inProgress = true;
    refs.skipNextHistoryLoadRef.current = true;
    refs.skipNonceRef.current = 1758100000000;
    refs.pendingContextRef.current = 'A 的 challenge prompt (含物品名+金额)';
    refs.pendingDisplayContentRef.current = 'A 的 mirror 消息';
    const clearTimeoutSpy = vi.spyOn(global, 'clearTimeout');

    const { rerender } = render();
    rerender({ uid: 'user-b' });

    expect(setters.setActiveChallenge).toHaveBeenCalledWith(undefined);
    expect(setters.setExpiredChallenge).toHaveBeenCalledWith(null);
    expect(setters.setMessagesSync).toHaveBeenCalledWith([]);
    expect(setters.setIsLoading).toHaveBeenCalledWith(false);
    expect(setters.setHistoryLoadError).toHaveBeenCalledWith(null);
    expect(setters.setPendingContextReady).toHaveBeenCalledWith(false);

    // demo timers 清 + 置 null (防 demo→auth 过渡泄漏); buddy/deposit timer 不在切换范围
    expect(clearTimeoutSpy).toHaveBeenCalledWith(demoReply);
    expect(clearTimeoutSpy).toHaveBeenCalledWith(demoAuth);
    expect(refs.demoReplyTimerRef.current).toBeNull();
    expect(refs.demoAuthTimerRef.current).toBeNull();
    expect(refs.buddyStateRefreshTimerRef.current).toBe(buddyRefresh);

    expect(refs.sendMessageLockRef.current.inProgress).toBe(false);
    expect(refs.skipNextHistoryLoadRef.current).toBe(false);
    // Round 23 CRITICAL-2: nonce 不清 → B 的历史被误跳过; Round 37 C1: pendingContext 不清 → A 的 prompt 发给 B
    expect(refs.skipNonceRef.current).toBe(0);
    expect(refs.pendingContextRef.current).toBeNull();
    expect(refs.pendingDisplayContentRef.current).toBeNull();
  });

  it('a→undefined (登出) 同样触发全量清理; 之后同一 undefined 重渲染不再重复触发', () => {
    const { refs, setters, render } = makeSetup('user-a');
    refs.skipNonceRef.current = 42;
    refs.pendingContextRef.current = 'leak';

    const { rerender } = render();
    rerender({ uid: undefined });

    expect(setters.setActiveChallenge).toHaveBeenCalledTimes(1);
    expect(setters.setMessagesSync).toHaveBeenCalledTimes(1);
    expect(refs.skipNonceRef.current).toBe(0);
    expect(refs.pendingContextRef.current).toBeNull();

    rerender({ uid: undefined });
    expect(setters.setActiveChallenge).toHaveBeenCalledTimes(1);
  });
});
