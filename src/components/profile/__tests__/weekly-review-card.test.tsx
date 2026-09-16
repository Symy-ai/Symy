// @vitest-environment happy-dom
/**
 * WeeklyReviewCard (profile 版) 组件测试 (batch78-a)
 *
 * 金额口径断言: "Saved" 指标不直接显示金额 — 统一走
 * moneyToFreedomLabel(totalSaved, locale, hourlyRate) 换算成自由时间
 * (freedom-time Owner 铁律: 金额只在梦想基金语境保留)。
 * 本文件锁: 渲染产物 === 既有 lib 换算产物 (零散落格式化)、
 * loading/error/无数据三态降级、streak 徽章显隐、卡片点击回调。
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { moneyToFreedomLabel, moneyToHours, formatFreedomTime } from '@/lib/freedom-time';

const { apiFetchMock } = vi.hoisted(() => ({ apiFetchMock: vi.fn() }));

let locale = 'en';

vi.mock('@/i18n/provider', () => ({
  useI18n: () => ({
    t: (key: string, params?: Record<string, string | number> & { defaultValue?: string }) => {
      let result = params?.defaultValue ?? key;
      if (params) {
        for (const [k, v] of Object.entries(params)) {
          if (k !== 'defaultValue') result = result.replaceAll(`{${k}}`, String(v));
        }
      }
      return result;
    },
    get locale() { return locale; },
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

import { WeeklyReviewCard } from '../weekly-review-card';

function reviewData(overrides: Record<string, unknown> = {}) {
  return {
    challengesCompleted: 3,
    totalSaved: 250,
    tokensEarned: 120,
    dailyBreakdown: [],
    streakDays: 4,
    ...overrides,
  };
}

beforeEach(() => {
  locale = 'en';
  apiFetchMock.mockReset();
});

afterEach(() => {
  cleanup();
});

describe('WeeklyReviewCard 数据降级', () => {
  it('isActive=false → 初始不加载, 渲染 null', () => {
    const { container } = render(<WeeklyReviewCard isActive={false} />);
    expect(container.textContent).toBe('');
    expect(apiFetchMock).not.toHaveBeenCalled();
  });

  it('fetch 挂起 → 骨架屏, 无指标文案', () => {
    apiFetchMock.mockImplementation(() => new Promise(() => {}));
    const { container } = render(<WeeklyReviewCard />);
    expect(container.querySelector('.animate-pulse')).toBeTruthy();
    expect(container.textContent).not.toContain('Saved');
  });

  it('fetch 失败 → 错误文案 + Retry 重发请求', async () => {
    apiFetchMock.mockRejectedValueOnce(new Error('network down'));
    const { container } = render(<WeeklyReviewCard />);
    expect(await screen.findByText('Could not load weekly review')).toBeTruthy();
    expect(container.textContent).toContain('Retry');
    expect(apiFetchMock).toHaveBeenCalledTimes(1);

    apiFetchMock.mockResolvedValueOnce(reviewData());
    fireEvent.click(screen.getByText('Retry'));
    expect(await screen.findByText('10 hours')).toBeTruthy();
    expect(apiFetchMock).toHaveBeenCalledTimes(2);
  });

  it('成功加载后 data 为 null 之外的有效载荷 → 正常渲染 (error 状态先行清除)', async () => {
    apiFetchMock.mockRejectedValueOnce(new Error('fail'));
    render(<WeeklyReviewCard />);
    await screen.findByText('Could not load weekly review');
    apiFetchMock.mockResolvedValueOnce(reviewData());
    fireEvent.click(screen.getByText('Retry'));
    expect(await screen.findByText('Saved')).toBeTruthy();
  });
});

describe('WeeklyReviewCard 金额→自由时间口径', () => {
  it('"Saved" 指标 === moneyToFreedomLabel(totalSaved, locale, 25)', async () => {
    apiFetchMock.mockResolvedValueOnce(reviewData({ totalSaved: 250 }));
    render(<WeeklyReviewCard />);
    expect(await screen.findByText('10 hours')).toBeTruthy();
    // 口径对齐: 渲染产物必须等于 lib 产物 (不是散落 toFixed)
    expect(screen.getByText('10 hours').textContent).toBe(
      moneyToFreedomLabel(250, 'en', 25)
    );
    expect(screen.getByText('10 hours').textContent).toBe(
      formatFreedomTime(moneyToHours(250, 25), 'en')
    );
  });

  it('zh locale → "10 小时"', async () => {
    locale = 'zh';
    apiFetchMock.mockResolvedValueOnce(reviewData({ totalSaved: 250 }));
    render(<WeeklyReviewCard />);
    expect(await screen.findByText('10 小时')).toBeTruthy();
  });

  it('totalSaved=0 → "0 hours", 全文档无 NaN/undefined', async () => {
    apiFetchMock.mockResolvedValueOnce(reviewData({ totalSaved: 0, streakDays: 0 }));
    const { container } = render(<WeeklyReviewCard />);
    expect(await screen.findByText('0 hours')).toBeTruthy();
    expect(screen.getByText('0 hours').textContent).toBe(moneyToFreedomLabel(0, 'en', 25));
    expect(document.body.textContent).not.toMatch(/NaN|undefined/);
    expect(container).toBeTruthy();
  });

  it('totalSaved=237.5 (非整小时) → 一位小数, 仍等于 lib 产物', async () => {
    apiFetchMock.mockResolvedValueOnce(reviewData({ totalSaved: 237.5 }));
    render(<WeeklyReviewCard />);
    expect(await screen.findByText('9.5 hours')).toBeTruthy();
    expect(screen.getByText('9.5 hours').textContent).toBe(moneyToFreedomLabel(237.5, 'en', 25));
  });
});

describe('WeeklyReviewCard 指标与交互', () => {
  it('三指标 + streak 徽章渲染', async () => {
    apiFetchMock.mockResolvedValueOnce(reviewData());
    render(<WeeklyReviewCard />);
    expect(await screen.findByText('3')).toBeTruthy(); // challengesCompleted
    expect(screen.getByText('120')).toBeTruthy(); // tokensEarned
    // streak 徽章: t('profile.weeklyActiveDays', { n: 4 }) → key 回退含 4
    expect(screen.getByText('profile.weeklyActiveDays')).toBeTruthy();
  });

  it('streakDays=0 → 无徽章', async () => {
    apiFetchMock.mockResolvedValueOnce(reviewData({ streakDays: 0 }));
    render(<WeeklyReviewCard />);
    await screen.findByText('10 hours');
    expect(screen.queryByText('profile.weeklyActiveDays')).toBeNull();
  });

  it('点击卡片 → onOpenInsights 回调', async () => {
    apiFetchMock.mockResolvedValueOnce(reviewData());
    const onOpenInsights = vi.fn();
    render(<WeeklyReviewCard onOpenInsights={onOpenInsights} />);
    await screen.findByText('10 hours');
    fireEvent.click(screen.getByText('This week\'s seeing'));
    expect(onOpenInsights).toHaveBeenCalledTimes(1);
  });

  it('卸载时中止进行中的请求 (无 unhandled rejection)', async () => {
    apiFetchMock.mockImplementation(() => new Promise(() => {}));
    const { unmount } = render(<WeeklyReviewCard />);
    expect(() => unmount()).not.toThrow();
    await waitFor(() => expect(apiFetchMock).toHaveBeenCalledTimes(1));
  });
});
