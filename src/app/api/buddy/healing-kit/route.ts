/**
 * POST /api/buddy/healing-kit — 使用 Healing Kit (服务端强制每日限制)
 *
 * 🔧 ARCH fix (Round 3 数据审计 C4):
 *    旧代码 healing-kit 限制纯客户端检查 (buddy-tab.tsx 读 lastHealingKitAt) → 可绕过。
 *    根因修复: 此路由调 use_healing_kit RPC, 服务端原子检查 + 应用奖励。
 *
 * 🔧 ARCH fix (Round 73 — Audit Finding 7.5: 409 缺 lastHealingKitAt 导致客户端状态不同步):
 *    旧代码: 当 RPC 不返回 lastHealingKitAt 时, 409 response 该字段为 undefined。
 *       Client `if (errBody.lastHealingKitAt)` 检查失败 → state 不更新 → 按钮可点 → 静默 409 循环。
 *    根因修复: 409 必须始终包含 lastHealingKitAt (fallback 到 now ISO); 加 zod schema 验证 RPC 结果。
 *
 * 🔧 2026-07-21: Migrated to withAuth HOF (was manual createAuthenticatedClient
 *    with 8 mergeCookies calls — now handled automatically by withAuth).
 *    Admin client still used for RPC calls (SECURITY DEFINER) and CAS updates.
 */

import { withAuth } from '@/lib/with-auth';
import { createAdminClient } from '@/lib/supabase-admin';
// 🔧 P1-5 机制闭合 (Round 90): Pet Symy 后补充 connection + bump intimacy
import { fireReplenishDailyNeed, fireBumpIntimacy } from '@/lib/companion-rpc';
import { NextResponse } from 'next/server';
import { logger } from '@/lib/logger';
import { getLimitWindow, TEST_PERIOD_5MIN } from '@/lib/limit-window';
import { z } from 'zod';

// 🔧 ARCH fix Round 73: Validate RPC response shape (was `as Record<string, unknown>`)
const healingKitRpcResultSchema = z.object({
  success: z.boolean(),
  error: z.string().optional(),
  lastHealingKitAt: z.string().optional(),
  vitality_delta: z.number().optional(),
  tokens_delta: z.number().optional(),
}).passthrough(); // allow extra fields

export const dynamic = 'force-dynamic';

