/**
 * useChallengeFlow tests (batch84-b — testgap v9 长尾补测第四批, buddy 兑换/挑战流 hooks)
 *
 * 覆盖 (断言与现状对齐):
 *  - mount 预查: 非 demo+userId 才 GET /api/challenge/active; demo/userId 缺失零预查
 *  - startChallenge demo: 零 API, demo- 前缀临时 challengeId, itemName trim
 *  - startChallenge 成功: POST create (trimmed body) → 导航带 challengeId + 派发
 *    'symy:challenge-created' + 写缓存 (5s 内 See it 直接命中缓存零新请求)
 *  - startChallenge 429: info toast limitReached + refreshChallengeLimit + 不导航 (限流契约)
 *  - startChallenge 无 challengeId / 网络错误: 降级导航 legacy (无 challengeId)
 *  - handleSeeItClick 缓存命中: 有挑战 → resume 导航 + alreadyActive toast;
 *    同一 challengeId 二次点击 message 去重 (只导航不发消息)
 *  - 缓存命中无挑战: 次数用尽 → 只 toast limitReached, 不开兑换框 (现状: 兑换框仅过期路径);
 *    可挑战 → pulse + modal
 *  - 缓存过期 + fetch 无挑战 + 次数用尽 → openRedeemDialog('see_it') (兑换链路主钉子);
 *    可挑战 → modal; fetch 有挑战 → resume 导航
 *  - 缓存过期 + fetch 失败 → toast challengeCheckFailed, isCheckingChallenge 收口
 *  - prefetch in-flight 时点击: await 同一 promise 不发新请求
 *  - 'symy:open-challenge-modal' 事件 → modal 打开; handleClose 关闭
 *  - userId 切换 → 缓存清空, 再点击重新 fetch
 */
// @vitest-environment happy-dom

import { cleanup, renderHook, act } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/api-client', () => {
  class ApiError extends Error {
    constructor(public status: number, message?: string) {
      super(message ?? `API error ${status}`);
      this.name = 'ApiError';
    }
  }
  return { ApiError, apiFetch: vi.fn() };
});
vi.mock('@/lib/logger', () => ({ logger: { info: vi.fn(), warn: vi.fn() } }));
vi.mock('@/i18n/provider', () => ({
  useI18n: () => ({ t: (key: string, _params?: Record<string, unknown>) => key }),
}));
vi.mock('@/hooks/use-challenge-limit', () => ({ useChallengeLimit: vi.fn() }));

import { apiFetch, ApiError } from '@/lib/api-client';
import { useChallengeLimit } from '@/hooks/use-challenge-limit';
import { useChallengeFlow } from '../use-challenge-flow';

const mockedApiFetch = vi.mocked(apiFetch);
const mockUseChallengeLimit = vi.mocked(useChallengeLimit);

type NavContext = NonNullable<Parameters<FlowProps['onNavigateChat']>[0]>;

/** onNavigateChat 第 i 次调用参数 — NavigateChat 的 context 为可选参数, 此处收窄非空 */
function navCall(props: FlowProps, i = 0): NavContext {
  const ctx = vi.mocked(props.onNavigateChat).mock.calls[i]?.[0];
  if (!ctx) throw new Error(`no onNavigateChat call at index ${i}`);
  return ctx;
}

function deferred<T>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

type FlowProps = Parameters<typeof useChallengeFlow>[0];

function setup(over: Partial<FlowProps> = {}) {
  // RQ provider 包装仅因 useI18n 之外 hook 链无依赖——此 hook 不需要; 保留纯 renderHook
  const props: FlowProps = {
    isDemo: false,
    userId: 'u1',
    onNavigateChat: vi.fn<FlowProps['onNavigateChat']>(),
    onToast: vi.fn<NonNullable<FlowProps['onToast']>>(),
    pulseTimerRefs: { current: [] as ReturnType<typeof setTimeout>[] },
    openRedeemDialog: vi.fn<FlowProps['openRedeemDialog']>(),
    ...over,
  };
  const utils = renderHook(() => useChallengeFlow(props));
  return { props, ...utils };
}

