// @vitest-environment happy-dom

import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const goalState = { goal: 'money_forest_500' as string | null, celebrated: new Set<string>() };
vi.mock('@/lib/badge-goal', () => ({
  getBadgeGoal: () => goalState.goal,
  isBadgeGoalCelebrated: (id: string) => goalState.celebrated.has(id),
  markBadgeGoalCelebrated: (id: string) => goalState.celebrated.add(id),
}));
vi.mock('@/components/buddy/constants', () => ({
  ALL_BADGES: [
    { id: 'money_forest_500', emoji: '🌳', nameKey: 'buddy.badgeNames.money_forest_500' },
    { id: 'first_intercept', emoji: '🛡️', nameKey: 'buddy.badgeNames.first_intercept' },
  ],
}));
const stableT = (key: string, opts?: { defaultValue?: string }) => {
  const map: Record<string, string> = {
    'buddy.badgeNames.money_forest_500': '百小时森林',
  };
  return map[key] ?? opts?.defaultValue ?? key;
};
vi.mock('@/i18n/provider', () => ({
  useI18n: () => ({ locale: 'zh', t: stableT }),
}));
vi.mock('lucide-react', (importOriginal) => importOriginal());

import { BadgeGoalBanner } from '../badge-goal-banner';

/**
 * badge-goal-banner.tsx (98行) — 自选勋章达成一次性庆祝横幅。
 *
 * 锁定:
 * - 四守卫: 无目标/未知 id/未解锁/已庆祝 → null
 * - 解锁+未庆祝 → 横幅 + markCelebrated (一次性)
 * - 晒一下 → onShare(id+emoji); X → dismissed
 */
describe('BadgeGoalBanner 勋章达成横幅', () => {
  beforeEach(() => {
    goalState.goal = 'money_forest_500';
    goalState.celebrated = new Set();
  });
  afterEach(() => cleanup());

  it('无目标/未解锁/已庆祝 三守卫 → null', () => {
    goalState.goal = null;
    const { unmount } = render(<BadgeGoalBanner buddyState={{ badges: ['money_forest_500'] }} />);
    expect(screen.queryByTestId('badge-goal-banner')).toBeNull();
    unmount();

    goalState.goal = 'money_forest_500';
    const r2 = render(<BadgeGoalBanner buddyState={{ badges: [] }} />); // 未解锁
    expect(screen.queryByTestId('badge-goal-banner')).toBeNull();
    r2.unmount();

    goalState.celebrated.add('money_forest_500');
    render(<BadgeGoalBanner buddyState={{ badges: ['money_forest_500'] }} />);
    expect(screen.queryByTestId('badge-goal-banner')).toBeNull();
  });

  it('解锁+未庆祝 → 横幅 + emoji + 自动 markCelebrated', async () => {
    render(<BadgeGoalBanner buddyState={{ badges: ['money_forest_500'] }} />);
    await waitFor(() => expect(screen.getByTestId('badge-goal-banner')).toBeTruthy(), { timeout: 200 });
    expect(screen.getByText('🌳')).toBeTruthy();
    expect(goalState.celebrated.has('money_forest_500')).toBe(true);
  });

  it('晒一下 → onShare(id+emoji)', async () => {
    const onShare = vi.fn();
    render(<BadgeGoalBanner buddyState={{ badges: ['money_forest_500'] }} onShare={onShare} />);
    await waitFor(() => expect(screen.getByTestId('badge-goal-banner')).toBeTruthy());
    act(() => { fireEvent.click(screen.getByTestId('badge-goal-share-button')); });
    expect(onShare).toHaveBeenCalledWith({ badge: { id: 'money_forest_500', emoji: '🌳' } });
  });

  it('X → dismissed (横幅消失)', async () => {
    render(<BadgeGoalBanner buddyState={{ badges: ['money_forest_500'] }} />);
    await waitFor(() => expect(screen.getByTestId('badge-goal-banner')).toBeTruthy());
    const xBtn = screen.getByRole('button', { name: /close/i });
    act(() => { fireEvent.click(xBtn); });
    expect(screen.queryByTestId('badge-goal-banner')).toBeNull();
  });
});
