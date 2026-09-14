/**
 * GET /api/community/stats — 群体防御网络总览数据
 *
 * 返回 4 个大数字:
 * - activeUsers: 7 天内有挑战记录的用户数
 * - totalSaved: 7 天内所有用户抵御的金额
 * - totalChallengesPassed: 7 天内抵御次数
 * - lifeHoursRecovered: totalSaved / 20 (全局平均时薪)
 *
 * 隐私: activeUsers < 10 时 hasData = false
 *
 * 🔧 Round 100: Migrated to withAuth HOF (was manual createAuthenticatedClient
 *    without mergeCookies — auth cookie refresh was lost).
 */

import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/with-auth';
import { logger } from '@/lib/logger';
import { featureFlags } from '@/lib/feature-flags';

export const dynamic = 'force-dynamic';

export const GET = withAuth(async ({ supabase }) => {
  try {
    // 🔧 ARCH fix (2026-07-21): Views types can't be added to database.types.ts
    //    (Supabase type generation conflict — 286 TS errors when Views is non-empty).
    //    Using 'as never' as documented workaround. Architecture guard exempts this route.
    const { data, error } = await supabase
      .from('community_total_stats' as never)
      .select('*')
      .limit(1)
      .maybeSingle() as { data: { active_users_7d?: number; total_saved_7d?: number; total_passed_7d?: number } | null; error: { message?: string } | null };

    if (error) {
      logger.warn('[Community Stats] View query failed (migration may not be applied):', error?.message);
      return NextResponse.json({
        activeUsers: 0,
        totalSaved: 0,
        totalChallengesPassed: 0,
        lifeHoursRecovered: 0,
        hasData: false,
      });
    }

    const activeUsers = data?.active_users_7d ?? 0;
    const totalSaved = Number(data?.total_saved_7d ?? 0);
    const totalChallengesPassed = data?.total_passed_7d ?? 0;
    const lifeHoursRecovered = Math.round((totalSaved / 20) * 10) / 10;

    // 🔧 ARCH fix (2026-07-21): Replaced hardcoded `MULTIPLIER = 21` with feature flag.
    //    Old pattern: `const MULTIPLIER = 21;` — hardcoded, not configurable, violates
    //    道用六·公开 (信息全公开) by showing fake participation numbers.
    //    New pattern: `featureFlags.communityStatsMultiplier` — defaults to 1 (real numbers),
    //    can be set >1 via COMMUNITY_STATS_MULTIPLIER env var for dev/staging demos only.
    //    The architecture guard `no-hardcoded-community-multiplier` prevents regression.
    //    Note: only multiply counts (activeUsers, totalChallengesPassed), never money/hours.
    const multiplier = featureFlags.communityStatsMultiplier;
    const displayActiveUsers = activeUsers * multiplier;
    const displayTotalChallengesPassed = totalChallengesPassed * multiplier;

    return NextResponse.json({
      activeUsers: displayActiveUsers,
      totalSaved,
      totalChallengesPassed: displayTotalChallengesPassed,
      lifeHoursRecovered,
      hasData: displayActiveUsers >= 10,
    });
  } catch (err) {
    // safe to ignore: returns fallback zeros so UI doesn't crash; error is logged for debugging
    logger.error('[Community Stats] Unexpected error:', err);
    return NextResponse.json({
      activeUsers: 0,
      totalSaved: 0,
      totalChallengesPassed: 0,
      lifeHoursRecovered: 0,
      hasData: false,
    });
  }
});
