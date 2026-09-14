/**
 * /api/admin/users/[id] — 单用户管理 API（需 admin 鉴权）
 *
 * GET    /api/admin/users/<id>  — 用户详情 + 关联数据计数
 * DELETE /api/admin/users/<id>  — GDPR 数据删除（级联删 auth.users 及所有关联表）
 */

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

import { NextRequest, NextResponse } from 'next/server';
import { verifyAdminAuth } from '@/lib/admin-auth';
import { withAdminAudit, logUnauthorizedAdminAttempt } from '@/lib/admin-audit';
import { createAdminClient } from '@/lib/supabase-admin';
import { logger } from '@/lib/logger';
import type { UserDetail } from '@/lib/admin-panel/types';

const PROFILE_COLS =
  'id, email, display_name, avatar_url, plan, banned, banned_until, banned_reason, onboarding_completed, locale, timezone, trial_until, created_at, updated_at';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** GET: 单用户详情 + 关联数据 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const authResult = verifyAdminAuth(req);
  if (!authResult.authorized) {
    void logUnauthorizedAdminAttempt(req, authResult);
    return NextResponse.json({ error: authResult.error }, { status: 401 });
  }

  const { id } = await params;
  if (!UUID_RE.test(id)) {
    return NextResponse.json({ error: 'Invalid user ID format' }, { status: 400 });
  }

  return withAdminAudit(req, authResult, async () => {
    const { supabase } = createAdminClient();
    if (!supabase) {
      return NextResponse.json({ error: 'Admin client not configured' }, { status: 500 });
    }

    try {
      const [profileRes, impulseRes, chatRes, butterflyRes, buddyRes] = await Promise.all([
        supabase.from('profiles').select(PROFILE_COLS).eq('id', id).maybeSingle(),
        supabase.from('impulse_events').select('*', { count: 'exact', head: true }).eq('user_id', id),
        supabase.from('chat_messages').select('*', { count: 'exact', head: true }).eq('user_id', id),
        supabase.from('butterfly_sessions').select('*', { count: 'exact', head: true }).eq('user_id', id),
        supabase.from('buddy_state').select('*').eq('user_id', id).maybeSingle(),
      ]);

      if (profileRes.error) {
        logger.error('[Admin Users Detail] profile query failed:', profileRes.error.message);
        return NextResponse.json({ error: 'Failed to fetch profile' }, { status: 500 });
      }
      if (!profileRes.data) {
        return NextResponse.json({ error: 'User not found' }, { status: 404 });
      }

      const detail: UserDetail = {
        ...(profileRes.data as unknown as UserDetail),
        impulseCount: impulseRes.count ?? 0,
        chatMessageCount: chatRes.count ?? 0,
        butterflySessionCount: butterflyRes.count ?? 0,
        buddyState: (buddyRes.data as Record<string, unknown> | null) ?? null,
      };

      return NextResponse.json(detail);
    } catch (err) {
      logger.error('[Admin Users Detail] Unexpected error:', err);
      return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
  });
}

/** DELETE: GDPR 数据删除（删 auth.users → 级联删所有关联表） */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const authResult = verifyAdminAuth(req);
  if (!authResult.authorized) {
    void logUnauthorizedAdminAttempt(req, authResult);
    return NextResponse.json({ error: authResult.error }, { status: 401 });
  }

  const { id } = await params;
  if (!UUID_RE.test(id)) {
    return NextResponse.json({ error: 'Invalid user ID format' }, { status: 400 });
  }

  return withAdminAudit(req, authResult, async () => {
    const { supabase } = createAdminClient();
    if (!supabase) {
      return NextResponse.json({ error: 'Admin client not configured' }, { status: 500 });
    }

    try {
      // 1. Delete Letta agent (if profile has one) — non-blocking, log and continue
      try {
        const { data: profile } = await supabase
          .from('profiles')
          .select('letta_agent_id')
          .eq('id', id)
          .maybeSingle<{ letta_agent_id: string | null }>();

        if (profile?.letta_agent_id) {
          const { getLettaClient } = await import('@/lib/letta-mcp-manager');
          try {
            const client = getLettaClient();
            await client.agents.delete(profile.letta_agent_id);
            logger.info(`[Admin Users Delete] Deleted Letta agent ${profile.letta_agent_id}`);
          } catch (lettaErr) {
            // Non-blocking — agent may already be deleted. Log but continue.
            logger.warn(
              `[Admin Users Delete] Failed to delete Letta agent ${profile.letta_agent_id}:`,
              lettaErr instanceof Error ? lettaErr.message : String(lettaErr),
            );
          }
        }
      } catch (profileErr) {
        logger.warn('[Admin Users Delete] Failed to fetch profile for Letta agent ID:', profileErr);
      }

      // 2. Delete Supabase Storage avatars — non-blocking, log and continue
      try {
        const { data: files } = await supabase.storage.from('avatars').list(id);
        if (files && files.length > 0) {
          const paths = files.map((f) => `${id}/${f.name}`);
          await supabase.storage.from('avatars').remove(paths);
          logger.info(`[Admin Users Delete] Deleted ${paths.length} avatar files`);
        }
      } catch (storageErr) {
        logger.warn('[Admin Users Delete] Failed to delete avatar files:', storageErr);
      }

      // 3. Delete auth.users row (cascades to all ON DELETE CASCADE tables)
      //    (profiles, buddy_state, chat_messages, impulse_events, butterfly_sessions, ...)
      const { error: deleteError } = await supabase.auth.admin.deleteUser(id);
      if (deleteError) {
        logger.error('[Admin Users Delete] deleteUser failed:', deleteError.message);
        return NextResponse.json({ error: 'Failed to delete user' }, { status: 500 });
      }

      logger.info(`[Admin Users Delete] Deleted user ${id.substring(0, 8)} (cascaded to all tables)`);
      return NextResponse.json({ success: true, id });
    } catch (err) {
      logger.error('[Admin Users Delete] Unexpected error:', err);
      return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
  }, 'delete');
}
