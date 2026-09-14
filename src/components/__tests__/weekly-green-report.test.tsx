/**
 * Component tests for WeeklyGreenReport (守护者周报卡)
 *
 * 测试矩阵:
 *   - aggregateGuardWeek 纯函数: 跨天累加 / 拦截-找回拆分 / 金额求和 /
 *     出窗与非守护事件排除 / streak 连续性 (断天即停)
 *   - streak 荣誉锚点: 今天还没守护时从昨天起数 (清早打开不清零)
 *   - 门控: 近 7 天守护 <3 天 → 整卡不渲染 (空数据同理)
 *   - 全量渲染: 称号区 + 2x2 指标 + 里子金额行 + 梦想基金去向
 *   - 中断周: streak 单元显示「重新开始」陪伴文案, 不出 0 / 不出失败表述;
 *     金额为 0 时金额行隐藏, 只留去向提示 (荣誉非羞耻)
 *   - 晒卡边界: 卡内无任何 share 入口 (本卡不参与导出图)
 *   - batch26-b 时薪引导: 有拦截战绩 + 默认时薪 → 胶囊挂分享入口上方;
 *     已自设 → 不出现
 */
// @vitest-environment happy-dom

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { WeeklyGreenReport, aggregateGuardWeek } from '../weekly-green-report';
import type { ImpulseEvent } from '@/lib/impulse-detector';

const shareModalMock = vi.hoisted(() => vi.fn(() => null));
// batch26-b: 胶囊显隐由共享单例的 rateIsDefault 驱动, 测试内可翻转
const hourlyRateMock = vi.hoisted(() => ({ rateIsDefault: true }));

vi.mock('@/components/share/share-modal', () => ({
  ShareModal: shareModalMock,
}));

vi.mock('@/hooks/use-hourly-rate', () => ({
  useHourlyRate: () => ({
    hourlyRate: 20,
    rateIsDefault: hourlyRateMock.rateIsDefault,
    setHourlyRate: vi.fn(async () => {}),
  }),
}));

vi.mock('@/components/auth/auth-provider', () => ({
  useAuth: () => ({ user: { id: 'u1' }, loading: false, signOut: vi.fn() }),
}));

vi.mock('@/i18n/provider', () => ({
  useI18n: () => ({
    t: (key: string, params?: Record<string, string | number>) => {
      const translations: Record<string, string> = {
        'report.weekly.title': "Guardian's weekly report",
        'report.weekly.guardDays': 'Days guarded',
        'report.weekly.intercepts': 'Intercepts',
        'report.weekly.refunds': 'Refunds reclaimed',
        'report.weekly.streakLabel': 'Guard streak',
        'report.weekly.streakRestart': 'Symy is here to start fresh with you',
        'report.weekly.moneyLeft': 'This week won you back {amount}',
        'report.weekly.moneyDestination': 'All of it flows into your dream fund',
        'report.weekly.moneyHint': 'Every guarded choice flows into your dream fund',
        'common.days': 'days',
      };
      let result = translations[key] ?? key;
      if (params) {
        for (const [k, v] of Object.entries(params)) {
          result = result.replace(`{${k}}`, String(v));
        }
      }
      return result;
    },
    locale: 'en',
  }),
}));

// 固定「今天」= 2026-09-06 12:00 本地时间, 天级断言不受运行时刻影响
function at(dayOffset: number, hour = 12): Date {
  const d = new Date(2026, 8, 6, hour, 0, 0, 0);
  d.setDate(d.getDate() + dayOffset);
  return d;
}

function mkEvent(subType: NonNullable<ImpulseEvent['subType']>, dayOffset: number, amount = 50): ImpulseEvent {
  return {
    id: `evt-${subType}-${dayOffset}-${amount}`,
    platform: 'challenge',
    item: 'Test item',
    amount,
    timestamp: at(dayOffset),
    category: 'challenge',
    isLivestream: false,
    isFlashSale: false,
    impulseScore: 0,
    reasons: [],
    subType,
  };
}

describe('aggregateGuardWeek', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(at(0));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('accumulates across days: guard days / intercept-refund split / money sum / window & non-guard exclusion', () => {
    const summary = aggregateGuardWeek(
      [
        mkEvent('challenge_completed', 0, 40),
        mkEvent('refund_processed', 0, 60),
        mkEvent('challenge_completed', -1, 50),
        mkEvent('refund_processed', -3, 70),
        mkEvent('challenge_completed', -8, 500), // 出窗 (>7 天前)
        mkEvent('impulse_purchase', 0, 999), // 非守护
        mkEvent('challenge_failed', -1, 30), // 非守护 (不计入也不羞耻)
      ],
      at(0)
    );

    expect(summary.guardDays).toBe(3); // 今天 / 昨天 / 3 天前
    expect(summary.intercepts).toBe(2);
    expect(summary.refunds).toBe(2);
    expect(summary.moneyLeft).toBe(220); // 40+60+50+70, 出窗与非守护不计
    expect(summary.streakDays).toBe(2); // 今天+昨天连续, 前天断 → 停
  });

  it('anchors streak on yesterday when nothing guarded yet today (early morning ≠ reset)', () => {
    const summary = aggregateGuardWeek(
      [mkEvent('challenge_completed', -1, 50), mkEvent('refund_processed', -2, 30)],
      at(0)
    );

    expect(summary.streakDays).toBe(2); // 荣誉非羞耻: 今天还没守护不清零
  });
});

