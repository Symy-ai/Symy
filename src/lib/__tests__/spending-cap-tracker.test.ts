import { describe, expect, it } from 'vitest';
import { computeSpendingCapState, daysLeftInSpendingCapPeriod } from '../spending-cap-tracker';

const now = new Date('2026-09-15T12:00:00');
const periodStart = '2026-09-01T00:00:00';
const events = [
  { amount: 300, timestamp: '2026-09-05T00:00:00' },
  { amount: 120, timestamp: '2026-09-10T00:00:00' },
];

describe('computeSpendingCapState', () => {
  it('returns ok below the warning line', () => {
    expect(computeSpendingCapState(events, 50000, now, { periodStart, warningPct: 80 })).toMatchObject({ usedCents: 42000, pctUsed: 84, status: 'warning', remainingCents: 8000 });
  });

  it('returns warning at the configured line', () => {
    expect(computeSpendingCapState(events, 50000, now, { periodStart, warningPct: 90 })?.status).toBe('ok');
  });

  it('returns exceeded at the cap', () => {
    expect(computeSpendingCapState([...events, { amount: 100, timestamp: '2026-09-11' }], 50000, now, { periodStart, warningPct: 80 })).toMatchObject({ status: 'exceeded', remainingCents: 0 });
  });

  it('silently disables cap=0 and ignores prior periods', () => {
    expect(computeSpendingCapState(events, 0, now)).toBeNull();
    expect(computeSpendingCapState([{ amount: 999, timestamp: '2026-08-20' }], 50000, now, { periodStart, warningPct: 80 })?.usedCents).toBe(0);
  });
});

describe('daysLeftInSpendingCapPeriod', () => {
  it('counts inclusive days remaining', () => {
    expect(daysLeftInSpendingCapPeriod(periodStart, now)).toBe(16);
  });
});
