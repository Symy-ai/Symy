// @vitest-environment happy-dom

import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { CommunityChallengeCard } from '../community-challenge-card';

// t 直传 prop (非 hook) — 简单回 defaultValue
const t = (key: string, opts?: { defaultValue?: string } & Record<string, unknown>) => {
  const map: Record<string, string> = {
    'defense.joinChallenge': '加入挑战',
    'defense.joinLastDay': '🔥 最后一天！立即加入',
    'defense.joinUpcoming': '🚀 加入（明天开始）',
    'defense.signUpToJoin': '注册后加入',
    'defense.challengeEnded': '挑战已结束 — 新挑战即将上线！',
    'defense.challengeEndedShort': '挑战已结束',
    'defense.checkin': '📍 今日签到',
    'defense.checkedInToday': '✓ 今日已签到',
    'defense.checkinLocked': '⏳ 挑战开始后开放签到',
    'defense.challengeCompleted': '🎉 挑战完成！',
    'defense.checkinSuccess': '✓ 已签到！第 ? 天完成。',
    'defense.checkinFailed': '签到失败，请重试。',
    'defense.joinedSuccess': '✓ 已加入！每日签到保持连胜。',
    'defense.joinFailed': '加入失败，请重试。',
    'defense.alreadyJoined': '已加入过该挑战！',
  };
  return map[key] ?? opts?.defaultValue ?? key;
};

function challenge(overrides: Record<string, unknown> = {}) {
  const now = Date.now();
  const day = 24 * 3600 * 1000;
  return {
    id: 'ch-1', title: '7天不冲动', titleKey: null, description: '连续七天抵抗冲动消费',
    platform: 'tiktok_shop', maxAmount: 100,
    startDate: new Date(now - 3 * day).toISOString(),
    endDate: new Date(now + 4 * day).toISOString(),
    totalDays: 7, currentDay: 4,
    totalParticipants: 120, activeParticipants: 45, completedParticipants: 12,
    myStatus: null, myCurrentDay: 0, myLastCheckinDate: null,
    ...overrides,
  } as never;
}

function renderCard(chOverrides: Record<string, unknown> = {}, props: Record<string, unknown> = {}) {
  const onJoin = vi.fn((_id: string) => Promise.resolve({ success: true as boolean, error: undefined as string | undefined }));
  const onCheckin = vi.fn(() => Promise.resolve({ success: true, currentDay: 5 }));
  const utils = render(
    <CommunityChallengeCard
      challenge={challenge(chOverrides)}
      isDemo={false}
      onJoin={onJoin}
      onCheckin={onCheckin}
      actionLoading={false}
      t={t}
      {...(props as unknown as Record<string, never>)}
    />,
  );
  return { ...utils, onJoin, onCheckin };
}

