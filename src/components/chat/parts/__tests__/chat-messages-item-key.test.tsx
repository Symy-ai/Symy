// @vitest-environment happy-dom

import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('@/i18n/provider', () => ({
  useI18n: () => ({
    t: (key: string, opts?: { defaultValue?: string }) => opts?.defaultValue ?? key,
  }),
}));

vi.mock('react-virtuoso', () => ({
  Virtuoso: ({ data, computeItemKey }: { data: unknown[]; computeItemKey: (index: number, item: unknown) => string }) => (
    <div data-testid="virtuoso">{computeItemKey(0, data[0])}</div>
  ),
}));

import { ChatMessages } from '../chat-messages';
import type { ChatMessage } from '@/types/chat-message';
import type { McpNotification } from '@/types/mcp-notification';

describe('ChatMessages item identity', () => {
  it('uses the message id as Virtuoso stable key', () => {
    const message: ChatMessage = {
      id: 'stable-message-id',
      role: 'user',
      content: 'Hello',
      timestamp: new Date(),
    };

    render(
      <ChatMessages
        messages={[message]}
        isLoading={false}
        isLoadingHistory={false}
        isLoadingMore={false}
        hasMore={false}
        firstItemIndex={100}
        mcpNotifications={[] as McpNotification[]}
        virtuosoRef={{ current: null }}
        onLoadMore={() => {}}
        onDeleteMessage={() => {}}
        onSendMessage={() => {}}
      />,
    );

    expect(screen.getByTestId('virtuoso').textContent).toBe('stable-message-id');
  });
});