describe('WeeklyGreenReport', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(at(0));
    hourlyRateMock.rateIsDefault = true;
    window.localStorage.clear();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders nothing when fewer than 3 guard days in the window (empty data included)', () => {
    const { container } = render(
      <WeeklyGreenReport events={[mkEvent('challenge_completed', 0), mkEvent('refund_processed', -1)]} />
    );

    expect(container.querySelector('[data-testid="weekly-green-report"]')).toBeNull();
  });

  it('renders title + 2x2 metrics + secondary money line + dream-fund destination', () => {
    render(
      <WeeklyGreenReport
        events={[
          mkEvent('challenge_completed', 0, 40),
          mkEvent('refund_processed', -1, 60),
          mkEvent('challenge_completed', -2, 50),
          mkEvent('impulse_purchase', 0, 999), // 非守护, 不进任何格子
        ]}
      />
    );

    expect(screen.getByText("Guardian's weekly report")).toBeTruthy();
    expect(screen.getByText('Days guarded').previousElementSibling?.textContent).toBe('3');
    expect(screen.getByText('Intercepts').previousElementSibling?.textContent).toBe('2');
    expect(screen.getByText('Refunds reclaimed').previousElementSibling?.textContent).toBe('1');
    expect(screen.getByText('Guard streak').previousElementSibling?.textContent).toBe('3days');
    // 里子: 金额行在次级区 (真实管道求和 40+60+50=150), 去向提示指向梦想基金
    expect(screen.getByTestId('weekly-money-line').textContent).toBe('This week won you back 6.0 hours');
    expect(screen.getByText('All of it flows into your dream fund')).toBeTruthy();
    expect(screen.getByTestId('weekly-share-entry')).toBeTruthy();

    fireEvent.click(screen.getByTestId('weekly-share-entry'));
    expect(shareModalMock).toHaveBeenLastCalledWith(
      expect.objectContaining({
        open: true,
        initialTemplate: 'weekly',
        weeklyCard: expect.objectContaining({ guardDays: 3, intercepts: 2, streakDays: 3, savedHours: 7.5 }),
      }),
      undefined
    );
  });

  it('shows restart companion copy (no zero, no shame) on an interrupted week, hint-only when money is 0', () => {
    render(
      <WeeklyGreenReport
        events={[
          mkEvent('challenge_completed', -2, 0),
          mkEvent('challenge_completed', -3, 0),
          mkEvent('refund_processed', -4, 0),
        ]}
      />
    );

    // 门控通过 (3 守护天), 但今天/昨天空 → streak 单元走重新开始文案, 不出 0
    expect(screen.getByText('Symy is here to start fresh with you')).toBeTruthy();
    expect(screen.queryByText('Guard streak')).toBeNull();
    // 金额为 0 → 金额行整体隐藏, 只留去向提示 (不出 "$0" 空洞句)
    expect(screen.queryByTestId('weekly-money-line')).toBeNull();
    expect(screen.getByText('Every guarded choice flows into your dream fund')).toBeTruthy();
  });

  it('surfaces the rate nudge above the share entry when intercepts exist and rate is default (batch26-b)', () => {
    const { container } = render(
      <WeeklyGreenReport
        events={[
          mkEvent('challenge_completed', 0, 40),
          mkEvent('refund_processed', -1, 60),
          mkEvent('challenge_completed', -2, 50),
        ]}
      />
    );

    // 有拦截战绩 + 默认时薪 → 胶囊挂在分享入口正上方 (周报高光时刻 = 动机最强点)
    const nudge = container.querySelector('[data-testid="rate-nudge"]');
    expect(nudge).not.toBeNull();
    expect(nudge?.nextElementSibling?.getAttribute('data-testid')).toBe('weekly-share-entry');

    // 已自设时薪 → 胶囊消失, 其余战报不受影响
    hourlyRateMock.rateIsDefault = false;
    const personalized = render(
      <WeeklyGreenReport
        events={[
          mkEvent('challenge_completed', 0, 40),
          mkEvent('refund_processed', -1, 60),
          mkEvent('challenge_completed', -2, 50),
        ]}
      />
    );
    expect(personalized.container.querySelector('[data-testid="rate-nudge"]')).toBeNull();
  });
});
