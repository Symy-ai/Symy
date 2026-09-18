// @vitest-environment happy-dom

/**
 * useChatActions tests (batch79-c — testgap v3 §三 Top20 #3 全仓最大无测 hook, 纯测试)
 *
 * 覆盖 (断言与现状对齐, 真实 consumeAIStream + SSE ReadableStream):
 *  - 非 200 → ApiError → isError 气泡 + onRetry; 错误气泡不落库 (BUG-116); finally 释放锁;
 *    onRetry 端到端: 删错误气泡 → 经 ref 重发 (retryAiResponseImpl) → 恰 1 条新 assistant,
 *    user 消息不复制 (NEW-002), 二次请求 body 恰 1 条 user 上下文
 *  - SSE error 事件 → isError + onRetry; sseErrorDisplayed 防止 finally flush 用部分回复
 *    覆盖错误文案; 不 saveMessage
 *  - 流关闭零 token (idleTimeout) → streamInterrupted 兜底文案保留 (batch80-a 修复) +
 *    isError + onRetry, 不落库
 *  - TECH-DEBT-D throttle: 同批多 token 只调度一次 rAF, 流结束 finally flush 最终全文
 *    (丢尾检查 — setMessagesSync 恰 3 次: user 占位 + assistant 占位 + 最终 flush)
 *  - 非 JSON 路径 toolCalls amount 入账分档: 有数字 amount → WithAmount 通知;
 *    缺失/0 → plain 通知不报金额; 非数字字符串/NaN/Infinity → 数值清洗回落 plain
 *    (batch80-b 修复 b79c-defects #2, 5 分档全覆盖);
 *    complete_challenge: activeChallenge.amount > 0 → onChallengeCompleted (计分/存款对话框);
 *    amount 0 → 不触发, 仅清 banner
 *  - demo 不双写: 非首条 → 仅 canned 路径 (零 fetch, 1.5s 后恰 1 条 canned 回复, 锁释放);
 *    首条挑战 → 仅真实 /api/chat/anonymous (无 canned timer), demoMsgCount 置 1
 */

import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { ChatMessage } from '@/types/chat-message';
import { useChatActions } from '../use-chat-actions';
import type { UseChatActionsParams } from '../use-chat-actions-types';

vi.mock('@/lib/posthog', () => ({
  symyEvents: { chatMessageSent: vi.fn() },
}));

const t = vi.fn(
  (key: string, opts?: { defaultValue?: string } & Record<string, unknown>) => opts?.defaultValue ?? key
);

