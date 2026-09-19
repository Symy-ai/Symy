/**
 * useChallengeLimit tests (batch84-b — testgap v9 长尾补测第四批, buddy 限流 hooks)
 *
 * 覆盖 (断言与现状对齐):
 *  - mount GET /api/challenge/limit → limitData 写入 + isLoading 收口
 *  - demo: mount 零请求 + refresh() 短路, limitData 恒 null
 *  - fetch 失败 → degraded 降级 (remaining=Infinity, 不阻塞用户)
 *  - canStartChallenge 五档: demo / 未加载乐观 true / degraded true / premium true / remaining
 *  - challenge-completed / challenge-created 事件 → refresh; demo 不订阅
 *  - tab-change buddy → 延迟 100ms refresh; 其他 tab 不刷
 *  - unmount: pending tab timer 清理 + 事件监听注销
 */
// @vitest-environment happy-dom

import { cleanup, renderHook, act } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/api-client', () => ({ apiFetch: vi.fn() }));
vi.mock('@/lib/logger', () => ({ logger: { info: vi.fn(), warn: vi.fn() } }));

import { apiFetch } from '@/lib/api-client';
import {
  useChallengeLimit,
  CHALLENGE_COMPLETED_EVENT,
  CHALLENGE_CREATED_EVENT,
} from '../use-challenge-limit';

const mockedApiFetch = vi.mocked(apiFetch);

const limitPayload = (over: Partial<{ count: number; remaining: number; limit: number; isPremium: boolean }> = {}) => ({
  count: 2,
  remaining: 3,
  limit: 5,
  isPremium: false,
  ...over,
});

const dispatchTabChange = (tab: string) =>
  window.dispatchEvent(new CustomEvent('symy:tab-change', { detail: { tab } }));

