/**
 * POST /api/buddy/personality — 觉醒 Symy 个性
 *
 * 🔧 2026-07-15: Migrated to withAuth HOF (auto cookie + Cache-Control)
 * 🔧 2026-07-15 (ARCH-10 P0-10): Removed client-supplied personality/behaviorProfile
 */

import { withAuth } from '@/lib/with-auth';
import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase-admin';
import { logger } from '@/lib/logger';
import { validateBody, isValidationError } from '@/lib/api-validation';
import { isValidPersonality, assessPersonality, type BehaviorProfile } from '@/lib/buddy-defaults';
import { z } from 'zod';

export const dynamic = 'force-dynamic';

// 🔧 2026-07-15 (ARCH-10 P0-10): schema rejects all client fields
const schema = z.object({}).strict();

export const POST = withAuth(async ({ request, user }) => {
  const bodyResult = await validateBody(request, schema);
  if (isValidationError(bodyResult)) return NextResponse.json({ error: 'Validation failed' }, { status: 400 });

  // 服务端自动收集行为画像
  const { supabase: adminClient, error: adminErr } = createAdminClient();
  if (adminErr || !adminClient) {
    logger.error('[Personality] admin client error for profile collection:', adminErr);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
  let behaviorProfile: BehaviorProfile;
  try {
    behaviorProfile = await collectBehaviorProfile(adminClient, user.id);
  } catch (err) {
    // safe to ignore: non-critical error, logged for observability
    logger.error('[Personality] Failed to collect behavior profile:', err);
    return NextResponse.json({ success: false, reason: 'collect_failed' }, { status: 500 });
  }

  // 评估
  const assessedPersonality = assessPersonality(behaviorProfile);

  // 如果仍是 unknown (未满 7 天), 返回 not_ready
  if (assessedPersonality === 'unknown') {
    return NextResponse.json({ success: false, reason: 'not_ready', totalDays: behaviorProfile.totalDays });
  }

  // 二次验证
  if (!isValidPersonality(assessedPersonality)) {
    return NextResponse.json({ error: 'Invalid personality' }, { status: 400 });
  }

  // 检查是否已觉醒 (避免重复觉醒)
  const { supabase: checkSupabase, error: checkError } = createAdminClient();
  if (checkError || !checkSupabase) {
    logger.error('[Personality] admin client error (check):', checkError);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
  const { data: buddyState } = await checkSupabase
    .from('buddy_state')
    .select('personality, personality_awakened_at')
    .eq('user_id', user.id)
    .maybeSingle();

  if (buddyState?.personality_awakened_at) {
    return NextResponse.json({
      success: true,
      personality: buddyState.personality || assessedPersonality,
      alreadyAwakened: true,
    });
  }

  const { supabase: adminSupabase, error: adminError } = createAdminClient();
  if (adminError || !adminSupabase) {
    logger.error('[Personality] admin client error:', adminError);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }

  const { data, error } = await adminSupabase
    .rpc('awaken_buddy_personality', {
      p_user_id: user.id,
      p_personality: assessedPersonality,
    });

  if (error) {
    logger.error('[Personality] RPC error:', error.message);
    return NextResponse.json({ error: 'Failed to awaken personality' }, { status: 500 });
  }

  logger.info(`[Personality] Awakened: ${data} for user ${user.id.substring(0, 8)}`);

  return NextResponse.json({ success: true, personality: data ?? assessedPersonality });
});

/**
 * 从 DB 收集用户行为画像
 */
async function collectBehaviorProfile(
  adminSupabase: NonNullable<ReturnType<typeof createAdminClient>['supabase']>,
  userId: string,
): Promise<BehaviorProfile> {
  const { data: profile } = await adminSupabase
    .from('profiles')
    .select('created_at')
    .eq('id', userId)
    .maybeSingle<{ created_at: string }>();

  const totalDays = profile?.created_at
    ? Math.floor((Date.now() - new Date(profile.created_at).getTime()) / (24 * 60 * 60 * 1000))
    : 0;

  const { data: buddyState } = await adminSupabase
    .from('buddy_state')
    .select('streak, challenges_completed, last_healing_kit_at')
    .eq('user_id', userId)
    .maybeSingle<{ streak: number; challenges_completed: number; last_healing_kit_at: string | null }>();

  const streak = Number(buddyState?.streak ?? 0);
  const challengesCompleted = Number(buddyState?.challenges_completed ?? 0);

  const { data: events } = await adminSupabase
    .from('health_events')
    .select('event_type')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(200);

  const eventTypeRows = (events || []) as Array<{ event_type: string }>;
  const eventTypes = eventTypeRows.map(e => e.event_type);
  const challengesFailed = eventTypes.filter((t: string) => t === 'challenge_failed').length;
  const gachaCompleted = eventTypes.filter((t: string) => t === 'butterfly_completed').length;

  const petSymyCount = buddyState?.last_healing_kit_at ? 1 : 0;

  const { count: reflectionCount } = await adminSupabase
    .from('chat_messages')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('role', 'user');

  return {
    challengesCompleted,
    challengesFailed,
    petSymyCount,
    gachaCompleted,
    streak,
    reflectionCount: reflectionCount ?? 0,
    totalDays,
  };
}