function sseResponse(events: unknown[]): Response {
  const encoder = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const event of events) controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n`));
      controller.enqueue(encoder.encode('data: [DONE]\n'));
      controller.close();
    },
  });
  return new Response(body, { status: 200, headers: { 'Content-Type': 'text/event-stream' } });
}

function jsonResponse(body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } });
}

const CH = { itemName: 'Air Fryer', amount: 89, challengeId: 'ch-1' };

function makeHarness(overrides: Partial<UseChatActionsParams> = {}) {
  // setMessagesSync 驱动真实 state 归约器 + messagesRef 镜像 (近似 chat-tab 的 ref 同步)
  const holder = { list: [] as ChatMessage[] };
  const messagesRef = { current: [] as ChatMessage[] };
  const setMessagesSync = vi.fn(
    (updater: ChatMessage[] | ((prev: ChatMessage[]) => ChatMessage[])) => {
      holder.list = typeof updater === 'function' ? updater(holder.list) : updater;
      messagesRef.current = holder.list.map((m) => ({ ...m }));
    }
  );
  let idSeq = 0;
  const params: UseChatActionsParams = {
    state: {
      activeChallenge: undefined,
      isLoadingHistory: false,
      isDemo: false,
      impulseContext: undefined,
      locale: 'en',
    },
    refs: {
      sendMessageLockRef: { current: { inProgress: false, lastContent: '', lastTime: 0 } },
      abortRef: { current: null },
      messagesRef,
      activeChallengeRef: { current: undefined },
      impulseContextRef: { current: undefined },
      localeRef: { current: 'en' },
      justCompletedChallengeRef: { current: false },
      demoReplyTimerRef: { current: null },
      demoAuthTimerRef: { current: null },
      demoMsgCountRef: { current: 0 },
      buddyStateRefreshTimerRef: { current: null },
      skipNextHistoryLoadRef: { current: false },
      skipNonceRef: { current: 0 },
      justBoughtChallengeRef: { current: false },
    },
    setters: {
      setMessagesSync,
      setIsLoading: vi.fn(),
      setInput: vi.fn(),
      setActiveChallenge: vi.fn(),
    },
    callbacks: {
      nextId: vi.fn((prefix: string) => `${prefix}-${++idSeq}`),
      saveMessage: vi.fn<(message: ChatMessage) => void>(),
      handleMCPResults: vi.fn(),
      addMcpNotification: vi.fn(),
      onBuddyStateRefresh: vi.fn(),
      onAuthPrompt: vi.fn(),
      onToast: vi.fn(),
      onChallengeCompleted: vi.fn(),
      onChallengeBought: vi.fn(),
    },
    i18n: { t: t as unknown as UseChatActionsParams['i18n']['t'] },
    demo: { DEMO_FREE_MESSAGES: 5 },
    ...overrides,
  };
  const { result } = renderHook(() => useChatActions(params));
  return { params, holder, result, saveMessage: params.callbacks.saveMessage as ReturnType<typeof vi.fn> };
}

function fetchBody(fetchMock: ReturnType<typeof vi.fn>, call = 0) {
  return JSON.parse(fetchMock.mock.calls[call][1].body as string);
}

describe('useChatActions — 非 200 / 流中断 → isError + onRetry 不重复', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    t.mockClear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('POST 500 → isError 气泡不落库, finally 释放锁; onRetry 端到端重发: user 消息不复制, 二次请求恰 1 条 user 上下文', async () => {
    const { params, holder, result, saveMessage } = makeHarness();
    fetchMock.mockResolvedValueOnce(new Response('boom', { status: 500 }));
    fetchMock.mockResolvedValueOnce(sseResponse([{ type: 'token', content: 'Hello again' }]));

    await act(async () => {
      await result.current.sendMessage('I want the air fryer');
    });

    // 首次请求: 真实端点 + SSE
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe('/api/chat');
    expect(fetchBody(fetchMock).stream).toBe(true);

    // 错误气泡: isError + onRetry; 错误消息不落库 (BUG-116) — 恰只有 userMsg 落库; 锁已释放
    const errMsg = holder.list.find((m) => m.isError);
    expect(errMsg).toBeDefined();
    expect(errMsg).toMatchObject({
      role: 'assistant',
      content: 'AI is temporarily unavailable. This might be due to high traffic or a timeout. Please try again.',
    });
    expect(typeof errMsg!.onRetry).toBe('function');
    expect(saveMessage).toHaveBeenCalledTimes(1);
    expect(saveMessage.mock.calls[0][0].role).toBe('user');
    expect(params.refs.sendMessageLockRef.current.inProgress).toBe(false);
    expect(params.setters.setIsLoading).toHaveBeenLastCalledWith(false);
    expect(holder.list.filter((m) => m.role === 'user')).toHaveLength(1);

    // onRetry: 删错误气泡 → setTimeout(0) 经 ref 走 retryAiResponseImpl (不新建 user 消息)
    await act(async () => {
      errMsg!.onRetry!();
      await new Promise((r) => setTimeout(r, 30));
    });
    await vi.waitFor(() => {
      // 落库恰 2 条: 重发前 userMsg + 重试的 finalMsg assistant — 错误气泡始终不落库
      expect(saveMessage).toHaveBeenCalledTimes(2);
    });

    // 二次请求: 恰 1 条 user 上下文, 无错误气泡混入
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchBody(fetchMock, 1).messages).toEqual([{ role: 'user', content: 'I want the air fryer' }]);

    // UI state: 错误气泡已删, user 仍 1 条, 新 assistant 恰 1 条, id 全唯一
    expect(holder.list.some((m) => m === errMsg)).toBe(false);
    expect(holder.list.filter((m) => m.role === 'user')).toHaveLength(1);
    expect(holder.list.filter((m) => m.role === 'assistant' && !m.isError)).toHaveLength(1);
    expect(holder.list.find((m) => m.role === 'assistant')?.content).toBe('Hello again');
    expect(new Set(holder.list.map((m) => m.id)).size).toBe(holder.list.length);
  });

  it("SSE error 事件 → isError + onRetry; sseErrorDisplayed 防 finally flush 覆盖错误文案; 不 saveMessage", async () => {
    const { params, holder, result, saveMessage } = makeHarness();
    fetchMock.mockResolvedValueOnce(
      sseResponse([{ type: 'token', content: 'Partial ' }, { type: 'error', content: 'AI overloaded' }])
    );

    await act(async () => {
      await result.current.sendMessage('hi');
    });

    const errMsg = holder.list.find((m) => m.isError);
    expect(errMsg).toMatchObject({ content: 'AI overloaded', isError: true });
    expect(typeof errMsg!.onRetry).toBe('function');
    // 部分回复不得覆盖错误文案 (sseErrorDisplayed 跳过 flushStreamUpdate)
    expect(holder.list.filter((m) => m.id === errMsg!.id)).toHaveLength(1);
    // 错误路径不落库 assistant — 恰只有 userMsg
    expect(saveMessage).toHaveBeenCalledTimes(1);
    expect(saveMessage.mock.calls[0][0].role).toBe('user');
    expect(params.refs.sendMessageLockRef.current.inProgress).toBe(false);
  });

  it('流关闭零 token (idleTimeout) → streamInterrupted 兜底文案保留 + isError + onRetry, 不 saveMessage', async () => {
    const { params, holder, result, saveMessage } = makeHarness();
    fetchMock.mockResolvedValueOnce(sseResponse([]));

    await act(async () => {
      await result.current.sendMessage('hi');
    });

    const errMsg = holder.list.find((m) => m.isError);
    expect(errMsg).toBeDefined();
    expect(errMsg!.isError).toBe(true);
    expect(typeof errMsg!.onRetry).toBe('function');
    // batch80-a fix 回归 (/tmp/b79c-defects.md #1): finally 的 flushStreamUpdate 跳过
    //   (idleFallbackDisplayed 守卫), 不再用空 accumulatedReply 覆盖兜底文案 —
    //   气泡显示 streamInterrupted 文案而非空气泡 (isError/onRetry 保留, 重试可用)。
    expect(errMsg!.content).toBe('The reply was cut off.');
    // flush 跳过的结构证明: setMessagesSync 恰 3 次 (user 占位 + assistant 占位 + 兜底写入), 无第 4 次覆盖写
    expect(params.setters.setMessagesSync).toHaveBeenCalledTimes(3);
    // 错误路径不落库 assistant — 恰只有 userMsg
    expect(saveMessage).toHaveBeenCalledTimes(1);
    expect(saveMessage.mock.calls[0][0].role).toBe('user');
    expect(params.refs.sendMessageLockRef.current.inProgress).toBe(false);
  });
});

describe('useChatActions — TECH-DEBT-D throttle 批量刷新', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('同批 4 个 token 只调度一次 rAF; 流结束 finally flush 最终全文 (丢尾检查)', async () => {
    // 手动 rAF 队列: 只记录不执行 → 证明 throttle 合帧; cancel spy 证明 cleanup
    const rafQueue: FrameRequestCallback[] = [];
    const cancelSpy = vi.fn();
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
      rafQueue.push(cb);
      return rafQueue.length;
    });
    vi.stubGlobal('cancelAnimationFrame', cancelSpy);

    const { params, holder, result, saveMessage } = makeHarness();
    fetchMock.mockResolvedValueOnce(
      sseResponse([
        { type: 'token', content: 'Hello' },
        { type: 'token', content: ',' },
        { type: 'token', content: ' ' },
        { type: 'token', content: 'world!' },
      ])
    );

    await act(async () => {
      await result.current.sendMessage('hi');
    });

    // 4 个 token → 恰 1 次 rAF 调度 (scheduleStreamUpdate pending 守卫合帧)
    expect(rafQueue).toHaveLength(1);
    // 流结束: finally 取消 pending rAF 并直接 flush
    expect(cancelSpy).toHaveBeenCalledWith(1);

    // setMessagesSync 恰 3 次: user 占位 + assistant 占位 + 最终 flush — 中间零逐 token 写入
    expect(params.setters.setMessagesSync).toHaveBeenCalledTimes(3);

    // 丢尾检查: 最终全文完整落在 assistant 气泡 + finalMsg 落库 (另含 userMsg 共 2 条)
    const aiMsg = holder.list.find((m) => m.role === 'assistant');
    expect(aiMsg?.content).toBe('Hello, world!');
    expect(saveMessage).toHaveBeenCalledTimes(2);
    expect(saveMessage.mock.calls[1][0].content).toBe('Hello, world!');
  });
});

describe('useChatActions — 非 JSON 路径 toolCalls amount 入账分档', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    t.mockClear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('record_impulse 有数字 amount → WithAmount 通知 (penalty), 回复照常落库', async () => {
    const { params, holder, result, saveMessage } = makeHarness();
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ reply: 'noted.', toolCalls: [{ name: 'record_impulse', args: { amount: 12.5 } }] })
    );

    await act(async () => {
      await result.current.sendMessage('bought it for 12.5');
    });

    expect(t).toHaveBeenLastCalledWith('chat.mcpNotifications.impulseRecordedWithAmount', { amount: 12.5 });
    expect(params.callbacks.addMcpNotification).toHaveBeenCalledWith(
      'chat.mcpNotifications.impulseRecordedWithAmount',
      'penalty'
    );
    const aiMsg = holder.list.find((m) => m.role === 'assistant');
    expect(aiMsg?.content).toBe('noted.');
    expect(saveMessage).toHaveBeenCalledTimes(2);
    expect(saveMessage.mock.calls[1][0]).toMatchObject({ role: 'assistant', content: 'noted.' });
  });

  it('record_impulse amount 缺失 / 0 → plain 通知, 不报金额', async () => {
    // 缺失
    const missing = makeHarness();
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ reply: 'ok', toolCalls: [{ name: 'record_impulse', args: {} }] })
    );
    await act(async () => {
      await missing.result.current.sendMessage('bought it');
    });
    expect(missing.params.callbacks.addMcpNotification).toHaveBeenCalledWith(
      'chat.mcpNotifications.impulseRecorded',
      'penalty'
    );
    expect(t.mock.calls.some(([key]) => String(key).includes('WithAmount'))).toBe(false);

    // 0 (falsy 分档)
    t.mockClear();
    const zero = makeHarness();
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ reply: 'ok', toolCalls: [{ name: 'record_impulse', args: { amount: 0 } }] })
    );
    await act(async () => {
      await zero.result.current.sendMessage('bought it');
    });
    expect(zero.params.callbacks.addMcpNotification).toHaveBeenCalledWith(
      'chat.mcpNotifications.impulseRecorded',
      'penalty'
    );
    expect(t.mock.calls.some(([key]) => String(key).includes('WithAmount'))).toBe(false);
  });

  it("batch80-b: 非数字字符串 amount ('abc') 数值清洗 → plain 通知, 不透传进 WithAmount 文案", async () => {
    const { params, result } = makeHarness();
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ reply: 'ok', toolCalls: [{ name: 'record_impulse', args: { amount: 'abc' } }] })
    );

    await act(async () => {
      await result.current.sendMessage('bought it');
    });

    expect(t).toHaveBeenLastCalledWith('chat.mcpNotifications.impulseRecorded');
    expect(params.callbacks.addMcpNotification).toHaveBeenCalledWith(
      'chat.mcpNotifications.impulseRecorded',
      'penalty'
    );
  });

  it('batch80-b: 其余 4 分档非数字 saved_amount/amount 同样清洗回落 plain (数字字符串/NaN/Infinity 均不透传)', async () => {
    // JSON 无法携带 NaN/Infinity (序列化为 null) — 传输层真实到达形态是字符串/数字, 用数字字符串覆盖
    const cases: Array<{ toolName: string; args: Record<string, unknown>; plainKey: string }> = [
      { toolName: 'complete_challenge', args: { saved_amount: 'abc' }, plainKey: 'chat.mcpNotifications.challengeCompleted' },
      { toolName: 'add_tokens', args: { amount: '12.5' }, plainKey: 'chat.mcpNotifications.tokensEarned' },
      { toolName: 'add_dream_fund_progress', args: { amount: 'lots' }, plainKey: 'chat.mcpNotifications.dreamFundProgress' },
      { toolName: 'add_vitality', args: { amount: 'NaN' }, plainKey: 'chat.mcpNotifications.vitalityAdjusted' },
    ];
    for (const c of cases) {
      t.mockClear();
      const h = makeHarness();
      fetchMock.mockResolvedValueOnce(
        jsonResponse({ reply: 'ok', toolCalls: [{ name: c.toolName, args: c.args }] })
      );
      await act(async () => {
        await h.result.current.sendMessage('go');
      });
      expect(t).toHaveBeenLastCalledWith(c.plainKey);
      expect(h.params.callbacks.addMcpNotification).toHaveBeenCalledWith(c.plainKey, 'reward');
    }
  });

  it('complete_challenge: activeChallenge.amount > 0 → onChallengeCompleted 恰一次 (计分/存款), 清 banner', async () => {
    const { params, result } = makeHarness();
    params.refs.activeChallengeRef.current = { ...CH };
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ reply: 'done!', toolCalls: [{ name: 'complete_challenge', args: { saved_amount: 20, challenge_id: 'ch-1' } }] })
    );

    await act(async () => {
      await result.current.sendMessage('I did it');
    });

    expect(params.callbacks.onChallengeCompleted).toHaveBeenCalledTimes(1);
    expect(params.callbacks.onChallengeCompleted).toHaveBeenCalledWith('ch-1', 89);
    expect(params.callbacks.onChallengeBought).not.toHaveBeenCalled();
    expect(params.refs.justCompletedChallengeRef.current).toBe(true);
    expect(params.setters.setActiveChallenge).toHaveBeenCalledWith(undefined);
    expect(params.callbacks.addMcpNotification).toHaveBeenCalledWith(
      'chat.mcpNotifications.challengeCompletedSaved',
      'reward'
    );
  });

  it('complete_challenge: activeChallenge.amount 0 → 不触发 onChallengeCompleted (不上报计分), 仅清 banner', async () => {
    const { params, result } = makeHarness();
    params.refs.activeChallengeRef.current = { itemName: 'Air Fryer', amount: 0, challengeId: 'ch-1' };
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ reply: 'done!', toolCalls: [{ name: 'complete_challenge', args: { saved_amount: 20, challenge_id: 'ch-1' } }] })
    );

    await act(async () => {
      await result.current.sendMessage('I did it');
    });

    expect(params.callbacks.onChallengeCompleted).not.toHaveBeenCalled();
    expect(params.refs.justCompletedChallengeRef.current).toBe(true);
    expect(params.setters.setActiveChallenge).toHaveBeenCalledWith(undefined);
  });
});

describe('useChatActions — demo 与真实路径不双写', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    vi.useFakeTimers();
    t.mockClear();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('demo 非首条 → 仅 canned 路径: 零 fetch, 1.5s 后恰 1 条 canned 回复, 锁释放, 不弹 auth prompt', async () => {
    const { params, holder, result } = makeHarness({
      state: {
        activeChallenge: undefined,
        isLoadingHistory: false,
        isDemo: true,
        impulseContext: undefined,
        locale: 'en',
      },
    });
    params.refs.demoMsgCountRef.current = 1; // 已非首条

    await act(async () => {
      await result.current.sendMessage('hello demo');
    });

    // 不打真实 API (demo 不写服务端消息)
    expect(fetchMock).not.toHaveBeenCalled();
    expect(holder.list).toHaveLength(1);
    expect(holder.list[0]).toMatchObject({ role: 'user', content: 'hello demo' });
    expect(params.refs.demoReplyTimerRef.current).not.toBeNull();
    expect(params.refs.sendMessageLockRef.current.inProgress).toBe(true);

    act(() => {
      vi.advanceTimersByTime(1600);
    });

    // 恰 1 条 canned 回复 (不双写), 锁释放, 计数推进, loading 清
    expect(holder.list).toHaveLength(2);
    expect(holder.list[1].role).toBe('assistant');
    expect(params.refs.sendMessageLockRef.current.inProgress).toBe(false);
    expect(params.refs.demoMsgCountRef.current).toBe(2);
    expect(params.setters.setIsLoading).toHaveBeenLastCalledWith(false);
    expect(params.callbacks.onAuthPrompt).not.toHaveBeenCalled();
  });

  it('demo 首条挑战消息 → 仅真实 /api/chat/anonymous 一次 (无 canned timer 不双写), demoMsgCount 置 1', async () => {
    const { params, holder, result, saveMessage } = makeHarness({
      state: {
        activeChallenge: { ...CH },
        isLoadingHistory: false,
        isDemo: true,
        impulseContext: undefined,
        locale: 'en',
      },
    });
    params.refs.activeChallengeRef.current = { ...CH };
    fetchMock.mockResolvedValueOnce(sseResponse([{ type: 'token', content: 'real analysis' }]));

    await act(async () => {
      await result.current.sendMessage('I want the Air Fryer');
    });

    // 真实 API 恰一次, anonymous 端点, challengeContext 上行
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe('/api/chat/anonymous');
    expect(fetchBody(fetchMock).challengeContext).toEqual(CH);

    // 不走 demo canned 路径: 无 reply timer, 首条标记已消费
    expect(params.refs.demoReplyTimerRef.current).toBeNull();
    expect(params.refs.demoMsgCountRef.current).toBe(1);

    // UI 恰 1 user + 1 assistant, 回复落库 1 次
    expect(holder.list).toHaveLength(2);
    expect(holder.list[0]).toMatchObject({ role: 'user', mode: 'challenge' });
    expect(holder.list[1]).toMatchObject({ role: 'assistant', content: 'real analysis', mode: 'challenge' });
    expect(saveMessage).toHaveBeenCalledTimes(2);
    expect(saveMessage.mock.calls[1][0]).toMatchObject({ role: 'assistant', content: 'real analysis' });
    expect(params.callbacks.onAuthPrompt).not.toHaveBeenCalled();
  });
});