describe('useChallengeFlow', () => {
  let canStart: boolean;
  let refreshLimit: ReturnType<typeof vi.fn<() => Promise<void>>>;
  let createdEvents: Event[];
  const recordCreated = (e: Event) => createdEvents.push(e);

  beforeEach(() => {
    mockedApiFetch.mockReset();
    // 默认实现: mount 预查 /api/challenge/active 返回无活跃挑战 (mockReset 后裸 fn 返回
    // undefined, prefetch 的 .then 会同步炸掉渲染 — 用例内的 Once 在 renderHook 后设置,
    // 预查已消费此默认实现, 不会串味)
    mockedApiFetch.mockResolvedValue({});
    canStart = true;
    refreshLimit = vi.fn<() => Promise<void>>();
    createdEvents = [];
    window.addEventListener('symy:challenge-created', recordCreated);
    mockUseChallengeLimit.mockImplementation(() => ({
      limitData: { count: 0, remaining: canStart ? 3 : 0, limit: 5, isPremium: false },
      isLoading: false,
      canStartChallenge: () => canStart,
      refresh: refreshLimit,
    }));
  });

  afterEach(() => {
    window.removeEventListener('symy:challenge-created', recordCreated);
    cleanup();
  });

  it('mount 预查: 非 demo + userId → GET /api/challenge/active; demo 或 userId 缺失零预查', async () => {
    mockedApiFetch.mockResolvedValue({});
    const mounted = setup();
    await act(async () => {});
    expect(mockedApiFetch).toHaveBeenCalledTimes(1);
    expect(mockedApiFetch).toHaveBeenCalledWith('/api/challenge/active');
    mounted.unmount();

    mockedApiFetch.mockClear();
    const demo = setup({ isDemo: true });
    await act(async () => {});
    expect(mockedApiFetch).not.toHaveBeenCalled();
    demo.unmount();

    const anonymous = setup({ userId: undefined });
    await act(async () => {});
    expect(mockedApiFetch).not.toHaveBeenCalled();
    anonymous.unmount();
  });

  it('startChallenge demo: 零 API, demo- 前缀 challengeId, itemName trim', async () => {
    const { result, props } = setup({ isDemo: true });
    await act(async () => {
      await result.current.startChallenge('  玻璃杯  ', 25);
    });
    expect(mockedApiFetch).not.toHaveBeenCalled();
    expect(props.onNavigateChat).toHaveBeenCalledTimes(1);
    const arg = navCall(props, 0);
    expect(arg.type).toBe('challenge');
    expect(arg.challengeContext).toMatchObject({ itemName: '玻璃杯', amount: 25 });
    expect(arg.challengeContext!.challengeId).toMatch(/^demo-/);
  });

  it('startChallenge 成功: POST create (trimmed body) → 导航带 challengeId + 派发 created 事件 + 写缓存', async () => {
    const { result, props } = setup();
    await act(async () => {}); // 先 flush mount 预查, 之后 mock 都归 startChallenge
    mockedApiFetch.mockResolvedValueOnce({ challengeId: 'ch-1' });

    await act(async () => {
      await result.current.startChallenge('  玻璃杯  ', 25);
    });
    expect(mockedApiFetch).toHaveBeenLastCalledWith('/api/challenge/create', {
      method: 'POST',
      body: { itemName: '玻璃杯', amount: 25 },
    });
    const arg = navCall(props, 0);
    expect(arg.challengeContext).toMatchObject({ itemName: '玻璃杯', amount: 25, challengeId: 'ch-1' });
    expect(createdEvents).toHaveLength(1);

    // 缓存写入: 紧接 See it 点击直接命中缓存 → 无新 active 请求, resume 导航
    canStart = true;
    await act(async () => {
      await result.current.handleSeeItClick();
    });
    expect(mockedApiFetch).toHaveBeenCalledTimes(2); // create + 0 次 active
    const resume = navCall(props, 1);
    expect(resume.challengeContext).toMatchObject({ challengeId: 'ch-1', itemName: '玻璃杯', amount: 25 });
  });

  it('startChallenge 429: info toast limitReached + refreshChallengeLimit + 不导航 (限流契约)', async () => {
    const { result, props } = setup();
    await act(async () => {});
    mockedApiFetch.mockRejectedValueOnce(new ApiError(429, 'daily limit'));

    await act(async () => {
      await result.current.startChallenge('耳机', 299);
    });
    expect(props.onToast).toHaveBeenCalledWith('buddy.challengeLimitReached', 'info');
    expect(refreshLimit).toHaveBeenCalledTimes(1);
    expect(props.onNavigateChat).not.toHaveBeenCalled();
  });

  it('startChallenge 响应无 challengeId → 降级导航 legacy (challengeContext 无 challengeId)', async () => {
    const { result, props } = setup();
    await act(async () => {});
    mockedApiFetch.mockResolvedValueOnce({ error: 'server said no' });

    await act(async () => {
      await result.current.startChallenge('耳机', 299);
    });
    const arg = navCall(props, 0);
    expect(arg.type).toBe('challenge');
    expect(arg.challengeContext).toEqual({ itemName: '耳机', amount: 299 });
  });

  it('startChallenge 普通网络错误 → 降级导航 legacy, 不抛出', async () => {
    const { result, props } = setup();
    await act(async () => {});
    mockedApiFetch.mockRejectedValueOnce(new TypeError('fetch failed'));

    await act(async () => {
      await result.current.startChallenge('耳机', 299);
    });
    const arg = navCall(props, 0);
    expect(arg.challengeContext).toEqual({ itemName: '耳机', amount: 299 });
    expect(props.onToast).not.toHaveBeenCalled();
  });

  it('See it (demo): 跳过 active 检查, pulse + modal 直开, pulseTimerRefs 收录 1 个 timer', async () => {
    const { result, props } = setup({ isDemo: true });
    await act(async () => {
      await result.current.handleSeeItClick();
    });
    expect(mockedApiFetch).not.toHaveBeenCalled();
    expect(result.current.showChallengeModal).toBe(true);
    expect(result.current.challengePulse).toBe(true); // 点击后 pulse 激活, 400ms timer 已入 refs
    expect(props.pulseTimerRefs.current).toHaveLength(1);
  });

  it('See it 缓存命中 + 有活跃挑战: resume 导航 + alreadyActive toast; 二次点击 message 去重', async () => {
    mockedApiFetch.mockResolvedValue({ challenge: { id: 'ch-9', item_name: '耳机', amount: 299 } });
    const { result, props } = setup();
    await act(async () => {});

    await act(async () => {
      await result.current.handleSeeItClick();
    });
    expect(mockedApiFetch).toHaveBeenCalledTimes(1); // 缓存命中零新请求
    const first = navCall(props, 0);
    expect(first.message).toBe('buddy.challengeResumeMessage');
    expect(first.challengeContext).toEqual({ itemName: '耳机', amount: 299, challengeId: 'ch-9' });
    expect(props.onToast).toHaveBeenCalledWith('buddy.challengeAlreadyActive', 'info');

    await act(async () => {
      await result.current.handleSeeItClick();
    });
    const second = navCall(props, 1);
    expect(second.message).toBeUndefined();
    expect(second.challengeContext).toMatchObject({ challengeId: 'ch-9' });
    expect(mockedApiFetch).toHaveBeenCalledTimes(1);
  });

  it('See it 缓存命中 + 无挑战 + 次数用尽: 只 toast limitReached, 不开 modal 不开兑换框 (现状钉子)', async () => {
    canStart = false;
    const { result, props } = setup(); // 默认 prefetch {} → null 缓存 (ts=now, 5s 内有效)
    await act(async () => {});

    await act(async () => {
      await result.current.handleSeeItClick();
    });
    expect(props.onToast).toHaveBeenCalledWith('buddy.challengeLimitReached', 'info');
    expect(result.current.showChallengeModal).toBe(false);
    expect(props.openRedeemDialog).not.toHaveBeenCalled();
  });

  it('See it 缓存命中 + 无挑战 + 可挑战: pulse + modal 打开', async () => {
    const { result, props } = setup();
    await act(async () => {});

    await act(async () => {
      await result.current.handleSeeItClick();
    });
    expect(result.current.showChallengeModal).toBe(true);
    expect(props.pulseTimerRefs.current).toHaveLength(1);
    expect(props.openRedeemDialog).not.toHaveBeenCalled();
  });

  it('See it 缓存过期 + fetch 无挑战 + 次数用尽 → openRedeemDialog("see_it") 兑换链路主钉子', async () => {
    // prefetch 失败 → 缓存 ts=0 (必然过期); 随后点击时 fetch 成功但无活跃挑战
    mockedApiFetch.mockRejectedValueOnce(new Error('prefetch down')).mockResolvedValue({});
    canStart = false;
    const { result, props } = setup();
    await act(async () => {});

    await act(async () => {
      await result.current.handleSeeItClick();
    });
    expect(mockedApiFetch).toHaveBeenCalledTimes(2);
    expect(props.openRedeemDialog).toHaveBeenCalledWith('see_it');
    expect(result.current.showChallengeModal).toBe(false);
    expect(result.current.isCheckingChallenge).toBe(false);
  });

  it('See it 缓存过期 + fetch 无挑战 + 可挑战 → modal 打开', async () => {
    mockedApiFetch.mockRejectedValueOnce(new Error('prefetch down')).mockResolvedValue({});
    const { result, props } = setup();
    await act(async () => {});

    await act(async () => {
      await result.current.handleSeeItClick();
    });
    expect(result.current.showChallengeModal).toBe(true);
    expect(props.openRedeemDialog).not.toHaveBeenCalled();
    expect(result.current.isCheckingChallenge).toBe(false);
  });

  it('See it 缓存过期 + fetch 有活跃挑战 → resume 导航, 不触达兑换框', async () => {
    mockedApiFetch
      .mockRejectedValueOnce(new Error('prefetch down'))
      .mockResolvedValue({ challenge: { id: 'ch-7', item_name: '跑鞋', amount: 400 } });
    canStart = false;
    const { result, props } = setup();
    await act(async () => {});

    await act(async () => {
      await result.current.handleSeeItClick();
    });
    const arg = navCall(props, 0);
    expect(arg.challengeContext).toEqual({ itemName: '跑鞋', amount: 400, challengeId: 'ch-7' });
    expect(props.openRedeemDialog).not.toHaveBeenCalled();
    expect(result.current.showChallengeModal).toBe(false);
  });

  it('See it 缓存过期 + fetch 失败 → toast challengeCheckFailed, isCheckingChallenge 收口, modal 不开', async () => {
    mockedApiFetch.mockRejectedValue(new Error('down'));
    const { result, props } = setup();
    await act(async () => {});

    await act(async () => {
      await result.current.handleSeeItClick();
    });
    expect(props.onToast).toHaveBeenCalledWith('buddy.challengeCheckFailed', 'info');
    expect(result.current.isCheckingChallenge).toBe(false);
    expect(result.current.showChallengeModal).toBe(false);
  });

  it('See it prefetch in-flight 时点击: await 同一 promise, 不发新请求', async () => {
    const d = deferred<{ challenge?: { id: string; item_name: string; amount: number } | null }>();
    mockedApiFetch.mockReturnValueOnce(d.promise as never); // mount 预查挂起
    const { result, props } = setup();
    // 不 flush — 预查仍 in-flight; 缓存 ref 仍为初始 {data:null, ts:0} → 必然过期路径

    let click!: Promise<void>;
    act(() => {
      click = result.current.handleSeeItClick();
    });
    expect(mockedApiFetch).toHaveBeenCalledTimes(1); // 点击未发新请求

    await act(async () => {
      d.resolve({});
      await click; // 复用预查 promise → 无活跃挑战 → 可挑战 → modal
    });
    expect(result.current.showChallengeModal).toBe(true);
    expect(props.openRedeemDialog).not.toHaveBeenCalled();
  });

  it("'symy:open-challenge-modal' 事件 → modal 打开; handleCloseChallengeModal 关闭", () => {
    const { result } = setup();
    expect(result.current.showChallengeModal).toBe(false);
    act(() => {
      window.dispatchEvent(new CustomEvent('symy:open-challenge-modal'));
    });
    expect(result.current.showChallengeModal).toBe(true);
    act(() => {
      result.current.handleCloseChallengeModal();
    });
    expect(result.current.showChallengeModal).toBe(false);
  });

  it('userId 切换 → 缓存清空, 再点击重新 fetch active', async () => {
    mockedApiFetch.mockResolvedValue({ challenge: { id: 'ch-9', item_name: '耳机', amount: 299 } });
    const { result, props, rerender } = setup();
    await act(async () => {});
    expect(mockedApiFetch).toHaveBeenCalledTimes(1);

    props.userId = 'u2';
    rerender();
    await act(async () => {});

    await act(async () => {
      await result.current.handleSeeItClick();
    });
    // 缓存已被用户切换清空 (ts=0) → 过期路径重新 fetch
    expect(mockedApiFetch).toHaveBeenCalledTimes(2);
    const arg = navCall(props, 0);
    expect(arg.challengeContext).toMatchObject({ challengeId: 'ch-9' });
    expect(props.openRedeemDialog).not.toHaveBeenCalled();
  });
});
