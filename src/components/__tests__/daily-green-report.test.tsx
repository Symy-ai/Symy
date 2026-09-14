/**
 * Component tests for DailyGreenReport (每日绿色守护日报卡)
 *
 * 测试矩阵:
 *   - 有守护: 今日次数块 + 连续天数块 + 里子行 (金额 ≈ 自由小时)
 *   - 今日 0 守护: 空状态中性文案 (无 0 计数/羞耻暗示), 昨日 + 累计兜底
 *   - 累计也是 0: 「守护的开始」文案, 不出 0
 *   - 分享图层: 有次数/自由小时/天数, 无任何货币符号 (moneySaved 不进分享层)
 *   - 每日一次高亮: 当日首访 data-unread → 4s 后写入窗口 key 记已读; 同日再访不高亮
 */
// @vitest-environment happy-dom

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { DailyGreenReport } from '../daily-green-report';
import type { ImpulseEvent } from '@/lib/impulse-detector';
import { getLimitWindow } from '@/lib/limit-window';

const toPngMock = vi.hoisted(() => vi.fn());
vi.mock('@/lib/html-to-image-loader', () => ({
  loadHtmlToImage: () => Promise.resolve({ toPng: toPngMock }),
}));

vi.mock('@/hooks/use-hourly-rate', () => ({
  useHourlyRate: () => ({ hourlyRate: 25, setHourlyRate: vi.fn(), isLoading: false }),
}));

// Mock i18n — 用真实 en.json 文案, 保证断言与线上文案一致
vi.mock('@/i18n/provider', () => ({
  useI18n: () => ({
    t: (key: string, params?: Record<string, string | number> & { defaultValue?: string }) => {
      const translations: Record<string, string> = {
        'home.dailyGreenTitle': "Today's green report",
        'home.dailyGreenShareLabel': "Share today's green report",
        'home.dailyGreenGuardsLabel': 'Guards today',
        'home.dailyGreenStreakLabel': 'Green streak',
        'home.dailyGreenQuietTitle': 'Symy is quietly standing guard with you today',
        'home.dailyGreenQuietYesterday': '{count, plural, =1 {1 guard yesterday} other {# guards yesterday}}',
        'home.dailyGreenQuietTotal': '{count, plural, =1 {1 guard in total} other {# guards in total}}',
        'home.dailyGreenQuietFirst': 'Every moment of seeing is where guarding begins',
        'home.dailyGreenReclaimed': '{hours} hours won back',
        'home.dailyGreenPrivateNote': 'Only visible here — never on your share card',
        'share.dailyReport.pill': 'Daily Green Report',
        'share.dailyReport.guardsToday': '{count, plural, =1 {1 green guard today} other {# green guards today}}',
        'share.dailyReport.guardsTotal': '{count, plural, =1 {1 green guard in total} other {# green guards in total}}',
        'share.dailyReport.guardsTodayLabel': 'Guards today',
        'share.dailyReport.guardsTotalLabel': 'Guards in total',
        'share.dailyReport.hoursWonBack': '{hours} won back',
        'share.dailyReport.aGreenChoice': 'a green choice',
        'share.dailyReport.streak': '{days}-day green streak',
        'share.dailyReport.modalTitle': 'Share your green report',
        'share.dailyReport.generating': 'Creating your report…',
        'share.interceptMedal.wonBackLabel': 'You won back',
        'share.interceptMedal.share': 'Share',
        'share.interceptMedal.save': 'Save image',
        'common.days': 'days',
        'common.close': 'Close',
        'common.retry': 'Retry',
      };
      let result = translations[key] ?? params?.defaultValue ?? key;
      // mock ICU plural (en 规则: =1 单数, 其余复数) — 与 next-intl 行为对齐
      if (typeof params?.count === 'number' && result.includes('{count, plural')) {
        const m = result.match(/=1 \{([^}]*)\} other \{([^}]*)\}/);
        if (m) result = (params.count === 1 ? m[1] : m[2]).replace('#', String(params.count));
        return result;
      }
      if (params) {
        for (const [k, v] of Object.entries(params)) {
          if (k !== 'defaultValue') result = result.replace(`{${k}}`, String(v));
        }
      }
      return result;
    },
    locale: 'en',
  }),
}));

function mkEvent(subType: NonNullable<ImpulseEvent['subType']>, ageMs: number): ImpulseEvent {
  return {
    id: `evt-${subType}-${ageMs}`,
    platform: 'challenge',
    item: 'Test item',
    amount: 50,
    timestamp: new Date(Date.now() - ageMs),
    category: 'challenge',
    isLivestream: false,
    isFlashSale: false,
    impulseScore: 0,
    reasons: [],
    subType,
  };
}

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

const baseStats = { impulseInterventions: 4, moneySaved: 200, daysStreak: 5 };

