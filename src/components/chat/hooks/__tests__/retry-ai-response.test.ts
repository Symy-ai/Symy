/**
 * retryAiResponseImpl tests (batch77-c — testgap v9 §十五.2 中高盲区补测, 纯测试)
 *
 * 覆盖 (断言与现状对齐, 真实 consumeAIStream + SSE ReadableStream):
 *  - 核心断言: 重试不产生重复消息 — 只追加一条 assistant, user 消息不复制,
 *    saveMessage 仅以 assistant 身份调用一次, 错误气泡不进 API body
 *  - BUG-018 锁互斥: inProgress=true → 零副作用早退
 *  - mode 推断: 从最后一条 user 消息取 (退出挑战后 retry 不分裂 mode)
 *  - SSE error 事件: isError + onRetry, 不 saveMessage; onRetry 删错误消息 + 经 ref 重发
 *  - catch: 401 → authRequired 文案; 其他 → aiError fallback; onRetry 经 ref 重发 lastUserContent
 *  - AbortError → 静默 (不标错误), finally 仍释放锁
 *  - Give Up 竞态: abortRef 被新一代接管后, 旧 finally 不清锁/loading/skip 标记
 *  - 空白回复 → hereForYou fallback
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { ChatMessage } from '@/types/chat-message';
import { retryAiResponseImpl, type RetryAiResponseParams } from '../retry-ai-response';
import { ApiError } from '@/lib/errors/api-error';

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

function interruptedSseResponse() {
  const encoder = new TextEncoder();
  let controller!: ReadableStreamDefaultController<Uint8Array>;
  let resolveRead!: () => void;
  const firstReadStarted = new Promise<void>((resolve) => { resolveRead = resolve; });
  const body = new ReadableStream<Uint8Array>({
    start(c) {
      controller = c;
      c.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'token', content: 'Partial' })}\n`));
    },
  });
  return {
    response: new Response(body, { status: 200, headers: { 'Content-Type': 'text/event-stream' } }),
    firstReadStarted,
    fail: () => controller.error(new TypeError('network dropped')),
    readStarted: () => {
      resolveRead();
    },
  };
}

function userMsg(content: string, mode?: 'normal' | 'challenge'): ChatMessage {
  return { id: `user-${content.replace(/\s+/g, '-')}`, role: 'user', content, timestamp: new Date(), mode };
}

function errorAssistantMsg(id: string, mode?: 'normal' | 'challenge'): ChatMessage {
  return { id, role: 'assistant', content: 'AI is unavailable', timestamp: new Date(), isError: true, mode };
}

/** 上轮失败后的典型会话态: 1 条 user + 1 条带 isError 的旧 assistant */
function makeInitialMessages() {
  return [userMsg('I want the air fryer', 'challenge'), errorAssistantMsg('ai-old')];
}

function makeHarness(initial: ChatMessage[], overrides: Partial<RetryAiResponseParams> = {}) {
  // setMessagesSync 驱动的真实 state 归约器 — "不产生重复消息"断言在此基础上做
  const holder = { list: initial.map((m) => ({ ...m })) };
  const messagesRef = { current: initial.map((m) => ({ ...m })) };
  const setMessagesSync = vi.fn(
    (updater: ChatMessage[] | ((prev: ChatMessage[]) => ChatMessage[])) => {
      holder.list = typeof updater === 'function' ? updater(holder.list) : updater;
      messagesRef.current = holder.list.map((m) => ({ ...m }));
    }
  );
  const challenge = { itemName: 'Air Fryer', amount: 89, challengeId: 'ch-1' };
  const saveMessage = vi.fn<(message: ChatMessage) => void>();
  const params: RetryAiResponseParams = {
    lastUserContent: 'please-retry-content',
    activeChallenge: challenge,
    t: t as unknown as RetryAiResponseParams['t'],
    setMessagesSync,
    setIsLoading: vi.fn(),
    setActiveChallenge: vi.fn(),
    nextId: vi.fn((prefix: string) => `${prefix}-1`),
    saveMessage,
    addMcpNotification: vi.fn(),
    onBuddyStateRefresh: vi.fn(),
    onToast: vi.fn(),
    sendMessageLockRef: { current: { inProgress: false, lastContent: '', lastTime: 0 } },
    abortRef: { current: null },
    messagesRef,
    activeChallengeRef: { current: challenge },
    impulseContextRef: { current: undefined },
    localeRef: { current: 'en' },
    justCompletedChallengeRef: { current: false },
    skipNextHistoryLoadRef: { current: false },
    skipNonceRef: { current: 0 },
    justBoughtChallengeRef: { current: false },
    retryAiResponseRef: { current: null },
    ...overrides,
  };
  return { params, holder, saveMessage };
}

