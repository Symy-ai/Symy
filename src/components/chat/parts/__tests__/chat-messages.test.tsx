// @vitest-environment happy-dom

import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

vi.mock('@/i18n/provider', () => ({
  useI18n: () => ({
    t: (key: string, opts?: { defaultValue?: string }) => {
  const map: Record<string, string> = {
    'chat.loadingChatHistory': 'Loading chat history...',
    'chat.loadingMore': 'Loading more...',
    'chat.scrollUpHint': 'Load earlier messages',
    'chat.symyTyping': 'Symy is typing...',
    'chat.dormantWarning': 'Dormant',
      };
      return map[key] ?? opts?.defaultValue ?? key;
    },
  }),
}));

vi.mock('react-virtuoso', () => {
  type VirtuosoProps = {
    data: unknown[];
    followOutput: (atBottom: boolean) => 'auto' | false;
    startReached: () => void;
    firstItemIndex: number;
    initialTopMostItemIndex: number;
    increaseViewportBy: { top: number; bottom: number };
  };
  const latest = { props: null as VirtuosoProps | null };
  const Virtuoso = (props: VirtuosoProps) => {
    latest.props = props;
    return <div data-testid="virtuoso" />;
  };
  return {
    Virtuoso,
    __getLatestProps: () => latest.props,
  };
});

import type { VirtuosoHandle } from 'react-virtuoso';
// mock 工厂额外导出的调试 helper (真模块无此导出, tsc 看不见 — 宽型 cast)
import * as VirtuosoModule from 'react-virtuoso';
const __getLatestProps = (VirtuosoModule as unknown as { __getLatestProps: () => { followOutput?: (atBottom: boolean) => 'auto' | false } }).__getLatestProps;
import { ChatMessages } from '../chat-messages';
import type { ChatMessage } from '@/types/chat-message';
import type { McpNotification } from '@/types/mcp-notification';

function message(overrides: Partial<ChatMessage> = {}): ChatMessage {
  return {
    id: 'm1',
    role: 'user',
    content: 'Hello',
    timestamp: new Date(),
    ...overrides,
  };
}

function setup(overrides: Record<string, unknown> = {}) {
  const scrollToIndex = vi.fn();
  const virtuosoRef = { current: { scrollToIndex } as unknown as VirtuosoHandle };
  const onLoadMore = vi.fn();

  const props = {
    messages: [message()],
    isLoading: false,
    isLoadingHistory: false,
    isLoadingMore: false,
    hasMore: false,
    firstItemIndex: 0,
    mcpNotifications: [] as McpNotification[],
    virtuosoRef,
    onLoadMore,
    onDeleteMessage: () => {},
    onSendMessage: () => {},
    ...overrides,
  };
  return { props, scrollToIndex, onLoadMore, rerender: () => {} };
}

function renderMessages(props: Record<string, unknown>) {
  return render(<ChatMessages {...(props as unknown as React.ComponentProps<typeof ChatMessages>)} />);
}

describe('ChatMessages behavior', () => {
  it('shows history loading instead of the empty state', () => {
    const { props } = setup({ isLoadingHistory: true, messages: [] });
    renderMessages(props);
    expect(screen.getByText('Loading chat history...')).toBeTruthy();
    expect(screen.queryByTestId('virtuoso')).toBeNull();
  });

  it('shows a dormant warning in the empty state', () => {
    const { props } = setup({
      messages: [],
      buddyState: { health: 'dormant' } as never,
    });
    renderMessages(props);
    expect(screen.getByText('Dormant')).toBeTruthy();
  });

  it('shows an active loader while loading more history', () => {
    const { props } = setup({ isLoadingMore: true, hasMore: true });
    renderMessages(props);
    expect(screen.getByText('Loading more...')).toBeTruthy();
  });

  it('offers and invokes load-more when earlier history remains', () => {
    const { props, onLoadMore } = setup({ hasMore: true });
    renderMessages(props);
    fireEvent.click(screen.getByRole('button', { name: 'Load earlier messages' }));
    expect(onLoadMore).toHaveBeenCalledTimes(1);
  });

  it('shows the external typing indicator before an assistant message exists', () => {
    const { props } = setup({ isLoading: true });
    renderMessages(props);
    expect(screen.getByText('Symy is typing...')).toBeTruthy();
  });

  it('omits the external typing indicator for an empty assistant message', () => {
    const { props } = setup({
      isLoading: true,
      messages: [message({ role: 'assistant', content: '' })],
    });
    renderMessages(props);
    expect(screen.queryByText('Symy is typing...')).toBeNull();
    expect(screen.getByTestId('virtuoso')).toBeTruthy();
  });

  it('renders MCP notifications by id and semantic type', () => {
    const notifications: McpNotification[] = [
      { id: 'n1', type: 'badge', message: 'Badge earned' },
      { id: 'n2', type: 'reward', message: 'Reward earned' },
      { id: 'n3', type: 'warning' as never, message: 'Warning shown' },
    ];
    const { props } = setup({ mcpNotifications: notifications });
    renderMessages(props);
    expect(screen.getByText('🏅 Badge earned')).toBeTruthy();
    expect(screen.getByText('✨ Reward earned')).toBeTruthy();
    expect(screen.getByText('💔 Warning shown')).toBeTruthy();
  });

  it('does not follow output when Virtuoso is not at the bottom', () => {
    const { props } = setup();
    renderMessages(props);
    expect(__getLatestProps()?.followOutput?.(false)).toBe(false);
    expect(__getLatestProps()?.followOutput?.(true)).toBe('auto');
  });

  it('follows new messages and streaming growth by scrolling to the bottom', async () => {
    const { props, scrollToIndex } = setup();
    const view = renderMessages(props);
    // 真实行为: 挂载即触发 1 次 — prevLastContentLenRef 初始 0, 末条 content>0 即 contentGrew 兜底滚动
    await waitFor(() => expect(scrollToIndex).toHaveBeenCalledTimes(1));
    scrollToIndex.mockClear();

    view.rerender(
      <ChatMessages
        {...(props as unknown as React.ComponentProps<typeof ChatMessages>)}
        messages={[message(), message({ id: 'm2', content: 'World' })]}
      />,
    );
    await waitFor(() =>
      expect(scrollToIndex).toHaveBeenCalledWith({ index: Number.MAX_SAFE_INTEGER, behavior: 'auto' }),
    );
    scrollToIndex.mockClear();

    // 流式增长: 消息数不变但末条 content 变长 → prevLastContentLen 检测到增长 → rAF 滚动
    view.rerender(
      <ChatMessages
        {...(props as unknown as React.ComponentProps<typeof ChatMessages>)}
        messages={[message(), message({ id: 'm2', role: 'assistant', content: 'World and more' })]}
      />,
    );
    await waitFor(() => expect(scrollToIndex).toHaveBeenCalledTimes(1));
  });

  it('scrolls to the bottom after history loading finishes', async () => {
    const { props, scrollToIndex } = setup({ isLoadingHistory: true });
    const view = renderMessages(props);
    view.rerender(
      <ChatMessages
        {...(props as unknown as React.ComponentProps<typeof ChatMessages>)}
        isLoadingHistory={false}
      />,
    );
    await waitFor(() =>
      expect(scrollToIndex).toHaveBeenCalledWith({ index: Number.MAX_SAFE_INTEGER, behavior: 'auto' }),
    );
  });
});
