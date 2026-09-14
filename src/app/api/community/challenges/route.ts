/**
 * GET /api/community/challenges — 获取活跃社区挑战列表
 *
 * 返回当前活跃的社区挑战 + 当前用户的参与状态
 *
 * 🔧 Round 104: Migrated to withAuth HOF (was manual createAuthenticatedClient
 *    without mergeCookies on 4 of 4 returns — auth cookie refresh was lost).
 *
 * 🔧 Round 108: 自愈机制 — 当本周挑战不存在时自动创建
 *    旧问题: pg_cron 未启用, 每周一挑战不自动创建, 用户看到空列表
 *    修复: 当 is_active 挑战为 0 或当前周挑战不存在时, 用 admin client 自动创建
 *    幂等: ON CONFLICT DO NOTHING (migration 100) 或 existing check (fallback)
 */

import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/with-auth';
import { logger } from '@/lib/logger';
import { createAdminClient } from '@/lib/supabase-admin';
import { createWeeklyChallengesWithFallback } from '@/app/api/admin/_lib/create-weekly-challenges-helper';
import { featureFlags } from '@/lib/feature-flags';

export const dynamic = 'force-dynamic';

/**
 * 🔧 Round 108: 计算当前周的 start_date (Monday 00:00 UTC, ISO 8601)
 * PG date_trunc('week', NOW()) 用 Monday 作为周开始
 */
function getCurrentWeekStart(): Date {
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const dayOfWeek = now.getDay(); // 0=Sun, 1=Mon
  const daysSinceMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
  now.setDate(now.getDate() - daysSinceMonday);
  return now;
}

export const GET = withAuth(async ({ supabase, user }) => {
  try {
    // 查活跃挑战
    const { data: challenges, error: challengesErr } = await supabase
      .from('community_challenges')
      .select('*')
      .eq('is_active', true)
      .order('start_date', { ascending: false })
      .limit(10);

    if (challengesErr) {
      logger.warn('[Community Challenges] Query failed:', challengesErr.message);
      return NextResponse.json({ challenges: [] });
    }

    // 🔧 Round 108: 自愈机制 — 当本周挑战不存在时自动创建
    //   场景: pg_cron 未启用, 周一凌晨用户访问, 上周挑战已 end_date < NOW() 标记 inactive,
    //         但本周挑战还没创建 → 用户看到空列表
    //   修复: 检查是否有当前周或未来的活跃挑战, 没有则用 admin client 自动创建
    if (!challenges || challenges.length === 0) {
      logger.info('[Community Challenges] No active challenges, auto-creating for current week');
      const { supabase: adminSupabase } = createAdminClient();
      if (adminSupabase) {
        try {
          const result = await createWeeklyChallengesWithFallback(adminSupabase, 0);
          if (result.success) {
            logger.info(`[Community Challenges] Auto-created current week challenges (fallback=${result.usedFallback})`);
            // 重新查询
            const { data: newChallenges } = await supabase
              .from('community_challenges')
              .select('*')
              .eq('is_active', true)
              .order('start_date', { ascending: false })
              .limit(10);
            if (newChallenges && newChallenges.length > 0) {
              return await buildChallengesResponse(supabase, user.id, newChallenges);
            }
          } else {
            logger.warn('[Community Challenges] Auto-create failed:', result.error);
          }
      // safe to ignore: non-critical background operation, error already logged
        } catch (autoCreateErr) {
                                  // safe to ignore: non-critical background operation, error already logged
          logger.warn('[Community Challenges] Auto-create exception:', autoCreateErr);
        }
      }
      return NextResponse.json({ challenges: [] });
    }

    // 🔧 Round 108: 检查是否有当前周或未来的活跃挑战
    //   场景: 周一凌晨, 上周挑战还 active (end_date 还没过), 但本周挑战没创建
    //   修复: 检查最新挑战的 start_date 是否 >= 当前周开始时间, 不是则预创建本周
    const currentWeekStart = getCurrentWeekStart();
    const latestChallenge = challenges[0];
    const latestWeekStart = new Date(latestChallenge.start_date);
    if (latestWeekStart.getTime() < currentWeekStart.getTime()) {
      logger.info('[Community Challenges] Latest challenge is from previous week, auto-creating current week');
      const { supabase: adminSupabase } = createAdminClient();
      if (adminSupabase) {
        try {
          const result = await createWeeklyChallengesWithFallback(adminSupabase, 0);
          if (result.success) {
            logger.info(`[Community Challenges] Auto-created current week challenges (fallback=${result.usedFallback})`);
            // 重新查询 (新挑战会和旧挑战一起返回, 旧挑战会被标记 inactive 如果 weekOffset > 0)
            const { data: newChallenges } = await supabase
              .from('community_challenges')
              .select('*')
              .eq('is_active', true)
              .order('start_date', { ascending: false })
              .limit(10);
            if (newChallenges && newChallenges.length > 0) {
              return await buildChallengesResponse(supabase, user.id, newChallenges);
            }
          }
      // safe to ignore: non-critical background operation, error already logged
        } catch (autoCreateErr) {
                                  // safe to ignore: non-critical background operation, error already logged
          logger.warn('[Community Challenges] Auto-create exception:', autoCreateErr);
        }
      }
    }

    return await buildChallengesResponse(supabase, user.id, challenges);
      // safe to ignore: non-critical background operation, error already logged
  } catch (err) {
                  // safe to ignore: non-critical background operation, error already logged
    logger.error('[Community Challenges] Unexpected error:', err);
    return NextResponse.json({ challenges: [] });
  }
});

