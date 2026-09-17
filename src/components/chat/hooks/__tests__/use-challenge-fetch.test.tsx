// @vitest-environment happy-dom

/**
 * useChallengeFetch tests (batch78-b — testgap v9 §十五.2 chat lifecycle hooks 补盲, 纯测试)
 *
 * 覆盖 (断言与现状对齐):
 *  - 成功: /api/challenge/active → setActiveChallenge (amount 字符串 → Number);
 *    /api/challenge/expired → setExpiredChallenge; 响应无 challenge → 不误设
 *  - 失败: ApiError 401/403 静默 (auth provider 兜底, 不打 warn);
 *    其他错误 → logger.warn 且不向 React 抛
 *  - 竞态: fetch 在途时 user 切换 (a→b) 触发 effect 重跑, 旧响应被 cancelled
 *    屏蔽 — 旧 challenge 不覆盖新请求的结果
 *  - 守卫: isDemo / 未登录 / authLoading / 已有 activeChallenge / 刚完成挑战
 *    (justCompletedChallengeRef 消费一次) 均不请求
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { useChallengeFetch } from '../use-challenge-fetch';
import { ApiError } from '@/lib/api-client';
import type { User } from '@supabase/supabase-js';

const apiFetchMock = vi.hoisted(() => vi.fn());
vi.mock('@/lib/api-client', async (importOriginal) => ({
  ...(await importOriginal()),
  apiFetch: apiFetchMock,
}));

const loggerWarnMock = vi.hoisted(() => vi.fn());
vi.mock('@/lib/logger', () => ({
  logger: { warn: loggerWarnMock, error: vi.fn(), info: vi.fn(), log: vi.fn() },
}));

function makeUser(id: string): User {
  return { id, aud: 'authenticated', role: 'authenticated', email: `${id}@test.dev` } as unknown as User;
}

interface Deferred<T> {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (err: unknown) => void;
}

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  let reject!: (err: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

type Args = Parameters<typeof useChallengeFetch>[0];

function makeArgs(overrides: Partial<Args> = {}) {
  return {
    user: makeUser('user-a') as User | null,
    isDemo: false,
    authLoading: false,
    activeChallenge: undefined as Args['activeChallenge'],
    justCompletedChallengeRef: { current: false },
    setActiveChallenge: vi.fn(),
    setExpiredChallenge: vi.fn(),
    ...overrides,
  };
}

beforeEach(() => {
  apiFetchMock.mockReset();
  // 默认: 两个端点都返回无 challenge (各测试按需覆盖)
  apiFetchMock.mockImplementation(() => Promise.resolve({}));
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('useChallengeFetch — 成功', () => {
  it('active 端点返回挑战 → setActiveChallenge, amount 字符串转数值', async () => {
    const setActiveChallenge = vi.fn();
    apiFetchMock.mockImplementation((url: string) =>
      url.includes('/api/challenge/active')
        ? Promise.resolve({ challenge: { id: 'ch-1', item_name: '手办', amount: '199.5' } })
        : Promise.resolve({})
    );

    renderHook(() => useChallengeFetch(makeArgs({ setActiveChallenge })));

    await waitFor(() => expect(setActiveChallenge).toHaveBeenCalled());
    expect(setActiveChallenge).toHaveBeenCalledWith({
      itemName: '手办',
      amount: 199.5,
      challengeId: 'ch-1',
    });
    expect(apiFetchMock.mock.calls.some(([url]) => String(url).includes('/api/challenge/active'))).toBe(true);
  });

  it('expired 端点返回挑战 → setExpiredChallenge', async () => {
    const setExpiredChallenge = vi.fn();
    apiFetchMock.mockImplementation((url: string) =>
      url.includes('/api/challenge/expired')
        ? Promise.resolve({ challenge: { id: 'ch-old', item_name: '奶茶', amount: 18 } })
        : Promise.resolve({})
    );

    renderHook(() => useChallengeFetch(makeArgs({ setExpiredChallenge })));

    await waitFor(() => expect(setExpiredChallenge).toHaveBeenCalled());
    expect(setExpiredChallenge).toHaveBeenCalledWith({
      challengeId: 'ch-old',
      itemName: '奶茶',
      amount: 18,
    });
  });

  it('两个端点都无 challenge → 不设任何 state', async () => {
    const setActiveChallenge = vi.fn();
    const setExpiredChallenge = vi.fn();

    renderHook(() => useChallengeFetch(makeArgs({ setActiveChallenge, setExpiredChallenge })));

    await waitFor(() => expect(apiFetchMock).toHaveBeenCalledTimes(2));
    expect(setActiveChallenge).not.toHaveBeenCalled();
    expect(setExpiredChallenge).not.toHaveBeenCalled();
  });
});

describe('useChallengeFetch — 失败降级', () => {
  it('ApiError 401/403 → 静默, 不打 warn, 不抛', async () => {
    apiFetchMock.mockImplementation((url: string) =>
      url.includes('/api/challenge/active')
        ? Promise.reject(new ApiError(401, 'session expired'))
        : Promise.reject(new ApiError(403, 'forbidden'))
    );

    renderHook(() => useChallengeFetch(makeArgs()));

    // 两个 effect 的 catch 都走静默分支
    await new Promise((r) => setTimeout(r, 20));
    expect(loggerWarnMock).not.toHaveBeenCalled();
  });

  it('其他错误 → logger.warn 且不向 React 抛', async () => {
    apiFetchMock.mockImplementation((url: string) =>
      url.includes('/api/challenge/active')
        ? Promise.reject(new ApiError(500, 'boom'))
        : Promise.reject(new TypeError('network dead'))
    );

    renderHook(() => useChallengeFetch(makeArgs()));

    await waitFor(() => expect(loggerWarnMock).toHaveBeenCalledTimes(2));
    expect(loggerWarnMock).toHaveBeenCalledWith('[ChatTab] Failed to fetch active challenge:', expect.any(ApiError));
    expect(loggerWarnMock).toHaveBeenCalledWith('[ChatTab] Failed to fetch expired challenge:', expect.any(TypeError));
  });
});

describe('useChallengeFetch — 竞态 (旧响应不覆盖新请求)', () => {
  it('user a→b 快速切换: a 的在途响应被 cancelled 屏蔽, 只有 b 的结果落地', async () => {
    const setActiveChallenge = vi.fn();
    const activeA = deferred<{ challenge?: { id: string; item_name: string; amount: number | string } }>();
    const activeB = deferred<{ challenge?: { id: string; item_name: string; amount: number | string } }>();
    let activeCalls = 0;
    apiFetchMock.mockImplementation((url: string) => {
      if (String(url).includes('/api/challenge/active')) {
        activeCalls += 1;
        return activeCalls === 1 ? activeA.promise : activeB.promise;
      }
      return Promise.resolve({});
    });

    const { rerender } = renderHook(
      ({ uid }: { uid: string }) => useChallengeFetch(makeArgs({ user: makeUser(uid), setActiveChallenge })),
      { initialProps: { uid: 'user-a' } }
    );
    await waitFor(() => expect(activeCalls).toBe(1));
    rerender({ uid: 'user-b' });
    await waitFor(() => expect(activeCalls).toBe(2));

    // 先落旧响应 a (challenge 属于 a) → cancelled, 不落地
    activeA.resolve({ challenge: { id: 'ch-a', item_name: 'A 的手办', amount: 100 } });
    await new Promise((r) => setTimeout(r, 20));
    expect(setActiveChallenge).not.toHaveBeenCalled();

    // 再落新响应 b → 落地
    activeB.resolve({ challenge: { id: 'ch-b', item_name: 'B 的手办', amount: 88 } });
    await waitFor(() => expect(setActiveChallenge).toHaveBeenCalledTimes(1));
    expect(setActiveChallenge).toHaveBeenCalledWith({
      itemName: 'B 的手办',
      amount: 88,
      challengeId: 'ch-b',
    });
  });
});

describe('useChallengeFetch — 守卫分支 (零请求)', () => {
  it('isDemo / 未登录 / authLoading / 已有 activeChallenge 均不发请求', () => {
    const activeChallenge = { itemName: '手办', amount: 199, challengeId: 'ch-1' } as Args['activeChallenge'];

    renderHook(() => useChallengeFetch(makeArgs({ isDemo: true })));
    renderHook(() => useChallengeFetch(makeArgs({ user: null })));
    renderHook(() => useChallengeFetch(makeArgs({ authLoading: true })));
    renderHook(() => useChallengeFetch(makeArgs({ activeChallenge })));

    expect(apiFetchMock).not.toHaveBeenCalled();
  });

  it('justCompletedChallengeRef: 消费一次并跳过 active fetch (防完成挑战后拉回旧数据)', () => {
    const justCompletedChallengeRef = { current: true };
    const setActiveChallenge = vi.fn();

    renderHook(() => useChallengeFetch(makeArgs({ justCompletedChallengeRef, setActiveChallenge })));

    expect(justCompletedChallengeRef.current).toBe(false);
    // 只守卫 active 端点; expired 端点无此守卫, 照常请求 (现状对齐)
    expect(apiFetchMock.mock.calls.some(([url]) => String(url).includes('/api/challenge/active'))).toBe(false);
    expect(setActiveChallenge).not.toHaveBeenCalled();
  });
});
