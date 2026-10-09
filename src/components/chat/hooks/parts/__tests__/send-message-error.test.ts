import { describe, expect, it, vi, beforeEach } from 'vitest';

vi.mock('@/lib/errors/api-error', () => ({ getErrorStatus: vi.fn() }));
vi.mock('@/lib/logger', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));

import { handleSendMessageError } from '../send-message-error';
import { getErrorStatus } from '@/lib/errors/api-error';
import type { ChatMessage } from '@/components/chat-bubble';

const mockGetErrorStatus = vi.mocked(getErrorStatus);

type Msg = ChatMessage;

function makeHarness() {
  const setMessagesSync = vi.fn();
  const messagesRef = { current: [] as Msg[] };
  const sendMessageLockRef = { current: { inProgress: true, lastContent: 'x', lastTime: 1 } };
  const retryFn = vi.fn(async () => {});
  const retryAiResponseRef = { current: retryFn };
  const t = (key: string) => (key === 'chat.aiFallback.authRequired' ? '请先登录' : 'AI 出错了, 稍后再试');
  const nextId = (prefix: string) => `${prefix}-1`;
  return { setMessagesSync, messagesRef, sendMessageLockRef, retryAiResponseRef, retryFn, t, nextId };
}

/**
 * send-message-error.ts (75行) — 发送错误处理器 (chat route 拆相位件)。
 *
 * 锁定:
 * - AbortError: 删泡后静默返回 (零错误泡)
 * - 401 → authRequired 文案; 其他 → aiError 文案; isError=true + onRetry 挂载
 * - onRetry: 删错误泡→取最后 user 消息→释放锁→异步 retry
 * - 无 user 消息 → 不重试 (锁不释放)
 */
describe('handleSendMessageError', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
  });

  it('AbortError → 删泡静默, 零错误泡', () => {
    const h = makeHarness();
    handleSendMessageError({
      err: new DOMException('aborted', 'AbortError'),
      assistantMsgId: 'ai-0',
      t: h.t, nextId: h.nextId, setMessagesSync: h.setMessagesSync,
      messagesRef: h.messagesRef, sendMessageLockRef: h.sendMessageLockRef,
      retryAiResponseRef: h.retryAiResponseRef,
    });
    expect(h.setMessagesSync).toHaveBeenCalledTimes(1); // 仅删泡一次, 无追加
    const updater = h.setMessagesSync.mock.calls[0][0] as (p: Array<{ id: string }>) => Array<{ id: string }>;
    expect(updater([{ id: 'u' }, { id: 'ai-0' }])).toEqual([{ id: 'u' }]);
  });

  it('401 → authRequired; 其他 → aiError; isError+onRetry 挂载', () => {
    mockGetErrorStatus.mockReturnValueOnce(401);
    const h = makeHarness();
    handleSendMessageError({
      err: new Error('unauth'), assistantMsgId: 'ai-0',
      t: h.t, nextId: h.nextId, setMessagesSync: h.setMessagesSync,
      messagesRef: h.messagesRef, sendMessageLockRef: h.sendMessageLockRef,
      retryAiResponseRef: h.retryAiResponseRef,
    });
    const appender = h.setMessagesSync.mock.calls[0][0] as (p: Msg[]) => Msg[];
    const [msg] = appender([]);
    expect(msg.content).toBe('请先登录');
    expect(msg.isError).toBe(true);
    expect(typeof msg.onRetry).toBe('function');

    // 非鉴权路径
    mockGetErrorStatus.mockReturnValueOnce(503);
    const h2 = makeHarness();
    handleSendMessageError({
      err: new Error('upstream'), assistantMsgId: null,
      t: h2.t, nextId: h2.nextId, setMessagesSync: h2.setMessagesSync,
      messagesRef: h2.messagesRef, sendMessageLockRef: h2.sendMessageLockRef,
      retryAiResponseRef: h2.retryAiResponseRef,
    });
    const [msg2] = (h2.setMessagesSync.mock.calls[0][0] as (p: Msg[]) => Msg[])([]);
    expect(msg2.content).toBe('AI 出错了, 稍后再试');
  });

  it('onRetry: 删错误泡→取最后 user 消息→释放锁→异步 retry', () => {
    mockGetErrorStatus.mockReturnValueOnce(500);
    const h = makeHarness();
    h.messagesRef.current = [
      { id: 'u1', role: 'user', content: '第一条', timestamp: new Date() },
      { id: 'u2', role: 'user', content: '第二条', timestamp: new Date() },
    ] as Msg[];
    handleSendMessageError({
      err: new Error('x'), assistantMsgId: null,
      t: h.t, nextId: h.nextId, setMessagesSync: h.setMessagesSync,
      messagesRef: h.messagesRef, sendMessageLockRef: h.sendMessageLockRef,
      retryAiResponseRef: h.retryAiResponseRef,
    });
    const [msg] = (h.setMessagesSync.mock.calls[0][0] as (p: Msg[]) => Msg[])([]);
    (msg as Msg & { onRetry?: () => void }).onRetry?.();
    expect(h.sendMessageLockRef.current.inProgress).toBe(false);
    vi.runAllTimers();
    expect(h.retryFn).toHaveBeenCalledWith('第二条'); // 最后 user 消息
  });

  it('无 user 消息 → onRetry 不重试不释放锁', () => {
    mockGetErrorStatus.mockReturnValueOnce(500);
    const h = makeHarness();
    h.messagesRef.current = [];
    handleSendMessageError({
      err: new Error('x'), assistantMsgId: null,
      t: h.t, nextId: h.nextId, setMessagesSync: h.setMessagesSync,
      messagesRef: h.messagesRef, sendMessageLockRef: h.sendMessageLockRef,
      retryAiResponseRef: h.retryAiResponseRef,
    });
    const [msg] = (h.setMessagesSync.mock.calls[0][0] as (p: Msg[]) => Msg[])([]);
    (msg as Msg & { onRetry?: () => void }).onRetry?.();
    vi.runAllTimers();
    expect(h.retryFn).not.toHaveBeenCalled();
    expect(h.sendMessageLockRef.current.inProgress).toBe(true); // 锁未释放
  });
});