function fetchBody(fetchMock: ReturnType<typeof vi.fn>) {
  return JSON.parse(fetchMock.mock.calls[0][1].body as string);
}

describe('retryAiResponseImpl', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('核心断言: 重试不产生重复消息 — 只追加一条 assistant, user 不复制, saveMessage 仅 assistant 一次, 错误气泡不进 API', async () => {
    const initial = makeInitialMessages();
    const { params, holder, saveMessage } = makeHarness(initial);
    fetchMock.mockResolvedValueOnce(
      sseResponse([
        { type: 'reasoning', content: 'thinking...' },
        { type: 'token', content: 'He' },
        { type: 'token', content: 'llo' },
      ])
    );

    await retryAiResponseImpl(params);

    // API 恰好一次; body.messages 排除 assistant 占位与 isError 气泡, user 不重复
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchBody(fetchMock).messages).toEqual([{ role: 'user', content: 'I want the air fryer' }]);
    expect(fetchBody(fetchMock).stream).toBe(true);
    expect(fetchBody(fetchMock).locale).toBe('en');
    expect(fetchBody(fetchMock).challengeContext).toEqual({ itemName: 'Air Fryer', amount: 89, challengeId: 'ch-1' });

    // UI state: 初始 2 条 + 恰 1 条新 assistant; user 数量不变; id 全唯一
    expect(holder.list).toHaveLength(3);
    expect(holder.list.filter((m) => m.role === 'user')).toHaveLength(1);
    const newMsg = holder.list.find((m) => m.id === 'ai-1');
    expect(newMsg).toMatchObject({ role: 'assistant', content: 'Hello', reasoning: 'thinking...', mode: 'challenge' });
    expect(new Set(holder.list.map((m) => m.id)).size).toBe(3);

    // saveMessage 恰一次且只保存 assistant (不创建/不保存 userMsg)
    expect(params.saveMessage).toHaveBeenCalledTimes(1);
    expect(saveMessage.mock.calls[0][0]).toMatchObject({ id: 'ai-1', role: 'assistant', content: 'Hello', mode: 'challenge' });
    expect(saveMessage.mock.calls.every(([message]) => message.role !== 'user')).toBe(true);

    // finally: 锁释放 + loading 清 + skip nonce 抑制重复 loadHistory + abortRef 清
    expect(params.setIsLoading).toHaveBeenNthCalledWith(1, true);
    expect(params.setIsLoading).toHaveBeenLastCalledWith(false);
    expect(params.sendMessageLockRef.current.inProgress).toBe(false);
    expect(params.skipNextHistoryLoadRef.current).toBe(true);
    expect(params.skipNonceRef.current).toBeGreaterThan(0);
    expect(params.justBoughtChallengeRef.current).toBe(false);
    expect(params.abortRef.current).toBeNull();
  });

  it('BUG-018 锁互斥: inProgress=true → 立即早退, 零网络零状态变化', async () => {
    const { params, holder } = makeHarness(makeInitialMessages());
    params.sendMessageLockRef.current.inProgress = true;

    await retryAiResponseImpl(params);

    expect(fetchMock).not.toHaveBeenCalled();
    expect(params.setMessagesSync).not.toHaveBeenCalled();
    expect(params.setIsLoading).not.toHaveBeenCalled();
    expect(params.saveMessage).not.toHaveBeenCalled();
    expect(holder.list).toHaveLength(2);
  });

  it('mode 推断: 退出挑战后 retry (activeChallengeRef 已空) 仍从最后一条 user 消息取 challenge, challengeContext 兜底 null', async () => {
    const { params, holder, saveMessage } = makeHarness(makeInitialMessages(), {
      activeChallenge: undefined,
    });
    params.activeChallengeRef.current = undefined;
    fetchMock.mockResolvedValueOnce(sseResponse([{ type: 'token', content: 'ok' }]));

    await retryAiResponseImpl(params);

    expect(fetchBody(fetchMock).challengeContext).toBeNull();
    expect(holder.list.find((m) => m.id === 'ai-1')?.mode).toBe('challenge');
    expect(saveMessage.mock.calls[0][0]).toMatchObject({ mode: 'challenge' });
  });

  it('SSE error 事件: isError + onRetry, 不 saveMessage; onRetry 删错误消息并经 ref 重发最后一条 user 内容', async () => {
    const { params, holder } = makeHarness(makeInitialMessages());
    fetchMock.mockResolvedValueOnce(sseResponse([{ type: 'error', content: 'AI overloaded' }]));

    await retryAiResponseImpl(params);

    const errMsg = holder.list.find((m) => m.id === 'ai-1');
    expect(errMsg).toMatchObject({ content: 'AI overloaded', isError: true });
    expect(typeof errMsg?.onRetry).toBe('function');
    expect(params.saveMessage).not.toHaveBeenCalled();
    expect(params.sendMessageLockRef.current.inProgress).toBe(false);

    // 点击重试: 删除错误消息 + 强制释放锁 + setTimeout(0) 经 ref 重发
    const retryRefSpy = vi.fn();
    params.retryAiResponseRef.current = retryRefSpy;
    errMsg!.onRetry!();
    expect(holder.list.some((m) => m.id === 'ai-1')).toBe(false);
    await new Promise((r) => setTimeout(r, 20));
    expect(retryRefSpy).toHaveBeenCalledTimes(1);
    expect(retryRefSpy).toHaveBeenCalledWith('I want the air fryer');
  });

  it('SSE reader 中断: 保留已收 token, 标记可重试; 重试只请求 AI 不复制 user', async () => {
    const { params, holder, saveMessage } = makeHarness(makeInitialMessages());
    const interrupted = interruptedSseResponse();
    fetchMock.mockResolvedValueOnce(interrupted.response);
    const retryRefSpy = vi.fn((content: string) => retryAiResponseImpl({ ...params, lastUserContent: content }));
    params.retryAiResponseRef.current = retryRefSpy;

    const retrying = retryAiResponseImpl(params);
    void interrupted.readStarted();
    await interrupted.firstReadStarted;
    await vi.waitFor(() => interrupted.fail());
    await retrying;

    const partial = holder.list.find((m) => m.id === 'ai-1');
    expect(partial).toMatchObject({ content: 'Partial', isError: true });
    expect(typeof partial?.onRetry).toBe('function');
    expect(saveMessage).not.toHaveBeenCalled();

    fetchMock.mockResolvedValueOnce(sseResponse([{ type: 'token', content: 'complete' }]));
    partial!.onRetry!();
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));

    const firstBody = fetchBody(fetchMock);
    const retryBody = JSON.parse(fetchMock.mock.calls[1][1].body as string);
    expect(firstBody.messages).toEqual([{ role: 'user', content: 'I want the air fryer' }]);
    expect(retryBody.messages).toEqual([{ role: 'user', content: 'I want the air fryer' }]);
    expect(holder.list.filter((m) => m.role === 'user')).toHaveLength(1);
    await vi.waitUntil(() => expect(saveMessage).toHaveBeenCalledTimes(1));
    expect(saveMessage.mock.calls[0][0]).toMatchObject({ role: 'assistant', content: 'complete' });
  });

  it('catch 401 → authRequired 文案 + onRetry 经 ref 重发 lastUserContent; finally 释放锁', async () => {
    const { params, holder } = makeHarness(makeInitialMessages());
    fetchMock.mockResolvedValueOnce(new Response('Unauthorized', { status: 401 }));

    await retryAiResponseImpl(params);

    const errMsg = holder.list.find((m) => m.id === 'ai-1');
    expect(errMsg).toMatchObject({
      content: 'Sign in to chat with Symy and save your conversations.',
      isError: true,
    });
    expect(params.saveMessage).not.toHaveBeenCalled();
    expect(params.sendMessageLockRef.current.inProgress).toBe(false);

    const retryRefSpy = vi.fn();
    params.retryAiResponseRef.current = retryRefSpy;
    errMsg!.onRetry!();
    await new Promise((r) => setTimeout(r, 20));
    expect(retryRefSpy).toHaveBeenCalledWith('please-retry-content');
  });

  it('catch 非 401 (500 ApiError) → 通用 aiError fallback 文案', async () => {
    const { params, holder } = makeHarness(makeInitialMessages());
    fetchMock.mockRejectedValueOnce(new ApiError('Chat API error (500): boom', 500));

    await retryAiResponseImpl(params);

    expect(holder.list.find((m) => m.id === 'ai-1')).toMatchObject({
      content: 'chat.aiFallback.aiError',
      isError: true,
    });
  });

  it('AbortError → 静默: 不标错误不弹 fallback, finally 仍释放锁与 abortRef', async () => {
    const { params, holder } = makeHarness(makeInitialMessages());
    fetchMock.mockRejectedValueOnce(new DOMException('The operation was aborted.', 'AbortError'));

    await expect(retryAiResponseImpl(params)).resolves.toBeUndefined();

    const placeholder = holder.list.find((m) => m.id === 'ai-1');
    expect(placeholder).toMatchObject({ content: '' });
    expect(placeholder?.isError).toBeUndefined();
    expect(placeholder?.onRetry).toBeUndefined();
    expect(params.sendMessageLockRef.current.inProgress).toBe(false);
    expect(params.abortRef.current).toBeNull();
    expect(params.setIsLoading).toHaveBeenLastCalledWith(false);
  });

  it('Give Up 竞态: 流期间 abortRef 被新一代接管 → 旧 finally 不清锁/loading/skip 标记', async () => {
    const { params } = makeHarness(makeInitialMessages());
    let resolveFetch!: (r: Response) => void;
    fetchMock.mockImplementationOnce(() => new Promise((res) => { resolveFetch = res; }));

    const promise = retryAiResponseImpl(params);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    // 模拟新一代 sendMessage 已接管 abortRef (代际推进)
    const newer = new AbortController();
    params.abortRef.current = newer;

    resolveFetch(sseResponse([{ type: 'token', content: 'late' }]));
    await promise;

    // finalMsg 照常保存, 但清理让位给新一代 — 锁/lock/loading 均不被旧 finally 误清
    expect(params.saveMessage).toHaveBeenCalledTimes(1);
    expect(params.setIsLoading).not.toHaveBeenCalledWith(false);
    expect(params.sendMessageLockRef.current.inProgress).toBe(true);
    expect(params.abortRef.current).toBe(newer);
    expect(params.skipNextHistoryLoadRef.current).toBe(false);
    expect(params.skipNonceRef.current).toBe(0);
  });

  it('空白-only 回复 → hereForYou fallback (trim 检查), 仍保存 finalMsg 一次', async () => {
    const { params, holder, saveMessage } = makeHarness(makeInitialMessages());
    fetchMock.mockResolvedValueOnce(sseResponse([{ type: 'token', content: '   ' }]));

    await retryAiResponseImpl(params);

    expect(holder.list.find((m) => m.id === 'ai-1')?.content).toBe('chat.aiFallback.hereForYou');
    expect(params.saveMessage).toHaveBeenCalledTimes(1);
    expect(saveMessage.mock.calls[0][0].content).toBe('chat.aiFallback.hereForYou');
  });

  it('请求透传: greenPref/guardIntensity 默认值与 sendMessage 同口径', async () => {
    const { params } = makeHarness(makeInitialMessages());
    fetchMock.mockResolvedValueOnce(sseResponse([{ type: 'token', content: 'ok' }]));

    await retryAiResponseImpl(params);

    const body = fetchBody(fetchMock);
    expect(body.greenPref).toBe('on');
    expect(body.guardIntensity).toBe('balanced');
    expect(body.guardScope).toBeDefined();
    expect(body.impulseContext).toBeNull();
  });
});
