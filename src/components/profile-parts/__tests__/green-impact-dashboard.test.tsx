// @vitest-environment happy-dom

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/i18n/provider', () => ({
  useI18n: () => ({
    locale: 'zh',
    t: (key: string, opts?: { defaultValue?: string; count?: number; hours?: string }) => {
      const map: Record<string, string> = {
        'profile.greenImpactTitle': '绿色守护足迹',
        'profile.greenImpactDesc': '每一次守住选择, 都是给地球的一份礼物',
        'profile.greenImpactLoadError': '数据加载失败',
      };
      let v = map[key] ?? opts?.defaultValue ?? key;
      if (opts?.count !== undefined) v = v.replace('{count}', String(opts.count));
      if (opts?.hours) v = v.replace('{hours}', opts.hours);
      return v;
    },
  }),
}));
vi.mock('lucide-react', (importOriginal) => importOriginal());

const state = { loading: false, error: null as string | null, data: null as Record<string, unknown> | null, adoption: 0 };
vi.mock('@/hooks/use-green-impact', () => ({
  useGreenImpact: () => ({ data: state.data, isLoading: state.loading, error: state.error }),
}));
vi.mock('@/hooks/use-green-alt-adoption', () => ({
  useGreenAltAdoption: () => ({ total: state.adoption }),
}));
vi.mock('@/lib/freedom-time', () => ({
  formatFreedomTime: (h: number) => `${h}小时`,
  DEFAULT_HOURLY_RATE: 25,
}));

// 八张洞察卡 mock (装配层)
vi.mock('./guard-category-card', () => ({ GuardCategoryCard: () => <div data-testid="cat-card" /> }));
vi.mock('./impulse-trigger-card', () => ({ ImpulseTriggerCard: () => <div data-testid="trigger-card" /> }));
vi.mock('./green-alt-adoption-insight-card', () => ({ GreenAltAdoptionInsightCard: () => <div data-testid="adopt-card" /> }));
vi.mock('./guard-style-card', () => ({ GuardStyleCard: () => <div data-testid="style-card" /> }));
vi.mock('./impulse-window-card', () => ({ ImpulseWindowCard: () => <div data-testid="window-card" /> }));
vi.mock('./guard-win-rate-card', () => ({ GuardWinRateCard: () => <div data-testid="winrate-card" /> }));
vi.mock('./guard-consistency-card', () => ({ GuardConsistencyCard: () => <div data-testid="consistency-card" /> }));
vi.mock('./weekly-guard-compare-card', () => ({ WeeklyGuardCompareCard: () => <div data-testid="weekly-card" /> }));
vi.mock('./monthly-guard-statement-card', () => ({ MonthlyGuardStatementCard: () => <div data-testid="monthly-card" /> }));
vi.mock('./guard-year-review-card', () => ({ GuardYearReviewCard: () => <div data-testid="year-card" /> }));

import { GreenImpactDashboard } from '../green-impact-dashboard';

/**
 * green-impact-dashboard.tsx (146行) — 绿色守护足迹仪表盘 (四数字卡+八洞察卡编排)。
 *
 * 锁定:
 * - loading → 骨架 (无数字卡)
 * - error/无数据 → 标题+破折号兜底
 * - 成功: 四数字卡 (itemsSaved/hours/streak/adoption)
 * - adoption 第 4 卡来自独立 hook (失败静默 0)
 */
describe('GreenImpactDashboard 绿色足迹', () => {
  beforeEach(() => {
    state.loading = false;
    state.error = null;
    state.data = null;
    state.adoption = 0;
  });
  afterEach(() => cleanup());

  it('loading → 骨架, 无数字卡', () => {
    state.loading = true;
    render(<GreenImpactDashboard />);
    expect(screen.getByTestId('green-impact-dashboard')).toBeTruthy();
    expect(screen.queryByTestId('green-impact-hours-reclaimed')).toBeNull();
  });

  it('error → 标题+加载失败 aria 标注', () => {
    state.error = 'down';
    render(<GreenImpactDashboard />);
    expect(screen.getByText('绿色守护足迹')).toBeTruthy();
    expect(screen.getByLabelText('数据加载失败')).toBeTruthy();
  });

  it('成功: 四数字卡渲染 (itemsSaved=12/hours=8小时/streak=5/adoption=3)', () => {
    state.data = { itemsSaved: 12, hoursReclaimed: 8, currentStreak: 5 };
    state.adoption = 3;
    render(<GreenImpactDashboard />);
    expect(screen.getByText('12')).toBeTruthy();
    expect(screen.getByText(/8小时/)).toBeTruthy();
    expect(screen.getByText('5')).toBeTruthy();
    expect(screen.getByText('3')).toBeTruthy();
  });

  it('adoption hook 失败静默 0 (第 4 卡零值兜底)', () => {
    state.data = { itemsSaved: 1, hoursReclaimed: 0.5, currentStreak: 1 };
    state.adoption = 0;
    render(<GreenImpactDashboard />);
    expect(screen.getByText('0')).toBeTruthy();
  });
});
