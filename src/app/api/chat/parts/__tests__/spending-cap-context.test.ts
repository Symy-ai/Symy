import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { loadSpendingCapContext } from '../spending-cap-context';

function chain(data: unknown) {
  return {
    select: () => chain(data),
    eq: (_col: string, _val: string) => chain(data),
    gte: () => chain(data),
    lte: () => chain(data),
    maybeSingle: () => ({ data }),
  };
}


describe('loadSpendingCapContext', () => {
  beforeAll(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-09-15T12:00:00Z'));
  });

  afterAll(() => vi.useRealTimers());

  it('injects warning context and marks exceeded cap', async () => {
    const now = new Date('2026-09-15T12:00:00Z');
    const periodStart = '2026-09-01T00:00:00Z';
    const rows = { from: (table: string) => chain(table === 'shopping_facts'
      ? { value: JSON.stringify({ capCents: 50000, periodStart, warningPct: 80 }) }
      : table === 'health_events'
        ? [{ metadata: { savedAmount: 300 }, created_at: now.toISOString() }, { metadata: { savedAmount: 220 }, created_at: now.toISOString() }]
        : []) };
    const context = await loadSpendingCapContext('u', rows as never);
    expect(context).toMatchObject({ exceeded: true });
    expect(context.line).toContain('symy_spending_cap_context');
  });

  it('is silent when cap is disabled', async () => {
    const rows = { from: () => chain({ value: null }) };
    expect(await loadSpendingCapContext('u', rows as never)).toEqual({ exceeded: false });
  });
});
