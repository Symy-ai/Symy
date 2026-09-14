/* eslint-disable symy/no-warn-only-catch -- individual catch blocks reviewed per error-policy.md */
import { createClient } from '@/lib/supabase-server';
import { NextResponse } from 'next/server';
import { logger } from '@/lib/logger';

/**
 * Auth Callback — Supabase 邮箱确认后的回调
 *
 * 当用户点击确认邮箱链接后，Supabase 会重定向到这里。
 * 我们在这里:
 * 1. 交换 code 获取 session
 * 2. ✅ 为用户立即创建 Letta Agent（不是惰性创建！用户激活时就创建）
 */
// 🔧 Round 112 P0 fix: Agent 创建可能需要 30s+, Vercel 默认 10s 超时不够
export const maxDuration = 300;

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');
  // 🔧 SEC-1 fix: 验证 next 参数以防止 open redirect
  // BUG-159 fix: 同时阻止 /api/ 路径重定向，防止认证后被导向内部 API
  const nextParam = searchParams.get('next') ?? '/';
  const next = (nextParam.startsWith('/') && !nextParam.startsWith('/api/')) ? nextParam : '/';

  // 🔧 forgot-password fix: 检测 type=recovery (Supabase 密码重置邮件回调)
  //   旧代码: 只处理 email verification, 密码重置链接会落到 next=/, 用户被重定向到首页但没改密码
  //   修复: 如果是 recovery flow, 交换 code 拿到 session 后跳到 /auth/reset-password 让用户设置新密码
  const flowType = searchParams.get('type');
  const isRecovery = flowType === 'recovery';

  if (code) {
    const supabase = await createClient();
    const { error, data } = await supabase.auth.exchangeCodeForSession(code);

    if (!error && data.user) {
      // 🔧 forgot-password fix: recovery flow 跳到 reset-password 页面, 不创建 Letta agent (不必要)
      if (isRecovery) {
        return NextResponse.redirect(`${origin}/auth/reset-password`);
      }

      // ✅ 账户激活时立即创建 Letta Agent（不是惰性创建！）
      // 这样用户进入 Chat 页面时 agent 已经准备好了，不会冷启动
      try {
        const userId = data.user.id;
        const userEmail = data.user.email;

        // 使用 admin 客户端查询和更新 profiles（RLS 可能限制普通用户读写）
        const { createAdminClient } = await import('@/lib/supabase-admin');
        const adminResult = createAdminClient();

        if (adminResult.supabase) {
          const adminSupabase = adminResult.supabase;

          // 🔧 migration 120 fix (2026-07-17): 兜底创建 profiles 记录
          //   根因: handle_new_user() 触发器可能因 RLS/异常失败, profiles 记录不存在
          //   → onboarding API 返回 false 但 profiles 记录不存在 → 后续 UPDATE 都失败
          //   修复: 检查 profiles 记录是否存在, 不存在则 INSERT (含 trial_until = NOW() + 7 days)
          const { data: existingProfile } = await adminSupabase
            .from('profiles')
            .select('id, letta_agent_id')
            .eq('id', userId)
            .maybeSingle();

          if (!existingProfile) {
            logger.info('[auth/callback] profiles record missing, creating with 7-day trial:', userId);
            await adminSupabase
              .from('profiles')
              .insert({
                id: userId,
                email: userEmail,
                display_name: userEmail?.split('@')[0] || 'User',
                trial_until: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
                onboarding_completed: false,
              });
          }

          // 检查用户是否已有 letta_agent_id
          const profileData = existingProfile as { letta_agent_id: string | null } | null;
          if (!profileData?.letta_agent_id) {
            // 没有 agent_id，立即创建
            // 🔧 ARCH fix (Round 42 REVIEW-B2 — auth callback 也用 getOrCreateAgentId 防 orphan agent):
            //    旧代码: 直接 createAgentForUser 无锁 → 并发登录 (多设备) 都创建 agent → orphan。
            //    根因修复: 改用 getOrCreateAgentId (内部有 acquireLock + backoff 重试)。
            const { getOrCreateAgentId } = await import('@/lib/letta-agent-manager');

            // getOrCreateAgentId 内部已经会保存到 profiles 表
            const agentId = await getOrCreateAgentId(userId, userEmail);

            if (agentId) {
              logger.info('[auth/callback] ✅ Agent created at account activation for user:', userId, 'agent_id:', agentId);
            } else {
              logger.error('[auth/callback] ⚠️ Agent creation failed for user:', userId, '(non-blocking)');
            }
          }
        } else {
          logger.error('[auth/callback] ⚠️ Admin client unavailable, skipping agent creation:', adminResult.error);
        }
      // safe to ignore: non-critical background operation, error already logged
      } catch (err) {
        logger.error('[auth/callback] Agent creation error (non-blocking):', err);
        // 不阻断登录流程
      }

      return NextResponse.redirect(`${origin}${next}`);
    }

    // 🔧 BUG-67 fix: 保留原始错误信息，方便用户理解问题
    if (error) {
      const errorMsg = encodeURIComponent(error.message);
      return NextResponse.redirect(`${origin}/auth/login?error=${errorMsg}`);
    }
  }

  return NextResponse.redirect(`${origin}/auth/login?error=auth_callback_failed`);
}
