/**
 * GET /api/challenge/limit — 挑战每日限制查询 (需求六)
 *
 * 🔧 需求六: 免费版每日 3 次挑战限制 (跨设备同步)
 *    镜像 gacha-limit 模式 (migration 078)
 *    Premium 用户不限次 (plan = 'premium')
 *
 * 返回: { count, date, remaining, limit, isPremium, resetsAt }
 *
 * 优雅降级: 若 daily_see_it_count/daily_see_it_date 列不存在 (migration 未应用),
 *    返回 limit=Infinity (不阻塞用户)
 *
 * 🔧 ARCH fix Round 74 (Finding 16): Migrated to withAuth HOF.
 */

export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/with-auth';
import { logger } from '@/lib/logger';
import { getLimitWindow, getLimitResetDescription } from '@/lib/limit-window';

// 🔧 P2-8 fix: Increased from 3 to 5 (free users). Premium = unlimited.
const DAILY_CHALLENGE_LIMIT = 5;

/**
 * 🔧 ARCH fix Round 78: 测试期用 5 分钟窗口替代每日窗口.
 */
function getChallengeDay(now: Date = new Date()): string {
  return getLimitWindow(now);
}

export const GET = withAuth(async ({ supabase, user }) => {
  try {
    // 查询 buddy_state + profiles.plan + profiles.trial_until (判断 Premium)
    // 🔧 Bug fix: trial_until 列可能不存在 (migration 119 未执行), 需要优雅降级
    const [{ data: buddyData, error: buddyErr }, profileResult] = await Promise.all([
      supabase
        .from('buddy_state')
        .select('daily_see_it_count, daily_see_it_date')
        .eq('user_id', user.id)
        .maybeSingle(),
      supabase
        .from('profiles')
        .select('plan, trial_until')
        .eq('id', user.id)
        .maybeSingle(),
    ]);

    // 🔧 Bug fix: trial_until 列不存在时 fallback 到只查 plan
    let profileData = profileResult?.data;
    if (profileResult?.error) {
      logger.warn('[Challenge Limit] profile query with trial_until failed, retrying with plan only:', profileResult.error.message);
      const fallback = await supabase
        .from('profiles')
        .select('plan')
        .eq('id', user.id)
        .maybeSingle();
      profileData = fallback.data as typeof profileData;
    }

    if (buddyErr) {
      // 🔧 优雅降级: daily_see_it_count 列不存在 → 返回不限
      if (buddyErr.message.includes('Could not find the column') || buddyErr.message.includes('does not exist') || buddyErr.code === '42703') {
        logger.info('[Challenge Limit] Column not found — migration 085 not applied, returning unlimited');
        return NextResponse.json({
          count: 0,
          date: getChallengeDay(),
          remaining: Infinity,
          limit: Infinity,
          // 🔧 ARCH fix (2026-07-17): coerce to boolean (see main path comment above)
          isPremium: Boolean(profileData?.plan === 'premium'),
          resetsAt: getLimitResetDescription(),
          degraded: true,
        });
      }
      logger.warn('[Challenge Limit] GET error:', buddyErr.message);
      return NextResponse.json({ error: 'Failed to fetch challenge limit' }, { status: 500 });
    }

    // 🔧 7天VIP试用: plan='premium' OR trial_until > now()
    // 🔧 ARCH fix (2026-07-17): coerce to boolean — old code returned `undefined`
    //    when plan != 'premium' and trial_until was missing, leaking through
    //    NextResponse.json as `isPremium: undefined` (test failure + client bug).
    const rawTrialUntil = (profileData as Record<string, unknown> | null)?.trial_until;
    const isPremium = Boolean(
      profileData?.plan === 'premium' ||
      (typeof rawTrialUntil === 'string' && rawTrialUntil !== '' && new Date(rawTrialUntil) > new Date()),
    );
    const todayChallengeDay = getChallengeDay();
    const storedDate = buddyData?.daily_see_it_date as string | null;
    const storedCount = (buddyData?.daily_see_it_count as number) || 0;
    const effectiveCount = storedDate === todayChallengeDay ? storedCount : 0;
    const limit = isPremium ? Infinity : DAILY_CHALLENGE_LIMIT;
    const remaining = isPremium ? Infinity : Math.max(0, DAILY_CHALLENGE_LIMIT - effectiveCount);

    return NextResponse.json({
      count: effectiveCount,
      date: todayChallengeDay,
      remaining,
      limit,
      isPremium,
      resetsAt: getLimitResetDescription(),
    });
      // safe to ignore: non-critical background operation, error already logged
  } catch (err) {
                  // safe to ignore: non-critical background operation, error already logged
    logger.error('[Challenge Limit] GET unhandled error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
});
