// @vitest-environment happy-dom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { consumeSendMessageStream } from '../send-message-stream';
import type { ChatMessage } from '@/components/chat-bubble';
import type { ActiveChallenge } from '../../use-challenge-actions';

// consumeAIStream mock — 本测试锁 send-message-stream 的编排层 (消息合成/错误兜底/卡片透传)
const consumeAIStreamMock = vi.fn();
vi.mock('../../consume-ai-stream', () => ({
  consumeAIStream: (...args: unknown[]) => consumeAIStreamMock(...(args as [])),
  handleToolEvent: vi.fn(),
}));
vi.mock('@/components/chat/parts/green-alt-retro-store', () => ({
  markGreenAltRetroAwaited: vi.fn(),
}));
vi.mock('@/lib/chat-drift-guard', () => ({
  applyDriftGuard: vi.fn(() => null),
  DRIFT_REPLACEMENTS: {},
}));

type Ref<T> = { current: T };

function makeArgs(overrides: Partial<Record<string, unknown>> = {}) {
  let messages: ChatMessage[] = [];
  const messagesRef: Ref<ChatMessage[]> = { current: messages };
  const setMessagesSync = vi.fn((updater: ChatMessage[] | ((prev: ChatMessage[]) => ChatMessage[])) => {
    messages = typeof updater === 'function' ? (updater as (p: ChatMessage[]) => ChatMessage[])(messages) : updater;
    messagesRef.current = messages;
  });
  const args = {
    response: { body: { getReader: () => ({ read: () => Promise.resolve({ done: true, value: undefined }) }) } },
    content: '帮我看看咖啡机',
    msgMode: 'normal' as const,
    activeChallenge: undefined as ActiveChallenge | undefined,
    currentActiveChallenge: undefined as ActiveChallenge | undefined,
    locale: 'zh',
    t: (key: string) => `t:${key}`,
    nextId: (prefix: string) => `${prefix}-1`,
    onAssistantMsgId: vi.fn(),
    saveMessage: vi.fn(),
    setMessagesSync,
    messagesRef,
    sendMessageLockRef: { current: { inProgress: true, lastContent: '', lastTime: 0 } },
    retryAiResponseRef: { current: null as ((c: string) => Promise<void>) | null },
    justCompletedChallengeRef: { current: false },
    justBoughtChallengeRef: { current: false },
    setActiveChallenge: vi.fn(),
    onBuddyStateRefresh: vi.fn(),
    onToast: vi.fn(),
    addMcpNotification: vi.fn(),
    onChallengeCompleted: vi.fn(),
    onChallengeBought: vi.fn(),
    ...overrides,
  };
  return args;
}

function streamResult(overrides: Record<string, unknown> = {}) {
  return {
    reply: 'AI 回复内容',
    reasoning: '',
    errorDisplayed: false,
    readerError: false,
    idleTimeout: false,
    ...overrides,
  };
}

