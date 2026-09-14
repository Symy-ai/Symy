/**
 * GET/POST/DELETE /api/buddy/gacha-limit — Gacha daily limit 服务端追踪
 *
 * 🔧 PM-NEW-36 fix: Gacha daily limit 跨设备同步
 *    之前: localStorage 追踪 (仅设备级, 用户可切换设备绕过限制)
 *    现在: buddy_state 表的 daily_see_it_count + daily_see_it_date 字段
 *
 * GET: 返回 { count, date, remaining, limit, resetsAt }
 * POST: { action: 'increment' | 'decrement' } → count +1/-1, 返回新的 { count, remaining }
 * DELETE: 退款 (decrement gacha count)
 *
 * 每日 4:00 AM 重置 (与 Healing Kit 一致):
 *   - 服务端用当前 UTC 时间计算 "gacha day" (UTC 4:00 AM 为分界)
 *   - 若 daily_see_it_date !== today's gacha day → count 重置为 0
 *
 * 🔧 2026-07-21: Migrated all 3 handlers to withAuth HOF (was manual
 *    createAuthenticatedClient with json() helper — now handled by withAuth).
 *    Admin client still used for writes (migration 111 GRANT compatibility).
 */

import { withAuth } from '@/lib/with-auth';
import { NextResponse } from 'next/server';
import { logger } from '@/lib/logger';
import { validateBody, isValidationError } from '@/lib/api-validation';
import { getLimitWindow, getLimitResetDescription } from '@/lib/limit-window';
import { z } from 'zod';
import { createAdminClient } from '@/lib/supabase-admin';

export const dynamic = 'force-dynamic';

const DAILY_GACHA_LIMIT = 3;
// 🔧 P2-9 fix: Premium users get unlimited gacha. Failures must refund (decrement).

/**
 * 🔧 ARCH fix Round 78: 测试期用 5 分钟窗口替代每日窗口.
 */
function getGachaDay(now: Date = new Date()): string {
  return getLimitWindow(now);
}

// Helper: query premium status with trial_until fallback
async function queryPremiumStatus(supabase: NonNullable<Awaited<ReturnType<typeof import('@/lib/supabase-api')['createAuthenticatedClient']>>['supabase']>, userId: string) {
  const profileResult = await supabase
    .from('profiles')
    .select('plan, trial_until')
    .eq('id', userId)
    .maybeSingle();

  let profileData = profileResult?.data;
  if (profileResult?.error) {
    logger.warn('[Gacha Limit] profile query with trial_until failed, retrying with plan only:', profileResult.error.message);
    const fallback = await supabase
      .from('profiles')
      .select('plan')
      .eq('id', userId)
      .maybeSingle();
    profileData = fallback.data as typeof profileData;
  }

  const isPremium = profileData?.plan === 'premium' ||
    ((profileData as Record<string, unknown>)?.trial_until &&
      new Date((profileData as Record<string, unknown>).trial_until as string) > new Date());
  return isPremium;
}

