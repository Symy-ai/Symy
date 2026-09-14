// @vitest-environment happy-dom

/**
 * useChatRecap 基本行为 — 派生一次后锁定 / demo 静默 / sessionStorage 去重 / dismiss。
 */

import { beforeEach, describe, expect, it } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useChatRecap } from '../use-chat-recap';
import type { ChatMessage } from '@/types/chat-message';

function greenHistory(): ChatMessage[] {
  return [
    {
      id: 'h1',
      role: 'assistant',
      content: '嗨',
      timestamp: new Date(Date.now() - 3600_000),
    },
    {
      id: 'h2',
      role: 'user',
      content: '我想买个象牙手镯',
      timestamp: new Date(Date.now() - 3500_000),
    },
  ];
}

function chitChat(): ChatMessage[] {
  return [
    { id: 'c1', role: 'user', content: '你好', timestamp: new Date(Date.now() - 3600_000) },
  ];
}

describe('useChatRecap', () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  it('历史就绪 + 含绿色话题 → 派生 recap', () => {
    const { result } = renderHook(() =>
      useChatRecap({ messages: greenHistory(), isDemo: false, historyReady: true })
    );
    expect(result.current.recap?.kind).toBe('green_alt');
    expect(result.current.recap?.messageId).toBe('h2');
  });

  it('纯寒暄 → recap 为 null, 零渲染', () => {
    const { result } = renderHook(() =>
      useChatRecap({ messages: chitChat(), isDemo: false, historyReady: true })
    );
    expect(result.current.recap).toBeNull();
  });

  it('demo 模式 → 不派生', () => {
    const { result } = renderHook(() =>
      useChatRecap({ messages: greenHistory(), isDemo: true, historyReady: true })
    );
    expect(result.current.recap).toBeNull();
  });

  it('历史未就绪 → 暂不派生; 就绪后派生一次并锁定 (本会话新消息不再触发)', () => {
    const initial = chitChat();
    const { result, rerender } = renderHook(
      ({ messages, historyReady }: { messages: ChatMessage[]; historyReady: boolean }) =>
        useChatRecap({ messages, isDemo: false, historyReady }),
      { initialProps: { messages: initial, historyReady: false } }
    );
    rerender({ messages: initial, historyReady: false });
    expect(result.current.recap).toBeNull();

    const history = greenHistory();
    rerender({ messages: history, historyReady: true });
    expect(result.current.recap?.messageId).toBe('h2');

    // 派生已锁定: 后续消息变化不更新 / 不清除 recap
    rerender({ messages: [...history, { id: 'new', role: 'user', content: '再看看皮草', timestamp: new Date() }], historyReady: true });
    expect(result.current.recap?.messageId).toBe('h2');
  });

  it('sessionStorage 已记录该话题 → 本浏览器会话不再出现', () => {
    sessionStorage.setItem('symy:chat-recap:dismissed-message-id', 'h2');
    const { result } = renderHook(() =>
      useChatRecap({ messages: greenHistory(), isDemo: false, historyReady: true })
    );
    expect(result.current.recap).toBeNull();
  });

  it('dismiss → recap 清空 + 写 sessionStorage', () => {
    const { result } = renderHook(() =>
      useChatRecap({ messages: greenHistory(), isDemo: false, historyReady: true })
    );
    act(() => result.current.dismiss());
    expect(result.current.recap).toBeNull();
    expect(sessionStorage.getItem('symy:chat-recap:dismissed-message-id')).toBe('h2');
  });
});
