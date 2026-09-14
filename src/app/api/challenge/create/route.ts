/**
 * POST /api/challenge/create
 *
 * 前端发起挑战时调用，创建 active_challenges 记录，返回 challenge_id
 * challenge_id 会被注入到后续 /api/chat 的 context header，让 AI 能引用
 *
 * Request body:
 *   { itemName: string, amount: number }
 *
 * Response:
 *   200 { challengeId: string }
 *   400/401/500 { error: string }
 *
 * 🔧 2026-07-21: Migrated to withAuth HOF (was manual createAuthenticatedClient
 *    with mergeCookies pattern — now handled automatically by withAuth).
 */

import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/with-auth';
import { createChallenge } from '@/lib/challenge-store';
import { logger } from '@/lib/logger';
import { validateBody, isValidationError } from '@/lib/api-validation';
import { getLimitWindow } from '@/lib/limit-window';
import { z } from 'zod';

// 🔧 P2-8 fix: Increased from 3 to 5 (free users). Premium = unlimited.
//    Bonus paths: +1 per gacha story completion, +1 for 7-day streak, +3 per invite.
const DAILY_CHALLENGE_LIMIT = 5;

/**
 * 🔧 ARCH fix Round 78: 测试期用 5 分钟窗口替代每日窗口.
 *    getChallengeDay → getLimitWindow (测试期返回 5 分钟桶, 生产期返回 UTC 日期).
 */
function getChallengeDay(now: Date = new Date()): string {
  return getLimitWindow(now);
}

export const dynamic = 'force-dynamic';

export const POST = withAuth(async ({ supabase, user, request }) => {
  // 🔧 ARCH fix (Round 6 AUDIT-3 P0 #1): 用 zod 替代手写 validation
  const createSchema = z.object({
    itemName: z.string().trim().min(1, 'itemName is required').max(200, 'itemName too long (max 200 chars)'),
    amount: z.number().finite().positive('amount must be a positive number').max(1_000_000, 'amount too large (max 1000000)'),
  });
  const body = await validateBody(request, createSchema);
  if (isValidationError(body)) return body;

  const { itemName, amount } = body;

  // 🔧 需求六 + REVIEW-1 CRITICAL-2: 免费版每日 5 次挑战限制
  //    原子化: increment 在 create 之前 (CAS), 失败 = 已达上限 → 429 (不创建挑战)
  //    优雅降级: 列不存在或查询失败 → 不阻塞 (返回 degraded)
  try {
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

    let profileData = profileResult?.data as { plan?: string; trial_until?: string | null } | null;
    // 🔧 Bug fix: trial_until 列不存在时 fallback 到只查 plan
    if (profileResult?.error) {
      logger.warn('[Challenge Create] profile query with trial_until failed, retrying with plan only:', profileResult.error.message);
      const fallback = await supabase
        .from('profiles')
        .select('plan')
        .eq('id', user.id)
        .maybeSingle();
      profileData = fallback.data as { plan?: string; trial_until?: string | null } | null;
    }

    // 🔧 PM-TRIAL fix (2026-07-17): 7天VIP试用 — plan='premium' OR trial_until > now()
    //   旧代码: 只检查 plan === 'premium' → 试用用户 (plan=free, trial_until>now) 被限制5次
    //   新代码: 与 challenge/limit API 一致, 检查 trial_until
    const isPremium = profileData?.plan === 'premium' ||
      (profileData?.trial_until && new Date(profileData.trial_until) > new Date());
    // 列不存在 → 优雅降级 (跳过限制检查)
    const columnMissing = buddyErr && (buddyErr.message.includes('Could not find the column') || buddyErr.message.includes('does not exist') || buddyErr.code === '42703');
    if (columnMissing) {
      logger.info('[Challenge Create] daily_see_it_count column not found — skipping limit (degraded)');
    } else if (!buddyErr && !isPremium) {
      // 🔧 PM-COUNT fix (2026-07-17): count 改为反映"已完成的看见"而非"创建的挑战"
      //   旧代码: create 时 +1 → 用户创建5次但只完成2次 → count=5 但守护之书只有2条
      //   新代码: create 时只检查 limit (不+1), complete_challenge 时才 +1
      //   这样 count 与守护之书一致
      const todayChallengeDay = getChallengeDay();
      const storedDate = buddyData?.daily_see_it_date as string | null;
      const storedCount = (buddyData?.daily_see_it_count as number) || 0;
      const effectiveCount = storedDate === todayChallengeDay ? storedCount : 0;

      if (effectiveCount >= DAILY_CHALLENGE_LIMIT) {
        return NextResponse.json({
          error: 'Daily challenge limit reached',
          limit: DAILY_CHALLENGE_LIMIT,
          count: effectiveCount,
          isPremium: false,
        }, { status: 429 });
      }

      // 🔧 PM-COUNT fix: 移除 create 时的 +1 (改在 complete_challenge 时 +1)
      //   旧代码: CAS increment daily_see_it_count (create 时计数)
      //   新代码: 不 increment, 只检查 limit. complete_challenge handler 负责 +1
    }
    // safe to ignore: non-critical background operation, error already logged
  } catch (limitErr) {
                       // safe to ignore: non-critical background operation, error already logged
    logger.warn('[Challenge Create] Limit check failed (degrading gracefully):', limitErr);
  }

  // 创建挑战 (count 在 complete_challenge 时 +1, 不是 create 时)
  const result = await createChallenge(user.id, itemName.trim(), amount);

  if (!result.success || !result.challengeId) {
    logger.error('[Challenge API] Failed to create challenge for user', user.id, ':', result.error);
    // 🔧 PM-COUNT fix: 不需要回滚 daily_see_it_count (create 时不再 +1)
    return NextResponse.json({ error: 'Failed to create challenge' }, { status: 500 });
  }

  return NextResponse.json({
    challengeId: result.challengeId,
    itemName,
    amount,
  });
});
