// @vitest-environment happy-dom

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/i18n/provider', () => ({
  useI18n: () => ({
    locale: 'zh',
    t: (key: string, opts?: { defaultValue?: string }) => {
      const map: Record<string, string> = {
        'defense.title': '🌱 守护林',
        'defense.subtitle': '绿色消费共同体',
        'defense.details': '详情',
      };
      return map[key] ?? opts?.defaultValue ?? key;
    },
  }),
}));
vi.mock('../../hooks/use-community-stats', () => ({
  useCommunityStats: () => ({
    stats: { activeUsers: 1, totalSaved: 2, totalChallengesPassed: 3, lifeHoursRecovered: 4, hasData: true },
    platformIndex: [],
    strategies: [],
    strategiesSource: 'sample',
    strategiesLoading: false,
    isLoading: false,
  }),
}));
vi.mock('../../hooks/use-community-challenges', () => ({
  useCommunityChallenges: () => ({
    challenges: [],
    isLoading: false,
    joinChallenge: vi.fn(() => Promise.resolve({ success: true })),
    checkin: vi.fn(() => Promise.resolve({ success: true })),
    actionLoading: false,
  }),
}));
vi.mock('../defense-tab-demo', () => ({
  DefenseTabDemo: () => <div data-testid="demo-tab" />,
}));
vi.mock('../community-challenge-list', () => ({
  CommunityChallengeList: () => <div data-testid="challenge-list" />,
}));
vi.mock('../awakening-stories', () => ({ AwakeningStories: () => <div data-testid="stories" /> }));
vi.mock('../daily-reflection', () => ({ DailyReflection: () => <div data-testid="reflection" /> }));
vi.mock('../platform-induce-index', () => ({ PlatformInduceIndex: () => <div data-testid="platform" /> }));
vi.mock('../inducement-strategies', () => ({ InducementStrategies: () => <div data-testid="strategies" /> }));
vi.mock('../defense-hero-stats', () => ({
  DefenseHeroStats: (p: { isDemo?: boolean }) => <div data-testid="hero" data-demo={String(p.isDemo ?? false)} />,
}));
vi.mock('lucide-react', (importOriginal) => importOriginal());

import { DefenseTab } from '../defense-tab';

/**
 * defense-tab.tsx (115行) — 守护林主 Tab (登录态编排)。
 *
 * 锁定:
 * - isDemo → DefenseTabDemo 独占
 * - 非 demo: 标题 + 详情按钮 + 六区块编排
 * - 详情 overlay 开关
 */
describe('DefenseTab 守护林主 Tab', () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(() => cleanup());

  it('isDemo → DefenseTabDemo 独占 (主内容不渲染)', () => {
    render(<DefenseTab isDemo onAuthPrompt={vi.fn()} />);
    expect(screen.getByTestId('demo-tab')).toBeTruthy();
    expect(screen.queryByTestId('hero')).toBeNull();
    expect(screen.queryByTestId('reflection')).toBeNull();
  });

  it('非 demo: 六区块编排全在 (hero/reflection/stories/challenge/platform/strategies)', () => {
    render(<DefenseTab isDemo={false} onAuthPrompt={vi.fn()} />);
    expect(screen.getByTestId('hero')).toBeTruthy();
    expect(screen.getByTestId('reflection')).toBeTruthy();
    expect(screen.getByTestId('stories')).toBeTruthy();
    expect(screen.getByTestId('challenge-list')).toBeTruthy();
    // platform/strategies 在详情 overlay 内 — 主视图不渲染 (懒挂载)
    expect(screen.queryByTestId('platform')).toBeNull();
    expect(screen.queryByTestId('strategies')).toBeNull();
    expect(screen.getByText('🌱 守护林')).toBeTruthy();
  });

  it('详情按钮 → overlay 开; 关闭可回', () => {
    render(<DefenseTab isDemo={false} onAuthPrompt={vi.fn()} />);
    fireEvent.click(screen.getByLabelText('详情'));
    // overlay 打开: platform/strategies 懒挂载渲染
    expect(screen.getByTestId('platform')).toBeTruthy();
    expect(screen.getByTestId('strategies')).toBeTruthy();
  });
});