describe('useChallengeLimit', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    // mockReset 而非 clearAllMocks: once 队列必须一并清 (b83-b 踩坑)
    mockedApiFetch.mockReset();
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it('mount: GET /api/challenge/limit → limitData 写入, isLoading 收口 false', async () => {
    mockedApiFetch.mockResolvedValue(limitPayload());
    const { result } = renderHook(() => useChallengeLimit());
    await act(async () => {});
    expect(mockedApiFetch).toHaveBeenCalledTimes(1);
    expect(mockedApiFetch).toHaveBeenCalledWith('/api/challenge/limit');
    expect(result.current.limitData).toEqual(limitPayload());
    expect(result.current.isLoading).toBe(false);
  });

  it('demo: mount 零请求, refresh() 短路零请求, limitData 恒 null', async () => {
    const { result } = renderHook(() => useChallengeLimit(true));
    await act(async () => {});
    expect(mockedApiFetch).not.toHaveBeenCalled();
    await act(async () => {
      await result.current.refresh();
    });
    expect(mockedApiFetch).not.toHaveBeenCalled();
    expect(result.current.limitData).toBeNull();
  });

  it('fetch 失败 → degraded 降级 remaining=Infinity, 不阻塞用户', async () => {
    mockedApiFetch.mockRejectedValue(new Error('network down'));
    const { result } = renderHook(() => useChallengeLimit());
    await act(async () => {});
    expect(result.current.limitData).toEqual({
      count: 0,
      remaining: Infinity,
      limit: Infinity,
      isPremium: false,
      degraded: true,
    });
    expect(result.current.canStartChallenge()).toBe(true);
  });

  it('canStartChallenge: limitData 未加载 (null) → 乐观允许', async () => {
    mockedApiFetch.mockReturnValue(new Promise(() => {}));
    const { result } = renderHook(() => useChallengeLimit());
    await act(async () => {});
    expect(result.current.limitData).toBeNull();
    expect(result.current.canStartChallenge()).toBe(true);
  });

  it('canStartChallenge: premium 永真 (即使 remaining=0); degraded 永真', async () => {
    mockedApiFetch.mockResolvedValue(limitPayload({ isPremium: true, remaining: 0 }));
    const { result } = renderHook(() => useChallengeLimit());
    await act(async () => {});
    expect(result.current.canStartChallenge()).toBe(true);

    mockedApiFetch.mockRejectedValue(new Error('degraded path'));
    const degraded = renderHook(() => useChallengeLimit());
    await act(async () => {});
    expect(degraded.result.current.limitData?.degraded).toBe(true);
    expect(degraded.result.current.canStartChallenge()).toBe(true);
  });

  it('canStartChallenge: remaining>0 true, remaining=0 false', async () => {
    mockedApiFetch.mockResolvedValue(limitPayload({ remaining: 2 }));
    const { result } = renderHook(() => useChallengeLimit());
    await act(async () => {});
    expect(result.current.canStartChallenge()).toBe(true);

    mockedApiFetch.mockResolvedValue(limitPayload({ remaining: 0 }));
    const exhausted = renderHook(() => useChallengeLimit());
    await act(async () => {});
    expect(exhausted.result.current.canStartChallenge()).toBe(false);
  });

  it('challenge-completed / challenge-created 事件 → 各触发一次 refresh', async () => {
    mockedApiFetch.mockResolvedValue(limitPayload());
    const { result } = renderHook(() => useChallengeLimit());
    await act(async () => {});
    expect(mockedApiFetch).toHaveBeenCalledTimes(1);

    await act(async () => {
      window.dispatchEvent(new Event(CHALLENGE_COMPLETED_EVENT));
      await Promise.resolve();
    });
    expect(mockedApiFetch).toHaveBeenCalledTimes(2);

    await act(async () => {
      window.dispatchEvent(new Event(CHALLENGE_CREATED_EVENT));
      await Promise.resolve();
    });
    expect(mockedApiFetch).toHaveBeenCalledTimes(3);
    expect(result.current.limitData).toEqual(limitPayload());
  });

  it('demo: 不订阅完成/创建事件 (dispatch 后零请求)', async () => {
    renderHook(() => useChallengeLimit(true));
    await act(async () => {});
    window.dispatchEvent(new Event(CHALLENGE_COMPLETED_EVENT));
    window.dispatchEvent(new Event(CHALLENGE_CREATED_EVENT));
    await act(async () => {
      vi.advanceTimersByTime(500);
      await Promise.resolve();
    });
    expect(mockedApiFetch).not.toHaveBeenCalled();
  });

  it('tab-change: buddy → 延迟 100ms refresh; 其他 tab 不刷', async () => {
    mockedApiFetch.mockResolvedValue(limitPayload());
    const { result } = renderHook(() => useChallengeLimit());
    await act(async () => {});
    expect(mockedApiFetch).toHaveBeenCalledTimes(1);

    await act(async () => {
      dispatchTabChange('chat');
      vi.advanceTimersByTime(300);
      await Promise.resolve();
    });
    expect(mockedApiFetch).toHaveBeenCalledTimes(1);

    await act(async () => {
      dispatchTabChange('buddy');
      vi.advanceTimersByTime(99);
      await Promise.resolve();
    });
    expect(mockedApiFetch).toHaveBeenCalledTimes(1);

    await act(async () => {
      vi.advanceTimersByTime(1);
      await Promise.resolve();
    });
    expect(mockedApiFetch).toHaveBeenCalledTimes(2);
    expect(result.current.limitData).toEqual(limitPayload());
  });

  it('unmount: pending tab timer 清理 — 切 tab 后立即卸载, 100ms 后不再 refresh', async () => {
    mockedApiFetch.mockResolvedValue(limitPayload());
    const { unmount } = renderHook(() => useChallengeLimit());
    await act(async () => {});
    expect(mockedApiFetch).toHaveBeenCalledTimes(1);

    await act(async () => {
      dispatchTabChange('buddy');
      await Promise.resolve();
    });
    unmount();
    await act(async () => {
      vi.advanceTimersByTime(1000);
      await Promise.resolve();
    });
    expect(mockedApiFetch).toHaveBeenCalledTimes(1);
  });

  it('unmount: 事件监听注销 — 卸载后 completed/created/tab-change 均不触发 refresh', async () => {
    mockedApiFetch.mockResolvedValue(limitPayload());
    const { unmount } = renderHook(() => useChallengeLimit());
    await act(async () => {});
    expect(mockedApiFetch).toHaveBeenCalledTimes(1);
    unmount();

    await act(async () => {
      window.dispatchEvent(new Event(CHALLENGE_COMPLETED_EVENT));
      window.dispatchEvent(new Event(CHALLENGE_CREATED_EVENT));
      dispatchTabChange('buddy');
      vi.advanceTimersByTime(1000);
      await Promise.resolve();
    });
    expect(mockedApiFetch).toHaveBeenCalledTimes(1);
  });

  it('isLoading: refresh in-flight 期间 true, 完成后 false', async () => {
    let resolveFetch!: (v: unknown) => void;
    mockedApiFetch.mockReturnValue(
      new Promise(r => {
        resolveFetch = r;
      }),
    );
    const { result } = renderHook(() => useChallengeLimit());
    expect(result.current.isLoading).toBe(true);
    await act(async () => {
      resolveFetch(limitPayload());
      await Promise.resolve();
    });
    expect(result.current.isLoading).toBe(false);
    expect(result.current.limitData).toEqual(limitPayload());
  });
});
