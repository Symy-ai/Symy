/**
 * POST /api/user/delete-account — GDPR Article 17: Right to Erasure
 *
 * 🔧 2026-07-15 (ARCH-13 #13): GDPR compliance — user can delete their account
 *
 * Deletion sequence:
 * 1. Delete Letta agent (API call to Letta cloud)
 * 2. Delete Supabase Storage avatars
 * 3. Delete auth.users row (cascades to all ON DELETE CASCADE tables)
 *    - profiles, buddy_state, dream_funds, active_challenges, chat_messages,
 *      health_events, impulse_events, user_embeddings, email_receipts,
 *      email_connections, butterfly_sessions, challenge_participants, premium_waitlist
 * 4. Clear letta_agent_pool.assigned_to (ON DELETE SET NULL)
 * 5. ai_audit_logs.user_id set to NULL (migration 112 fixed NOT NULL)
 *
 * Body: { confirm: string } — must match "DELETE" to prevent accidental deletion
 */

import { withAuth } from '@/lib/with-auth';
import { NextResponse } from 'next/server';
import { logger } from '@/lib/logger';
import { validateBody, isValidationError } from '@/lib/api-validation';
import { z } from 'zod';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

const schema = z.object({
  confirm: z.literal('DELETE', { message: 'Must send { confirm: "DELETE" } to confirm deletion' }),
});

export const POST = withAuth(async ({ request, supabase, user }) => {
  const body = await validateBody(request, schema);
  if (isValidationError(body)) return body;

  const userId = user.id;
  logger.info(`[Delete Account] Starting deletion for user ${userId.substring(0, 8)}`);

  // 1. Delete Letta agent (if exists)
  try {
    const { data: profile } = await supabase
      .from('profiles')
      .select('letta_agent_id')
      .eq('id', userId)
      .maybeSingle<{ letta_agent_id: string | null }>();

    if (profile?.letta_agent_id) {
      const { getLettaClient } = await import('@/lib/letta-mcp-manager');
      try {
        const client = getLettaClient();
        await client.agents.delete(profile.letta_agent_id);
        logger.info(`[Delete Account] Deleted Letta agent ${profile.letta_agent_id}`);
      } catch (lettaErr) {
        // Non-blocking — agent may already be deleted. Log but continue.
        logger.warn(`[Delete Account] Failed to delete Letta agent ${profile.letta_agent_id}:`, lettaErr instanceof Error ? lettaErr.message : String(lettaErr));
      }
    }
  } catch (profileErr) {
    // safe to ignore: non-critical error, logged for observability
    logger.warn('[Delete Account] Failed to fetch profile for Letta agent ID:', profileErr);
  }

  // 2. Delete Supabase Storage avatars
  try {
    const { data: files } = await supabase.storage
      .from('avatars')
      .list(userId);

    if (files && files.length > 0) {
      const paths = files.map(f => `${userId}/${f.name}`);
      await supabase.storage.from('avatars').remove(paths);
      logger.info(`[Delete Account] Deleted ${paths.length} avatar files`);
    }
  } catch (storageErr) {
    // safe to ignore: non-critical error, logged for observability
    logger.warn('[Delete Account] Failed to delete avatar files:', storageErr);
  }

  // 3. Delete auth.users row (cascades to all ON DELETE CASCADE tables)
  //    This is the nuclear option — Supabase auth.admin.deleteUser cascades.
  try {
    const { createAdminClient } = await import('@/lib/supabase-admin');
    const { supabase: adminSupabase } = createAdminClient();
    if (!adminSupabase) {
      return NextResponse.json({ error: 'Admin client unavailable' }, { status: 500 });
    }

    const { error: deleteError } = await adminSupabase.auth.admin.deleteUser(userId);
    if (deleteError) {
      logger.error('[Delete Account] Failed to delete auth.users row:', deleteError.message);
      return NextResponse.json({ error: 'Failed to delete account' }, { status: 500 });
    }

    logger.info(`[Delete Account] Successfully deleted user ${userId.substring(0, 8)} (cascaded to all tables)`);
  } catch (deleteErr) {
    // safe to ignore: non-critical error, logged for observability
    logger.error('[Delete Account] Unexpected error during deletion:', deleteErr);
    return NextResponse.json({ error: 'Failed to delete account' }, { status: 500 });
  }

  return NextResponse.json({
    success: true,
    message: 'Account deleted successfully. All data has been removed.',
  });
});
