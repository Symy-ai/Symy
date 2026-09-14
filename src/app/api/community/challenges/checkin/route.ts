/**
 * POST /api/community/challenges/checkin — 社区挑战每日签到
 *
 * 🔧 2026-07-15: Migrated to withAuth HOF (consistent auth + cookie handling)
 */

import { withAuth } from '@/lib/with-auth';
import { NextResponse } from 'next/server';
import { validateBody, isValidationError } from '@/lib/api-validation';
import { logger } from '@/lib/logger';
import { z } from 'zod';

export const dynamic = 'force-dynamic';

// 🔧 Round 102: Added Zod validation (was using manual typeof check)
const schema = z.object({
  challengeId: z.string().min(1),
});

export const POST = withAuth(async ({ request, supabase, user }) => {
  const bodyResult = await validateBody(request, schema);
  if (isValidationError(bodyResult)) return NextResponse.json({ error: 'challengeId is required' }, { status: 400 });
  const { challengeId } = bodyResult;

  try {

    // 查参与记录
    const { data: participant, error: pErr } = await supabase
      .from('challenge_participants')
      .select('*')
      .eq('challenge_id', challengeId)
      .eq('user_id', user.id)
      .maybeSingle();

    if (pErr || !participant) {
      return NextResponse.json({ error: 'Not joined this challenge' }, { status: 404 });
    }

    if (participant.status === 'completed') {
      return NextResponse.json({ success: true, currentDay: participant.current_day, status: 'completed', message: 'Already completed' });
    }

    // 🔧 Round 107: 检查挑战是否已开始 (start_date > NOW() → 不允许签到)
    //   旧代码: 用户可以签到即将开始的挑战 (start_date 在明天)
    //   问题: 签到会 +1 day, 但挑战还没开始, 逻辑混乱
    //   修复: 查询 challenge 的 start_date, 如果 > NOW() 拒绝签到
    const { data: challenge, error: cErr } = await supabase
      .from('community_challenges')
      .select('start_date, end_date')
      .eq('id', challengeId)
      .maybeSingle();

    if (cErr || !challenge) {
      return NextResponse.json({ error: 'Challenge not found' }, { status: 404 });
    }

    const now = new Date();
    const startDate = new Date(challenge.start_date);
    const endDate = new Date(challenge.end_date);

    if (startDate.getTime() > now.getTime()) {
      return NextResponse.json({ error: 'Challenge has not started yet' }, { status: 400 });
    }

    if (endDate.getTime() < now.getTime()) {
      return NextResponse.json({ error: 'Challenge has ended' }, { status: 400 });
    }

    // 检查今天是否已签到
    const today = new Date().toISOString().split('T')[0];
    if (participant.last_checkin_date === today) {
      return NextResponse.json({ success: true, currentDay: participant.current_day, status: participant.status, message: 'Already checked in today' });
    }

    // 🔧 需求: 取消 See-it 挑战前置条件 — 用户无需完成 See-it 即可签到
    //   旧代码 (已删除): 检查今天是否完成至少 1 个 See-it 挑战, 否则返回 400
    //   新代码: 直接允许签到, 无需任何前置任务

    // 更新签到
    // 🔧 2026-07-15 (P0-3 fix): CAS 防止并发签到导致 current_day 跳 +2
    //    旧代码: .neq('last_checkin_date', today)
    //    BUG: 当 last_checkin_date 为 null (新用户首次签到) 时,
    //         PostgreSQL 中 null != '2026-07-15' 返回 null (不是 true),
    //         WHERE 条件不匹配 → update 不执行 → current_day 永远是 0
    //    修复: 用 .or() 包含 null 的情况: last_checkin_date != today OR last_checkin_date IS NULL
    const newDay = (participant.current_day ?? 0) + 1;
    const isCompleted = newDay >= 7;

    const { data: updatedRow, error: updateErr } = await supabase
      .from('challenge_participants')
      .update({
        current_day: newDay,
        last_checkin_date: today,
        status: isCompleted ? 'completed' : 'active',
      })
      .eq('id', participant.id)
      // 🔧 P0-3 fix: CAS 条件 — last_checkin_date != today OR last_checkin_date IS NULL
      //   旧代码 .neq('last_checkin_date', today) 在 null 时不匹配 (SQL 三值逻辑)
      //   新代码用 .or() 显式包含 null 的情况
      .or(`last_checkin_date.neq.${today},last_checkin_date.is.null`)
      .select('current_day, status')
      .maybeSingle();

    if (updateErr) {
      logger.warn('[Community Challenges] Checkin update failed:', updateErr.message);
      return NextResponse.json({ error: 'Failed to check in' }, { status: 500 });
    }

    // CAS 失败 = 另一个并发请求已签到
    if (!updatedRow) {
      return NextResponse.json({
        success: true,
        currentDay: participant.current_day,
        status: participant.status,
        message: 'Already checked in today',
      });
    }

    return NextResponse.json({
      success: true,
      currentDay: updatedRow.current_day,
      status: updatedRow.status,
    });
  } catch (err) {
    // safe to ignore: non-critical error, logged for observability
    logger.error('[Community Challenges] Checkin unexpected error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
});
