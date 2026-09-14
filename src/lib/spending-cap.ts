export interface SpendingCapSetting {
  capCents: number;
  periodStart: string;
  warningPct: number;
}

export function normalizeSpendingCapSetting(input: Partial<SpendingCapSetting> | null | undefined, now = new Date()): SpendingCapSetting {
  const capCents = Math.max(0, Math.floor(Number(input?.capCents) || 0));
  const periodStart = startOfMonth(now).toISOString();
  const warningPct = Math.min(95, Math.max(50, Math.floor(Number(input?.warningPct) || 80)));
  return { capCents, periodStart, warningPct };
}

export function startOfMonth(now: Date): Date {
  return new Date(now.getFullYear(), now.getMonth(), 1);
}

export function spendingCapPeriodEnd(periodStart: string, now = new Date()): Date {
  const start = new Date(periodStart);
  if (Number.isNaN(start.getTime())) return startOfMonth(now);
  return new Date(start.getFullYear(), start.getMonth() + 1, 0, 23, 59, 59, 999);
}

// batch67 qafix: 零 DDL 红线 — 设置改存 shopping_facts (category='budget', key='spending_cap'),
// value 为 JSON 文本，受该表 200 字符上限约束 (capCents ≤ 9 位时序列化 <100 字符)。
export const SPENDING_CAP_FACT_CATEGORY = 'budget';
export const SPENDING_CAP_FACT_KEY = 'spending_cap';

export function serializeSpendingCapSetting(setting: SpendingCapSetting): string {
  return JSON.stringify({ capCents: setting.capCents, periodStart: setting.periodStart, warningPct: setting.warningPct });
}

export function parseSpendingCapSettingValue(value: string | null | undefined): Partial<SpendingCapSetting> | null {
  if (!value) return null;
  try {
    const row = JSON.parse(value) as Record<string, unknown>;
    return {
      capCents: Number(row.capCents) || 0,
      periodStart: typeof row.periodStart === 'string' ? row.periodStart : undefined,
      warningPct: Number(row.warningPct) || 80,
    };
  } catch {
    // safe to ignore: malformed stored JSON falls back to default (disabled) setting
    return null;
  }
}
