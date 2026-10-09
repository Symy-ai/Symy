// @vitest-environment happy-dom

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const stableT = (key: string, opts?: { hours?: string; defaultValue?: string }) => {
  const map: Record<string, string> = {
    'share.streakCard.pill': '连续守护勋章',
    'share.streakCard.daysUnit': '天',
    'share.streakCard.daysLabel': '连续守护',
    'share.streakCard.encourageTitle': '你的连续守护, 从今天开始',
    'share.streakCard.encourageSub': '每次守护都长出新叶',
    'share.interceptMedal.wonBackLabel': '你赢回了',
    'share.interceptMedal.brandTagline': '买得更少, 活得更多',
  };
  if (key === 'share.dailyReport.hoursWonBack') return `${opts?.hours ?? ''} 已赢回`;
  if (key === 'share.dailyReport.aGreenChoice') return '一次绿色选择';
  return map[key] ?? opts?.defaultValue ?? key;
};
vi.mock('@/i18n/provider', () => ({
  useI18n: () => ({ locale: 'zh', t: stableT }),
}));
vi.mock('../share-format', () => ({
  formatShareHoursLabel: vi.fn((h: number) => (h > 0 ? `${h} 小时` : '')),
}));

import { StreakCard } from '../streak-card';

/**
 * streak-card.tsx (183行) — 连续守护分享卡 (batch2-b 模板 A)。
 *
 * 非羞耻红线: streak=0 → 新芽鼓励态不出「0 天」。
 *
 * 锁定:
 * - hasStreak: 大号天数+天单位+连续守护
 * - 0 天: Sprout 鼓励态 (零 "0" 数字)
 * - guardRank 条件徽标 (emoji+name+L{level})
 * - 赢回英雄句双分支
 */
describe('StreakCard 连续守护卡', () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(() => cleanup());

  it('hasStreak: 7 天大号面板', () => {
    render(<StreakCard streakDays={7} savedHours={5} />);
    expect(screen.getByTestId('streak-card')).toBeTruthy();
    expect(screen.getByText('7')).toBeTruthy();
    expect(screen.getByText('天')).toBeTruthy();
    expect(screen.getByText('连续守护')).toBeTruthy();
    expect(screen.getByText('连续守护勋章')).toBeTruthy();
    expect(screen.getByText('Symy')).toBeTruthy();
  });

  it('非羞耻红线: 0 天 → 新芽鼓励态, 零 "0" 大数字', () => {
    render(<StreakCard streakDays={0} savedHours={1} />);
    expect(screen.getByText('你的连续守护, 从今天开始')).toBeTruthy();
    expect(screen.getByText('每次守护都长出新叶')).toBeTruthy();
    // 不出失败态大数字 0
    const bigZero = document.querySelector('.text-\\[64px\\]');
    expect(bigZero).toBeNull();
  });

  it('小数向下取整: 7.9 → 7', () => {
    render(<StreakCard streakDays={7.9} savedHours={1} />);
    expect(screen.getByText('7')).toBeTruthy();
  });

  it('guardRank 条件徽标', () => {
    render(<StreakCard streakDays={3} savedHours={1} guardRank={{ name: '常青藤', level: 4, emoji: '🌿' }} />);
    expect(screen.getByTestId('streak-card-rank').textContent).toContain('🌿');
    expect(screen.getByTestId('streak-card-rank').textContent).toContain('常青藤');
    expect(screen.getByTestId('streak-card-rank').textContent).toContain('L4');
    cleanup();
    render(<StreakCard streakDays={3} savedHours={1} />);
    expect(screen.queryByTestId('streak-card-rank')).toBeNull();
  });

  it('赢回英雄句双分支', () => {
    render(<StreakCard streakDays={3} savedHours={2.5} />);
    expect(screen.getByText('2.5 小时 已赢回')).toBeTruthy();
    cleanup();
    render(<StreakCard streakDays={3} savedHours={0} />);
    expect(screen.getByText('一次绿色选择')).toBeTruthy();
  });
});
