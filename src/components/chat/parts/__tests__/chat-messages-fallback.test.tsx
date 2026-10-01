// @vitest-environment happy-dom

import { describe, expect, it, vi } from 'vitest';
import { render, screen, act } from '@testing-library/react';

vi.mock('@/i18n/provider', () => ({
  useI18n: () => ({
    t: (key: string, opts?: { defaultValue?: string }) => {
      const map: Record<string, string> = {
        'chat.welcomeTitle': '🐘 Symy',
        'chat.welcomeDesc': 'Your green-shopping companion.',
        'chat.dormantWarning': 'Dormant',
        'chat.loadingChatHistory': 'Loading chat history...',
        'chat.scrollUpHint': 'Scroll up',
        'chat.symyTyping': 'Symy is typing...',
        'chat.deleteMessage': 'Delete',
        'chat.aiFallback.retry': 'Retry',
        'chat.aiFallback.streamInterrupted': 'The reply was cut off.',
        'chat.messageUnavailable': 'This message is temporarily unavailable. Try refreshing.',
      };
      return map[key] ?? opts?.defaultValue ?? key;
    },
  }),
}));

import { ChatMessages, toDisplayMessage } from '../chat-messages';
import { ChatBubble } from '../../../chat-bubble';
import type { ChatMessage } from '@/types/chat-message';
import type { McpNotification } from '@/types/mcp-notification';

const baseMessages: ChatMessage[] = [
  { id: 'u1', role: 'user', content: 'Hello', timestamp: new Date() },
];

const defaultProps = {
  messages: baseMessages,
  isLoading: false,
  isLoadingHistory: false,
  isLoadingMore: false,
  hasMore: false,
  firstItemIndex: 0,
  mcpNotifications: [] as McpNotification[],
  virtuosoRef: { current: null } as { current: null },
  onLoadMore: () => {},
  onDeleteMessage: () => {},
  onSendMessage: () => {},
};

describe('ChatMessages fallback states', () => {
  it('renders empty state when messages is empty', async () => {
    await act(() => {
      render(
        <div style={{ height: '400px' }}>
          <ChatMessages {...defaultProps} messages={[]} />
        </div>,
      );
    });
    expect(screen.getByText('🐘 Symy')).toBeTruthy();
  });

  it('renders a retry affordance for an assistant error message', () => {
    const errorMessage: ChatMessage = {
      id: 'e1',
      role: 'assistant',
      content: 'The reply was cut off.',
      timestamp: new Date(),
      isError: true,
      onRetry: () => {},
    };
    render(<ChatBubble message={errorMessage} />);
    expect(screen.getByText('The reply was cut off.')).toBeTruthy();
    expect(screen.getByText('Retry')).toBeTruthy();
  });

  it('renders user bubbles without the internal symy-clarify tag', () => {
    const taggedMessage: ChatMessage = {
      id: 'u2',
      role: 'user',
      content: '[symy-clarify:clothing] Want to see what for the child?',
      timestamp: new Date(),
    };

    expect(toDisplayMessage(taggedMessage)).toMatchObject({
      id: 'u2',
      role: 'user',
      content: 'Want to see what for the child?',
      timestamp: taggedMessage.timestamp,
    });

    expect(toDisplayMessage(baseMessages[0]).content).toBe('Hello');
    expect(taggedMessage.content).toBe('[symy-clarify:clothing] Want to see what for the child?');

    render(<ChatBubble message={toDisplayMessage(taggedMessage)} />);
    expect(screen.queryByText(/\[symy-clarify:clothing\]/)).toBeNull();
    expect(screen.getByText('Want to see what for the child?')).toBeTruthy();
    expect(screen.queryByText('Hello')).toBeNull();
  });

  it('keeps malformed user content unchanged for the message-level boundary', () => {
    const malformed = { id: 'bad', role: 'user' as const, content: null as unknown as string, timestamp: new Date() };

    expect(toDisplayMessage(malformed)).toBe(malformed);
  });
});
