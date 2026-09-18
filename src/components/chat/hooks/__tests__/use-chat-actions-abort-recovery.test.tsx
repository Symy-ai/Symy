// @vitest-environment happy-dom

/**
 * useChatActions tests (batch80-c — 79-c 剩余切片, 纯测试)
 *
 * 覆盖 (断言与现状对齐, 真实 consumeAIStream + 可控 SSE ReadableStream):
 *  - 卸载中 stream 到达: 组件卸载 cleanup (use-chat-lifecycle-cleanup) 走 abortRef.abort() →
 *    真实 fetch 流的 pending read 会以 AbortError reject — mock 流用 controller.error 等价模拟 →
 *    内层 finally 取消 pending rAF (TECH-DEBT-D 的 rAF 取消时机), AbortError catch 移除
 *    assistant 气泡且是最后一次 setMessagesSync 写 (flush 在 catch 前跑, 但不会复活气泡 —
 *    React 卸载后 setState 告警防线), assistant 不落库, 锁释放。
 *  - onError 后再次发送新消息: 错误路径 finally 已释放锁 → 新消息照常发送 (不卡死);
 *    新 assistant 气泡全新 id 且不沾染 isError (isError 按气泡隔离);
 *    旧错误气泡按现状保留在对话记录中 (产品代码无清除逻辑, 不被复制/变异)。
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

/** 发 1 个 token 后挂起不关闭 — 由测试通过 controller.error(AbortError) 模拟卸载 abort 打断 */
function heldSseResponse() {
  const encoder = new TextEncoder();
  let controller!: ReadableStreamDefaultController<Uint8Array>;
  const body = new ReadableStream<Uint8Array>({
    start(c) {
      controller = c;
      c.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'token', content: 'Hello' })}\n`));
    },
  });
  return {
    response: new Response(body, { status: 200, headers: { 'Content-Type': 'text/event-stream' } }),
    failWithAbort: () => controller.error(new DOMException('The operation was aborted.', 'AbortError')),
  };
}

function makeHarness() {
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
  };
  const { result } = renderHook(() => useChatActions(params));
  return { params, holder, result, saveMessage: params.callbacks.saveMessage as ReturnType<typeof vi.fn> };
}

describe('useChatActions — 卸载 abort 与错误后恢复 (79-c 剩余切片)', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('卸载中 stream 到达: abort → pending rAF 取消 (无帧尾巴写 state), 气泡移除为末次写入, 锁释放', async () => {
    // 手动 rAF 队列: 只记录不执行 → 精确观察调度/取消时机
    const rafQueue: FrameRequestCallback[] = [];
    const cancelSpy = vi.fn();
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
      rafQueue.push(cb);
      return rafQueue.length;
    });
    vi.stubGlobal('cancelAnimationFrame', cancelSpy);

    const { params, holder, result, saveMessage } = makeHarness();
    const stream = heldSseResponse();
    fetchMock.mockResolvedValueOnce(stream.response);

    let send!: Promise<void>;
    await act(async () => {
      send = result.current.sendMessage('hi');
      await vi.waitFor(() => expect(rafQueue).toHaveLength(1)); // token 已到, throttle rAF 已调度待执行
    });

    // 模拟组件卸载 cleanup (use-chat-lifecycle-cleanup): abort in-flight 请求;
    // 真实 fetch 流的 pending read 因 abort 以 AbortError reject — mock 流用 controller.error 等价模拟
    await act(async () => {
      params.refs.abortRef.current?.abort();
      stream.failWithAbort();
      await send;
    });

    // rAF 取消时机: 内层 finally 取消 pending 帧 — 卸载后无帧回调再写 state (React 告警防线)
    expect(cancelSpy).toHaveBeenCalledWith(1);
    expect(rafQueue).toHaveLength(1); // 无新增调度

    // AbortError catch 移除 assistant 气泡, 且为最后一次写入 (前置 flush 不复活气泡)
    expect(holder.list.map((m) => m.role)).toEqual(['user']);
    expect(holder.list.some((m) => m.isError)).toBe(false);
    // assistant 不落库 (恰只有 userMsg); 锁与 loading 已清
    expect(saveMessage).toHaveBeenCalledTimes(1);
    expect(saveMessage.mock.calls[0][0].role).toBe('user');
    expect(params.refs.sendMessageLockRef.current.inProgress).toBe(false);
    expect(params.setters.setIsLoading).toHaveBeenLastCalledWith(false);
  });

  it('onError 后再次发送新消息: 旧错误不阻塞新发送, 新气泡全新 id 不沾染 isError (旧气泡按现状保留)', async () => {
    const { params, holder, result, saveMessage } = makeHarness();
    fetchMock.mockResolvedValueOnce(
      sseResponse([{ type: 'token', content: 'Partial ' }, { type: 'error', content: 'AI overloaded' }])
    );
    fetchMock.mockResolvedValueOnce(sseResponse([{ type: 'token', content: 'Fresh reply' }]));

    await act(async () => {
      await result.current.sendMessage('first question');
    });
    const errMsg = holder.list.find((m) => m.isError);
    expect(errMsg).toBeDefined();
    expect(params.refs.sendMessageLockRef.current.inProgress).toBe(false); // 错误路径已释放锁

    await act(async () => {
      await result.current.sendMessage('second question');
    });

    // 新发送照常走完 (不被旧错误状态卡死): 第二次 fetch 发出
    expect(fetchMock).toHaveBeenCalledTimes(2);

    // 新 assistant 气泡: 全新 id, 内容完整, 不沾染 isError
    const freshMsgs = holder.list.filter((m) => m.role === 'assistant' && !m.isError);
    expect(freshMsgs).toHaveLength(1);
    expect(freshMsgs[0]).toMatchObject({ content: 'Fresh reply' });
    expect(freshMsgs[0].id).not.toBe(errMsg!.id);
    expect(freshMsgs[0].isError).toBeFalsy();

    // 旧错误气泡按现状保留在对话记录中: 恰 1 条, 未被新发送复制或变异
    const errBubbles = holder.list.filter((m) => m.isError);
    expect(errBubbles).toHaveLength(1);
    expect(errBubbles[0].id).toBe(errMsg!.id);
    expect(errBubbles[0]).toMatchObject({ content: 'AI overloaded', isError: true });

    expect(holder.list.filter((m) => m.role === 'user')).toHaveLength(2);
    expect(new Set(holder.list.map((m) => m.id)).size).toBe(holder.list.length);
    // 落库: 2 user + 第二轮 finalMsg assistant; 错误气泡始终不落库
    expect(saveMessage).toHaveBeenCalledTimes(3);
    expect(saveMessage.mock.calls[2][0]).toMatchObject({ role: 'assistant', content: 'Fresh reply' });
    expect(params.refs.sendMessageLockRef.current.inProgress).toBe(false);
  });
});
