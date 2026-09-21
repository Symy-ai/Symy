/**
 * GET /api/defense/collective — collective platform totals for the defense hero.
 * Reuses the transparency snapshot ladder so the public source has one ledger.
 */

export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { collectiveStatsFromSnapshot } from '@/lib/platform-aggregate';
import { loadTransparencyWeekly } from '@/lib/transparency-weekly-server';

export async function GET() {
  const snapshot = await loadTransparencyWeekly();
  return NextResponse.json(
    collectiveStatsFromSnapshot(snapshot),
    { headers: { 'Cache-Control': 'public, max-age=60, s-maxage=300, stale-while-revalidate=600' } },
  );
}