describe('DailyGreenReport', () => {
  beforeEach(() => {
    toPngMock.mockReset();
    toPngMock.mockResolvedValue('data:image/png;base64,AAA');
    localStorage.clear();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // 相对时间测试钉在正午 — 否则 00:00–03:00 UTC 跑测试时 "N 小时前" 会落到昨天 (日期边界 flaky)
  function pinNoon(): void {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-09-06T12:00:00'));
  }

  it('shows today guard count + streak + reclaimed line when there are guards today', () => {
    pinNoon();
    render(
      <DailyGreenReport
        events={[mkEvent('challenge_completed', 2 * HOUR_MS), mkEvent('refund_processed', 3 * HOUR_MS)]}
        stats={baseStats}
      />
    );

    expect(screen.getByText("Today's green report")).toBeTruthy();
    expect(screen.getByText('Guards today').previousElementSibling?.textContent).toBe('2');
    expect(screen.getByText('Green streak').previousElementSibling?.textContent).toBe('5days');
    // 里子: moneySaved=200, 时薪 25 → 8.0h (real formatCurrency, locale=en → $)
    expect(screen.getByText('8.0 hours won back')).toBeTruthy();
    expect(screen.getByText('Only visible here — never on your share card')).toBeTruthy();
    // 非空状态不出现空状态文案
    expect(screen.queryByText('Symy is quietly standing guard with you today')).toBeNull();
  });

  it('shows neutral quiet copy (no zero count) when nothing was guarded today', () => {
    pinNoon();
    render(
      <DailyGreenReport
        events={[mkEvent('challenge_completed', DAY_MS + 2 * HOUR_MS), mkEvent('challenge_failed', 1 * HOUR_MS)]}
        stats={baseStats}
      />
    );

    // challenge_failed 不算守护 — 今日 0, 走空状态
    expect(screen.getByText('Symy is quietly standing guard with you today')).toBeTruthy();
    expect(screen.getByText('1 guard yesterday · 4 guards in total')).toBeTruthy();
    // 荣誉框架: 不出现守护计数块, 也不出现孤立 "0"
    expect(screen.queryByText('Guards today')).toBeNull();
  });

  it('shows first-see copy when there are no guards at all (no shame, no zero)', () => {
    render(<DailyGreenReport events={[mkEvent('impulse_purchase', 1 * HOUR_MS)]} stats={{ impulseInterventions: 0, moneySaved: 0, daysStreak: 0 }} />);

    expect(screen.getByText('Every moment of seeing is where guarding begins')).toBeTruthy();
    // 里子行为 0 时整体隐藏 (0 金额不出 "≈ 0 小时" 空洞句)
    expect(screen.queryByText(/reclaimed/)).toBeNull();
  });

  it('share layer shows guards/hours/streak and never any money', async () => {
    pinNoon();
    render(
      <DailyGreenReport
        events={[mkEvent('challenge_completed', 1 * HOUR_MS)]}
        stats={baseStats}
      />
    );

    fireEvent.click(screen.getByTestId('daily-green-share-button'));

    await waitFor(() => expect(toPngMock).toHaveBeenCalled());
    const shareCard = document.querySelector('[data-testid="daily-green-share-card"]');
    expect(shareCard).toBeTruthy();
    const text = shareCard!.textContent || '';
    // 面子三件套: 次数 + 赢回小时 + 天数 (count=1 走 ICU 单数)
    expect(text).toContain('1 green guard today');
    expect(text).toContain('8.0 hours won back');
    expect(text).toContain('5-day green streak');
    // 红线: 分享图层任何位置无钱数 (moneySaved=200 在 app 内可见, 但不进分享卡)
    expect(text).not.toMatch(/[$¥]/);

    const modal = document.querySelector('[data-testid="daily-green-share-modal"]');
    expect((modal?.textContent || '')).not.toMatch(/[$¥]/);
  });

  it('highlights once per day: unread on first visit, marked seen after 4s', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-06T12:00:00'));

    render(<DailyGreenReport events={[]} stats={{ impulseInterventions: 0, moneySaved: 0, daysStreak: 0 }} />);

    const card = () => document.querySelector('[data-testid="daily-green-report"]');
    expect(card()?.getAttribute('data-unread')).toBe('true');

    act(() => {
      vi.advanceTimersByTime(4000);
    });
    expect(card()?.getAttribute('data-unread')).toBeNull();
    expect(localStorage.getItem('symy-daily-green-report')).toBe(getLimitWindow());
  });

  it('no highlight when already seen today', () => {
    localStorage.setItem('symy-daily-green-report', getLimitWindow());

    render(<DailyGreenReport events={[]} stats={{ impulseInterventions: 0, moneySaved: 0, daysStreak: 0 }} />);

    expect(document.querySelector('[data-testid="daily-green-report"]')?.getAttribute('data-unread')).toBeNull();
  });
});