describe('consumeSendMessageStream (编排层)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    consumeAIStreamMock.mockReset();
    globalThis.requestAnimationFrame = ((cb: FrameRequestCallback) => { cb(0); return 0; }) as typeof requestAnimationFrame;
  });
  afterEach(() => { vi.restoreAllMocks(); });

  it('正常流: 助手消息合成 + saveMessage + 返回 id', async () => {
    consumeAIStreamMock.mockResolvedValue(streamResult());
    const args = makeArgs();
    const id = await consumeSendMessageStream(args as never);
    expect(id).toBe('ai-1');
    expect(args.onAssistantMsgId).toHaveBeenCalledWith('ai-1');
    expect(args.saveMessage).toHaveBeenCalledTimes(1);
    const saved = args.saveMessage.mock.calls[0][0] as ChatMessage;
    expect(saved.id).toBe('ai-1');
    expect(saved.content).toBe('AI 回复内容');
    expect(saved.mode).toBe('normal');
  });

  it('正常流: 空回复落 hereForYou 兜底文案', async () => {
    consumeAIStreamMock.mockResolvedValue(streamResult({ reply: '   ' }));
    const args = makeArgs();
    await consumeSendMessageStream(args as never);
    const saved = args.saveMessage.mock.calls[0][0] as ChatMessage;
    expect(saved.content).toBe('t:chat.aiFallback.hereForYou');
  });

  it('errorDisplayed: 不 saveMessage 返回 null (onError 已渲染错误消息)', async () => {
    consumeAIStreamMock.mockResolvedValue(streamResult({ errorDisplayed: true }));
    const args = makeArgs();
    const id = await consumeSendMessageStream(args as never);
    expect(id).toBeNull();
    expect(args.saveMessage).not.toHaveBeenCalled();
  });

  it('readerError: isError 消息 + onRetry 回调链 (删消息+retry原content)', async () => {
    consumeAIStreamMock.mockResolvedValue(streamResult({ readerError: true, reply: '部分内容' }));
    const args = makeArgs();
    const retryFn = vi.fn().mockResolvedValue(undefined);
    args.retryAiResponseRef.current = retryFn;
    const id = await consumeSendMessageStream(args as never);
    expect(id).toBeNull();
    expect(args.saveMessage).not.toHaveBeenCalled();
    const errMsg = args.messagesRef.current.find(m => m.id === 'ai-1');
    expect(errMsg?.isError).toBe(true);
    // readerError onRetry 有 inProgress 锁检查 — 锁持中点重试被忽略
    errMsg?.onRetry?.();
    await Promise.resolve();
    expect(retryFn).not.toHaveBeenCalled();
    // 解锁后重试生效
    args.sendMessageLockRef.current.inProgress = false;
    errMsg?.onRetry?.();
    await new Promise((r) => setTimeout(r, 0));
    expect(args.messagesRef.current.find(m => m.id === 'ai-1')).toBeUndefined();
    expect(retryFn).toHaveBeenCalledWith('帮我看看咖啡机');
  });

  it('idleTimeout + 空回复: streamInterrupted 兜底 + onRetry 走最后一条 user 消息', async () => {
    consumeAIStreamMock.mockResolvedValue(streamResult({ idleTimeout: true, reply: '' }));
    const args = makeArgs();
    // 预置一条历史 user 消息
    args.setMessagesSync([
      { id: 'user-1', role: 'user', content: '旧问题', timestamp: new Date() } as ChatMessage,
    ]);
    const retryFn = vi.fn().mockResolvedValue(undefined);
    args.retryAiResponseRef.current = retryFn;
    await consumeSendMessageStream(args as never);
    const errMsg = args.messagesRef.current.find(m => m.id === 'ai-1');
    expect(errMsg?.isError).toBe(true);
    expect(errMsg?.content).toBe('t:chat.aiFallback.streamInterrupted');
    errMsg?.onRetry?.();
    await new Promise((r) => setTimeout(r, 0));
    expect(retryFn).toHaveBeenCalledWith('旧问题');
  });

  it('onError 流中回调: connectionInterrupted 兜底 + retry 最后 user 消息', async () => {
    // consumeAIStream 调用 onError callback (SSE error 事件)
    consumeAIStreamMock.mockImplementation((_reader, _decoder, callbacks: { onError: (raw: string) => void }) => {
      callbacks.onError('');
      return streamResult({ errorDisplayed: true, reply: '' });
    });
    const args = makeArgs();
    args.setMessagesSync([
      { id: 'user-1', role: 'user', content: '重试我', timestamp: new Date() } as ChatMessage,
    ]);
    const retryFn = vi.fn().mockResolvedValue(undefined);
    args.retryAiResponseRef.current = retryFn;
    await consumeSendMessageStream(args as never);
    const errMsg = args.messagesRef.current.find(m => m.id === 'ai-1');
    expect(errMsg?.isError).toBe(true);
    expect(errMsg?.content).toBe('t:chat.aiFallback.connectionInterrupted');
    // onRetry 内部先解锁再 retry (锁复位是 retry 的前置)
    errMsg?.onRetry?.();
    await new Promise((r) => setTimeout(r, 0));
    expect(args.sendMessageLockRef.current.inProgress).toBe(false);
    expect(retryFn).toHaveBeenCalledWith('重试我');
  });

  it('卡片透传: productCards/greenAlt/microChallenge 进最终消息', async () => {
    consumeAIStreamMock.mockImplementation((_r, _d, cb: Record<string, (arg: unknown) => void>) => {
      cb.onProductCards([{ title: 'Product A' }]);
      cb.onGreenAlt({ suggestion: 'walk' });
      cb.onMicroChallenge({ title: 'No Milk Tea Week' });
      return streamResult();
    });
    const args = makeArgs();
    await consumeSendMessageStream(args as never);
    const saved = args.saveMessage.mock.calls[0][0] as ChatMessage;
    expect(saved.productCards).toEqual([{ title: 'Product A' }]);
    expect(saved.productCardsQuery).toBe('帮我看看咖啡机');
    expect(saved.greenAlt).toEqual({ suggestion: 'walk' });
    expect(saved.microChallenge).toEqual({ title: 'No Milk Tea Week' });
  });

  it('microChallenge: currentActiveChallenge 已在时丢弃 (不覆盖进行中挑战)', async () => {
    consumeAIStreamMock.mockImplementation((_r, _d, cb: Record<string, (arg: unknown) => void>) => {
      cb.onMicroChallenge({ title: 'CHALLENGE-NEW' });
      return streamResult();
    });
    const args = makeArgs({ currentActiveChallenge: { id: 'c1' } as unknown as ActiveChallenge });
    await consumeSendMessageStream(args as never);
    const saved = args.saveMessage.mock.calls[0][0] as ChatMessage;
    expect(saved.microChallenge).toBeUndefined();
  });

  it('高置信度泄漏检测: prompt 泄漏文案被 hereForYou 替换', async () => {
    consumeAIStreamMock.mockResolvedValue(streamResult({
      reply: 'You MUST follow the impulse scoring guide carefully when evaluating.',
    }));
    const args = makeArgs();
    await consumeSendMessageStream(args as never);
    const saved = args.saveMessage.mock.calls[0][0] as ChatMessage;
    expect(saved.content).toBe('t:chat.aiFallback.hereForYou');
  });

  it('drift guard 命中: 应用替换词表', async () => {
    const { applyDriftGuard } = await import('@/lib/chat-drift-guard');
    vi.mocked(applyDriftGuard).mockReturnValueOnce('anxiety-trip');
    vi.mocked(applyDriftGuard).mockReturnValueOnce(null);
    const { DRIFT_REPLACEMENTS } = await import('@/lib/chat-drift-guard');
    (DRIFT_REPLACEMENTS as Record<string, string>)['anxiety-trip'] = '安全替换文案';
    consumeAIStreamMock.mockResolvedValue(streamResult({ reply: '正常内容不会被替换' }));
    const args = makeArgs();
    await consumeSendMessageStream(args as never);
    const saved = args.saveMessage.mock.calls[0][0] as ChatMessage;
    // drift 命中 → 替换词
    expect(saved.content).toBe('安全替换文案');
  });

  it('greenAltRetro: markGreenAltRetroAwaited 被调 + 消息携带', async () => {
    const { markGreenAltRetroAwaited } = await import('@/components/chat/parts/green-alt-retro-store');
    consumeAIStreamMock.mockImplementation((_r, _d, cb: Record<string, (arg: unknown) => void>) => {
      cb.onGreenAltRetro({ entryId: 'entry-9' });
      return streamResult();
    });
    const args = makeArgs();
    await consumeSendMessageStream(args as never);
    expect(vi.mocked(markGreenAltRetroAwaited)).toHaveBeenCalledWith('entry-9');
    const saved = args.saveMessage.mock.calls[0][0] as ChatMessage;
    expect(saved.greenAltRetro).toEqual({ entryId: 'entry-9' });
  });
});
