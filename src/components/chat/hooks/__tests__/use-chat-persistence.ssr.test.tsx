// @vitest-environment node

/**
 * useChatPersistence SSR 安全 (batch79-b): hook 逻辑零 window/document 依赖 —
 * 在无 window 的 node 环境下服务端渲染不抛, 三个回调闭包正常创建。
 * ('use client' 组件在 Next.js 下仍会经历 SSR 预渲染, 此为该路径的回归守卫。)
 */

import { describe, expect, it, vi } from 'vitest';
import { renderToString } from 'react-dom/server';
import { useChatPersistence } from '../use-chat-persistence';
import type { ChatMessage } from '@/components/chat-bubble';

vi.mock('@/lib/api-client', () => ({
  apiFetch: vi.fn(),
  apiFetchVoid: vi.fn(),
}));

vi.mock('@/lib/logger', () => ({
  logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

// render 期捕获 hook 返回值 — 用容器属性而非外部变量重赋值 (react-hooks/globals)
const probe: { current: Record<string, unknown> | null } = { current: null };

function Probe() {
  const hooks = useChatPersistence({
    userId: undefined,
    activeChallenge: undefined,
    messagesRef: { current: [] as ChatMessage[] },
    setMessagesSync: () => {},
    hasMore: false,
    setHasMore: () => {},
    setFirstItemIndex: () => {},
    isLoadingMoreRef: { current: false },
    setIsLoadingMore: () => {},
    pageSize: 20,
  });
  probe.current = hooks;
  return null;
}

describe('useChatPersistence — SSR (无 window) 降级', () => {
  it('node 环境 (无 window/document) renderToString 不抛, 回调闭包正常创建', () => {
    expect(typeof window).toBe('undefined');
    expect(() => renderToString(<Probe />)).not.toThrow();
    const hooks = probe.current as {
      saveMessage: unknown;
      deleteMessage: unknown;
      loadMoreMessages: unknown;
    } | null;
    expect(hooks).not.toBeNull();
    expect(typeof hooks!.saveMessage).toBe('function');
    expect(typeof hooks!.deleteMessage).toBe('function');
    expect(typeof hooks!.loadMoreMessages).toBe('function');
  });
});
