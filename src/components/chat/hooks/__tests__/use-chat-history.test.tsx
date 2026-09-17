// @vitest-environment happy-dom

/**
 * useChatHistory tests (batch78-b — testgap v9 §十五.2 chat lifecycle hooks 补盲, 纯测试)
 *
 * 覆盖 (断言与现状对齐):
 *  - 分页加载: limit/mode 查询参数 + hasMore 透传 + messages 映射
 *    (reasoning 空串 → undefined, created_at → Date, mode 标记 normal/challenge)
 *  - 去重 (防重复拉历史): sendMessageLock 进行中 / skipNonce 消费一次复位 /
 *    boolean skip 消费一次复位 — 均不发请求
 *  - 错误降级不抛: ApiError 401/403 → sessionExpired 文案 (无 warn);
 *    其他 ApiError → err.message + logger.warn; 普通 Error → 默认文案
 *  - challengeContext skip effect: 置 skip 标记 + 清空消息;
 *    activeChallenge 有→undefined (P0-3) 只置 skip 不清消息
 *  - contextMessage effect: 带 challengeContext → buildChallengePrompt + 暂存 mirror
 *    消息 + setActiveChallenge + 刷新 skipNonce; 不带 → pendingContext 直存
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { useChatHistory } from '../use-chat-history';
import { ApiError } from '@/lib/api-client';

const apiFetchMock = vi.hoisted(() => vi.fn());
vi.mock('@/lib/api-client', async (importOriginal) => ({
  ...(await importOriginal()),
  apiFetch: apiFetchMock,
}));

const loggerWarnMock = vi.hoisted(() => vi.fn());
vi.mock('@/lib/logger', () => ({
  logger: { warn: loggerWarnMock, error: vi.fn(), info: vi.fn(), log: vi.fn() },
}));

const buildChallengePromptMock = vi.hoisted(() => vi.fn(() => 'CHALLENGE_PROMPT'));
vi.mock('../../parts/challenge-prompt', () => ({
  buildChallengePrompt: buildChallengePromptMock,
}));

const i18n = { t: (key: string, opts?: { defaultValue?: string }) => opts?.defaultValue ?? key };

type Hooks = Parameters<typeof useChatHistory>[0];

function makeParams(overrides: Partial<Hooks> = {}): Hooks {
  return {
    userId: 'user-a',
    isDemo: false,
    historyRetryNonce: 0,
    pageSize: 20,
    sendMessageLockRef: { current: { inProgress: false } },
    skipNextHistoryLoadRef: { current: false },
    skipNonceRef: { current: 0 },
    pendingContextRef: { current: null },
    pendingDisplayContentRef: { current: null },
    setMessagesSync: vi.fn(),
    setIsLoadingHistory: vi.fn(),
    setHasMore: vi.fn(),
    setHistoryLoadError: vi.fn(),
    setPendingContextReady: vi.fn(),
    setActiveChallenge: vi.fn(),
    onContextConsumed: vi.fn(),
    i18n,
    ...overrides,
  };
}

function serverMessage(id: string, role: 'user' | 'assistant', extra: Record<string, unknown> = {}) {
  return { id, role, content: `content-${id}`, reasoning: '', created_at: '2026-09-17T00:00:00Z', ...extra };
}

beforeEach(() => {
  apiFetchMock.mockReset();
  buildChallengePromptMock.mockClear();
  loggerWarnMock.mockClear();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('useChatHistory — 分页加载', () => {
  it('normal 模式: 请求带 limit/mode, hasMore 透传, messages 完整映射', async () => {
    apiFetchMock.mockResolvedValue({
      messages: [
        serverMessage('m1', 'user'),
        serverMessage('m2', 'assistant', { reasoning: '思考链' }),
      ],
      hasMore: true,
    });
    const setMessagesSync = vi.fn();
    const setHasMore = vi.fn();

    renderHook(() => useChatHistory(makeParams({ pageSize: 50, setMessagesSync, setHasMore })));

    await waitFor(() => expect(setMessagesSync).toHaveBeenCalled());

    const [url] = apiFetchMock.mock.calls[0];
    expect(url).toBe('/api/chat/history?limit=50&mode=normal');
    expect(setHasMore).toHaveBeenCalledWith(true);
    expect(setHasMore).toHaveBeenCalledTimes(1);
    expect(setMessagesSync).toHaveBeenCalledWith([
      expect.objectContaining({
        id: 'm1',
        role: 'user',
        content: 'content-m1',
        reasoning: undefined,
        mode: 'normal',
        timestamp: new Date('2026-09-17T00:00:00Z'),
      }),
      expect.objectContaining({ id: 'm2', role: 'assistant', reasoning: '思考链', mode: 'normal' }),
    ]);
  });

  it('challenge 模式: 有 activeChallenge 时 mode=challenge, 消息带 challenge 标记', async () => {
    apiFetchMock.mockResolvedValue({ messages: [serverMessage('c1', 'user')], hasMore: false });
    const setMessagesSync = vi.fn();

    renderHook(() =>
      useChatHistory(makeParams({ activeChallenge: { itemName: '手办', amount: 199 }, setMessagesSync }))
    );

    await waitFor(() => expect(setMessagesSync).toHaveBeenCalled());
    expect(apiFetchMock.mock.calls[0][0]).toBe('/api/chat/history?limit=20&mode=challenge');
    expect(setMessagesSync.mock.calls[0][0][0]).toMatchObject({ id: 'c1', mode: 'challenge' });
  });

  it('空历史: messages 缺失 → 清空消息, hasMore 缺省 false, 结束后关 loading', async () => {
    apiFetchMock.mockResolvedValue({});
    const setMessagesSync = vi.fn();
    const setHasMore = vi.fn();
    const setIsLoadingHistory = vi.fn();

    renderHook(() =>
      useChatHistory(makeParams({ setMessagesSync, setHasMore, setIsLoadingHistory }))
    );

    await waitFor(() => expect(setMessagesSync).toHaveBeenCalledWith([]));
    expect(setHasMore).toHaveBeenCalledWith(false);
    expect(setIsLoadingHistory).toHaveBeenLastCalledWith(false);
  });
});

describe('useChatHistory — 去重 (防重复拉历史)', () => {
  it('sendMessageLock 进行中: 不请求, 直接关 loading', () => {
    const setIsLoadingHistory = vi.fn();
    renderHook(() =>
      useChatHistory(
        makeParams({ sendMessageLockRef: { current: { inProgress: true } }, setIsLoadingHistory })
      )
    );
    expect(apiFetchMock).not.toHaveBeenCalled();
    expect(setIsLoadingHistory).toHaveBeenCalledWith(false);
  });

  it('skipNonce: 消费一次即复位, 本次不请求; 复位后重渲染才真正拉取', async () => {
    apiFetchMock.mockResolvedValue({ messages: [serverMessage('m1', 'user')] });
    const skipNonceRef = { current: 1758100000000 };
    const setIsLoadingHistory = vi.fn();

    const { rerender } = renderHook(
      ({ nonce }: { nonce: number }) =>
        useChatHistory(makeParams({ skipNonceRef, setIsLoadingHistory, historyRetryNonce: nonce })),
      { initialProps: { nonce: 0 } }
    );

    // 第一轮: nonce 被消费, 复位为 0, 不发请求
    expect(skipNonceRef.current).toBe(0);
    expect(apiFetchMock).not.toHaveBeenCalled();
    expect(setIsLoadingHistory).toHaveBeenCalledWith(false);

    // historyRetryNonce 变化触发 effect, 此时 skipNonce 已清零 → 正常拉取
    rerender({ nonce: 1 });
    await waitFor(() => expect(apiFetchMock).toHaveBeenCalledTimes(1));
  });

  it('boolean skip (resumeChallenge 场景): 消费一次复位, 不请求', () => {
    const skipNextHistoryLoadRef = { current: true };
    const setIsLoadingHistory = vi.fn();
    renderHook(() => useChatHistory(makeParams({ skipNextHistoryLoadRef, setIsLoadingHistory })));
    expect(skipNextHistoryLoadRef.current).toBe(false);
    expect(apiFetchMock).not.toHaveBeenCalled();
    expect(setIsLoadingHistory).toHaveBeenCalledWith(false);
  });

  it('demo 模式或无 userId: 不请求; 无 userId 时关 loading', () => {
    renderHook(() => useChatHistory(makeParams({ isDemo: true })));
    renderHook(() => useChatHistory(makeParams({ userId: undefined })));
    expect(apiFetchMock).not.toHaveBeenCalled();
  });
});

describe('useChatHistory — 错误降级不抛', () => {
  it('ApiError 401/403 → sessionExpired 文案, 不打 warn', async () => {
    apiFetchMock.mockRejectedValue(new ApiError(401, 'unauthorized'));
    const setHistoryLoadError = vi.fn();
    const setIsLoadingHistory = vi.fn();

    renderHook(() => useChatHistory(makeParams({ setHistoryLoadError, setIsLoadingHistory })));

    await waitFor(() => expect(setHistoryLoadError).toHaveBeenCalled());
    expect(setHistoryLoadError).toHaveBeenCalledWith('Session expired. Please sign in again.');
    expect(loggerWarnMock).not.toHaveBeenCalled();
    expect(setIsLoadingHistory).toHaveBeenLastCalledWith(false);
  });

  it('其他 ApiError → err.message + logger.warn, hook 不抛', async () => {
    apiFetchMock.mockRejectedValue(new ApiError(500, 'server exploded'));
    const setHistoryLoadError = vi.fn();

    renderHook(() => useChatHistory(makeParams({ setHistoryLoadError })));

    await waitFor(() => expect(setHistoryLoadError).toHaveBeenCalledWith('server exploded'));
    expect(loggerWarnMock).toHaveBeenCalledWith('[ChatTab] loadHistory error:', expect.any(ApiError));
  });

  it('普通 Error → 默认文案, 不抛', async () => {
    apiFetchMock.mockRejectedValue(new TypeError('network dead'));
    const setHistoryLoadError = vi.fn();

    renderHook(() => useChatHistory(makeParams({ setHistoryLoadError })));

    await waitFor(() => expect(setHistoryLoadError).toHaveBeenCalledWith('Failed to load chat history'));
    expect(loggerWarnMock).toHaveBeenCalledTimes(1);
  });
});

describe('useChatHistory — challengeContext skip effect', () => {
  it('challengeContext 到达: 置 skip + 清空消息; skip 被同轮 loadHistory 消费 → 零请求 (NEW-012)', () => {
    apiFetchMock.mockResolvedValue({ messages: [serverMessage('stale', 'user')] });
    const skipNextHistoryLoadRef = { current: false };
    const skipNonceRef = { current: 0 };
    const setMessagesSync = vi.fn();

    renderHook(() =>
      useChatHistory(
        makeParams({ challengeContext: { itemName: '盲盒', amount: 59 }, skipNextHistoryLoadRef, skipNonceRef, setMessagesSync })
      )
    );

    // skip effect 同步清空旧消息; nonce/flag 被 loadHistory effect 消费复位 → 本次不拉历史
    expect(setMessagesSync).toHaveBeenCalledWith([]);
    expect(apiFetchMock).not.toHaveBeenCalled();
    expect(skipNonceRef.current).toBe(0);
    expect(skipNextHistoryLoadRef.current).toBe(false);
  });

  it('activeChallenge 有→undefined (完成挑战): 只置 skip 不清消息, 重拉被 skip 消费 (P0-3)', async () => {
    apiFetchMock.mockResolvedValue({ messages: [serverMessage('m1', 'user')] });
    const skipNextHistoryLoadRef = { current: false };
    const setMessagesSync = vi.fn();

    const { rerender } = renderHook(
      ({ active }: { active: { itemName: string; amount: number } | undefined }) =>
        useChatHistory(makeParams({ activeChallenge: active, skipNextHistoryLoadRef, setMessagesSync })),
      { initialProps: { active: { itemName: '手办', amount: 199 } as { itemName: string; amount: number } | undefined } }
    );

    // 挂载: 无 skip → 正常拉一次 challenge 历史
    await waitFor(() => expect(apiFetchMock).toHaveBeenCalledTimes(1));
    expect(setMessagesSync).toHaveBeenCalledTimes(1);

    rerender({ active: undefined });
    // 完成挑战: skip 置位后立即被消费 → 不再拉第二次 (当前 chat 消息不被覆盖)
    expect(apiFetchMock).toHaveBeenCalledTimes(1);
    expect(setMessagesSync).toHaveBeenCalledTimes(1);
    expect(skipNextHistoryLoadRef.current).toBe(false);
  });
});

describe('useChatHistory — contextMessage effect', () => {
  it('带 challengeContext: buildChallengePrompt 写入 pendingContext, 暂存 mirror 消息, setActiveChallenge + 刷新 skip', () => {
    const pendingContextRef = { current: null as string | null };
    const pendingDisplayContentRef = { current: null as string | null };
    const skipNextHistoryLoadRef = { current: false };
    const skipNonceRef = { current: 0 };
    const setActiveChallenge = vi.fn();
    const setPendingContextReady = vi.fn();
    const onContextConsumed = vi.fn();

    renderHook(() =>
      useChatHistory(
        makeParams({
          contextMessage: '接受挑战: 手办 199 元',
          challengeContext: { itemName: '手办', amount: 199 },
          hourlyRate: 40,
          pendingContextRef,
          pendingDisplayContentRef,
          skipNextHistoryLoadRef,
          skipNonceRef,
          setActiveChallenge,
          setPendingContextReady,
          onContextConsumed,
        })
      )
    );

    expect(buildChallengePromptMock).toHaveBeenCalledWith('手办', 199, 40);
    expect(pendingContextRef.current).toBe('CHALLENGE_PROMPT');
    expect(pendingDisplayContentRef.current).toBe('接受挑战: 手办 199 元');
    expect(skipNextHistoryLoadRef.current).toBe(true);
    expect(skipNonceRef.current).toBeGreaterThan(0);
    expect(setActiveChallenge).toHaveBeenCalledWith({ itemName: '手办', amount: 199 });
    expect(setPendingContextReady).toHaveBeenCalledWith(true);
    expect(onContextConsumed).toHaveBeenCalledTimes(1);
  });

  it('不带 challengeContext: contextMessage 直存 pendingContext, 不暂存 mirror 消息', () => {
    const pendingContextRef = { current: null as string | null };
    const pendingDisplayContentRef = { current: null as string | null };

    renderHook(() =>
      useChatHistory(
        makeParams({
          contextMessage: '帮我看看这笔值不值',
          pendingContextRef,
          pendingDisplayContentRef,
        })
      )
    );

    expect(buildChallengePromptMock).not.toHaveBeenCalled();
    expect(pendingContextRef.current).toBe('帮我看看这笔值不值');
    expect(pendingDisplayContentRef.current).toBeNull();
  });
});
