// @vitest-environment happy-dom

/**
 * GuardYearReviewCard — annual deep-read rendering tests (batch66-a)
 * Covers insufficient fallback, full portrait, and amount-free share face.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { readFileSync } from 'fs';
import { GuardYearReviewCard } from '../guard-year-review-card';

vi.mock('@/lib/api-client', () => ({
  apiFetch: vi.fn(),
}));

import { apiFetch } from '@/lib/api-client';

const zhMsgs = JSON.parse(readFileSync('src/i18n/messages/zh.json', 'utf-8'));
const enMsgs = JSON.parse(readFileSync('src/i18n/messages/en.json', 'utf-8'));

function flat(obj: Record<string, unknown>, prefix = ''): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (value && typeof value === 'object') Object.assign(out, flat(value as Record<string, unknown>, `${prefix}${key}.`));
    else out[`${prefix}${key}`] = String(value);
  }
  return out;
}

let locale = 'en';

vi.mock('@/i18n/provider', () => ({
  useI18n: () => {
    const translations = locale === 'zh' ? flat(zhMsgs) : flat(enMsgs);
    return {
      t: (key: string, params?: Record<string, unknown>) => {
        let result = translations[key] ?? key;
        if (params) {
          for (const [paramKey, value] of Object.entries(params)) {
            result = result.replace(`{${paramKey}}`, String(value));
          }
        }
        return result;
      },
      locale,
    };
  },
}));

vi.mock('@/hooks/use-hourly-rate', () => ({
  useHourlyRate: () => ({ hourlyRate: 25 }),
}));

interface EventInput {
  eventType: string;
  triggerId: string;
  metadata: Record<string, unknown>;
  createdAt: string;
}

function annualEvents(): EventInput[] {
  const year = new Date().getFullYear();
  const on = (month: number, day: number): string => new Date(year, month, day, 10).toISOString();
  return [
    { eventType: 'challenge_completed', triggerId: 'i1', metadata: { category: 'clothing', savedAmount: 25 }, createdAt: on(0, 1) },
    { eventType: 'challenge_completed', triggerId: 'i2', metadata: { category: 'clothing', savedAmount: 25 }, createdAt: on(0, 2) },
    { eventType: 'challenge_completed', triggerId: 'i3', metadata: { category: 'clothing', savedAmount: 25 }, createdAt: on(0, 3) },
    { eventType: 'challenge_failed', triggerId: 'r1', metadata: { category: 'food' }, createdAt: on(1, 4) },
    { eventType: 'challenge_failed', triggerId: 'r2', metadata: { category: 'food' }, createdAt: on(1, 5) },
    { eventType: 'challenge_failed', triggerId: 'r3', metadata: { category: 'food' }, createdAt: on(1, 6) },
    { eventType: 'mindful_recovery', triggerId: 'a1', metadata: { kind: 'green_alt_adoption', entryId: 'ebook_repurchase', estSaved: 25 }, createdAt: on(2, 7) },
    {
      eventType: 'manual_adjustment',
      triggerId: 'g1',
      metadata: { source: 'green_commitment', category: 'clothing', subject: 'clothes', start_key: '2026-03-01', end_key: '2026-03-31' },
      createdAt: on(2, 8),
    },
    {
      eventType: 'manual_adjustment',
      triggerId: 's1',
      metadata: { source: 'green_commitment_settlement', ref_key: '2026-03-01#2026-03-31', outcome: 'kept' },
      createdAt: on(3, 9),
    },
    { eventType: 'challenge_completed', triggerId: 'prev1', metadata: { category: 'clothing', savedAmount: 25 }, createdAt: new Date(year - 1, 4, 1, 10).toISOString() },
    { eventType: 'challenge_completed', triggerId: 'prev2', metadata: { category: 'clothing', savedAmount: 25 }, createdAt: new Date(year - 1, 5, 1, 10).toISOString() },
  ];
}

function mockEvents(events: EventInput[]) {
  vi.mocked(apiFetch).mockImplementation((input: unknown) => {
    const url = new URL(String(input), 'http://localhost');
    const eventType = url.searchParams.get('event_type') ?? '';
    return Promise.resolve({ events: events.filter((event) => event.eventType === eventType) });
  });
}

beforeEach(() => {
  locale = 'en';
  vi.mocked(apiFetch).mockReset();
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('GuardYearReviewCard', () => {
  it('renders a stable insufficient state without inventing annual conclusions', async () => {
    mockEvents([]);
    render(<GuardYearReviewCard />);
    expect(await screen.findByTestId('guard-year-review-card-insufficient')).toBeTruthy();
    expect(screen.queryByTestId('guard-year-review-months')).toBeNull();
  });

  it('renders twelve-month trend, scenes, adoption structure, streak and private details', async () => {
    mockEvents(annualEvents());
    render(<GuardYearReviewCard />);
    expect(await screen.findByTestId('guard-year-review-card')).toBeTruthy();
    expect(screen.getAllByTestId(/^guard-year-review-month-/)).toHaveLength(12);
    expect(screen.getByTestId('guard-year-review-scenes').textContent).toContain('Clothing');
    expect(screen.getByTestId('guard-year-review-scenes').textContent).toContain('Food');
    expect(screen.getByTestId('guard-year-review-adoptions').textContent).toContain('Digital content');
    expect(screen.getByTestId('guard-year-review-streak').textContent).toContain('3');
    expect(screen.getByTestId('guard-year-review-private').textContent).toContain('4.0 hours');
    expect(screen.getByTestId('guard-year-review-private-counts').textContent).toContain('3');
  });

  it('keeps the share face free of amount and carbon values', async () => {
    mockEvents(annualEvents());
    render(<GuardYearReviewCard />);
    fireEvent.click(await screen.findByTestId('guard-year-review-share-btn'));
    const share = screen.getByTestId('guard-year-review-share-face');
    expect(share.textContent).not.toMatch(/\$|¥|€|£|carbon|CO2|kg/i);
    expect(share.textContent).not.toMatch(/savedAmount|estSaved/i);
  });
});
