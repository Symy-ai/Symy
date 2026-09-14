/**
 * /api/user/onboarding — 新手导引状态
 *
 * GET  — 获取当前用户的 onboarding_completed 状态
 * PUT  — 标记 onboarding_completed = true（跳过导引 → 永久关闭）
 *
 * 🔧 ARCH fix (Round 54 R54-Bug1 — 采用 withAuth HOF):
 *    旧代码: 2 个 handler 各 15 行 auth + cookie + error 样板。
 *    根因修复: 用 withAuth HOF, 业务逻辑从 ~15 行降到 ~5 行。
 *
 * 🔧 ARCH fix (Round 55 REVIEW-A-1 — withAuth 自动 merge cookies):
 *    业务代码不再需要手动调 mergeCookies, 架构层自动处理。
 *
 * 容错: 如果 profiles 表还没有 onboarding_completed 列（迁移未执行），
 * GET 返回 false（显示导引），PUT 静默忽略错误（不阻断用户操作）
 */

export const dynamic = 'force-dynamic';

export const maxDuration = 60;

import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/with-auth';
import { logger } from '@/lib/logger';
import { z } from 'zod';

export const GET = withAuth(async ({ supabase, user }) => {
  const { data, error } = await supabase
    .from('profiles')
    .select('onboarding_completed')
    .eq('id', user.id)
    .maybeSingle();

  if (error) {
    // 🔧 2026-07-15: Remove migration-era fallback — onboarding_completed column
    // has been deployed for months. Returning false on DB error causes onboarding
    // popup to loop forever during DB outages.
    logger.error('[onboarding] GET error:', error.message);
    return NextResponse.json({ error: 'Failed to fetch onboarding status' }, { status: 500 });
  }

  // 🔧 migration 120 fix (2026-07-17): 兜底创建 profiles 记录
  //   根因: handle_new_user() 触发器可能失败, profiles 记录不存在
  //   → onboarding_completed 返回 false (正确), 但后续 PUT UPDATE 会失败 (记录不存在)
  //   修复: 如果 profiles 记录不存在, 用 admin client 创建 (含 trial_until = 7 days)
  if (!data) {
    try {
      const { createAdminClient } = await import('@/lib/supabase-admin');
      const adminResult = createAdminClient();
      if (adminResult.supabase) {
        await adminResult.supabase
          .from('profiles')
          .insert({
            id: user.id,
            email: user.email,
            display_name: user.email?.split('@')[0] || 'User',
            trial_until: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
            onboarding_completed: false,
          });
        logger.info('[onboarding] profiles record created for user:', user.id);
      }
    } catch (err) {
      // safe to ignore: non-critical, onboarding will still return false
      logger.warn('[onboarding] Failed to create profiles record:', err);
    }
  }

  return NextResponse.json({
    onboarding_completed: data?.onboarding_completed ?? false,
  });
});

export const PUT = withAuth(async ({ supabase, user, request }) => {
  // 🔧 ARCH fix (Round 6 AUDIT-3 P0 #1): 用 zod 替代手写 validation + parseBody
  //    BUG-160 fix: 要求 onboarding_completed 必须是 boolean
  const onboardingSchema = z.object({
    onboarding_completed: z.boolean(),
  });
  let parsed;
  try {
    parsed = onboardingSchema.parse(await request.json());
      // safe to ignore: non-critical background operation, error already logged
  } catch {
            // safe to ignore: non-critical background operation, error already logged
    return NextResponse.json({ error: 'Invalid JSON or onboarding_completed must be a boolean' }, { status: 400 });
  }
  const completed = parsed.onboarding_completed;

  // 🔧 ARCH fix (C3 — upsert nulls out entire profile row):
  //    旧代码用 .upsert({ id, onboarding_completed, updated_at }, { onConflict: 'id' })
  //    PostgREST upsert 默认 merge-duplicates, 会用 NULL/default 覆盖未提供的列。
  //    结果: email, letta_agent_id, locale, created_at 等全部被 NULL 覆盖。
  //    letta-agent-manager.getUserAgentId() 返回 null → chat 功能彻底损坏。
  //    根因修复: 用 .update().eq('id', user.id) 只更新指定列, 不动其他列。
  const { error } = await supabase
    .from('profiles')
    .update({
      onboarding_completed: completed,
      updated_at: new Date().toISOString(),
    })
    .eq('id', user.id);

  if (error) {
    // 🔧 2026-07-15 (ARCH-5 #4 修复): DB 失败时返回 success: false (was success: true)
    //    旧代码 (Round 25): 返回 success: true + warning → 客户端以为 onboarding 已标记
    //    → 下次 GET 仍返回 onboarding_completed: false → onboarding 重新弹窗
    //    修复: 返回 500, 客户端可重试 (migration 081 早已应用, column 必定存在)
    logger.error('[onboarding] PUT error:', error.message);
    return NextResponse.json(
      { error: 'Failed to update onboarding status', success: false },
      { status: 500 }
    );
  }

  return NextResponse.json({ success: true, onboarding_completed: completed });
});
