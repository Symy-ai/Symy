// @vitest-environment happy-dom

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import zh from '@/i18n/messages/zh.json';
import { BadgesSection } from '@/components/buddy/badges-section';
import { ShareModal } from '@/components/share/share-modal';
import { ALL_BADGES, BADGE_GROUP_ORDER } from '@/components/buddy/constants';
import type { BuddyState } from '@/types/buddy-state';

vi.mock('@/components/share/share-modal', () => ({
  ShareModal: vi.fn(({ badgeCard }: { badgeCard?: { badge: { id: string } } }) => (
    <div data-testid="share-modal">{badgeCard?.badge.id}</div>
  )),
}));

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <NextIntlClientProvider locale="zh" messages={zh}>{children}</NextIntlClientProvider>
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

const openCollection = async (badges: string[], buddyState?: BuddyState) => {
  const opener = badges.length ? badges : ['impulse_shield'];
  render(
    <BadgesSection badges={opener} buddyState={buddyState ?? makeBuddyState({ badges: opener })} />,
    { wrapper },
  );
  await act(() => { fireEvent.click(screen.getByRole('button', { name: /查看全部/ })); });
  const dialog = await screen.findByRole('dialog');
  return within(dialog);
};

describe('BadgesSection', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
  });

  it('renders the first three earned badges and hides view-all without badges', () => {
    const { rerender } = render(
      <BadgesSection badges={['impulse_shield', 'streak_7', 'first_save', 'boss_slayer']} buddyState={makeBuddyState()} />,
      { wrapper },
    );
    expect(screen.getByText('初次守护')).toBeTruthy();
    expect(screen.getByText('7 天守护')).toBeTruthy();
    expect(screen.getByText('首次守护')).toBeTruthy();
    expect(screen.queryByText('大真话')).toBeNull();

    rerender(
      <NextIntlClientProvider locale="zh" messages={zh}>
        <BadgesSection badges={[]} buddyState={makeBuddyState()} />
      </NextIntlClientProvider>,
    );
    expect(screen.queryByRole('button', { name: /查看全部/ })).toBeNull();
    expect(screen.getByText('还没有印记')).toBeTruthy();
  });

  it('renders every registered badge in grouped collection order', async () => {
    const dialog = await openCollection(['impulse_shield']);
    const sections = dialog.getAllByRole('region', { hidden: true });
    expect(sections.map((section) => section.getAttribute('aria-label'))).toEqual(
      BADGE_GROUP_ORDER.map((group) => ({
        guardian: '守护勋章',
        growth: '成长勋章',
        milestone: '里程碑勋章',
      })[group]),
    );
    expect(sections.at(0)?.textContent).toContain('初次守护');
    expect(sections.at(1)?.textContent).toContain('首次守护');
    expect(sections.at(2)?.textContent).toContain('守住大考验');
    expect(dialog.getAllByText('已守护').length).toBe(1);
    // 非进度型徽章显示「尚未解锁」, 进度型(trackable)显示进度条 — 分开计数
    const notUnlocked = dialog.getAllByText('尚未解锁').length;
    expect(notUnlocked).toBeLessThan(ALL_BADGES.length);
    expect(notUnlocked).toBeGreaterThan(0);
  });

  it('shows locked styling, unlock condition, and no share entry before unlock', async () => {
    const dialog = await openCollection(['impulse_shield'], makeBuddyState({ badges: ['impulse_shield'], streak: 3 }));
    const locked = dialog.getByText('7 天守护').closest('div.flex.items-start');
    expect(locked?.className).toContain('opacity-70');
    expect(locked?.textContent).toContain('连续 7 天与 Symy 一起守护');
    expect(locked?.textContent).toContain('3/7');
    expect(locked?.textContent).not.toContain('晒');
    expect(dialog.queryByTestId('badge-share-streak_7')).toBeNull();
  });

  it('unlocks a trackable badge when progress reaches target', async () => {
    // streak 达标 → progressMet → earned: 无 opacity-70, 无进度条(进度条只在 !earned 时渲染), 无设目标入口
    const dialog = await openCollection([], makeBuddyState({ streak: 7 }));
    const earned = dialog.getByText('7 天守护').closest('div.flex.items-start');
    expect(earned?.className).not.toContain('opacity-70');
    expect(earned?.textContent).toContain('已守护');
    expect(earned?.textContent).not.toContain('/7');
    expect(dialog.queryByTestId('set-goal-streak_7')).toBeNull();
  });

  it('caps: exceeding streak still shows earned (progressMet makes cap cosmetic)', async () => {
    // streak 9 > target 7: progressMet=true 恒 earned — Math.min cap 只影响 !earned 场景,
    // 达标后进度条整体不渲染 (实现语义: 解锁后不再显示进度)
    const dialog = await openCollection([], makeBuddyState({ streak: 9 }));
    const earned = dialog.getByText('7 天守护').closest('div.flex.items-start');
    expect(earned?.textContent).toContain('已守护');
    expect(earned?.textContent).not.toContain('/7');
  });

  it('shows Not-unlocked-yet only for an untrackable locked badge', async () => {
    const dialog = await openCollection([], makeBuddyState());
    const boss = dialog.getByText('守住大考验').closest('div.flex.items-start');
    const streak = dialog.getByText('7 天守护').closest('div.flex.items-start');
    expect(boss?.textContent).not.toContain('7/7');
    expect(boss?.textContent).toContain('尚未解锁');
    expect(streak?.textContent).not.toContain('尚未解锁');
  });

  it('opens badge share modal only from an earned collection card', async () => {
    const dialog = await openCollection(['impulse_shield'], makeBuddyState({ badges: ['impulse_shield'], streak: 3 }));
    await act(() => { fireEvent.click(dialog.getByTestId('badge-share-impulse_shield')); });
    expect(await screen.findByTestId('share-modal')).toBeTruthy();
    expect(screen.getByTestId('share-modal').textContent).toContain('impulse_shield');
    expect(ShareModal).toHaveBeenCalledWith(
      expect.objectContaining({ initialTemplate: 'badge', open: true }),
      undefined,
    );
  });

  it('closes the collection overlay by backdrop and Escape', async () => {
    render(<BadgesSection badges={['impulse_shield']} buddyState={makeBuddyState({ badges: ['impulse_shield'] })} />, { wrapper });
    await act(() => { fireEvent.click(screen.getByRole('button', { name: /查看全部/ })); });
    expect(await screen.findByRole('dialog')).toBeTruthy();

    const dialog = await screen.findByRole('dialog');
    await act(() => { fireEvent.click(dialog.firstElementChild as HTMLElement); });
    expect(screen.queryByRole('dialog')).toBeNull();

    await act(() => { fireEvent.click(screen.getByRole('button', { name: /查看全部/ })); });
    await screen.findByRole('dialog');
    await act(() => { fireEvent.keyDown(window, { key: 'Escape' }); });
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});