export const POST = withAuth(async ({ supabase, user }) => {
  // 用 admin client 调 RPC (SECURITY DEFINER, 需要 admin service 或 authenticated)
  const { supabase: adminSupabase, error: adminError } = createAdminClient();
  if (!adminSupabase || adminError) {
    logger.error('[Healing Kit] Admin client unavailable:', adminError);
    return NextResponse.json({ error: 'Service unavailable' }, { status: 503 });
  }

  // 🔧 ARCH fix Round 78: 测试期用 5 分钟窗口替代每日窗口.
  //    旧代码: 调 use_healing_kit RPC, RPC 内部检查 CURRENT_DATE::date = last_healing_kit_at::date.
  //    问题: 测试期想 5 分钟重置, 但 RPC 检查的是整天.
  //    根因修复: 测试期在调 RPC 前, 检查 last_healing_kit_at 是否在当前 5 分钟窗口外.
  //    如果在窗口外 (即 5 分钟已过), 先清 last_healing_kit_at = null, 让 RPC 的日期检查通过.
  //    如果在窗口内, 直接返回 409 (不调 RPC).
  let userTimezone = 'UTC';
  let timezoneFetchFailed = false;
  try {
    const { data: profile } = await supabase
      .from('profiles')
      .select('timezone')
      .eq('id', user.id)
      .maybeSingle();
    const tz = (profile as { timezone?: string } | null)?.timezone;
    if (tz) userTimezone = tz;
  } catch (tzErr) {
    // safe to ignore: timezone fetch failure — fallback to UTC, client can display warning
    logger.warn('[Healing Kit] Failed to fetch user timezone, falling back to UTC:', tzErr);
    timezoneFetchFailed = true;
  }

  // 🔧 ARCH fix Round 78: 测试期 5 分钟窗口检查
  if (TEST_PERIOD_5MIN) {
    try {
      // 读 buddy_state.last_healing_kit_at
      const { data: buddyState } = await supabase
        .from('buddy_state')
        .select('last_healing_kit_at')
        .eq('user_id', user.id)
        .maybeSingle();
      const lastUsed = (buddyState as { last_healing_kit_at?: string } | null)?.last_healing_kit_at;

      if (lastUsed) {
        const lastUsedWindow = getLimitWindow(new Date(lastUsed));
        const currentWindow = getLimitWindow();
        if (lastUsedWindow === currentWindow) {
          // 同一个 5 分钟窗口内 → 409
          return NextResponse.json({
            success: false,
            error: 'already_used_this_window',
            lastHealingKitAt: lastUsed,
          }, { status: 409 });
        }
        // 不同窗口 → 清 last_healing_kit_at, 让 RPC 通过
        // 🔧 2026-07-15 (ARCH-3 #5 修复): CAS 防止并发请求双倍奖励
        //    旧代码: 无条件 UPDATE last_healing_kit_at = null
        //    问题: 两个并发请求都读到 lastUsed (旧窗口), 都判断不同窗口,
        //    都执行 UPDATE null, 都调 RPC → 双倍 vitality/tokens 奖励
        //    修复: CAS — 只在 last_healing_kit_at 仍等于 lastUsed 时才 UPDATE null
        //    若 CAS 失败 (0 rows), 说明另一个请求已更新, 跳过 RPC 返回 409
        // 🔧 2026-07-15: 用 admin client (migration 111 REVOKE 了 authenticated 对
        //    last_healing_kit_at 的 UPDATE 权限 — server-only 字段)
        const { data: casResult } = await adminSupabase
          .from('buddy_state')
          .update({ last_healing_kit_at: null })
          .eq('user_id', user.id)
          .eq('last_healing_kit_at', lastUsed)  // 🔧 CAS: 只更新未被其他请求改过的行
          .select('user_id')
          .maybeSingle();

        if (!casResult) {
          // CAS 失败 — 另一个并发请求已经用了 healing kit, 返回 409
          return NextResponse.json({
            success: false,
            error: 'already_used_this_window',
            lastHealingKitAt: lastUsed,
          }, { status: 409 });
        }
      }
    } catch (windowErr) {
      // 🔧 2026-07-15 (deep audit #14): Don't silently fall back to less-strict check
      //    Old code: DB error → skip 5-min check → only daily RPC check applies
      //    → user can use healing kit every 5 min during DB outages (unlimited vitality boost)
      //    Fix: return 500 — better to refuse healing kit than allow unlimited use
      logger.error('[Healing Kit] 5-min window check failed (DB error):', windowErr instanceof Error ? windowErr.message : String(windowErr));
      return NextResponse.json({ error: 'Service temporarily unavailable. Please try again.' }, { status: 500 });
    }
  }

  const { data, error } = await adminSupabase.rpc('use_healing_kit', { p_user_id: user.id, p_timezone: userTimezone });

  if (error) {
    logger.error('[Healing Kit] RPC error:', error.message);
    return NextResponse.json({ error: 'Failed to use healing kit' }, { status: 500 });
  }

  // 🔧 ARCH fix Round 73: zod validation replaces `as Record<string, unknown>`
  const parsed = healingKitRpcResultSchema.safeParse(data);
  if (!parsed.success) {
    logger.error('[Healing Kit] RPC returned malformed result:', parsed.error.message, { data });
    return NextResponse.json({ error: 'Malformed RPC response' }, { status: 500 });
  }
  const result = parsed.data;

  if (!result.success) {
    // 今日已用 — 必须始终返回 lastHealingKitAt (审计 Finding 7.5 根因修复)
    // 当 RPC 不返回该字段时, fallback 到 now ISO (用户已用过, 但时间戳丢失)
    return NextResponse.json({
      success: false,
      error: result.error || 'already_used_today',
      lastHealingKitAt: result.lastHealingKitAt ?? new Date().toISOString(),
    }, { status: 409 });
  }

  // 🔧 P1-5 机制闭合 (Round 90): Pet Symy 成功后补充 connection + bump intimacy
  //    connection +15 (抚摸 = 连接), intimacy +1 (日常互动)
  // 🔧 Round 91 fix: await RPC 调用 (fire-and-forget 在 Vercel serverless 会被 kill)
  // 🔧 ARCH fix (2026-07-21): Use Promise.allSettled (not Promise.all) — if one RPC fails,
  //    the other should still complete. Both are independent side effects.
  await Promise.allSettled([
    fireReplenishDailyNeed(user.id, 'connection', 15),
    fireBumpIntimacy(user.id, 1),
  ]);

  return NextResponse.json({
    ...result,
    // 🔧 ARCH fix (Round 43 LOW-1): 暴露 timezoneUsed + timezoneFetchFailed 让前端提示
    timezoneUsed: userTimezone,
    timezoneFetchFailed,
  });
});
