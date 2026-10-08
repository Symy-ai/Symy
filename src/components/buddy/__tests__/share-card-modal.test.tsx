// @vitest-environment happy-dom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { ShareCardModal } from '../share-card-modal';
import type { BuddyState } from '@/types/buddy-state';

vi.mock('@/i18n/provider', () => ({
  useI18n: () => ({
    locale: 'en',
    t: (key: string, params?: Record<string, unknown>) => {
      const translations: Record<string, string> = {
        'share.defaultQuote': 'Every guarded choice is a medal.',
        'share.yourCompanion': 'Your green guard companion',
        'share.interceptMedal.wonBackLabel': 'Time won back',
        'share.wonBackUnit': 'hours',
        'share.daysGuarded': 'days guarded',
        'share.vitalityLabel': 'vitality',
        'share.joinSymy': 'Join Symy',
        'common.close': 'Close',
        'buddy.shareSaveImage': 'Save Image',
        'buddy.shareShare': 'Share',
        'buddy.shareTodayStoryLabel': "✏️ Today's story (optional)",
        'buddy.sharePersonalize': '+ Personalize',
        'buddy.shareUseDefault': 'Use default',
        'buddy.shareTodayStoryPlaceholder': 'Today I resisted buying...',
      };
      const fallback = translations[key] ?? key;
      return typeof params?.defaultValue === 'string' ? params.defaultValue : fallback;
    },
  }),
}));

vi.mock('@/hooks/use-hourly-rate', () => ({
  useHourlyRate: () => ({ hourlyRate: 20 }),
}));

vi.mock('@/lib/api-client', () => ({
  apiFetch: vi.fn(),
}));

vi.mock('@/lib/logger', () => ({
  logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

vi.mock('@/components/common/multi-platform-share', () => ({
  MultiPlatformShare: vi.fn(() => <div data-testid="multi-platform-share" />),
}));

const canvasText: string[] = [];
const toDataURLMock = vi.fn(() => 'data:image/png;base64,stub');

const makeState = (overrides: Partial<BuddyState> = {}): BuddyState => ({
  dreamFunds: [
    { id: 'fund-camera', name: 'Camera', target: 1000, current: 500, emoji: '📷' },
    { id: 'df-savings', name: 'Savings', target: 1000, current: 250, emoji: '🏦' },
  ],
  streak: 12,
  level: 3,
  vitality: 87.5,
  ...overrides,
} as unknown as BuddyState);

const apiFetchMock = vi.hoisted(() => vi.fn());

beforeEach(() => {
  vi.mocked(apiFetchMock).mockResolvedValue({ refCode: 'FRIEND42' });
  const context = {
    fillRect: vi.fn(),
    beginPath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    stroke: vi.fn(),
    fillText: vi.fn((text: string) => canvasText.push(String(text))),
    measureText: vi.fn((text: string) => ({ width: String(text).length * 10 })),
    createLinearGradient: vi.fn(() => ({ addColorStop: vi.fn() })),
  };
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(context as unknown as CanvasRenderingContext2D);
  vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockImplementation(toDataURLMock);
  globalThis.fetch = vi.fn().mockResolvedValue({ blob: () => Promise.resolve(new Blob(['stub'], { type: 'image/png' })) });
  canvasText.length = 0;
  toDataURLMock.mockClear();
});

afterEach(() => {
  vi.restoreAllMocks();
  cleanup();
});

vi.mock('@/lib/api-client', () => ({
  apiFetch: apiFetchMock,
}));

describe('ShareCardModal', () => {
  it('renders nothing when closed', () => {
    render(<ShareCardModal open={false} onClose={() => {}} buddyState={makeState()} aiQuote="Calm mind" />);

    expect(document.body.textContent).not.toContain("Today's story");
  });

  it('generates a card preview and converts it to an image blob', async () => {
    render(<ShareCardModal open onClose={() => {}} buddyState={makeState()} aiQuote="Calm mind" />);

    await waitFor(() => expect(screen.getByRole('img', { name: 'Symy Guardian Card' })).toBeTruthy());
    expect(screen.getByText("✏️ Today's story (optional)")).toBeTruthy();
    expect(screen.getByRole('button', { name: '+ Personalize' })).toBeTruthy();
    expect(await screen.findByTestId('multi-platform-share')).toBeTruthy();
  });

  it('keeps monetary data out of the rendered card text', async () => {
    render(
      <ShareCardModal
        open
        onClose={() => {}}
        buddyState={makeState()}
        aiQuote="Kept my calm near $1,234 and 56.78 dollars today."
      />,
    );

    await waitFor(() => expect(canvasText.length).toBeGreaterThan(0));
    const rendered = canvasText.join('\n');
    expect(rendered).toContain('Kept my calm near and today.');
    expect(rendered).toContain('37.5');
    expect(rendered).toContain('🔥 12 days guarded');
    expect(rendered).toContain('⚡ LV.3');
    expect(rendered).toContain('88% vitality');
    expect(rendered).toContain('🎯 Camera 50%');
    expect(rendered).not.toMatch(/(?:[$¥£]\s*\d|\b(?:USD|CNY|Amount)\b)/i);
  });

  it('formats hours with grouping after 100 and one decimal below 100', async () => {
    const largeState = makeState({
      dreamFunds: [
        { id: 'fund-large', name: 'Home', target: 1000, current: 4000, emoji: '🏠' },
        { id: 'df-savings', name: 'Savings', target: 1000, current: 1000, emoji: '🏦' },
      ],
    });
    render(<ShareCardModal open onClose={() => {}} buddyState={largeState} aiQuote="Big guard" />);

    await waitFor(() => expect(canvasText.join('\n')).toContain('250'));
  });

  it('uses the fallback quote when stripping removes the entire AI quote', async () => {
    render(<ShareCardModal open onClose={() => {}} buddyState={makeState()} aiQuote="$12.34" />);

    await waitFor(() => expect(canvasText.join('\n')).toContain('Every guarded choice is a medal.'));
  });

  it('shows, bounds, and clears the personal story input', () => {
    render(<ShareCardModal open onClose={() => {}} buddyState={makeState()} aiQuote="Calm mind" />);

    fireEvent.click(screen.getByRole('button', { name: '+ Personalize' }));
    const textarea = screen.getByPlaceholderText('Today I resisted buying...') as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: 'x'.repeat(140) } });

    expect(textarea.value).toHaveLength(120);
    expect(screen.getByText('120/120')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Use default' }));

    expect(screen.queryByPlaceholderText('Today I resisted buying...')).toBeNull();
  });

  it('closes on the close button and Escape key', () => {
    const onClose = vi.fn();
    render(<ShareCardModal open onClose={onClose} buddyState={makeState()} aiQuote="Calm mind" />);

    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    fireEvent.keyDown(document, { key: 'Escape' });

    expect(onClose).toHaveBeenCalledTimes(2);
  });
});
