import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/with-auth';
import { logger } from '@/lib/logger';
import { z } from 'zod';

const resonateSchema = z.object({
  id: z.string().uuid(),
});

export const dynamic = 'force-dynamic';

export const POST = withAuth(async ({ supabase, user, request }) => {
  try {
    let raw: unknown;
    try {
      raw = await request.json();
    } catch {
      // safe to ignore: malformed JSON is a client error, surfaced as 400 (not swallowed)
      return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
    }
    const parsed = resonateSchema.safeParse(raw);
    if (!parsed.success) {
      return NextResponse.json({ error: 'Validation failed', issues: parsed.error.issues }, { status: 400 });
    }
    const target = parsed.data.id;

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
