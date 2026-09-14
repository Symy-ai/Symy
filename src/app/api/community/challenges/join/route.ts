/**
 * POST /api/community/challenges/join — 加入社区挑战
 *
 * 请求: { challengeId: string }
 * 响应: { success: true, participant: { ... } }
 *
 * 🔧 2026-07-15: Migrated to withAuth HOF (consistent auth + cookie handling)
 */

import { withAuth } from '@/lib/with-auth';
import { NextResponse } from 'next/server';
import { validateBody, isValidationError } from '@/lib/api-validation';
import { logger } from '@/lib/logger';
import { z } from 'zod';

export const dynamic = 'force-dynamic';

const schema = z.object({
  challengeId: z.string().min(1),
});

export const POST = withAuth(async ({ request, supabase, user }) => {
  const bodyResult = await validateBody(request, schema);
  if (isValidationError(bodyResult)) return NextResponse.json({ error: 'challengeId is required' }, { status: 400 });
  const { challengeId } = bodyResult;

  try {
    // 检查挑战是否存在且活跃
    const { data: challenge, error: challengeErr } = await supabase
      .from('community_challenges')
      .select('id, is_active, start_date, end_date')
      .eq('id', challengeId)
      .maybeSingle();

    if (challengeErr || !challenge) {
      return NextResponse.json({ error: 'Challenge not found' }, { status: 404 });
    }

    if (!challenge.is_active) {
      return NextResponse.json({ error: 'Challenge is not active' }, { status: 400 });
    }

    // 检查是否已参与 (UNIQUE 约束也会防重复)
    const { data: existing } = await supabase
      .from('challenge_participants')
      .select('id, status, current_day')
      .eq('challenge_id', challengeId)
      .eq('user_id', user.id)
      .maybeSingle();

    if (existing) {
      return NextResponse.json({
        success: true,
        participant: existing,
        message: 'Already joined',
      });
    }

    // 加入挑战
    const { data: participant, error: insertErr } = await supabase
      .from('challenge_participants')
      .insert({
        challenge_id: challengeId,
        user_id: user.id,
        status: 'active',
        current_day: 0,
      })
      .select('id, status, current_day')
      .single();

    if (insertErr) {
      // 🔧 2026-07-15 (ARCH-3 LOW 修复): UNIQUE violation 返回 "Already joined" 而非 500
      //    旧代码: 任何 INSERT error 返回 500 → 用户看到 "Failed to join"
      //    修复: 23505 (UNIQUE violation) = 并发请求已加入, 返回 200 + Already joined
      if (insertErr.code === '23505') {
        // 重新读取已存在的 participant 记录
        const { data: reRead } = await supabase
          .from('challenge_participants')
          .select('id, status, current_day')
          .eq('challenge_id', challengeId)
          .eq('user_id', user.id)
          .maybeSingle();
        return NextResponse.json({
          success: true,
          participant: reRead || { id: '', status: 'active', current_day: 0 },
          message: 'Already joined',
        });
      }
      logger.warn('[Community Challenges] Join failed:', insertErr.message);
      return NextResponse.json({ error: 'Failed to join challenge' }, { status: 500 });
    }

    return NextResponse.json({ success: true, participant });
  } catch (err) {
    // safe to ignore: non-critical error, logged for observability
    logger.error('[Community Challenges] Join unexpected error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
});
