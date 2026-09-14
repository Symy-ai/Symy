import { NextResponse } from 'next/server';
import { z } from 'zod';
import { withAuth, type AuthContext } from '@/lib/with-auth';
import { validateBody, isValidationError } from '@/lib/api-validation';
import { computeSpendingCapState, daysLeftInSpendingCapPeriod, type SpendingCapState } from '@/lib/spending-cap-tracker';
import { normalizeSpendingCapSetting, parseSpendingCapSettingValue, serializeSpendingCapSetting, spendingCapPeriodEnd, SPENDING_CAP_FACT_CATEGORY, SPENDING_CAP_FACT_KEY } from '@/lib/spending-cap';

export const dynamic = 'force-dynamic';

const CACHE_HEADERS = { 'Cache-Control': 'private, max-age=300' };

const putSchema = z.object({
  capCents: z.number().int().min(0).max(100_000_000),
  warningPct: z.number().int().min(50).max(95),
  resetPeriod: z.boolean().optional(),
});

type SupabaseClient = AuthContext['supabase'];
interface GuardEventRow { metadata: Record<string, unknown> | null; created_at: string }
interface RefundRow { amount: number | null; platform: string | null; received_at: string | null }

function parseSetting(value: string | null | undefined) {
  return normalizeSpendingCapSetting(parseSpendingCapSettingValue(value));
}

function readSettingRow(supabase: SupabaseClient, userId: string) {
  return supabase
    .from('shopping_facts')
    .select('value')
    .eq('user_id', userId)
    .eq('category', SPENDING_CAP_FACT_CATEGORY)
    .eq('key', SPENDING_CAP_FACT_KEY)
    .maybeSingle() as unknown as PromiseLike<{ data: { value: string | null } | null }>;
}

async function loadPayload(supabase: SupabaseClient, userId: string) {
  const { data: factRow } = await readSettingRow(supabase, userId);

  const now = new Date();
  const setting = parseSetting(factRow?.value);
  const events: Array<{ amountCents: number; category: string; timestamp: string }> = [];

  const [{ data: guardRows }, { data: refundRows }] = await Promise.all([
    supabase.from('health_events').select('metadata, created_at').eq('user_id', userId).eq('event_type', 'challenge_completed').gte('created_at', setting.periodStart).lte('created_at', spendingCapPeriodEnd(setting.periodStart, now).toISOString()) as unknown as PromiseLike<{ data: GuardEventRow[] | null }>,
    supabase.from('email_receipts').select('amount, platform, received_at').eq('user_id', userId).eq('status', 'refunded').gte('received_at', setting.periodStart).lte('received_at', spendingCapPeriodEnd(setting.periodStart, now).toISOString()) as unknown as PromiseLike<{ data: RefundRow[] | null }>,
  ]);

  for (const row of guardRows || []) {
    const amount = Number((row.metadata as Record<string, unknown> | null)?.savedAmount);
    if (Number.isFinite(amount) && amount > 0) {
      events.push({ amountCents: Math.round(amount * 100), category: 'challenge', timestamp: row.created_at });
    }
  }
  for (const row of refundRows || []) {
    const amount = Number(row.amount);
    if (Number.isFinite(amount) && amount > 0) {
      events.push({ amountCents: Math.round(amount * 100), category: row.platform || 'refund', timestamp: row.received_at || '' });
    }
  }

  const state: SpendingCapState | null = computeSpendingCapState(
    events.map((event) => ({ amount: event.amountCents / 100, category: event.category, timestamp: event.timestamp })),
    setting.capCents,
    now,
    setting,
  );
  const categories = [...events.reduce((map, event) => {
    const current = map.get(event.category) || 0;
    map.set(event.category, current + event.amountCents);
    return map;
  }, new Map<string, number>())].map(([category, amountCents]) => ({ category, amountCents }));

  return {
    state,
    setting,
    events: events.sort((a, b) => b.timestamp.localeCompare(a.timestamp)),
    categories,
    daysLeft: daysLeftInSpendingCapPeriod(setting.periodStart, now),
  };
}

export const GET = withAuth(async ({ supabase, user }) => {
  const payload = await loadPayload(supabase, user.id);
  return NextResponse.json(payload, { headers: CACHE_HEADERS });
});

export const PUT = withAuth(async ({ supabase, user, request }) => {
  const body = await validateBody(request, putSchema);
  if (isValidationError(body)) return body;
  const { data: factRow } = await readSettingRow(supabase, user.id);
  const currentSetting = parseSetting(factRow?.value);
  const now = new Date();
  const next = normalizeSpendingCapSetting({
    capCents: body.capCents,
    warningPct: body.warningPct,
    periodStart: body.resetPeriod || !currentSetting.periodStart ? now.toISOString() : currentSetting.periodStart,
  }, now);
  if (currentSetting.periodStart && now.getFullYear() === new Date(currentSetting.periodStart).getFullYear() && now.getMonth() === new Date(currentSetting.periodStart).getMonth()) {
    next.periodStart = currentSetting.periodStart;
  }

  const { error } = await supabase.from('shopping_facts').upsert(
    { user_id: user.id, category: SPENDING_CAP_FACT_CATEGORY, key: SPENDING_CAP_FACT_KEY, value: serializeSpendingCapSetting(next) },
    { onConflict: 'user_id,category,key' },
  );
  if (error) return NextResponse.json({ error: 'Failed to save spending cap' }, { status: 500 });
  return NextResponse.json(await loadPayload(supabase, user.id), { headers: CACHE_HEADERS });
});
