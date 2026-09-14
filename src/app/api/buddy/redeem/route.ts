/**
 * POST /api/buddy/redeem — 用代币兑换额外次数
 *
 * 请求: { type: 'see_it' | 'gacha' }
 * 逻辑:
 *   1. 检查用户代币是否足够
 *   2. 扣减代币 (buddy_state.tokens -= cost)
 *   3. 减少当日使用次数 (buddy_state.daily_see_it_count -= 1)
 *      → 相当于增加 1 次剩余次数
 *   4. 返回新的代币余额
 *
 * 代币兑换数值 (基于 AI 调用成本):
 *   - see_it: 20 代币/次 (1次 LLM 调用, ~¥0.02)
 *   - gacha: 50 代币/次 (3-5次 LLM 调用, ~¥0.10)
 *
 * 🔧 2026-07-18: 新增功能
 */

import { withAuth } from '@/lib/with-auth';
import { NextResponse } from 'next/server';
import { validateBody, isValidationError } from '@/lib/api-validation';
import { logger } from '@/lib/logger';
import { createAdminClient } from '@/lib/supabase-admin';
import { z } from 'zod';

export const dynamic = 'force-dynamic';

const REDEEM_COSTS: Record<string, number> = {
  see_it: 20,
  gacha: 50,
};

const schema = z.object({
  type: z.enum(['see_it', 'gacha']),
});

export const POST = withAuth(async ({ request, supabase, user }) => {
  const bodyResult = await validateBody(request, schema);
  if (isValidationError(bodyResult)) return NextResponse.json({ error: 'Invalid type' }, { status: 400 });
  const { type } = bodyResult;
  const cost = REDEEM_COSTS[type];

  try {
    // 1. 查询当前 buddy_state
    const { data: buddyState, error: fetchErr } = await supabase
      .from('buddy_state')
      .select('tokens, daily_see_it_count, daily_see_it_date')
      .eq('user_id', user.id)
      .maybeSingle();

    if (fetchErr || !buddyState) {
      logger.warn('[Redeem] buddy_state fetch failed:', fetchErr?.message);
      return NextResponse.json({ error: 'Failed to fetch user state' }, { status: 500 });
    }

    const currentTokens = buddyState.tokens ?? 0;
    if (currentTokens < cost) {
      return NextResponse.json({ error: 'Insufficient tokens', cost, tokens: currentTokens }, { status: 400 });
    }

    // 2. 扣减代币 + 减少当日使用次数 (相当于 +1 remaining)
    const currentCount = buddyState.daily_see_it_count ?? 0;
    const currentDate = buddyState.daily_see_it_date;
    const todayKey = new Date().toISOString().slice(0, 16); // 5分钟窗口 (与 limit-window 一致)

    // 只在当前窗口内才减少 count (否则重置为 0, 再减 1 = -1, 相当于 +1 remaining)
    const newCount = currentDate === todayKey ? Math.max(0, currentCount - 1) : -1;
    const newTokens = currentTokens - cost;

    // 🔧 2026-07-21 audit fix: daily_see_it_count/date 被 migration 111 列级 GRANT 收归
    //    server-only (authenticated 无 UPDATE 权限)。原来用 authenticated `supabase` 写这两列
    //    会整体 42501 失败, 连带 tokens 也扣不了 → 整个 redeem 功能在生产是坏的。
    //    根因修复: 用 admin client 写 (与 /api/buddy/gacha-limit 同模式), 仍 .eq('user_id', user.id)
    //    限定自身行。同时移除冗余 `as Record<string,unknown>` cast (select 已返回 typed row)。
    const admin = createAdminClient();
    if (admin.error || !admin.supabase) {
      logger.error('[Redeem] admin client unavailable:', admin.error);
      return NextResponse.json({ error: 'Server not configured' }, { status: 500 });
    }

    // 🔧 ARCH fix (2026-07-22 P1 — TOCTOU race condition):
    //    旧代码: SELECT tokens → check ≥ cost → UPDATE tokens = newTokens (无 CAS)
    //    Bug: 两个并发请求都读到 tokens=100, 都通过检查, 都 UPDATE tokens=80
    //    → 用户兑换 2 次但只扣 20 代币 (last-write-wins 丢失了第一次扣费)
    //
    //    根因修复: CAS UPDATE — 在 UPDATE 条件中加 .gte('tokens', cost)
    //    如果并发请求已扣费, 当前 tokens < cost, UPDATE 影响 0 行 → 返回 409
    //
    //    架构原则: 把原子性从应用层 (SELECT + check + UPDATE) 转移到数据库层 (CAS UPDATE)
    const { data: updated, error: updateErr } = await admin.supabase
      .from('buddy_state')
      .update({
        tokens: newTokens,
        daily_see_it_count: newCount,
        daily_see_it_date: todayKey,
      })
      .eq('user_id', user.id)
      .gte('tokens', cost)  // CAS: only update if still enough tokens
      .select('tokens')
      .maybeSingle();

    if (updateErr) {
      logger.error('[Redeem] Update failed:', updateErr.message);
      return NextResponse.json({ error: 'Failed to redeem' }, { status: 500 });
    }

    // CAS failed — another concurrent request already consumed the tokens
    if (!updated) {
      logger.warn(`[Redeem] CAS failed — concurrent redemption detected for user ${user.id.substring(0, 8)}`);
      return NextResponse.json({
        error: 'Concurrent redemption detected — please try again',
      }, { status: 409 });
    }

    logger.info(`[Redeem] User ${user.id.substring(0, 8)} redeemed ${type} for ${cost} tokens. Tokens: ${currentTokens} → ${newTokens}`);

    return NextResponse.json({
      success: true,
      type,
      cost,
      tokens: newTokens,
    });
  } catch (err) {
    // safe to ignore: error is logged AND user gets a 500 response — this is the
    // canonical "unhandled error → 500" pattern, not a silent swallow.
    logger.error('[Redeem] Unexpected error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
});
