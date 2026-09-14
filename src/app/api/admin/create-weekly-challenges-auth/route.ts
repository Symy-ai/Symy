/**
 * POST /api/admin/create-weekly-challenges-auth — 用 Supabase auth 触发创建每周社区挑战
 *
 * 🔧 Round 107: ADMIN_API_KEY 在 Vercel 未配置时的 fallback 路由
 *
 * 认证: Supabase auth session (用户必须登录)
 * 授权: 邮箱白名单 (ADMIN_EMAILS 环境变量, 逗号分隔)
 *
 * 调用 create_weekly_challenges(p_week_offset) 函数创建指定周的挑战
 * 如果 migration 100 未应用, 自动 fallback 到直接 INSERT
 *
 * 用法 (从浏览器 console):
 *   fetch('/api/admin/create-weekly-challenges-auth', {
 *     method: 'POST',
 *     headers: { 'Content-Type': 'application/json' },
 *     body: JSON.stringify({ weekOffset: 1 })
 *   }).then(r => r.json()).then(console.log)
 */

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase-admin';
import { logger } from '@/lib/logger';
import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';
import { createWeeklyChallengesWithFallback } from '../_lib/create-weekly-challenges-helper';

const ADMIN_EMAILS = (process.env.ADMIN_EMAILS || '')
  .split(',')
  .map(s => s.trim().toLowerCase())
  .filter(Boolean);

// 🔧 Round 120 audit fix (AUDIT-5 S3): 删除硬编码 admin 邮箱后门
//    旧代码: ADMIN_EMAILS 未配置时 fallback 到 ['huangcl25@mails.tsinghua.edu.cn']
//    风险: 任何环境 (包括生产) 都能用此邮箱绕过 ADMIN_API_KEY 调用 admin 接口
//    修复: 强制要求 ADMIN_EMAILS 环境变量, 未配置时 fail-closed (403)
//    操作: 在 Vercel Dashboard 配置 ADMIN_EMAILS=huangcl25@mails.tsinghua.edu.cn (或其它白名单)

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    // 0. 守卫: ADMIN_EMAILS 必须显式配置 (Round 120 audit fix)
    if (ADMIN_EMAILS.length === 0) {
      logger.error('[Admin-Auth] ADMIN_EMAILS env var not configured — refusing to authenticate (fail-closed). Set ADMIN_EMAILS in Vercel Dashboard.');
      return NextResponse.json(
        { error: 'Admin email whitelist not configured. Set ADMIN_EMAILS env var.' },
        { status: 503 }
      );
    }

    // 1. 从 cookie 获取 Supabase session
    const cookieStore = await cookies();
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

    const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, options);
          });
        },
      },
    });

    const { data: { user }, error: userErr } = await supabase.auth.getUser();
    if (userErr || !user) {
      return NextResponse.json({ error: 'Unauthorized — must be logged in' }, { status: 401 });
    }

    // 2. 检查邮箱白名单 (timing-safe 比较每个 email, 防止 timing attack 探测白名单)
    const email = user.email?.toLowerCase() || '';
    const isAuthorized = ADMIN_EMAILS.some(allowed => {
      if (email.length !== allowed.length) return false;
      let diff = 0;
      for (let i = 0; i < email.length; i++) {
        diff |= email.charCodeAt(i) ^ allowed.charCodeAt(i);
      }
      return diff === 0;
    });
    if (!isAuthorized) {
      logger.warn(`[Admin-Auth] Unauthorized email attempted admin action`);
      return NextResponse.json({ error: 'Forbidden — admin access required' }, { status: 403 });
    }

    // 3. 解析 weekOffset
    let weekOffset = 0;
    try {
      const body = await req.json();
      if (typeof body?.weekOffset === 'number' && Number.isFinite(body.weekOffset)) {
        weekOffset = Math.max(-4, Math.min(4, Math.round(body.weekOffset)));
      }
    } catch {
      // body 可能为空, 用默认值 0
    }

    // 4. 用 admin client 调用 RPC (with fallback)
    const { supabase: adminSupabase, error: adminError } = createAdminClient();
    if (adminError || !adminSupabase) {
      logger.error('[Admin-Auth] Admin client not configured:', adminError);
      return NextResponse.json({ error: 'Server not configured', detail: adminError }, { status: 500 });
    }

    const result = await createWeeklyChallengesWithFallback(adminSupabase, weekOffset);

    if (!result.success) {
      logger.error('[Admin-Auth] create_weekly_challenges failed:', result.error);
      return NextResponse.json({ error: 'Failed to create challenges', detail: result.error }, { status: 500 });
    }

    logger.info(`[Admin-Auth] Weekly challenges created by ${email} (weekOffset=${weekOffset}, fallback=${result.usedFallback})`);

    // 5. 查询当前活跃挑战
    const { data: activeChallenges } = await adminSupabase
      .from('community_challenges')
      .select('id, title, title_key, platform, start_date, end_date, is_active')
      .eq('is_active', true)
      .order('start_date', { ascending: false });

    return NextResponse.json({
      success: true,
      message: `Weekly challenges created successfully (weekOffset=${weekOffset}${result.usedFallback ? ', fallback' : ''})`,
      weekOffset,
      usedFallback: result.usedFallback,
      triggeredBy: email,
      activeChallenges: activeChallenges || [],
    });
      // safe to ignore: non-critical background operation, error already logged
  } catch (err) {
                  // safe to ignore: non-critical background operation, error already logged
    logger.error('[Admin-Auth] Unexpected error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