describe('CommunityChallengeCard (227行 社区挑战卡)', () => {
  beforeEach(() => { vi.clearAllMocks(); });
  afterEach(() => cleanup());

  it('未加入: 平台图标+标题+参与者统计+加入按钮', () => {
    const { unmount } = renderCard();
    expect(screen.getByText('📱')).toBeTruthy(); // tiktok_shop 图标
    expect(screen.getByText('7天不冲动')).toBeTruthy();
    expect(screen.getByText(/120 joined/)).toBeTruthy();
    expect(screen.getByText(/45 active/)).toBeTruthy();
    expect(screen.getByText(/12 completed/)).toBeTruthy();
    expect(screen.getByText('加入挑战')).toBeTruthy();
    unmount();
  });

  it('completedParticipants=0 且 active>0: 正在挑战文案 (P4-6 不暴露冷启动)', () => {
    const { unmount } = renderCard({ completedParticipants: 0 });
    expect(screen.getByText(/people challenging now/)).toBeTruthy();
    expect(screen.queryByText(/Be the first/)).toBeNull();
    unmount();
  });

  it('completed=0 且 active=0: Be the first', () => {
    const { unmount } = renderCard({ completedParticipants: 0, activeParticipants: 0 });
    expect(screen.getByText(/Be the first/)).toBeTruthy();
    unmount();
  });

  it('已加入 active: 个人进度 Day/total + 进度条 + 签到按钮', () => {
    const { unmount } = renderCard({ myStatus: 'active', myCurrentDay: 3 });
    expect(screen.getByText('Day 3/7')).toBeTruthy();
    expect(screen.getByText('📍 今日签到')).toBeTruthy();
    const bar = document.querySelector('.bg-gradient-to-r.from-emerald-500') as HTMLElement;
    expect(bar).toBeTruthy();
    expect(bar.style.width).toBe('43%'); // round(3/7*100)
    unmount();
  });

  it('今日已签到: 签到按钮禁用+已签到文案', () => {
    const today = new Date().toISOString().split('T')[0];
    const { unmount } = renderCard({ myStatus: 'active', myCurrentDay: 3, myLastCheckinDate: today });
    const btn = screen.getByText('✓ 今日已签到').closest('button')!;
    expect(btn.disabled).toBe(true);
    unmount();
  });

  it('已完成: 🎉 完成态 ✓ 角标, 无签到按钮', () => {
    const { unmount } = renderCard({ myStatus: 'completed', myCurrentDay: 7 });
    expect(screen.getByText('🎉')).toBeTruthy();
    expect(screen.queryByText(/签到/)).toBeNull();
    expect(screen.getByText('🎉')).toBeTruthy();
    unmount();
  });

  it('Round 107: Day 7/7 但 end_date 未来 → Last day! Join now (非 ended)', () => {
    const day = 24 * 3600 * 1000;
    const { unmount } = renderCard({ currentDay: 7, endDate: new Date(Date.now() + day).toISOString() });
    expect(screen.getByText('🔥 最后一天！立即加入')).toBeTruthy();
    expect(screen.queryByText(/Challenge ended/)).toBeNull();
    unmount();
  });

  it('Round 107: end_date 已过 → Challenge ended, 无加入按钮', () => {
    const { unmount } = renderCard({ endDate: new Date(Date.now() - 3600 * 1000).toISOString() });
    expect(screen.getByText('挑战已结束 — 新挑战即将上线！')).toBeTruthy();
    expect(screen.queryByText('加入挑战')).toBeNull();
    unmount();
  });

  it('未开始 (start 未来): Join (starts tomorrow) + 签到锁', () => {
    const day = 24 * 3600 * 1000;
    const { unmount } = renderCard({
      startDate: new Date(Date.now() + day).toISOString(),
    });
    expect(screen.getByText('🚀 加入（明天开始）')).toBeTruthy();
    unmount();
    const joined = renderCard({
      startDate: new Date(Date.now() + day).toISOString(),
      myStatus: 'active', myCurrentDay: 0,
    });
    expect(joined.getByText('⏳ 挑战开始后开放签到')).toBeTruthy();
    joined.unmount();
  });

  it('加入失败 (already): 已加入过文案; 其他错误: 加入失败', async () => {
    const { unmount, onJoin } = renderCard();
    onJoin.mockResolvedValueOnce({ success: false, error: 'already joined' });
    fireEvent.click(screen.getByText('加入挑战'));
    await vi.waitFor(() => expect(screen.getByText('已加入过该挑战！')).toBeTruthy());
    onJoin.mockResolvedValueOnce({ success: false, error: '500' });
    fireEvent.click(screen.getByText('加入挑战'));
    await vi.waitFor(() => expect(screen.getByText('加入失败，请重试。')).toBeTruthy());
    unmount();
  });

  it('加入成功: 成功消息 4s 后消失', async () => {
    vi.useFakeTimers();
    try {
      const { unmount } = renderCard();
      fireEvent.click(screen.getByText('加入挑战'));
      await act(async () => { await vi.advanceTimersByTimeAsync(10); });
      expect(screen.getByText('✓ 已加入！每日签到保持连胜。')).toBeTruthy();
      act(() => vi.advanceTimersByTime(4100));
      expect(screen.queryByText('✓ 已加入！每日签到保持连胜。')).toBeNull();
      unmount();
    } finally { vi.useRealTimers(); }
  });

  it('签到成功: Day N 文案', async () => {
    const { unmount } = renderCard({ myStatus: 'active', myCurrentDay: 4 });
    fireEvent.click(screen.getByText('📍 今日签到'));
    await vi.waitFor(() => expect(screen.getByText('✓ 已签到！第 ? 天完成。')).toBeTruthy());
    unmount();
  });

  it('demo: 按钮禁用 + 注册文案', () => {
    const { unmount, onJoin } = renderCard({}, { isDemo: true });
    const btn = screen.getByText('注册后加入').closest('button')!;
    expect(btn.disabled).toBe(true);
    fireEvent.click(btn);
    expect(onJoin).not.toHaveBeenCalled();
    unmount();
  });
});