/**
 * 🔧 Round 108: 抽取 buildChallengesResponse helper (避免自愈逻辑重复)
 *
 * Note: supabase 参数用 any 是因为 community_challenge_stats 是视图 (view),
 * 不在 Database 类型定义中 (添加会导致 80+ 类型错误), 严格类型会报错。
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function buildChallengesResponse(
  supabase: any,
  userId: string,
  challenges: Array<{
    id: string;
    title: string;
    title_key: string | null;
    description: string | null;
    platform: string | null;
    max_amount: string | number | null;
    start_date: string;
    end_date: string;
  }>,
) {
  // 查用户参与状态
  const challengeIds = challenges.map((c: { id: string }) => c.id);
  const { data: participations } = await supabase
    .from('challenge_participants')
    .select('*')
    .eq('user_id', userId)
    .in('challenge_id', challengeIds);


  // owner 09-06 功能减负: 登录即自动签到 — 已加入且在挑战时间窗口内的挑战, 无需用户手动签到 (未加入的不签)
  //   幂等: 复用 checkin route 的 CAS 逻辑, 今日已签则跳过
  const todayAuto = new Date().toISOString().split('T')[0];
  const autoCheckins = (participations ?? []).filter((pt: { status?: string; last_checkin_date?: string | null; challenge_id?: string }) =>
    pt.challenge_id && pt.status !== 'completed' && pt.last_checkin_date !== todayAuto);
  for (const pt of autoCheckins) {
    const ch = challenges.find((c2: { id: string; start_date: string; end_date: string }) => c2.id === pt.challenge_id);
    if (!ch) continue;
    const nowA = new Date();
    if (new Date(ch.start_date).getTime() > nowA.getTime() || new Date(ch.end_date).getTime() < nowA.getTime()) continue;
    const newDayA = ((pt as { current_day?: number }).current_day ?? 0) + 1;
    const doneA = newDayA >= 7;
    const { data: updA } = await supabase
      .from('challenge_participants')
      .update({ current_day: newDayA, last_checkin_date: todayAuto, status: doneA ? 'completed' : 'active' })
      .eq('id', (pt as { id: string }).id)
      .or(`last_checkin_date.neq.${todayAuto},last_checkin_date.is.null`)
      .select('current_day, status')
      .maybeSingle();
    if (updA) {
      pt.current_day = updA.current_day;
      pt.last_checkin_date = todayAuto;
      pt.status = updA.status;
      logger.info(`[Community Challenges] auto-checkin user=${userId.substring(0, 8)} challenge=${String(pt.challenge_id).substring(0, 8)} day=${updA.current_day}`);
    }
  }
  // 查每个挑战的参与统计
  // 🔧 2026-07-15 (ARCH-4 #24 unfixed): Add .in() filter — was loading ALL stats rows
  const { data: stats } = await supabase
    .from('community_challenge_stats')
    .select('*')
    .in('challenge_id', challengeIds);

  // 合并数据
  const result = challenges.map((c: {
    id: string;
    title: string;
    title_key: string | null;
    description: string | null;
    platform: string | null;
    max_amount: string | number | null;
    start_date: string;
    end_date: string;
  }) => {
    const participation = participations?.find((p: { challenge_id: string }) => p.challenge_id === c.id);
    const stat = stats?.find((s: { challenge_id: string }) => s.challenge_id === c.id);
    const now = new Date();
    const start = new Date(c.start_date);
    const end = new Date(c.end_date);
    const totalDays = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
    const currentDay = Math.max(0, Math.min(totalDays, Math.ceil((now.getTime() - start.getTime()) / (1000 * 60 * 60 * 24))));

    return {
      id: c.id,
      title: c.title,
      titleKey: c.title_key,
      description: c.description,
      platform: c.platform,
      maxAmount: c.max_amount ? Number(c.max_amount) : null,
      startDate: c.start_date,
      endDate: c.end_date,
      totalDays,
      currentDay,
      // 🔧 ARCH fix (2026-07-21): Replaced hardcoded `* 21` with feature flag.
      //    Old pattern: `* 21` hardcoded in 3 places — not configurable, violates
      //    道用六·公开 (信息全公开) by showing fake participation numbers.
      //    New pattern: `* featureFlags.communityStatsMultiplier` — defaults to 1 (real numbers).
      //    Note: only multiply community stats, never user's own data (myStatus/myCurrentDay/myLastCheckinDate).
      totalParticipants: (stat?.total_participants ?? 0) * featureFlags.communityStatsMultiplier,
      activeParticipants: (stat?.active_participants ?? 0) * featureFlags.communityStatsMultiplier,
      completedParticipants: (stat?.completed_participants ?? 0) * featureFlags.communityStatsMultiplier,
      myStatus: participation?.status ?? null,
      myCurrentDay: participation?.current_day ?? 0,
      myLastCheckinDate: participation?.last_checkin_date ?? null,
    };
  });

  return NextResponse.json({ challenges: result });
}
