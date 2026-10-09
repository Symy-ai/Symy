import { describe, expect, it, vi, beforeEach } from 'vitest';

import { createStreamErrorRetry, markStreamErrorBubble } from '../stream-error-retry';
import type { ChatMessage } from '@/components/chat-bubble';

type Msg = ChatMessage;

function makeRefs() {
  return {
    setMessagesSync: vi.fn(),
    messagesRef: { current: [] as Msg[] },
    sendMessageLockRef: { current: { inProgress: false, lastContent: '', lastTime: 0 } },
    retryAiResponseRef: { current: null as ((c: string) => Promise<void>) | null },
  };
}

/**
 * stream-error-retry.ts (77行) — 流错误重试双函数。
 *
 * 锁定:
 * - createStreamErrorRetry: 删错误泡→取最后 user 消息→释放锁→异步重试
 * - skipIfLocked 门卫 (锁内直接 return)
 * - content 来源优先级: retryContent 显参 < messagesRef 最后 user 消息
 * - 无 content → 不重试
 * - markStreamErrorBubble: 打 isError+onRetry 标记
 */
describe('createStreamErrorRetry', () => {
  beforeEach(() => vi.useFakeTimers());

  it('完整链: 删泡→释放锁→retry 最后 user 消息', () => {
    const r = makeRefs();
    ;(r.messagesRef.current as Msg[]) = [
      { id: 'u1', role: 'user', content: '帮我看看键盘', timestamp: new Date(1) },
      { id: 'a1', role: 'assistant', content: '...', timestamp: new Date(2) },
      { id: 'u2', role: 'user', content: '换个颜色呢', timestamp: new Date(3) },
    ];
    r.sendMessageLockRef.current.inProgress = true;
    const retry = vi.fn(async () => {});
    r.retryAiResponseRef.current = retry;

    const fn = createStreamErrorRetry({
      assistantMsgId: 'a1',
      setMessagesSync: r.setMessagesSync,
      messagesRef: r.messagesRef,
      sendMessageLockRef: r.sendMessageLockRef,
      retryAiResponseRef: r.retryAiResponseRef,
    });
    fn();

    // 删泡
    const updater = r.setMessagesSync.mock.calls[0][0] as (p: Array<{ id: string }>) => Array<{ id: string }>;
    expect(updater([{ id: 'u1' }, { id: 'a1' }])).toEqual([{ id: 'u1' }]);
    // 释放锁
    expect(r.sendMessageLockRef.current.inProgress).toBe(false);
    // 异步重试用最后 user 消息
    vi.runAllTimers();
    expect(retry).toHaveBeenCalledWith('换个颜色呢');
  });

  it('skipIfLocked=true 且锁内 → 直接 return 零动作', () => {
    const r = makeRefs();
    r.sendMessageLockRef.current.inProgress = true;
    const fn = createStreamErrorRetry({
      assistantMsgId: 'a1', setMessagesSync: r.setMessagesSync,
      messagesRef: r.messagesRef, sendMessageLockRef: r.sendMessageLockRef,
      retryAiResponseRef: r.retryAiResponseRef, skipIfLocked: true,
    });
    fn();
    expect(r.setMessagesSync).not.toHaveBeenCalled();
  });

  it('messagesRef 存在时覆盖 retryContent (ref 优先 — 行为锚)', () => {
    const r = makeRefs();
    ;(r.messagesRef.current as Msg[]) = [{ id: 'u1', role: 'user', content: '旧消息', timestamp: new Date(1) }];
    const retry = vi.fn(async () => {});
    r.retryAiResponseRef.current = retry;
    createStreamErrorRetry({
      assistantMsgId: 'a1', setMessagesSync: r.setMessagesSync,
      messagesRef: r.messagesRef, sendMessageLockRef: r.sendMessageLockRef,
      retryAiResponseRef: r.retryAiResponseRef, retryContent: '显参内容',
    })();
    vi.runAllTimers();
    expect(retry).toHaveBeenCalledWith('旧消息'); // messagesRef 覆盖显参
  });

  it('无 content (ref 空且无显参) → 不调 retry', () => {
    const r = makeRefs();
    const retry = vi.fn(async () => {});
    r.retryAiResponseRef.current = retry;
    createStreamErrorRetry({
      assistantMsgId: 'a1', setMessagesSync: r.setMessagesSync,
      sendMessageLockRef: r.sendMessageLockRef, retryAiResponseRef: r.retryAiResponseRef,
    })();
    vi.runAllTimers();
    expect(retry).not.toHaveBeenCalled();
  });

  it('releaseLockBeforeRetry=false → 锁保留', () => {
    const r = makeRefs();
    r.sendMessageLockRef.current.inProgress = true;
    ;(r.messagesRef.current as Msg[]) = [{ id: 'u1', role: 'user', content: 'x', timestamp: new Date(1) }];
    createStreamErrorRetry({
      assistantMsgId: 'a1', setMessagesSync: r.setMessagesSync,
      messagesRef: r.messagesRef, sendMessageLockRef: r.sendMessageLockRef,
      retryAiResponseRef: r.retryAiResponseRef, releaseLockBeforeRetry: false,
    })();
    expect(r.sendMessageLockRef.current.inProgress).toBe(true);
  });
});

describe('markStreamErrorBubble', () => {
  it('打 isError+onRetry 标记 (仅目标 id)', () => {
    const setMessagesSync = vi.fn();
    const onRetry = () => {};
    markStreamErrorBubble({ assistantMsgId: 'a1', content: '出错了', setMessagesSync, onRetry });
    const updater = setMessagesSync.mock.calls[0][0] as (
      p: Array<{ id: string; isError?: boolean; onRetry?: () => void }>,
    ) => Array<{ id: string; isError?: boolean }>;
    const result = updater([{ id: 'a1' }, { id: 'a2' }]);
    expect(result[0]).toMatchObject({ id: 'a1', isError: true, onRetry });
    expect(result[1]).not.toHaveProperty('isError');
  });
});
