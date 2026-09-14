/**
 * GET /api/invite/public-stats — public guardian record for a referral landing.
 *
 * Privacy contract: the response is a fixed whitelist. It never contains money,
 * email, user id, token balance, or the submitted referral code. Invalid or
 * missing referrals are indistinguishable from database degradation.
 */

export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase-admin';
import { moneyToHours } from '@/lib/freedom-time';

function notFound() {
  return NextResponse.json({ found: false });
}

export async function GET(request: NextRequest) {
  const refCode = request.nextUrl.searchParams.get('ref')?.trim();
  if (!refCode || refCode.length > 64) return notFound();

  const { supabase, error: adminError } = createAdminClient();
  if (adminError || !supabase) return notFound();

  const { data, error } = await supabase
    .from('profiles')
    .select('id,display_name')
    .eq('ref_code', refCode)
    .maybeSingle();

  if (error || !data) return notFound();

  const row = data as unknown as { id: string; display_name: string | null };
  const { data: buddyState, error: buddyStateError } = await supabase
    .from('buddy_state')
    .select('streak,total_saved')
    .eq('user_id', row.id)
    .maybeSingle();

  if (buddyStateError) return notFound();
  const { count: intercepts, error: interceptsError } = await supabase
    .from('active_challenges')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', row.id)
    .eq('status', 'passed');

  if (interceptsError) return notFound();

  return NextResponse.json({
    found: true,
    displayName: row.display_name,
    intercepts: Math.max(0, intercepts ?? 0),
    guardDays: Math.max(0, Math.floor(buddyState?.streak ?? 0)),
    freedomHours: moneyToHours(buddyState?.total_saved ?? 0),
  });
}
