// @vitest-environment happy-dom

import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { NotificationCard } from '../notification-card';
import type { GuardianStoryNotification, TikTokShopNotification } from '@/lib/demo-data';

vi.mock('@/i18n/provider', () => ({
  useI18n: () => ({
    t: (key: string, values?: Record<string, string | number>) => ({
      'notification.tiktokShop': 'TikTok Shop',
      'impulseDetector.scoreLabels.low': 'Clean pass',
      'impulseDetector.scoreLabels.moderate': 'Worth another look',
      'impulseDetector.scoreLabels.high': 'Guard moment',
      'impulseDetector.guardMomentHint': 'The little elephant wants to sit with you on this one →',
      'notification.greenPick.badge': 'Green pick',
      'notification.guardianStory.title': 'Saved for you: {item} (${amount}) ≈ {hours} of freedom',
      'notification.guardianStory.altSuggestion': 'Instead',
    })[key]?.replace(/\{(\w+)\}/g, (_, name: string) => String(values?.[name] ?? '')) ?? key,
    locale: 'en',
  }),
}));

const notification = {
  id: 'notification-1',
  platform: 'tiktok',
  item: 'Ceramic mug',
  category: 'Home Decor',
  amount: 28,
  timestamp: new Date('2026-09-06T10:00:00Z'),
  thumbnail: '🐘',
  isLivestream: false,
  isFlashSale: false,
} satisfies TikTokShopNotification;

describe('NotificationCard', () => {
  it.each([
    [20, 'Clean pass'],
    [45, 'Worth another look'],
    [75, 'Guard moment'],
  ])('renders level copy for score %i', (score, label) => {
    const { container } = render(<NotificationCard notification={notification} impulseScore={score} />);
    expect(screen.getByText(label)).toBeTruthy();
    expect(container.innerHTML).not.toContain('red-500');
  });

  it('shows the guard invitation only for guard moments', () => {
    const { rerender, queryByText } = render(<NotificationCard notification={notification} impulseScore={75} />);
    expect(screen.getByText(/little elephant wants to sit/i)).toBeTruthy();
    rerender(<NotificationCard notification={notification} impulseScore={20} />);
    expect(queryByText(/little elephant wants to sit/i)).toBeNull();
  });

  it('renders a green pick badge', () => {
    const { container } = render(
      <NotificationCard notification={{ ...notification, isGreenPick: true }} impulseScore={20} />,
    );
    expect(screen.getByText('Green pick')).toBeTruthy();
    expect(container.innerHTML).toContain('emerald');
  });

  it('renders a guardian story with freedom hours and without shaming copy', () => {
    const { container } = render(
      <NotificationCard
        notification={{
          ...notification,
          type: 'guardian-story',
          altSuggestion: 'Borrow one for movie night first',
          savedHours: 3.6,
          hourlyRate: 25,
        } as GuardianStoryNotification}
        impulseScore={20}
      />,
    );
    expect(screen.getByText(/Saved for you: Ceramic mug/)).toBeTruthy();
    expect(screen.getByText(/3\.6 hours of freedom/)).toBeTruthy();
    expect(screen.getByText(/Borrow one for movie night first/)).toBeTruthy();
    expect(container.textContent?.toLowerCase()).not.toMatch(/stupid|waste|loser|failure/);
  });
});
