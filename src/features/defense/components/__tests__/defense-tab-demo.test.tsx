// @vitest-environment happy-dom

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../daily-reflection', () => ({
  DailyReflection: (p: { isDemo?: boolean }) => <div data-testid="reflection" data-demo={String(p.isDemo)} />,
}));
vi.mock('../awakening-stories', () => ({
  AwakeningStories: () => <div data-testid="stories" />,
}));
vi.mock('../defense-hero-stats', () => ({
  DefenseHeroStats: (p: { isDemo?: boolean; isLoading?: boolean }) => (
    <div data-testid="hero" data-demo={String(p.isDemo)} data-loading={String(p.isLoading)} />
  ),
}));

import { DefenseTabDemo } from '../defense-tab-demo';

const t = (key: string, opts?: { defaultValue?: string; current?: number; total?: number }) => {
  const map: Record<string, string> = {
    'defense.title': '🌱 守护林',
    'defense.subtitle': '绿色消费共同体',
    'ahaMoment.demoBadge': '🌱 示例数据',
    'inward.challengesTitle': '社区挑战',
    'defense.communityProgress': '社区进度',
    'defense.startsTomorrow': '明天开始!',
    'defense.endsToday': '最后一天!',
    'defense.joinUpcoming': '🚀 加入 (明天开始)',
    'defense.signUpToJoin': '注册加入',
  };
  let v = map[key] ?? opts?.defaultValue ?? key;
  if (opts?.current !== undefined) v = v.replace('{current}', String(opts.current)).replace('{total}', String(opts.total));
  return v;
};

const baseProps = {
  onAuthPrompt: vi.fn(),
  stats: { activeUsers: 1, totalSaved: 2, totalChallengesPassed: 3, lifeHoursRecovered: 4, hasData: true } as never,
  platformIndex: [],
  strategies: [],
  challenges: [] as never[],
  joinChallenge: vi.fn(() => Promise.resolve({ success: true })),
  checkin: vi.fn(() => Promise.resolve({ success: true })),
  actionLoading: false,
  t,
  locale: 'zh',
};

function makeChallenge(over: Record<string, unknown> = {}) {
  return {
    id: 'c1', title: 'T', titleKey: null, description: null, platform: 'tiktok_shop',
    maxAmount: null, startDate: new Date(Date.now() - 3 * 86400000).toISOString(), endDate: new Date(Date.now() + 4 * 86400000).toISOString(),
    totalDays: 7, currentDay: 3, totalParticipants: 10, activeParticipants: 5,
    completedParticipants: 1, myStatus: null, myCurrentDay: 0, myLastCheckinDate: null,
    ...over,
  };
}

function renderUI(props: Partial<typeof baseProps> = {}) {
  return render(<DefenseTabDemo {...baseProps} {...props} />);
}

/**
 * defense-tab-demo.tsx (129行) — 未登录守护林 Tab (v3 三区块编排)。
 *
 * 锁定:
 * - 标题 + 示例数据徽章 (诚实标注)
 * - 三区块编排: HeroStats(demo)/Reflection(isDemo)/Stories
 * - challenges 空数组 → 社区挑战区不渲染
 * - 有挑战: 进度行 + 参与数 + 点击 onAuthPrompt('defense')
 */
describe('DefenseTabDemo 未登录守护林', () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(() => cleanup());

  it('标题 + 示例数据徽章 (诚实标注)', () => {
    renderUI();
    expect(screen.getByText('🌱 守护林')).toBeTruthy();
    expect(screen.getByText('🌱 示例数据')).toBeTruthy();
  });

  it('三区块编排: Hero demo 态 / Reflection isDemo / Stories', () => {
    renderUI();
    expect(screen.getByTestId('hero').getAttribute('data-demo')).toBe('true');
    expect(screen.getByTestId('reflection').getAttribute('data-demo')).toBe('true');
    expect(screen.getByTestId('stories')).toBeTruthy();
  });

  it('challenges 空 → 社区挑战区不渲染', () => {
    renderUI();
    expect(screen.queryByText('社区挑战')).toBeNull();
  });

  it('有挑战: 标题 + 进度行 (Day 3/7) + 参与数', () => {
    renderUI({ challenges: [makeChallenge()] as never });
    expect(screen.getByText('社区挑战')).toBeTruthy();
    expect(screen.getByText(/Day 3\/7/)).toBeTruthy();
    expect(screen.getByText(/👥 10/)).toBeTruthy();
  });

  it('挑战按钮点击 → onAuthPrompt(defense) (未登录拦截)', () => {
    renderUI({ challenges: [makeChallenge()] as never });
    const joinBtn = screen.getAllByRole('button').find(b => b.textContent === '注册加入')!;
    fireEvent.click(joinBtn);
    expect(baseProps.onAuthPrompt).toHaveBeenCalledWith('defense');
  });

  it('daysLeft=0 → Last day 文案 (Round 107 分支)', () => {
    const now = new Date();
    const start = new Date(now.getTime() - 7 * 86400000);
    renderUI({ challenges: [makeChallenge({ currentDay: 7, startDate: start.toISOString() })] as never });
    expect(screen.getByText(/最后一天!/)).toBeTruthy();
  });
});
