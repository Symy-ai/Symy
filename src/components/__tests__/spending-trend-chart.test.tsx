/**
 * Component tests for SpendingTrendChart (Guardian Trend weekly view)
 */
// @vitest-environment happy-dom

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { SpendingTrendChart } from '../spending-trend-chart';
import type { ImpulseEvent } from '@/lib/impulse-detector';

const i18nMock = vi.hoisted(() => ({ locale: 'en' as 'en' | 'zh' }));

vi.mock('@/i18n/provider', () => ({
  useI18n: () => {
    const locale = i18nMock.locale;
    return {
      locale,
      t: (key: string, params?: Record<string, string | number>) => {
        const translations: Record<string, string> = {
          'home.guardianTrendTitle': "This week's guardian report",
          'home.guardianTrendEmpty': 'No records',
          'home.guardianTrendGuardDay': 'Guard day',
          'home.guardianTrendDayLabel': '{amount} · {hours}',
          'home.guardianTrendTooltip': '{amount} · {hours}',
          'home.guardianTrendTotal': 'This week left you {amount}',
          'home.guardianTrendUp': 'Rising',
          'home.guardianTrendDown': 'Falling',
          'home.guardianTrendStable': 'Steady',
          'home.guardianTrendStartHint': 'Every guard will be remembered here',
          'home.last7Days': 'Last 7 days',
          'home.thisWeek': 'This week',
        };
        let result = translations[key] ?? key;
        if (params) {
          for (const [name, value] of Object.entries(params)) {
            result = result.replaceAll(`{${name}}`, String(value));
          }
        }
        return result;
      },
    };
  },
}));

function at(dayOffset: number, hour = 12): Date {
  const date = new Date(2026, 8, 6, hour, 0, 0, 0);
  date.setDate(date.getDate() + dayOffset);
  return date;
}

function mkEvent(
  subType: NonNullable<ImpulseEvent['subType']>,
  dayOffset: number,
  amount: number,
): ImpulseEvent {
  return {
    id: `event-${subType}-${dayOffset}-${amount}`,
    platform: subType === 'refund_processed' ? 'email' : 'challenge',
    item: subType === 'refund_processed' ? 'Refund' : 'Challenge',
    amount,
    timestamp: at(dayOffset),
    category: subType === 'refund_processed' ? 'refund' : 'challenge',
    isLivestream: false,
    isFlashSale: false,
    impulseScore: 0,
    reasons: [],
    subType,
  };
}

describe('SpendingTrendChart guardian view', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(at(0));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('scales guard bars by money, sums guards and refunds, shows hours, and keeps empty days honest', async () => {
    i18nMock.locale = 'en';
    const view = render(
      <SpendingTrendChart
        events={[
          mkEvent('challenge_completed', -6, 100),
          mkEvent('challenge_completed', -4, 40),
          mkEvent('refund_processed', -4, 20),
          mkEvent('challenge_completed', -3, 80),
          mkEvent('refund_processed', -2, 60),
          mkEvent('impulse_purchase', -5, 999),
          mkEvent('challenge_failed', -1, 77),
        ]}
        moneySaved={0}
      />,
    );

    await vi.waitFor(() => {
      expect(screen.getAllByTestId('guardian-bar')).toHaveLength(4);
    });

    const bars = screen.getAllByTestId('guardian-bar');
    const amounts = [100, 60, 80, 60];
    expect(bars.map(bar => bar.style.height)).toEqual(amounts.map(amount => `${amount}%`));
    expect(screen.getAllByTestId('guardian-empty-bar')).toHaveLength(3);
    expect(screen.getAllByText('No records')).toHaveLength(3);
    expect(screen.getByTestId('guardian-week-total').textContent).toContain('This week left you $300');
    expect(screen.getByTestId('guardian-week-total').textContent).toContain('12 hours');
    expect(document.body.textContent).not.toContain('$999');
    expect(document.body.textContent).not.toContain('$77');
    expect(document.body.textContent).not.toMatch(/impulse spending|daily spending|spending/i);
    view.unmount();
  });

  it('renders every day as an honest empty state when only failed challenges exist', async () => {
    render(
      <SpendingTrendChart
        events={Array.from({ length: 7 }, (_, index) => mkEvent('challenge_failed', -index, 30 + index))}
        moneySaved={0}
      />,
    );

    await vi.waitFor(() => {
      expect(screen.getAllByTestId('guardian-empty-bar')).toHaveLength(7);
    });
    expect(screen.queryAllByTestId('guardian-bar')).toHaveLength(0);
    expect(document.body.textContent).not.toMatch(/[¥$]\s*0|failed|failure|失败/i);
    expect(screen.getAllByText('No records').length).toBeGreaterThanOrEqual(7);
  });

  it('keeps rising guardian trend positive and green', async () => {
    render(
      <SpendingTrendChart
        events={[
          mkEvent('challenge_completed', 0, 100),
          mkEvent('challenge_completed', -8, 20),
        ]}
        moneySaved={0}
      />,
    );

    await vi.waitFor(() => {
      expect(screen.getByTestId('guardian-trend-direction').textContent).toContain('Rising');
    });
    expect(screen.getByTestId('guardian-trend-direction').className).toContain('text-emerald-400');
    expect(screen.getByTestId('guardian-trend-direction').className).not.toContain('text-red-');
  });

  it('keeps the old spending narrative absent in both locales', async () => {
    for (const locale of ['zh', 'en'] as const) {
      i18nMock.locale = locale;
      const view = render(
        <SpendingTrendChart
          events={[mkEvent('challenge_completed', 0, 100)]}
          moneySaved={0}
        />,
      );

      await vi.waitFor(() => expect(screen.getAllByTestId('guardian-bar')).toHaveLength(1));
      const text = document.body.textContent || '';
      expect(text).not.toMatch(/冲动消费|每日消费金额|impulse spending|daily spending|spending/i);
      view.unmount();
    }
  });
});
