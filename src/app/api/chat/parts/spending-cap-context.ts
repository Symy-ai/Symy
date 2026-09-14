import { computeSpendingCapState } from '@/lib/spending-cap-tracker';
import { spendingCapPeriodEnd, parseSpendingCapSettingValue, SPENDING_CAP_FACT_CATEGORY, SPENDING_CAP_FACT_KEY } from '@/lib/spending-cap';

interface ReadChain {
  select: (cols: string) => ReadChain;
  eq: (col: string, val: string) => ReadChain;
  gte: (col: string, val: string) => ReadChain;
  lte: (col: string, val: string) => ReadChain;
  maybeSingle: () => PromiseLike<{ data: unknown }>;
}

export interface SpendingCapStore {
  from: (table: 'shopping_facts' | 'health_events' | 'email_receipts') => ReadChain;
}

export interface SpendingCapContext {
  line?: string;
  exceeded: boolean;
}

export async function loadSpendingCapContext(userId: string | undefined, store: SpendingCapStore | null | undefined): Promise<SpendingCapContext> {
  if (!userId || !store) return { exceeded: false };
  try {
    const factRow = (await store.from('shopping_facts').select('value').eq('user_id', userId).eq('category', SPENDING_CAP_FACT_CATEGORY).eq('key', SPENDING_CAP_FACT_KEY).maybeSingle()).data as { value: string | null } | null;
    const setting = parseSpendingCapSettingValue(factRow?.value) || {};
    const capCents = Number(setting.capCents) || 0;
    if (capCents <= 0) return { exceeded: false };
    const periodStart = typeof setting.periodStart === 'string' ? setting.periodStart : new Date().toISOString();
    const warningPct = Number(setting.warningPct) || 80;
    const periodEnd = spendingCapPeriodEnd(periodStart, new Date());

    const [guards, refunds] = await Promise.all([
      store.from('health_events').select('metadata, created_at').eq('user_id', userId).eq('event_type', 'challenge_completed').gte('created_at', periodStart).lte('created_at', periodEnd.toISOString()).maybeSingle(),
      store.from('email_receipts').select('amount, received_at').eq('user_id', userId).eq('status', 'refunded').gte('received_at', periodStart).lte('received_at', periodEnd.toISOString()).maybeSingle(),
    ]);
    const guardRows = (guards.data || []) as Array<{ metadata: Record<string, unknown> | null; created_at: string }>;
    const refundRows = (refunds.data || []) as Array<{ amount: number | null; received_at: string | null }>;
    const events = [
      ...guardRows.map((row) => ({ amount: Number(row.metadata?.savedAmount), timestamp: row.created_at })),
      ...refundRows.map((row) => ({ amount: Number(row.amount), timestamp: row.received_at || '' })),
    ];
    const state = computeSpendingCapState(events, capCents, new Date(), { periodStart, warningPct });
    if (!state || state.status === 'ok') return { exceeded: false };
    const line = ` | symy_spending_cap_context: ${state.pctUsed}% used, ${state.remainingCents / 100} USD remaining${state.status === 'exceeded' ? ' — guard goal reached; do not suggest purchases or green alternatives; guide the user to wait for the next period' : ' — warn before new purchase decisions and prioritize choices already on the guard list'}`;
    return { line, exceeded: state.status === 'exceeded' };
  } catch {
    // safe to ignore: cap context is best-effort; failure must never block chat
    return { exceeded: false };
  }
}
