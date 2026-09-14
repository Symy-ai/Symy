/**
 * GET /api/admin/vip — 查询候补名单 + VIP 用户列表
 * POST /api/admin/vip — 批量开通 VIP (设 profiles.plan='premium')
 *
 * 🔧 VIP 内测: 邮箱接入功能仅对 premium 用户开放
 *   管理员在此页面管理候补名单 + 开通 VIP
 *
 * 认证: Authorization: Bearer <ADMIN_API_KEY>
 */

import { NextResponse, type NextRequest } from 'next/server';
import { verifyAdminAuth } from '@/lib/admin-auth';
import { createAdminClient } from '@/lib/supabase-admin';
import { logger } from '@/lib/logger';

export const dynamic = 'force-dynamic';

/** GET: 查询候补名单 + VIP 用户 */
export async function GET(request: NextRequest) {
  const authResult = verifyAdminAuth(request);
  if (!authResult.authorized) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { supabase, error: adminError } = createAdminClient();
  if (adminError || !supabase) {
    return NextResponse.json({ error: 'Server config error' }, { status: 500 });
  }

  try {
    // 并行查询: 候补名单 + VIP 用户
    const [waitlistRes, premiumRes] = await Promise.all([
      supabase
        .from('premium_waitlist')
        .select('user_id, email, created_at')
        .order('created_at', { ascending: false })
        .limit(200),
      supabase
        .from('profiles')
        .select('id, email, display_name, plan, created_at')
        .eq('plan', 'premium')
        .order('created_at', { ascending: false })
        .limit(200),
    ]);

    if (waitlistRes.error) {
      logger.error('[Admin VIP] Waitlist query error:', waitlistRes.error.message);
    }
    if (premiumRes.error) {
      logger.error('[Admin VIP] Premium users query error:', premiumRes.error.message);
    }

    // 合并: 候补名单中标注是否已开通
    const premiumIds = new Set((premiumRes.data || []).map(p => p.id));
    const waitlist = (waitlistRes.data || []).map(w => ({
      ...w,
      isActivated: premiumIds.has(w.user_id),
    }));

    return NextResponse.json({
      waitlist,
      premiumUsers: premiumRes.data || [],
      stats: {
        waitlistTotal: waitlist.length,
        activatedCount: waitlist.filter(w => w.isActivated).length,
        pendingCount: waitlist.filter(w => !w.isActivated).length,
        premiumTotal: (premiumRes.data || []).length,
      },
    });
  } catch (err) {
    // safe to ignore: non-critical error, logged for observability
    logger.error('[Admin VIP] Unexpected error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/** POST: 批量开通 VIP (设 profiles.plan='premium') */
export async function POST(request: NextRequest) {
  const authResult = verifyAdminAuth(request);
  if (!authResult.authorized) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { supabase, error: adminError } = createAdminClient();
  if (adminError || !supabase) {
    return NextResponse.json({ error: 'Server config error' }, { status: 500 });
  }

  try {
    const body = await request.json();
    const { userIds, action } = body as { userIds: string[]; action: 'activate' | 'deactivate' };

    if (!Array.isArray(userIds) || userIds.length === 0) {
      return NextResponse.json({ error: 'userIds must be a non-empty array' }, { status: 400 });
    }

    if (action !== 'activate' && action !== 'deactivate') {
      return NextResponse.json({ error: 'action must be activate or deactivate' }, { status: 400 });
    }

    const newPlan = action === 'activate' ? 'premium' : 'free';

    // 批量更新 profiles.plan
    const { data, error } = await supabase
      .from('profiles')
      .update({ plan: newPlan, updated_at: new Date().toISOString() })
      .in('id', userIds)
      .select('id, email, plan');

    if (error) {
      logger.error('[Admin VIP] Batch update error:', error.message);
      return NextResponse.json({ error: 'Failed to update plans' }, { status: 500 });
    }

    const affected = data?.length || 0;
    logger.info(`[Admin VIP] ${action}d ${affected} users to ${newPlan}`);

    return NextResponse.json({
      success: true,
      action,
      affected,
      users: data || [],
    });
  } catch (err) {
    // safe to ignore: non-critical error, logged for observability
    logger.error('[Admin VIP] POST error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
