// @vitest-environment happy-dom

import { cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SpendingCapResponse } from '@/lib/hooks/use-spending-cap';
import type { SpendingCapState } from '@/lib/spending-cap-tracker';
import { SpendingCapCard } from '../spending-cap-card';

const i18nState = vi.hoisted(() => ({ locale: 'en' as 'en' | 'zh' }));
let hookResult: { data?: SpendingCapResponse } = {};

vi.mock('@/i18n/provider', () => ({
  useI18n: () => ({
    locale: i18nState.locale,
    t: (key: string, values?: Record<string, unknown>) => {
      if (key !== 'home.spendingCapUsage') return key;
      return `${values?.used} / ${values?.cap} · ${values?.days} days left`;
    },
  }),
}));

vi.mock('@/lib/hooks/use-spending-cap', () => ({
  useSpendingCap: () => hookResult,
}));

function setResponse(
  state: Omit<SpendingCapState, 'remainingCents'>,
  daysLeft = 7,
) {
  const fullState: SpendingCapState = {
    ...state,
    remainingCents: Math.max(0, state.capCents - state.usedCents),
  };
  hookResult = {
    data: {
      state: fullState,
      daysLeft,
      setting: {
        capCents: state.capCents,
        periodStart: '2026-09-01T00:00:00.000Z',
        warningPct: 80,
      },
      events: [],
      categories: [],
    },
  };
}

function renderCard() {
  return render(<SpendingCapCard />);
}

function progressBar(container: HTMLElement) {
  return container.querySelector<HTMLElement>('[style^="width:"]');
}

describe('SpendingCapCard', () => {
  beforeEach(() => {
    i18nState.locale = 'en';
  });

  afterEach(cleanup);

  it('renders nothing until the tracker returns a state', () => {
    hookResult = {};
    const { container } = renderCard();
    expect(container.firstChild).toBeNull();
  });

  it('formats cents as dollars and threads daysLeft into the usage copy', () => {
    setResponse({ usedCents: 123456, capCents: 12345600, pctUsed: 1, status: 'ok' }, 9);
    const { getByTestId } = renderCard();
    expect(getByTestId('spending-cap-card').textContent).toBe(
      'home.spendingCapTitle$1,234.56 / $123,456.00 · 9 days left',
    );
  });

  it('formats zero cents as $0.00', () => {
    setResponse({ usedCents: 0, capCents: 0, pctUsed: 0, status: 'ok' });
    const { getByTestId } = renderCard();
    expect(getByTestId('spending-cap-card').textContent).toContain('$0.00 / $0.00');
  });

  it('uses the zh-CN currency formatter for the zh locale', () => {
    i18nState.locale = 'zh';
    setResponse({ usedCents: 1235, capCents: 10000, pctUsed: 12.35, status: 'ok' });
    const { getByTestId } = renderCard();
    const expected = new Intl.NumberFormat('zh-CN', { style: 'currency', currency: 'USD' });
    expect(getByTestId('spending-cap-card').textContent).toContain(
      `${expected.format(12.35)} / ${expected.format(100)}`,
    );
  });

  it('clamps progress width at 100 percent', () => {
    setResponse({ usedCents: 2000, capCents: 1000, pctUsed: 150, status: 'ok' });
    const { container } = renderCard();
    expect(progressBar(container)?.style.width).toBe('100%');
  });

  it.each([
    ['exceeded', 'bg-red-500'],
    ['warning', 'bg-orange-500'],
    ['ok', 'bg-blue-500'],
  ] as const)('uses the %s progress color', (status, className) => {
    setResponse({ usedCents: 1, capCents: 100, pctUsed: 1, status });
    const { container } = renderCard();
    expect(progressBar(container)?.className).toContain(className);
  });
});
