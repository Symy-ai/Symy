// @vitest-environment happy-dom
/**
 * GreenImpactDashboard 全零/降级数据增补 (batch78-a)
 *
 * batch44-c 已锁 loading/success(47/23/5)/error/zh/adoption 失败静默,
 * 本文件只补其未覆盖的空数据降级面: 全零数据四卡可渲染、
 * 服务端脏载荷 (total 缺失/负数) 静默回 0、指标卡零金额红线
 * (dashboard 子树零 $¥, 零 NaN/undefined 字样)。
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';

const { apiFetchMock } = vi.hoisted(() => ({ apiFetchMock: vi.fn() }));

vi.mock('@/i18n/provider', () => ({
  useI18n: () => ({
    t: (key: string, params?: Record<string, string | number> & { defaultValue?: string }) => {
      const translations: Record<string, string> = {
        'profile.greenImpactItemsSaved': '{count} items kept from landfill',
        'profile.greenImpactHoursReclaimed': '{hours} hours of time saved',
        'profile.greenImpactCurrentStreak': '{count}-day guard streak',
        'profile.greenImpactGreenAltAdoptions': '{count} greener choices this season',
        'common.days': 'days',
      };
      let result = translations[key] ?? params?.defaultValue ?? key;
      if (params) {
        for (const [k, v] of Object.entries(params)) {
          if (k !== 'defaultValue') result = result.replaceAll(`{${k}}`, String(v));
        }
      }
      return result;
    },
    locale: 'en',
  }),
}));

vi.mock('@/hooks/use-hourly-rate', () => ({
  useHourlyRate: () => ({
    hourlyRate: 25,
    rateIsDefault: false,
    setHourlyRate: vi.fn(),
    isLoading: false,
  }),
}));

vi.mock('@/lib/api-client', () => ({
  apiFetch: apiFetchMock,
}));

vi.mock('@/lib/logger', () => ({
  logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

import { GreenImpactDashboard } from '../../profile-parts/green-impact-dashboard';

function mockApi({ adoption }: { adoption?: unknown } = {}) {
  apiFetchMock.mockImplementation((input: unknown) => {
    const url = typeof input === 'string' ? input : String((input as { url?: string }).url ?? input);
    if (url.includes('/api/green-alt/adoption')) {
      if (adoption instanceof Error) return Promise.reject(adoption);
      return Promise.resolve(adoption ?? { total: 0 });
    }
    // use-green-impact 的数据源: 全零
    return Promise.resolve({ challengesCompleted: 0, totalSaved: 0, streak: 0 });
  });
}

beforeEach(() => {
  apiFetchMock.mockReset();
});

afterEach(cleanup);

describe('GreenImpactDashboard 全零数据降级', () => {
  it('items/hours/streak/adoptions 全零: 四卡可渲染, hours 显示 "0 hours"', async () => {
    mockApi();
    render(<GreenImpactDashboard />);
    expect(await screen.findByTestId('green-impact-items-saved')).toBeTruthy();
    expect(screen.getByTestId('green-impact-items-saved').textContent).toContain('0');
    expect(screen.getByTestId('green-impact-hours-reclaimed').textContent).toContain('0 hours');
    expect(screen.getByTestId('green-impact-current-streak').textContent).toContain('0');
    expect(screen.getByTestId('green-impact-green-alt-adoptions').textContent).toContain('0');
  });

  it('全零 dashboard 子树零金额符号 (成就/次数/时间, 无 $¥)', async () => {
    mockApi();
    render(<GreenImpactDashboard />);
    const dashboard = await screen.findByTestId('green-impact-dashboard');
    expect(dashboard.textContent).not.toMatch(/[$¥€]/);
  });

  it('全零 dashboard 子树无 NaN/undefined 字样', async () => {
    mockApi();
    render(<GreenImpactDashboard />);
    const dashboard = await screen.findByTestId('green-impact-dashboard');
    expect(dashboard.textContent).not.toMatch(/NaN|undefined/);
  });
});

describe('GreenImpactDashboard 采纳计数脏载荷降级', () => {
  it('total 缺失 (null) → 第 4 卡静默回 0, 主卡不受影响', async () => {
    mockApi({ adoption: { total: null } });
    render(<GreenImpactDashboard />);
    expect(await screen.findByTestId('green-impact-green-alt-adoptions')).toBeTruthy();
    expect(screen.getByTestId('green-impact-green-alt-adoptions').textContent).toContain('0');
    expect(screen.getByTestId('green-impact-items-saved').textContent).toContain('0');
  });

  it('total 负数 → 钳制为 0', async () => {
    mockApi({ adoption: { total: -5 } });
    render(<GreenImpactDashboard />);
    const card = await screen.findByTestId('green-impact-green-alt-adoptions');
    expect(card.textContent).toContain('0');
    expect(card.textContent).not.toContain('-5');
  });

  it('采纳接口 500 → 静默回 0, 四卡仍齐', async () => {
    mockApi({ adoption: new Error('http 500') });
    render(<GreenImpactDashboard />);
    expect(await screen.findByTestId('green-impact-green-alt-adoptions')).toBeTruthy();
    expect(screen.getByTestId('green-impact-green-alt-adoptions').textContent).toContain('0');
    expect(screen.getByTestId('green-impact-hours-reclaimed').textContent).toContain('0 hours');
    expect(screen.getByTestId('green-impact-current-streak').textContent).toContain('0');
  });
});
