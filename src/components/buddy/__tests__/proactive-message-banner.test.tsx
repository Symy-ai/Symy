// @vitest-environment happy-dom
import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ProactiveMessageBanner } from '../proactive-message-banner';
import { apiFetchVoid } from '@/lib/api-client';
import type { ProactiveMessage, ProactiveMessageTrigger } from '@/types/buddy-state';

vi.mock('@/lib/api-client', () => ({ apiFetchVoid: vi.fn() }));
vi.mock('@/lib/logger', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } }));
vi.mock('next-themes', () => ({ useTheme: vi.fn(() => ({ resolvedTheme: 'dark' })) }));
vi.mock('@/i18n/provider', () => ({
  useI18n: () => ({
    locale: 'en',
    t: (key: string, params?: Record<string, string | number> & { defaultValue?: string }) => {
      if (params?.count !== undefined) return `+${params.count} more`;
      return params?.defaultValue ?? (params && 'count' in params ? undefined : key);
    },
  }),
}));

function message(overrides: Partial<ProactiveMessage> = {}): ProactiveMessage {
  return {
    id: 'm1',
    trigger: 'morning_checkin' as ProactiveMessageTrigger,
    textKey: 'buddy.morning',
    textFallback: 'Good morning',
    createdAt: new Date(Date.now() - 30 * 60 * 1000).toISOString(),
    read: false,
    ...overrides,
  };
}

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.mocked(apiFetchVoid).mockResolvedValue(undefined);
});

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
});

function openArchive() {
  fireEvent.click(screen.getAllByTitle('View all messages')[0] ?? screen.getByText(/^\+1 more/));
}

describe('ProactiveMessageBanner visibility', () => {
  it('renders the latest unread message and prefers i18n fallback text', () => {
    render(
      <ProactiveMessageBanner
        messages={[
          message({ id: 'old', textKey: 'buddy.old', textFallback: 'Old', createdAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString() }),
          message({ id: 'new', textKey: 'buddy.new', textFallback: 'New' }),
        ]}
      />,
    );

    expect(screen.getByText('New')).toBeTruthy();
    expect(screen.queryByText('Old')).toBeNull();
  });

  it('renders nothing after every message is read', () => {
    const { container } = render(<ProactiveMessageBanner messages={[message({ read: true })]} />);
    expect(container.childElementCount).toBe(0);
  });
});

describe('ProactiveMessageBanner close', () => {
  it('optimistically dismisses, marks read, and persists in the background', async () => {
    const onMarkRead = vi.fn();
    render(<ProactiveMessageBanner messages={[message()]} onMarkRead={onMarkRead} />);

    await act(() => {
      fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    });

    expect(onMarkRead).toHaveBeenCalledWith('m1');
    expect(apiFetchVoid).toHaveBeenCalledWith('/api/buddy/proactive-messages', {
      method: 'POST',
      body: { messageId: 'm1' },
    });
    expect(screen.queryByRole('status', { name: '' })).toBeNull();
  });

  it('keeps the dismissal when persistence fails and logs a warning', async () => {
    const failure = new Error('offline');
    vi.mocked(apiFetchVoid).mockRejectedValue(failure);
    const { logger } = await import('@/lib/logger');
    render(<ProactiveMessageBanner messages={[message()]} />);

    await act(() => {
      fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    });

    expect(screen.queryByRole('status')).toBeNull();
    expect(logger.warn).toHaveBeenCalledWith('[Proactive Message Banner] Failed to mark read:', failure);
  });
});

describe('ProactiveMessageBanner archive', () => {
  it('locks body scroll, closes on Escape, and restores scroll state', async () => {
    render(<ProactiveMessageBanner messages={[message(), message({ id: 'm2' })]} />);
    openArchive();
    expect(document.body.style.overflow).toBe('hidden');

    await act(() => {
      fireEvent.keyDown(document, { key: 'Escape' });
    });

    expect(document.body.style.overflow).toBe('');
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('closes on outside click and marks an unread archive item optimistically', async () => {
    const onMarkRead = vi.fn();
    const root = render(<ProactiveMessageBanner messages={[message(), message({ id: 'm2' })]} onMarkRead={onMarkRead} />);
    openArchive();

    const item = screen.getAllByRole('button').find(element => element.getAttribute('aria-label') === 'buddy.proactiveMessagesMarkRead');
    expect(item).toBeTruthy();
    await act(() => {
      fireEvent.click(item!);
    });
    expect(onMarkRead).toHaveBeenCalledWith('m1');

    await act(() => {
      fireEvent.mouseDown(document.body);
    });
    expect(document.body.style.overflow).toBe('');
    root.unmount();
  });

  it('supports Enter activation and ignores already-read archive items', async () => {
    const onMarkRead = vi.fn();
    render(<ProactiveMessageBanner messages={[message(), message({ id: 'm2' })]} onMarkRead={onMarkRead} />);
    openArchive();
    const item = screen.getAllByRole('button').find(element => element.getAttribute('aria-label') === 'buddy.proactiveMessagesMarkRead')!;
    await act(() => {
      fireEvent.keyDown(item, { key: 'Enter' });
    });
    expect(onMarkRead).toHaveBeenCalledWith('m1');

    expect(onMarkRead).toHaveBeenCalledTimes(1);
  });

  it('renders both relative-time boundaries from minutes to fallback dates', () => {
    const now = Date.now();
    vi.setSystemTime(now);
    const root = render(
      <ProactiveMessageBanner
        messages={[
          message({ id: 'minutes', textFallback: 'Minutes', createdAt: new Date(now - 5 * 60 * 1000).toISOString() }),
          message({ id: 'days', textFallback: 'Days', createdAt: new Date(now - 8 * 24 * 60 * 60 * 1000).toISOString(), read: true }),
          message({ id: 'visible', textFallback: 'Visible', createdAt: new Date(now - 60 * 1000).toISOString() }),
        ]}
      />,
    );
    openArchive();

    expect(screen.getAllByText('5m ago')).toHaveLength(1);
    expect(screen.getAllByText(new Date(now - 8 * 24 * 60 * 60 * 1000).toLocaleDateString('en-US'))).toHaveLength(1);
    root.unmount();
  });
});
