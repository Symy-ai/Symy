// @vitest-environment happy-dom

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const stableT = (key: string, opts?: { hours?: string; count?: number; remaining?: number; defaultValue?: string }) => {
  const map: Record<string, string> = {
    'share.milestoneCard.pill': '守护里程碑',
    'share.milestoneCard.lockedEyebrow': '即将解锁',
    'share.milestoneCard.guardLabel': `第 ${opts?.count ?? 0} 次守护`,
    'share.milestoneCard.unlockHint': `还差 ${opts?.remaining ?? 0} 次解锁`,
    'share.milestoneCard.allReachedLabel': '全部里程碑达成',
    'share.milestoneCard.legendLabel': '守护传说',
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
  getMilestoneState: vi.fn((count: number) => {
    if (count >= 100) return { count, unlocked: true, next: null, remaining: 0 };
    if (count >= 50) return { count, unlocked: true, next: 100, remaining: 100 - count };
    if (count >= 10) return { count, unlocked: true, next: 50, remaining: 50 - count };
    return { count, unlocked: false, next: 10, remaining: 10 - count };
  }),
}));

import { MilestoneCard } from '../milestone-card';

/**
 * milestone-card.tsx (181行) — 里程碑分享卡 (batch2-b 模板 B)。
 *
 * 红线: 金额永不进卡 (owner 09-06); 未解锁 = 期待态非羞耻。
 *
 * 锁定:
 * - 375×600 卡+里程碑 pill+Trophy
 * - 四态: 5 期待 (Almost/5/10)/12 解锁 (12/50)/55 (55/100)/120 全达成 (传说)
 * - hours 赢回英雄句; 0h → a green choice
 */
describe('MilestoneCard 里程碑卡', () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(() => cleanup());

  it('基础结构: 卡+pill+品牌条', () => {
    render(<MilestoneCard interceptCount={12} savedHours={3} />);
    expect(screen.getByTestId('milestone-card')).toBeTruthy();
    expect(screen.getByText('守护里程碑')).toBeTruthy();
    expect(screen.getByText('Symy')).toBeTruthy();
    expect(screen.getByText('买得更少, 活得更多')).toBeTruthy();
  });

  it('期待态 (5<10): eyebrow+5/10+还差 5', () => {
    render(<MilestoneCard interceptCount={5} savedHours={1} />);
    expect(screen.getByText('即将解锁')).toBeTruthy();
    expect(screen.getByText('5/10')).toBeTruthy();
    expect(screen.getByText('还差 5 次解锁')).toBeTruthy();
    expect(screen.getByText('第 5 次守护')).toBeTruthy();
  });

  it('解锁态 (12≥10): 无 eyebrow+12/50', () => {
    render(<MilestoneCard interceptCount={12} savedHours={2} />);
    expect(screen.queryByText('即将解锁')).toBeNull();
    expect(screen.getByText('12/50')).toBeTruthy();
  });

  it('全达成 (120≥100): 传说+无 next 分数', () => {
    render(<MilestoneCard interceptCount={120} savedHours={9} />);
    expect(screen.getByText('全部里程碑达成')).toBeTruthy();
    expect(screen.getByText('守护传说')).toBeTruthy();
    expect(screen.queryByText(/120\//)).toBeNull();
  });

  it('赢回英雄句: 有小时→hoursWonBack; 0h→绿色选择', () => {
    render(<MilestoneCard interceptCount={12} savedHours={3.5} />);
    expect(screen.getByText('3.5 小时 已赢回')).toBeTruthy();
    cleanup();
    render(<MilestoneCard interceptCount={12} savedHours={0} />);
    expect(screen.getByText('一次绿色选择')).toBeTruthy();
  });

  it('userName 条件渲染', () => {
    render(<MilestoneCard interceptCount={12} savedHours={1} userName="小绿" />);
    expect(screen.getByText('小绿')).toBeTruthy();
    cleanup();
    render(<MilestoneCard interceptCount={12} savedHours={1} />);
    expect(screen.queryByText('小绿')).toBeNull();
  });
});
