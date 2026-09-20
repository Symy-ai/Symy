/**
 * /api/admin/users — 用户管理 API（需 admin 鉴权）
 *
 * GET  /api/admin/users?page=&limit=&search=&plan=&banned=
 *      分页查询 profiles，支持 email/display_name 模糊搜索 + plan/banned 过滤
 * POST /api/admin/users
 *      批量操作：ban | unban | set_plan | reset_onboarding
 */

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

import { NextRequest, NextResponse } from 'next/server';
import { verifyAdminAuth } from '@/lib/admin-auth';
import { withAdminAudit, logUnauthorizedAdminAttempt } from '@/lib/admin-audit';
import { createAdminClient } from '@/lib/supabase-admin';
import { logger } from '@/lib/logger';
import type { UserProfile } from '@/lib/admin-panel/types';

const PROFILE_COLS =
  'id, email, display_name, avatar_url, plan, banned, banned_until, banned_reason, onboarding_completed, locale, timezone, trial_until, created_at, updated_at';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** GET: 分页查询用户列表 */
export function GET(req: NextRequest) {
  const authResult = verifyAdminAuth(req);
  if (!authResult.authorized) {
    void logUnauthorizedAdminAttempt(req, authResult);
    return NextResponse.json({ error: authResult.error }, { status: 401 });
  }

  return withAdminAudit(req, authResult, async () => {
    const { supabase } = createAdminClient();
    if (!supabase) {
      return NextResponse.json({ error: 'Admin client not configured' }, { status: 500 });
    }

    try {
      const url = new URL(req.url);
      const page = Math.max(1, parseInt(url.searchParams.get('page') || '1', 10));
      const limit = Math.min(100, Math.max(1, parseInt(url.searchParams.get('limit') || '20', 10)));
      const search = url.searchParams.get('search')?.trim() || '';
      const plan = url.searchParams.get('plan'); // 'free' | 'premium' | null
      const bannedParam = url.searchParams.get('banned'); // 'true' | 'false' | null
      const offset = (page - 1) * limit;

      let query = supabase
        .from('profiles')
        .select(PROFILE_COLS, { count: 'exact' })
        .order('created_at', { ascending: false })
        .range(offset, offset + limit - 1);

      if (search) {
        const safe = search.replace(/[\\,.()]/g, '\\$&');
        query = query.or(`email.ilike.%${safe}%,display_name.ilike.%${safe}%`);
      }
      if (plan === 'free' || plan === 'premium') {
        query = query.eq('plan', plan);
      }
      if (bannedParam === 'true') {
        query = query.eq('banned', true);
      } else if (bannedParam === 'false') {
        query = query.or('banned.eq.false,banned.is.null');
      }

      const { data, error: queryError, count } = await query;

      if (queryError) {
        logger.error('[Admin Users API] Query failed:', queryError.message);
        return NextResponse.json({ error: 'Failed to fetch users' }, { status: 500 });
      }

      return NextResponse.json({
        users: (data || []) as unknown as UserProfile[],
        total: count || 0,
        page,
        totalPages: Math.ceil((count || 0) / limit),
      });
    } catch (err) {
      // safe to ignore: error already logged and converted to a 500 response
      logger.error('[Admin Users API] Unexpected error:', err);
      return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
  });
}

/** POST: 批量操作 (ban / unban / set_plan / reset_onboarding) */
export async function POST(req: NextRequest) {
  const authResult = verifyAdminAuth(req);
  if (!authResult.authorized) {
    void logUnauthorizedAdminAttempt(req, authResult);
    return NextResponse.json({ error: authResult.error }, { status: 401 });
  }

  let body: {
    action: 'ban' | 'unban' | 'set_plan' | 'reset_onboarding';
    userIds: string[];
    plan?: 'free' | 'premium';
    bannedUntil?: string;
    reason?: string;
  };

  try {
    body = await req.json();
  } catch {
    // safe to ignore: malformed JSON is rejected with a 400 response
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { action, userIds } = body;

  if (!Array.isArray(userIds) || userIds.length === 0 || userIds.length > 100) {
    return NextResponse.json({ error: 'userIds must be 1-100 valid UUIDs' }, { status: 400 });
  }
  if (!userIds.every((id: unknown) => typeof id === 'string' && UUID_RE.test(id))) {
    return NextResponse.json({ error: 'Invalid user ID format' }, { status: 400 });
  }
  if (!['ban', 'unban', 'set_plan', 'reset_onboarding'].includes(action)) {
    return NextResponse.json({ error: `Invalid action: ${action}` }, { status: 400 });
  }
  if (action === 'ban' && body.bannedUntil !== undefined) {
    const bannedUntil = new Date(body.bannedUntil);
    if (typeof body.bannedUntil !== 'string' || Number.isNaN(bannedUntil.getTime())) {
      return NextResponse.json({ error: 'bannedUntil must be a valid date' }, { status: 400 });
    }
  }

  return withAdminAudit(
    req,
    authResult,
    async () => {
      const { supabase } = createAdminClient();
      if (!supabase) {
        return NextResponse.json({ error: 'Admin client not configured' }, { status: 500 });
      }

      const profiles = supabase.from('profiles');

      try {
        const nowIso = new Date().toISOString();

        if (action === 'ban') {
          const patch = {
            banned: true,
            banned_reason: body.reason || null,
            banned_until: body.bannedUntil ? new Date(body.bannedUntil).toISOString() : null,
            updated_at: nowIso,
          };
          const { data, error } = await profiles.update(patch).in('id', userIds).select('id');
          if (error) {
            logger.error('[Admin Users API] ban failed:', error.message);
            return NextResponse.json({ error: 'Failed to ban users' }, { status: 500 });
          }
          return NextResponse.json({ success: true, action, affected: data?.length || 0 });
        }

        if (action === 'unban') {
          const { data, error } = await profiles
            .update({ banned: false, banned_until: null, banned_reason: null, updated_at: nowIso })
            .in('id', userIds)
            .select('id');
          if (error) {
            logger.error('[Admin Users API] unban failed:', error.message);
            return NextResponse.json({ error: 'Failed to unban users' }, { status: 500 });
          }
          return NextResponse.json({ success: true, action, affected: data?.length || 0 });
        }

        if (action === 'set_plan') {
          const newPlan = body.plan;
          if (newPlan !== 'free' && newPlan !== 'premium') {
            return NextResponse.json({ error: 'plan must be free or premium' }, { status: 400 });
          }
          const { data, error } = await profiles
            .update({ plan: newPlan, updated_at: nowIso })
            .in('id', userIds)
            .select('id, plan');
          if (error) {
            logger.error('[Admin Users API] set_plan failed:', error.message);
            return NextResponse.json({ error: 'Failed to update plan' }, { status: 500 });
          }
          return NextResponse.json({ success: true, action, affected: data?.length || 0 });
        }

        // reset_onboarding
        const { data, error } = await profiles
          .update({ onboarding_completed: false, updated_at: nowIso })
          .in('id', userIds)
          .select('id');
        if (error) {
          logger.error('[Admin Users API] reset_onboarding failed:', error.message);
          return NextResponse.json({ error: 'Failed to reset onboarding' }, { status: 500 });
        }
        return NextResponse.json({ success: true, action, affected: data?.length || 0 });
      } catch (err) {
        // safe to ignore: error already logged and converted to a 500 response
        logger.error('[Admin Users API] POST unexpected error:', err);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
      }
    },
    action,
  );
}
