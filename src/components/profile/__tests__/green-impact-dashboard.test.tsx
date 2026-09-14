/* eslint-disable require-await -- test mocks use async for API consistency */
/**
 * GreenImpactDashboard component tests (batch44-c)
 *
 * @vitest-environment happy-dom
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';

const tEn = (key: string, params?: Record<string, string | number>) => {
  const translations: Record<string, string> = {
    'profile.greenImpactTitle': 'Green Impact',
    'profile.greenImpactDesc': 'Your cumulative guardian footprint, in human terms.',
    'profile.greenImpactItemsSaved': '{count} items kept from landfill',
    'profile.greenImpactHoursReclaimed': '{hours} hours of life reclaimed',
    'profile.greenImpactCurrentStreak': '{count}-day guard streak',
    'profile.greenImpactGreenAltAdoptions': '{count} greener choices this season',
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
    'profile.greenImpactTitle': '绿色影响',
    'profile.greenImpactDesc': '你的累计守护足迹，用人的方式呈现。',
    'profile.greenImpactItemsSaved': '{count} 件物品免于填埋',
    'profile.greenImpactHoursReclaimed': '赢回了 {hours} 小时生命',
    'profile.greenImpactCurrentStreak': '{count} 天守护连续',
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

  it('shows skeleton while loading', { timeout: 15000 }, async () => {
    const { apiFetch: apiFetchMock } = await import('@/lib/api-client');
    vi.mocked(apiFetchMock).mockImplementation(() => new Promise(() => {}));

    const { GreenImpactDashboard } = await import('@/components/profile-parts/green-impact-dashboard');
    render(<GreenImpactDashboard />);
    expect(screen.getByTestId('green-impact-dashboard')).toBeDefined();
  });

  it('renders success with 47 items, 23 hours, 5-day streak', async () => {
    const { apiFetch: apiFetchMock } = await import('@/lib/api-client');
    vi.mocked(apiFetchMock).mockResolvedValue({
      challengesCompleted: 47,
      totalSaved: 575,
      streak: 5,
    });

    const { GreenImpactDashboard } = await import('@/components/profile-parts/green-impact-dashboard');
    render(<GreenImpactDashboard />);

    expect(await screen.findByTestId('green-impact-dashboard')).toBeDefined();
    const itemsSaved = screen.getByTestId('green-impact-items-saved');
    expect(itemsSaved.textContent).toContain('47');
    expect(itemsSaved.textContent).toContain('items kept from landfill');
    const hoursReclaimed = screen.getByTestId('green-impact-hours-reclaimed');
    expect(hoursReclaimed.textContent).toContain('23');
    expect(hoursReclaimed.textContent).toContain('hours of life reclaimed');
    const streak = screen.getByTestId('green-impact-current-streak');
    expect(streak.textContent).toContain('5');
    expect(streak.textContent).toContain('day guard streak');
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
    render(<GreenImpactDashboard />);

    const adoptions = await screen.findByTestId('green-impact-green-alt-adoptions');
    expect(adoptions.textContent).toContain('6');
    expect(adoptions.textContent).toContain('greener choices this season');
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
    render(<GreenImpactDashboard />);

    const adoptions = await screen.findByTestId('green-impact-green-alt-adoptions');
    expect(adoptions.textContent).toContain('0');
    expect(screen.getByTestId('green-impact-items-saved')).toBeDefined();
  });

  it('renders fallback — on fetch failure', async () => {
    const { apiFetch: apiFetchMock } = await import('@/lib/api-client');
    vi.mocked(apiFetchMock).mockRejectedValue(new Error('network'));

    const { GreenImpactDashboard } = await import('@/components/profile-parts/green-impact-dashboard');
    render(<GreenImpactDashboard />);

    expect(await screen.findByTestId('green-impact-dashboard')).toBeDefined();
    expect(screen.getByLabelText('Could not load your impact data')).toBeDefined();
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
    render(<GreenImpactDashboard />);

    expect(await screen.findByTestId('green-impact-dashboard')).toBeDefined();
    expect(screen.getByTestId('green-impact-items-saved').textContent).toContain('47');
    expect(screen.getByTestId('green-impact-items-saved').textContent).toContain('件物品免于填埋');
    expect(screen.getByTestId('green-impact-hours-reclaimed').textContent).toContain('23');
    expect(screen.getByTestId('green-impact-hours-reclaimed').textContent).toContain('赢回了');
    expect(screen.getByTestId('green-impact-current-streak').textContent).toContain('5');
    expect(screen.getByTestId('green-impact-current-streak').textContent).toContain('天守护连续');
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
    render(<GreenImpactDashboard />);

    const adoptions = await screen.findByTestId('green-impact-green-alt-adoptions');
    expect(adoptions.textContent).toContain('6');
    expect(adoptions.textContent).toContain('本季采纳绿色替代');
    expect(adoptions.textContent).toContain('次');
  });

  it('renders fallback — in zh on fetch failure', async () => {
    const { apiFetch: apiFetchMock } = await import('@/lib/api-client');
    vi.mocked(apiFetchMock).mockRejectedValue(new Error('network'));

    const { GreenImpactDashboard } = await import('@/components/profile-parts/green-impact-dashboard');
    render(<GreenImpactDashboard />);

    expect(await screen.findByTestId('green-impact-dashboard')).toBeDefined();
    expect(screen.getByLabelText('无法加载你的影响数据')).toBeDefined();
  });
});
