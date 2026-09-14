/**
 * Component tests for RateNudge (时薪个性化引导胶囊, batch26-b)
 *
 * 测试矩阵:
 *   - 显隐门控: 默认时薪 + 有战绩 + 已登录 → 胶囊出现;
 *     非默认时薪 / 无战绩 / 未登录 → 不渲染
 *   - localStorage 关闭: 「暂不」后当场消失 + 落盘, 重挂载 (跨会话) 不复发
 *   - 内联展开 + 保存: 输入合法时薪 → setHourlyRate 被调, 「已为你定制」
 *     短暂停留后胶囊淡出移除 (非弹窗, 不阻断)
 *   - 校验拦截 (照抄 profile 设置路径 1..1,000,000): 0 / 负数 / 小于 1 /
 *     超百万 → 显示错误, 不调 setHourlyRate
 */

/* eslint-disable require-await -- act(async) 包装刻意无 await: 同步 fireEvent + 空 await 以冲刷 promise 链 (route.test.ts 同惯例) */

// @vitest-environment happy-dom

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { fireEvent, render, screen, act } from '@testing-library/react';

const hookMock = vi.hoisted(() => ({
  rateIsDefault: true,
  setHourlyRate: vi.fn(async (_rate: number) => {}),
}));

const authMock = vi.hoisted(() => ({
  user: { id: 'u1' } as unknown | null,
}));

vi.mock('@/hooks/use-hourly-rate', () => ({
  useHourlyRate: () => ({
    hourlyRate: 20,
    rateIsDefault: hookMock.rateIsDefault,
    setHourlyRate: hookMock.setHourlyRate,
    isLoading: false,
  }),
}));

vi.mock('@/components/auth/auth-provider', () => ({
  useAuth: () => ({ user: authMock.user, loading: false, signOut: vi.fn() }),
}));

vi.mock('@/i18n/provider', () => ({
  useI18n: () => ({
    t: (key: string) => {
      const translations: Record<string, string> = {
        'rateNudge.cta': 'Make these numbers truly yours → set your hourly rate',
        'rateNudge.inputPlaceholder': 'Hourly rate ($ / hr)',
        'rateNudge.save': 'Save',
        'rateNudge.success': 'Personalized for you',
        'rateNudge.notNow': 'Not now',
        'profile.hourlyRateInvalid': 'Please enter a valid hourly rate',
        'profile.hourlyRateTooLow': 'Hourly rate must be at least $1/hr',
        'profile.hourlyRateTooHigh': 'Hourly rate must be at most $1,000,000/hr',
        'profile.hourlyRateSaveFailed': 'Failed to save — please try again',
      };
      return translations[key] ?? key;
    },
    locale: 'en',
  }),
}));

import { RateNudge } from '../rate-nudge';

const DISMISS_KEY = 'symy-rate-nudge-dismissed';

describe('RateNudge', () => {
  beforeEach(() => {
    window.localStorage.clear();
    hookMock.rateIsDefault = true;
    hookMock.setHourlyRate.mockClear();
    hookMock.setHourlyRate.mockImplementation(async () => {});
    authMock.user = { id: 'u1' };
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('shows the capsule when rate is default and user has stats', () => {
    render(<RateNudge hasStats />);
    expect(screen.getByTestId('rate-nudge')).toBeTruthy();
    expect(screen.getByTestId('rate-nudge-open').textContent).toContain(
      'Make these numbers truly yours'
    );
  });

  it('renders nothing when the rate is already personalized (non-default)', () => {
    hookMock.rateIsDefault = false;
    const { container } = render(<RateNudge hasStats />);
    expect(container.querySelector('[data-testid="rate-nudge"]')).toBeNull();
  });

  it('renders nothing without stats (nothing to personalize yet)', () => {
    const { container } = render(<RateNudge hasStats={false} />);
    expect(container.querySelector('[data-testid="rate-nudge"]')).toBeNull();
  });

  it('renders nothing when logged out (no rate to save against)', () => {
    authMock.user = null;
    const { container } = render(<RateNudge hasStats />);
    expect(container.querySelector('[data-testid="rate-nudge"]')).toBeNull();
  });

  it('stays gone after "Not now" — persisted to localStorage across remounts', () => {
    const first = render(<RateNudge hasStats />);
    fireEvent.click(screen.getByTestId('rate-nudge-dismiss'));

    expect(window.localStorage.getItem(DISMISS_KEY)).toBe('true');
    expect(first.container.querySelector('[data-testid="rate-nudge"]')).toBeNull();

    // 模拟跨会话: 全新挂载, 关闭态不复发 (非骚扰铁律)
    const second = render(<RateNudge hasStats />);
    expect(second.container.querySelector('[data-testid="rate-nudge"]')).toBeNull();
  });

  it('expands inline, saves via setHourlyRate, then fades out for good', async () => {
    const { container } = render(<RateNudge hasStats />);

    // 收起态没有输入框
    expect(screen.queryByTestId('rate-nudge-input')).toBeNull();
    fireEvent.click(screen.getByTestId('rate-nudge-open'));

    const input = screen.getByTestId('rate-nudge-input') as HTMLInputElement;
    fireEvent.change(input, { target: { value: '80' } });
    await act(async () => {
      fireEvent.click(screen.getByTestId('rate-nudge-save'));
    });

    expect(hookMock.setHourlyRate).toHaveBeenCalledWith(80);
    // 「已为你定制」短暂停留 (荣誉框架: 定制完成的一瞬属于用户)
    expect(screen.getByTestId('rate-nudge-success').textContent).toBe('Personalized for you');

    // 停留 1.2s → 淡出 0.7s → 彻底移除
    act(() => {
      vi.advanceTimersByTime(2000);
    });
    expect(container.querySelector('[data-testid="rate-nudge"]')).toBeNull();
  });

  it('rejects invalid input (0 / negative / <1 / >1M) without calling setHourlyRate', async () => {
    render(<RateNudge hasStats />);
    fireEvent.click(screen.getByTestId('rate-nudge-open'));
    const input = screen.getByTestId('rate-nudge-input') as HTMLInputElement;

    const cases: Array<[string, string]> = [
      ['0', 'Please enter a valid hourly rate'],
      ['-5', 'Please enter a valid hourly rate'],
      ['0.5', 'Hourly rate must be at least $1/hr'],
      ['2000000', 'Hourly rate must be at most $1,000,000/hr'],
    ];
    for (const [value, expectedError] of cases) {
      fireEvent.change(input, { target: { value } });
      await act(async () => {
        fireEvent.click(screen.getByTestId('rate-nudge-save'));
      });
      expect(screen.getByTestId('rate-nudge-error').textContent).toBe(expectedError);
    }

    expect(hookMock.setHourlyRate).not.toHaveBeenCalled();
  });

  it('shows the persisted-dismiss state without rendering when flag already set', () => {
    window.localStorage.setItem(DISMISS_KEY, 'true');
    const { container } = render(<RateNudge hasStats />);
    expect(container.querySelector('[data-testid="rate-nudge"]')).toBeNull();
  });
});
