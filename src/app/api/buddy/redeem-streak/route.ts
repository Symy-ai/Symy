/**
 * POST /api/buddy/redeem-streak — 用代币补救断签的 streak
 *
 * 🔧 S4 fix: 留存机制 — 断签后可用代币恢复
 *
 * 逻辑:
 *   1. 检查用户代币是否足够 (50 代币/次)
 *   2. 从 buddy_state 读取 streak
 *   3. 恢复 streak 为 prev_streak + 1 (从 localStorage 读取 prev_streak)
 *   4. 扣减代币
 *   5. 返回新的 streak 和代币余额
 *
 * 注意: prev_streak 存在 localStorage (客户端), API 需要客户端传入 prev_streak
 *   服务端只做代币扣减 + streak 更新, prev_streak 由客户端验证
 *
 * 🔧 2026-07-18: 新增功能 (S4 留存机制)
 */

import { withAuth } from '@/lib/with-auth';
import { NextResponse } from 'next/server';
import { validateBody, isValidationError } from '@/lib/api-validation';
import { logger } from '@/lib/logger';
import { z } from 'zod';

export const dynamic = 'force-dynamic';

const STREAK_REDEEM_COST = 50;

const schema = z.object({
  prevStreak: z.number().int().min(1).max(365),
});

export const POST = withAuth(async ({ request, supabase, user }) => {
  const bodyResult = await validateBody(request, schema);
  if (isValidationError(bodyResult)) return NextResponse.json({ error: 'Invalid prevStreak' }, { status: 400 });
  const { prevStreak } = bodyResult;

  try {
    // 1. 查询当前 buddy_state
    const { data: buddyState, error: fetchErr } = await supabase
      .from('buddy_state')
      .select('tokens, streak')
      .eq('user_id', user.id)
      .maybeSingle();

    if (fetchErr || !buddyState) {
      logger.warn('[RedeemStreak] buddy_state fetch failed:', fetchErr?.message);
      return NextResponse.json({ error: 'Failed to fetch user state' }, { status: 500 });
    }

    // 🔧 2026-07-21 audit fix (agent-5 #3): 移除冗余 `as Record<string,unknown>` cast —
    //    .select('tokens, streak') 已返回 typed row, 直接访问即可 (与 redeem/route.ts 同修复)。
    const currentTokens = buddyState.tokens ?? 0;
    const currentStreak = buddyState.streak ?? 0;

    if (currentTokens < STREAK_REDEEM_COST) {
      return NextResponse.json({
        error: 'Insufficient tokens',
        cost: STREAK_REDEEM_COST,
        tokens: currentTokens,
      }, { status: 400 });
    }

    // 2. 恢复 streak: prevStreak + 1 (今天的 streak)
    const newStreak = prevStreak + 1;
    const newTokens = currentTokens - STREAK_REDEEM_COST;

    // 🔧 ARCH fix (2026-07-22 P1 — TOCTOU race condition):
    //    旧代码: 先 SELECT tokens → 检查 ≥ cost → UPDATE tokens = newTokens
    //    Bug: 两个并发请求都读到 tokens=100, 都通过检查, 都 UPDATE tokens=50
    //    → 用户付 50 代币但兑换了 2 次 (last-write-wins 丢失了第一次扣费)
    //
    //    根因修复: CAS (Compare-And-Swap) UPDATE — 在 UPDATE 条件中加 .gte('tokens', cost)
    //    如果并发请求已扣费, 当前 tokens < cost, UPDATE 影响 0 行 → 返回 409
    //
    //    架构原则: 把原子性从应用层 (SELECT + check + UPDATE) 转移到数据库层 (CAS UPDATE)
    const { data: updated, error: updateErr } = await supabase
      .from('buddy_state')
      .update({
        tokens: newTokens,
        streak: newStreak,
      })
      .eq('user_id', user.id)
      .gte('tokens', STREAK_REDEEM_COST)  // CAS: only update if still enough tokens
      .select('tokens, streak')
      .maybeSingle();

    if (updateErr) {
      logger.error('[RedeemStreak] Update failed:', updateErr.message);
      return NextResponse.json({ error: 'Failed to redeem streak' }, { status: 500 });
    }

    // CAS failed — another concurrent request already consumed the tokens
    if (!updated) {
      logger.warn(`[RedeemStreak] CAS failed — concurrent redemption detected for user ${user.id.substring(0, 8)}`);
      return NextResponse.json({
        error: 'Concurrent redemption detected — please try again',
      }, { status: 409 });
    }

    logger.info(`[RedeemStreak] User ${user.id.substring(0, 8)} redeemed streak: ${currentStreak} → ${newStreak} (prev=${prevStreak}), tokens: ${currentTokens} → ${newTokens}`);

    return NextResponse.json({
      success: true,
      cost: STREAK_REDEEM_COST,
      tokens: newTokens,
      prevStreak,
      newStreak,
    });
  } catch (err) {
    // safe to ignore: returns 500 to client, error already logged
    logger.error('[RedeemStreak] Unexpected error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
});