export const GET = withAuth(async ({ supabase, user }) => {
  try {
    const [{ data, error: buddyErr }, isPremium] = await Promise.all([
      supabase
        .from('buddy_state')
        .select('daily_see_it_count, daily_see_it_date')
        .eq('user_id', user.id)
        .maybeSingle(),
      queryPremiumStatus(supabase, user.id),
    ]);

    if (buddyErr) {
      logger.warn('[Gacha Limit] GET error:', buddyErr.message);
      return NextResponse.json({ error: 'Failed to fetch gacha limit' }, { status: 500 });
    }

    const todayGachaDay = getGachaDay();
    const storedDate = data?.daily_see_it_date as string | null;
    const storedCount = (data?.daily_see_it_count as number) || 0;

    const effectiveCount = storedDate === todayGachaDay ? storedCount : 0;
    const limit = isPremium ? Infinity : DAILY_GACHA_LIMIT;
    const remaining = isPremium ? Infinity : Math.max(0, DAILY_GACHA_LIMIT - effectiveCount);

    return NextResponse.json({
      count: effectiveCount,
      date: todayGachaDay,
      remaining,
      limit,
      isPremium,
      resetsAt: getLimitResetDescription(),
    });
  } catch (err) {
    // safe to ignore: returns 500 to client; error is logged for debugging
    logger.error('[Gacha Limit] GET unhandled error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
});

export const POST = withAuth(async ({ supabase, user, request }) => {
  // 🔧 2026-07-15 (migration 111 兼容): buddy_state UPDATE 用 admin client
  const { supabase: adminSupa } = createAdminClient();
  const writeClient = adminSupa || supabase;

  const gachaSchema = z.object({
    action: z.enum(['increment', 'decrement'], { message: 'action must be "increment" or "decrement"' }),
  });
  const body = await validateBody(request, gachaSchema);
  if (isValidationError(body)) return body;

  try {
    const todayGachaDay = getGachaDay();

    const [{ data: current, error: readErr }, isPremium] = await Promise.all([
      supabase
        .from('buddy_state')
        .select('daily_see_it_count, daily_see_it_date')
        .eq('user_id', user.id)
        .maybeSingle(),
      queryPremiumStatus(supabase, user.id),
    ]);

    if (readErr) {
      logger.warn('[Gacha Limit] POST read error:', readErr.message);
      return NextResponse.json({ error: 'Failed to read gacha count' }, { status: 500 });
    }

    const storedDate = current?.daily_see_it_date as string | null;
    const storedCount = (current?.daily_see_it_count as number) || 0;
    const effectiveCount = storedDate === todayGachaDay ? storedCount : 0;

    // 🔧 P2-9 fix: Refund (decrement) — used when gacha fails. No limit check needed.
    if (body.action === 'decrement') {
      if (effectiveCount <= 0) {
        return NextResponse.json({
          success: true,
          count: 0,
          remaining: isPremium ? Infinity : DAILY_GACHA_LIMIT,
          limit: isPremium ? Infinity : DAILY_GACHA_LIMIT,
          isPremium,
          refunded: false,
        });
      }
      const refundCount = effectiveCount - 1;
      const refundResult = await writeClient
        .from('buddy_state')
        .update({
          daily_see_it_count: refundCount,
          daily_see_it_date: todayGachaDay,
        })
        .eq('user_id', user.id);
      if (refundResult.error) {
        logger.warn('[Gacha Limit] decrement write error:', refundResult.error.message);
        return NextResponse.json({ error: 'Failed to refund gacha count' }, { status: 500 });
      }
      logger.info(`[Gacha Limit] Refunded 1 gacha pull for user ${user.id} (was ${effectiveCount}, now ${refundCount})`);
      return NextResponse.json({
        success: true,
        count: refundCount,
        remaining: isPremium ? Infinity : Math.max(0, DAILY_GACHA_LIMIT - refundCount),
        limit: isPremium ? Infinity : DAILY_GACHA_LIMIT,
        isPremium,
        refunded: true,
      });
    }

    // action === 'increment'
    if (!isPremium) {
      if (effectiveCount >= DAILY_GACHA_LIMIT) {
        return NextResponse.json({
          error: 'Daily limit reached',
          count: effectiveCount,
          remaining: 0,
          limit: DAILY_GACHA_LIMIT,
          isPremium: false,
        }, { status: 429 });
      }
    }

    // CAS write
    const newCount = effectiveCount + 1;
    let writeResult;
    if (storedDate === todayGachaDay) {
      // 🔧 ARCH fix (2026-07-22 P1): 必须传 { count: 'exact' } 否则 count 为 null,
      //    CAS 检查 (count === 0) 永远不触发 → 并发请求绕过日限
      writeResult = await writeClient
        .from('buddy_state')
        .update({
          daily_see_it_count: newCount,
          daily_see_it_date: todayGachaDay,
        }, { count: 'exact' })
        .eq('user_id', user.id)
        .eq('daily_see_it_count', storedCount)
        .eq('daily_see_it_date', todayGachaDay);
    } else {
      // 🔧 ARCH fix (2026-07-22 P2 — new-day race condition):
      //    旧代码: 新日路径无 CAS — 两个并发请求都设 count=1, 用户绕过日限
      //    修复: 加 CAS — 只在日期未变时更新
      //    如果 CAS 失败 (另一请求已更新日期), 下方 count===0 检查会触发 re-read
      //    注意: storedDate 可能为 null (首次使用), 用 .is() 处理
      const newDayUpdate = writeClient
        .from('buddy_state')
        .update({
          daily_see_it_count: 1,
          daily_see_it_date: todayGachaDay,
        }, { count: 'exact' })
        .eq('user_id', user.id);

      // CAS: only if date hasn't changed
      if (storedDate === null) {
        writeResult = await newDayUpdate.is('daily_see_it_date', null);
      } else {
        writeResult = await newDayUpdate.eq('daily_see_it_date', storedDate);
      }
    }

    if (writeResult.error) {
      logger.warn('[Gacha Limit] POST write error:', writeResult.error.message);
      return NextResponse.json({ error: 'Failed to update gacha count' }, { status: 500 });
    }

    // CAS check — if 0 rows updated, concurrent request won
    // 🔧 ARCH fix (2026-07-22): 也检查新日路径 (之前只检查同日路径)
    if (writeResult.count === 0) {
      const { data: reRead } = await supabase
        .from('buddy_state')
        .select('daily_see_it_count, daily_see_it_date')
        .eq('user_id', user.id)
        .maybeSingle();
      const reReadCount = (reRead?.daily_see_it_count as number) || 0;
      const reReadDate = reRead?.daily_see_it_date as string | null;
      const reReadEffective = reReadDate === todayGachaDay ? reReadCount : 0;

      if (!isPremium && reReadEffective >= DAILY_GACHA_LIMIT) {
        return NextResponse.json({
          error: 'Daily limit reached',
          count: reReadEffective,
          remaining: 0,
          limit: DAILY_GACHA_LIMIT,
          isPremium: false,
        }, { status: 429 });
      }
      return NextResponse.json({
        success: true,
        count: reReadEffective,
        remaining: isPremium ? Infinity : Math.max(0, DAILY_GACHA_LIMIT - reReadEffective),
        limit: isPremium ? Infinity : DAILY_GACHA_LIMIT,
        isPremium,
      });
    }

    const finalCount = storedDate === todayGachaDay ? newCount : 1;
    const remaining = isPremium ? Infinity : Math.max(0, DAILY_GACHA_LIMIT - finalCount);
    return NextResponse.json({
      success: true,
      count: finalCount,
      remaining,
      limit: isPremium ? Infinity : DAILY_GACHA_LIMIT,
      isPremium,
    });
  } catch (err) {
    // safe to ignore: returns 500 to client; error is logged for debugging
    logger.error('[Gacha Limit] POST unhandled error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
});

/**
 * 🔧 P0-5 fix: DELETE /api/buddy/gacha-limit — 退款 (decrement gacha count)
 *
 * 当故事生成失败或用户取消时, 调用此端点退还当次 Gacha 次数。
 * 使用 CAS 防并发: 只在 count == currentCount 时才 decrement (避免重复退款)。
 */
export const DELETE = withAuth(async ({ supabase, user }) => {
  // 🔧 2026-07-15 (migration 111 兼容): buddy_state UPDATE 用 admin client
  const { supabase: adminSupa } = createAdminClient();
  const writeClient = adminSupa || supabase;

  try {
    const todayGachaDay = getGachaDay();

    const { data: current, error: readErr } = await supabase
      .from('buddy_state')
      .select('daily_see_it_count, daily_see_it_date')
      .eq('user_id', user.id)
      .maybeSingle();

    if (readErr) {
      logger.warn('[Gacha Limit] DELETE read error:', readErr.message);
      return NextResponse.json({ error: 'Failed to read gacha count' }, { status: 500 });
    }

    const storedDate = current?.daily_see_it_date as string | null;
    const storedCount = (current?.daily_see_it_count as number) || 0;
    const effectiveCount = storedDate === todayGachaDay ? storedCount : 0;

    if (effectiveCount <= 0) {
      return NextResponse.json({ success: true, count: 0, remaining: DAILY_GACHA_LIMIT });
    }

    const newCount = effectiveCount - 1;
    // 🔧 ARCH fix (2026-07-22 P1): 必须传 { count: 'exact' } 否则 count 为 null,
    //    且需要检查 count === 0 (CAS 失败) — 旧代码不检查, CAS 失败时返回错误的 newCount
    const { error: writeErr, count: writeCount } = await writeClient
      .from('buddy_state')
      .update({
        daily_see_it_count: newCount,
        daily_see_it_date: todayGachaDay,
      }, { count: 'exact' })
      .eq('user_id', user.id)
      .eq('daily_see_it_count', storedCount)
      .eq('daily_see_it_date', todayGachaDay);

    if (writeErr) {
      logger.warn('[Gacha Limit] DELETE write error:', writeErr.message);
      return NextResponse.json({ error: 'Failed to refund gacha count' }, { status: 500 });
    }

    // CAS check — if 0 rows updated, concurrent request won
    if (writeCount === 0) {
      logger.warn(`[Gacha Limit] DELETE CAS failed — concurrent modification for user ${user.id.substring(0, 8)}`);
      return NextResponse.json({
        error: 'Concurrent modification detected — please try again',
      }, { status: 409 });
    }

    logger.info(`[Gacha Limit] DELETE refund: ${effectiveCount} → ${newCount} for user ${user.id}`);
    return NextResponse.json({
      success: true,
      count: newCount,
      remaining: DAILY_GACHA_LIMIT - newCount,
      refunded: true,
    });
  } catch (err) {
    // safe to ignore: returns 500 to client; error is logged for debugging
    logger.error('[Gacha Limit] DELETE unhandled error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
});
