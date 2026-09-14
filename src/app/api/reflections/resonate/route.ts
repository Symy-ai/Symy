import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/with-auth';
import { logger } from '@/lib/logger';

type ResonatePayload = { id: string };

export const dynamic = 'force-dynamic';

export const POST = withAuth(async ({ supabase, user, request }) => {
  try {
    const body = (await request.json()) as ResonatePayload;
    const target = String(body?.id ?? '').trim();

    if (!target || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(target)) {
      return NextResponse.json({ error: 'Invalid id' }, { status: 422 });
    }

    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const { count: todayVoteCount } = await supabase
      .from('daily_reflection_votes' as never)
      .select('reflection_id', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .gte('created_at', todayStart.toISOString());

    if ((todayVoteCount ?? 0) > 200) {
      return NextResponse.json({ error: 'rate_limited' }, { status: 429 });
    }

    const { data, error } = await supabase.rpc('increment_resonates' as never, { target } as never);

    if (error) {
      console.warn('[Reflections] resonate failed:', error.message);
      return NextResponse.json({ error: 'internal_error' }, { status: 400 });
    }

    return NextResponse.json({ ok: true, created: data as boolean });
  } catch (err) {
    logger.error('[Reflections] resonate unexpected error:', err);
    throw err;
  }
});
