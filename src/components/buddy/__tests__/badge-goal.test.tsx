/**
 * badge-goal component tests
 *
 * Covers:
 * - BadgesSection goal bar + set-goal button wiring
 * - BadgeGoalBanner render/celebrate/share/dismiss behavior
 */

// @vitest-environment happy-dom

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, act } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import type { BuddyState } from '@/types/buddy-state';
import { BadgesSection } from '@/components/buddy/badges-section';
import { BadgeGoalBanner } from '@/components/buddy/badge-goal-banner';
import zh from '@/i18n/messages/zh.json';
import en from '@/i18n/messages/en.json';

const messages = { zh, en };

const wrapperZh = ({ children }: { children: React.ReactNode }) => (
  <NextIntlClientProvider locale="zh" messages={messages.zh}>{children}</NextIntlClientProvider>
);
const wrapperEn = ({ children }: { children: React.ReactNode }) => (
  <NextIntlClientProvider locale="en" messages={messages.en}>{children}</NextIntlClientProvider>
);

const makeBuddyState = (overrides: Partial<BuddyState> = {}): BuddyState => ({
  vitality: 100,
  tokens: 10,
  health: 'healthy',
  level: 1,
  xp: 0,
  xpToNext: 100,
  streak: 0,
  dreamFunds: [],
  badges: [],
  totalSaved: 0,
  challengesCompleted: 0,
  lastHealingKitAt: null,
  version: 1,
  growthStage: 'baby',
  personality: 'unknown',
  intimacy: 0,
  dailyNeeds: { clarity: 50, connection: 50 },
  proactiveMessages: [],
  personalityAwakenedAt: null,
  lastActiveAt: null,
  ...overrides,
});

describe('BadgesSection goal wiring', () => {
  const badges = ['impulse_shield'];

  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
  });

  it('does not show set-goal button for untrackable badge', async () => {
    render(<BadgesSection badges={badges} buddyState={makeBuddyState()} />, { wrapper: wrapperZh });
    // Open detail panel
    await act(() => screen.getByText(/查看全部/).click());
    await waitFor(() => expect(screen.queryByTestId('set-goal-quiet_night_master')).toBeNull());
  });

  it('shows set-goal button for trackable badge', async () => {
    render(<BadgesSection badges={badges} buddyState={makeBuddyState()} />, { wrapper: wrapperZh });
    await act(() => screen.getByText(/查看全部/).click());
    await waitFor(() => screen.getByTestId('set-goal-streak_7'));
    expect(screen.getByTestId('set-goal-streak_7').textContent).toBe('设为守护目标');
  });

  it('does not show set-goal button for already earned badge', async () => {
    render(<BadgesSection badges={['streak_7']} buddyState={makeBuddyState({ badges: ['streak_7'] })} />, { wrapper: wrapperZh });
    await act(() => screen.getByText(/查看全部/).click());
    await waitFor(() => expect(screen.queryByTestId('set-goal-streak_7')).toBeNull());
  });

  it('goal bar shows progress text correctly', async () => {
    localStorage.setItem('symy-badge-goal', 'streak_7');
    render(<BadgesSection badges={badges} buddyState={makeBuddyState({ streak: 3 })} />, { wrapper: wrapperZh });
    await waitFor(() => screen.getByText(/3\/7/));
  });

  it('shows active goal copy when badge is current goal', async () => {
    localStorage.setItem('symy-badge-goal', 'streak_7');
    render(<BadgesSection badges={badges} buddyState={makeBuddyState()} />, { wrapper: wrapperZh });
    await act(() => screen.getByText(/查看全部/).click());
    await waitFor(() => screen.getByTestId('set-goal-streak_7'));
    expect(screen.getByTestId('set-goal-streak_7').textContent).toBe('这是你选的守护目标');
  });
});

describe('BadgeGoalBanner', () => {
  const buddyStateUnlocked = makeBuddyState({ badges: ['streak_7'] });

  beforeEach(() => {
    localStorage.clear();
  });

  it('renders when goal badge is unlocked and not celebrated', async () => {
    localStorage.setItem('symy-badge-goal', 'streak_7');
    const onShare = vi.fn();
    render(<BadgeGoalBanner buddyState={buddyStateUnlocked} onShare={onShare} />, { wrapper: wrapperEn });
    await waitFor(() => screen.getByTestId('badge-goal-banner'));
    expect(screen.getByTestId('badge-goal-banner')).toBeDefined();
    expect(screen.getByTestId('badge-goal-share-button').textContent).toBe('Show it off');
  });

  it('marks celebrated after first render', async () => {
    localStorage.setItem('symy-badge-goal', 'streak_7');
    const { unmount } = render(<BadgeGoalBanner buddyState={buddyStateUnlocked} />, { wrapper: wrapperEn });
    await waitFor(() => screen.getByTestId('badge-goal-banner'));
    unmount();
    // Remount should not show banner because celebrated was written
    render(<BadgeGoalBanner buddyState={buddyStateUnlocked} />, { wrapper: wrapperEn });
    await waitFor(() => expect(screen.queryByTestId('badge-goal-banner')).toBeNull());
  });

  it('share button calls onShare with badge id and emoji', async () => {
    localStorage.setItem('symy-badge-goal', 'streak_7');
    const onShare = vi.fn();
    render(<BadgeGoalBanner buddyState={buddyStateUnlocked} onShare={onShare} />, { wrapper: wrapperEn });
    await waitFor(() => screen.getByTestId('badge-goal-share-button'));
    await act(() => screen.getByTestId('badge-goal-share-button').click());
    expect(onShare).toHaveBeenCalledWith({ badge: { id: 'streak_7', emoji: '🍃' } });
  });

  it('does not contain shame or money words', async () => {
    localStorage.setItem('symy-badge-goal', 'streak_7');
    render(<BadgeGoalBanner buddyState={buddyStateUnlocked} />, { wrapper: wrapperEn });
    await waitFor(() => screen.getByTestId('badge-goal-banner'));
    const banner = screen.getByTestId('badge-goal-banner');
    const text = banner.textContent || '';
    expect(text).not.toMatch(/落后|失败|没完成|behind|failed/i);
    expect(text).not.toMatch(/\$|¥|usd|aud|cny/i);
  });

  it('closes when close button clicked', async () => {
    localStorage.setItem('symy-badge-goal', 'streak_7');
    render(<BadgeGoalBanner buddyState={buddyStateUnlocked} />, { wrapper: wrapperEn });
    await waitFor(() => screen.getByTestId('badge-goal-banner'));
    await act(() => screen.getByLabelText('Close').click());
    await waitFor(() => expect(screen.queryByTestId('badge-goal-banner')).toBeNull());
  });
});
