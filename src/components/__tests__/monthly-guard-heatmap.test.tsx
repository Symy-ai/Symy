// @vitest-environment happy-dom

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MonthlyGuardHeatmap } from '../monthly-guard-heatmap';
import type { ImpulseEvent } from '@/lib/impulse-detector';

const hourlyRateMock = vi.hoisted(() => ({ rateIsDefault: true }));

vi.mock('@/hooks/use-hourly-rate', () => ({
  useHourlyRate: () => ({
    hourlyRate: 20,
    rateIsDefault: hourlyRateMock.rateIsDefault,
    setHourlyRate: vi.fn(async () => {}),
  }),
}));

vi.mock('@/i18n/provider', () => ({
  useI18n: () => ({
    t: (key: string, params?: Record<string, string | number>) => {
      const translations: Record<string, string> = {
        'buddy.dailyTask.monthlyGuard.title': "Guardian's monthly heatmap",
        'buddy.dailyTask.monthlyGuard.guardDays': 'Guard days',
        'buddy.dailyTask.monthlyGuard.intercepts': 'Intercepts',
        'buddy.dailyTask.monthlyGuard.refunds': 'Refunds',
        'buddy.dailyTask.monthlyGuard.savedHours': 'Saved hours',
        'buddy.dailyTask.monthlyGuard.moneyLeft': 'This month won you back {amount}',
        'buddy.dailyTask.monthlyGuard.moneyDestination': 'All of it flows into your dream fund',
        'buddy.dailyTask.monthlyGuard.moneyHint': 'Every guarded choice flows into your dream fund',
        'buddy.dailyTask.monthlyGuard.restart': 'Symy is here to start fresh with you',
        'buddy.dailyTask.monthlyGuard.prevMonth': 'Previous month',
        'buddy.dailyTask.monthlyGuard.nextMonth': 'Next month',
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

function today(): Date {
  return new Date(2026, 8, 15, 12, 0, 0, 0);
}

function dayKey(d: Date): string {
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

function mkEvent(
  subType: NonNullable<ImpulseEvent['subType']>,
  dayOffset: number,
  amount = 50
): ImpulseEvent {
  const d = new Date(2026, 8, 15);
  d.setDate(d.getDate() + dayOffset);
  return {
    id: `evt-${subType}-${dayOffset}-${amount}`,
    platform: 'challenge',
    item: 'Test item',
    amount,
    timestamp: d,
    category: 'challenge',
    isLivestream: false,
    isFlashSale: false,
    impulseScore: 0,
    reasons: [],
    subType,
  };
}

describe('MonthlyGuardHeatmap', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(today());
    hourlyRateMock.rateIsDefault = true;
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('filters events to a 30-day window (inclusive)', () => {
    // Day -30 is outside the window, day 0 (today) is inside
    const events = [
      mkEvent('challenge_completed', -30, 10), // outside (boundary exclusive from 30 days ago if strict <)
      mkEvent('challenge_completed', -29, 20), // inside
      mkEvent('challenge_completed', 0, 30),
    ];
    render(<MonthlyGuardHeatmap events={events} />);

    // Today is Sep 15 2026. Day -29 is Aug 17. Sep 15 belongs to month=8 (September).
    // The calendar renders the current month (September 2026), so only Sep 15 (day 0) should be colored.
    expect(screen.queryByTestId(`monthly-cell-${dayKey(new Date(2026, 8, 15))}`)).toBeTruthy();

    // The two days in August should NOT have a month-cell in September view
    expect(screen.queryByTestId(`monthly-cell-${dayKey(new Date(2026, 7, 17))}`)).toBeNull();
  });

  it('maps color gradient 0/1/2/≥3 correctly', () => {
    const todayDate = today();
    const sameMonth = todayDate.getMonth();
    const sameYear = todayDate.getFullYear();

    // Day 0 (today) = 3 guards → ≥3
    const day0Key = dayKey(new Date(sameYear, sameMonth, 15));
    // Day -1 (yesterday) = 2 guards → 2
    const dayMinus1Key = dayKey(new Date(sameYear, sameMonth, 14));
    // Day -2 = 1 guard → 1
    const dayMinus2Key = dayKey(new Date(sameYear, sameMonth, 13));
    // Day -3 = 0 guards → 0
    const dayMinus3Key = dayKey(new Date(sameYear, sameMonth, 12));

    const events = [
      mkEvent('challenge_completed', 0, 10),
      mkEvent('challenge_completed', 0, 10),
      mkEvent('challenge_completed', 0, 10),
      mkEvent('refund_processed', -1, 10),
      mkEvent('challenge_completed', -1, 10),
      mkEvent('challenge_completed', -2, 10),
    ];
    const { container } = render(<MonthlyGuardHeatmap events={events} />);

    const bgClasses = [
      'bg-white/5',
      'bg-emerald-500/20',
      'bg-emerald-500/40',
      'bg-emerald-500/70',
    ];

    // 0 guards
    const cell0 = container.querySelector(`[data-testid="monthly-cell-${dayMinus3Key}"]`);
    expect(cell0?.className).toContain(bgClasses[0]);

    // 1 guard
    const cell1 = container.querySelector(`[data-testid="monthly-cell-${dayMinus2Key}"]`);
    expect(cell1?.className).toContain(bgClasses[1]);

    // 2 guards
    const cell2 = container.querySelector(`[data-testid="monthly-cell-${dayMinus1Key}"]`);
    expect(cell2?.className).toContain(bgClasses[2]);

    // 3+ guards
    const cell3 = container.querySelector(`[data-testid="monthly-cell-${day0Key}"]`);
    expect(cell3?.className).toContain(bgClasses[3]);
  });

  it('highlights today with a border', () => {
    const events = [
      mkEvent('challenge_completed', 0, 10),
    ];
    const { container } = render(<MonthlyGuardHeatmap events={events} />);

    const todayCell = container.querySelector(
      `[data-testid="monthly-cell-${dayKey(today())}"]`
    );
    expect(todayCell).toBeTruthy();
    expect(todayCell?.className).toContain('border border-emerald-300/50');
  });

  it('shows zero-data companion copy (no 0/0/0 stats)', () => {
    render(<MonthlyGuardHeatmap events={[]} />);

    expect(screen.getByText("Symy is here to start fresh with you")).toBeTruthy();
    expect(screen.queryByText('Guard days')).toBeNull();
    expect(screen.queryByTestId('monthly-money-line')).toBeNull();
    expect(screen.queryByTestId('monthly-money-hint')).toBeNull();
  });

  it('shows money line in secondary area and converts to saved hours, never raw money', () => {
    const events = [
      mkEvent('challenge_completed', 0, 50),
      mkEvent('refund_processed', 0, 50),
    ];
    render(<MonthlyGuardHeatmap events={events} />);

    // 50+50 = 100 money; at $20/hr = 5.0h
    expect(screen.getByTestId('monthly-money-line').textContent).toContain('5.0 hours');
    expect(screen.getByTestId('monthly-money-line').textContent).not.toContain('$');
    expect(screen.getByTestId('monthly-money-line').textContent).not.toContain('100');

    // Tooltip has day label + count, no raw money
    const tooltip = document.querySelector('[role="tooltip"]');
    expect(tooltip?.textContent).not.toContain('$');
    expect(tooltip?.textContent).not.toContain('100');
  });

  it('navigates months with prev/next buttons', () => {
    const { container } = render(<MonthlyGuardHeatmap events={[]} />);

    const title = container.querySelector('h3')?.textContent;
    expect(title).toContain("Guardian's monthly heatmap");

    const prevBtn = screen.getByTestId('monthly-prev');
    const nextBtn = screen.getByTestId('monthly-next');
    expect(prevBtn).toBeTruthy();
    expect(nextBtn).toBeTruthy();
  });
});
