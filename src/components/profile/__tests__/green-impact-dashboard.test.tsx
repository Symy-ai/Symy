/* eslint-disable require-await -- test mocks use async for API consistency */
/**
 * GreenImpactDashboard component tests (batch44-c)
 *
 * @vitest-environment happy-dom
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, within } from '@testing-library/react';

// ⏱️ 本文件每个用例都 resetModules 后重新求值组件图, 共享机高负载 + 全量并行时
//    可能远超默认 5s (gate 10:23 实录: 单测 15s 仍超时)——这里验证的是渲染行为,
//    不是性能, 文件级放宽到 30s; 查询一律 within(container) 限定本用例自己的挂载,
//    对超时杀测试后残留的僵尸容器免疫。
vi.setConfig({ testTimeout: 30_000 });
const FIND_TIMEOUT = 15_000;

const tEn = (key: string, params?: Record<string, string | number>) => {
  const translations: Record<string, string> = {
    'profile.greenImpactTitle': 'My better-choice record',
    'profile.greenImpactDesc': 'See what these choices brought you',
    'profile.greenImpactItemsSaved': '{count} fewer items bought',
    'profile.greenImpactHoursReclaimed': '{hours} of free time gained',
    'profile.greenImpactCurrentStreak': '{count} days in a row',
    'profile.greenImpactGreenAltAdoptions': '{count} better swaps made',
    'profile.greenImpactLoadError': 'Could not load your impact data',
    'common.days': 'days',
  };
  let result = translations[key] ?? key;
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      result = result.replace(`{${k}}`, String(v));
    }
  }
  return result;
};

const tZh = (key: string, params?: Record<string, string | number>) => {
  const translations: Record<string, string> = {
    'profile.greenImpactTitle': '我变好的记录',
    'profile.greenImpactDesc': '看看这些选择给你带来了什么',
    'profile.greenImpactItemsSaved': '少买 {count} 件物品',
    'profile.greenImpactHoursReclaimed': '多出 {hours} 自由时间',
    'profile.greenImpactCurrentStreak': '连续 {count} 天做到',
    'profile.greenImpactGreenAltAdoptions': '本季采纳绿色替代 {count} 次',
    'profile.greenImpactLoadError': '无法加载你的影响数据',
    'common.days': '天',
  };
  let result = translations[key] ?? key;
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      result = result.replace(`{${k}}`, String(v));
    }
  }
  return result;
};

function mockDeps({ hourlyRate = 25, t = tEn, locale = 'en' }: { hourlyRate?: number; t?: (key: string, params?: Record<string, string | number>) => string; locale?: string } = {}) {
  vi.doMock('@/hooks/use-hourly-rate', () => ({
    useHourlyRate: () => ({
      hourlyRate,
      rateIsDefault: false,
      setHourlyRate: vi.fn(),
      isLoading: false,
    }),
  }));
  vi.doMock('@/i18n/provider', () => ({
    useI18n: () => ({
      t,
      locale,
    }),
  }));
  vi.doMock('@/lib/api-client', () => ({
    apiFetch: vi.fn(),
  }));
  vi.doMock('@/lib/logger', () => ({
    logger: { warn: vi.fn() },
  }));
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.resetModules();
});

describe('GreenImpactDashboard (en)', () => {
  beforeEach(() => {
    mockDeps();
  });

  it('shows skeleton while loading', async () => {
    const { apiFetch: apiFetchMock } = await import('@/lib/api-client');
    vi.mocked(apiFetchMock).mockImplementation(() => new Promise(() => {}));

    const { GreenImpactDashboard } = await import('@/components/profile-parts/green-impact-dashboard');
    const { container } = render(<GreenImpactDashboard />);
    const scope = within(container);
    expect(scope.getByTestId('green-impact-dashboard')).toBeDefined();
  });

  it('renders success with 47 items, 23 hours, 5-day streak', async () => {
    const { apiFetch: apiFetchMock } = await import('@/lib/api-client');
    vi.mocked(apiFetchMock).mockResolvedValue({
      challengesCompleted: 47,
      totalSaved: 575,
      streak: 5,
    });

    const { GreenImpactDashboard } = await import('@/components/profile-parts/green-impact-dashboard');
    const { container } = render(<GreenImpactDashboard />);
    const scope = within(container);

    expect(await scope.findByTestId('green-impact-dashboard', {}, { timeout: FIND_TIMEOUT })).toBeDefined();
    const itemsSaved = scope.getByTestId('green-impact-items-saved');
    expect(itemsSaved.textContent).toContain('47');
    expect(itemsSaved.textContent).toContain('fewer items bought');
    const hoursReclaimed = scope.getByTestId('green-impact-hours-reclaimed');
    expect(hoursReclaimed.textContent).toContain('23');
    expect(hoursReclaimed.textContent).toContain('of free time gained');
    const streak = scope.getByTestId('green-impact-current-streak');
    expect(streak.textContent).toContain('5');
    expect(streak.textContent).toContain('days in a row');
  });

  it('renders 4th card: adoption count from /api/green-alt/adoption (count only, zero amounts)', async () => {
    const { apiFetch: apiFetchMock } = await import('@/lib/api-client');
    vi.mocked(apiFetchMock).mockImplementation(async (input: unknown) => {
      const url = typeof input === "string" ? input : String((input as { url?: string }).url ?? input);
      if (url.includes('/api/green-alt/adoption')) {
        return { total: 6, byCategory: { wear: 4, home: 2, other: 0 }, savedEstimate: 123 };
      }
      return { challengesCompleted: 47, totalSaved: 575, streak: 5 };
    });

    const { GreenImpactDashboard } = await import('@/components/profile-parts/green-impact-dashboard');
    const { container } = render(<GreenImpactDashboard />);
    const scope = within(container);

    const adoptions = await scope.findByTestId('green-impact-green-alt-adoptions', {}, { timeout: FIND_TIMEOUT });
    expect(adoptions.textContent).toContain('6');
    expect(adoptions.textContent).toContain('better swaps made');
    // 金额红线: 123 (savedEstimate) 不得出现在任何指标卡
    expect(adoptions.textContent).not.toContain('123');
  });

  it('adoption fetch failure degrades silently to 0 (dashboard still renders)', async () => {
    const { apiFetch: apiFetchMock } = await import('@/lib/api-client');
    vi.mocked(apiFetchMock).mockImplementation(async (input: unknown) => {
      const url = typeof input === "string" ? input : String((input as { url?: string }).url ?? input);
      if (url.includes('/api/green-alt/adoption')) {
        throw new Error('network down');
      }
      return { challengesCompleted: 47, totalSaved: 575, streak: 5 };
    });

    const { GreenImpactDashboard } = await import('@/components/profile-parts/green-impact-dashboard');
    const { container } = render(<GreenImpactDashboard />);
    const scope = within(container);

    const adoptions = await scope.findByTestId('green-impact-green-alt-adoptions', {}, { timeout: FIND_TIMEOUT });
    expect(adoptions.textContent).toContain('0');
    expect(scope.getByTestId('green-impact-items-saved')).toBeDefined();
  });

  it('renders fallback — on fetch failure', async () => {
    const { apiFetch: apiFetchMock } = await import('@/lib/api-client');
    vi.mocked(apiFetchMock).mockRejectedValue(new Error('network'));

    const { GreenImpactDashboard } = await import('@/components/profile-parts/green-impact-dashboard');
    const { container } = render(<GreenImpactDashboard />);
    const scope = within(container);

    expect(await scope.findByTestId('green-impact-dashboard', {}, { timeout: FIND_TIMEOUT })).toBeDefined();
    expect(scope.getByLabelText('Could not load your impact data')).toBeDefined();
  });
});

describe('GreenImpactDashboard (zh)', () => {
  beforeEach(() => {
    mockDeps({ t: tZh, locale: 'zh' });
  });

  it('renders success strings in zh', async () => {
    const { apiFetch: apiFetchMock } = await import('@/lib/api-client');
    vi.mocked(apiFetchMock).mockResolvedValue({
      challengesCompleted: 47,
      totalSaved: 575,
      streak: 5,
    });

    const { GreenImpactDashboard } = await import('@/components/profile-parts/green-impact-dashboard');
    const { container } = render(<GreenImpactDashboard />);
    const scope = within(container);

    expect(await scope.findByTestId('green-impact-dashboard', {}, { timeout: FIND_TIMEOUT })).toBeDefined();
    expect(scope.getByTestId('green-impact-items-saved').textContent).toContain('47');
    expect(scope.getByTestId('green-impact-items-saved').textContent).toContain('少买 47 件物品');
    expect(scope.getByTestId('green-impact-hours-reclaimed').textContent).toContain('23');
    expect(scope.getByTestId('green-impact-hours-reclaimed').textContent).toContain('自由时间');
    expect(scope.getByTestId('green-impact-current-streak').textContent).toContain('5');
    expect(scope.getByTestId('green-impact-current-streak').textContent).toContain('天做到');
  });

  it('renders 4th card adoption count in zh', async () => {
    const { apiFetch: apiFetchMock } = await import('@/lib/api-client');
    vi.mocked(apiFetchMock).mockImplementation(async (input: unknown) => {
      const url = typeof input === "string" ? input : String((input as { url?: string }).url ?? input);
      if (url.includes('/api/green-alt/adoption')) {
        return { total: 6 };
      }
      return { challengesCompleted: 47, totalSaved: 575, streak: 5 };
    });

    const { GreenImpactDashboard } = await import('@/components/profile-parts/green-impact-dashboard');
    const { container } = render(<GreenImpactDashboard />);
    const scope = within(container);

    const adoptions = await scope.findByTestId('green-impact-green-alt-adoptions', {}, { timeout: FIND_TIMEOUT });
    expect(adoptions.textContent).toContain('6');
    expect(adoptions.textContent).toContain('本季采纳绿色替代');
    expect(adoptions.textContent).toContain('次');
  });

  it('renders fallback — in zh on fetch failure', async () => {
    const { apiFetch: apiFetchMock } = await import('@/lib/api-client');
    vi.mocked(apiFetchMock).mockRejectedValue(new Error('network'));

    const { GreenImpactDashboard } = await import('@/components/profile-parts/green-impact-dashboard');
    const { container } = render(<GreenImpactDashboard />);
    const scope = within(container);

    expect(await scope.findByTestId('green-impact-dashboard', {}, { timeout: FIND_TIMEOUT })).toBeDefined();
    expect(scope.getByLabelText('无法加载你的影响数据')).toBeDefined();
  });
});
