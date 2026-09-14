import { spendingCapPeriodEnd, startOfMonth, type SpendingCapSetting } from './spending-cap';

export interface SpendingCapEvent {
  amount: number;
  category?: string;
  timestamp: Date | string;
}

export interface SpendingCapState {
  usedCents: number;
  capCents: number;
  pctUsed: number;
  status: 'warning' | 'exceeded' | 'ok';
  remainingCents: number;
}

export function computeSpendingCapState(
  events: readonly SpendingCapEvent[],
  capCents: number,
  now: Date,
  setting?: Pick<SpendingCapSetting, 'periodStart' | 'warningPct'>,
): SpendingCapState | null {
  if (!Number.isFinite(capCents) || capCents <= 0) return null;

  const normalizedStart = setting?.periodStart && !Number.isNaN(new Date(setting.periodStart).getTime())
    ? new Date(setting.periodStart)
    : startOfMonth(now);
  const start = normalizedStart > now || now.getFullYear() !== normalizedStart.getFullYear() || now.getMonth() !== normalizedStart.getMonth()
    ? startOfMonth(now)
    : normalizedStart;
  const end = spendingCapPeriodEnd(start.toISOString(), now);

  const usedCents = Math.max(0, events.reduce((sum, event) => {
    const timestamp = event.timestamp instanceof Date ? event.timestamp : new Date(event.timestamp);
    if (Number.isNaN(timestamp.getTime()) || timestamp < start || timestamp > end) return sum;
    return sum + Math.max(0, Math.round((Number(event.amount) || 0) * 100));
  }, 0));
  const pctUsed = Math.min(999, Math.round((usedCents / capCents) * 100));
  const warningPct = Math.min(95, Math.max(50, Math.floor(Number(setting?.warningPct) || 80)));
  return {
    usedCents,
    capCents,
    pctUsed,
    status: usedCents >= capCents ? 'exceeded' : pctUsed >= warningPct ? 'warning' : 'ok',
    remainingCents: Math.max(0, capCents - usedCents),
  };
}

export function daysLeftInSpendingCapPeriod(periodStart: string, now = new Date()): number {
  const end = spendingCapPeriodEnd(periodStart, now);
  return Math.max(0, Math.ceil((end.getTime() - now.getTime()) / 86400000));
}
