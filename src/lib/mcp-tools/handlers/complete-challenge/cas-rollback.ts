/**
 * CAS rollback helper for complete_challenge — extracted to eliminate 1x
 * inline implementation + add documentation about the NOT NULL constraint
 * fix from Round 120 AUDIT-6.
 *
 * 🔧 ARCH fix (2026-07-17): extract rollback helper
 *    Old: 15-line try/catch inlined in complete_challenge.ts fallback path.
 *    New: single function with explicit error logging.
 *
 * Behavior preservation (CRITICAL — Round 120 AUDIT-6 P0 #1 fix):
 *   - deposit_status column is TEXT NOT NULL DEFAULT 'unsettled'
 *   - Old code used null → NOT NULL violation → UPDATE silently failed
 *     → rollback failed → user permanently stuck (challenge status not reset)
 *   - Fix: use 'unsettled' (DEFAULT value), not null
 *   - We also reset status='active' + completed_at=null to fully restore
 *     the pre-completion state, so user can retry.
 *
 * This is a fail-closed rollback: if the rollback itself fails, we log the
 * error but don't throw — the caller has already returned an error to the
 * user, and we don't want to mask the original error with a rollback error.
 * The user can retry, and the next attempt will detect status='passed'
 * (CAS) and return "already completed" — which is wrong (the rewards
 * weren't applied), but it's the best we can do without manual intervention.
 * Operators should alert on "rollback also failed" log messages.
 */

import 'server-only'; // 🔧 ARCH fix: this file uses createAdminClient (admin service) — must be server-only
import { createAdminClient } from '@/lib/supabase-admin';
import { logger } from '@/lib/logger';

/**
 * Roll back challenge status to 'active' after applyBuddyStateDelta failed.
 *
 * This is the safety net for the rare case where:
 *   1. CAS already committed status='passed'
 *   2. applyBuddyStateDelta failed (DB timeout / connection drop)
 *
 * Without rollback, the user would be stuck: retry returns "already completed"
 * (CAS hit) but rewards were never applied.
 *
 * @returns true if rollback succeeded, false if it also failed (logged).
 */
export async function rollbackChallengeStatusOnFailure(
  userId: string,
  challengeId: string,
): Promise<boolean> {
  try {
    const { supabase: rollbackSupabase } = createAdminClient();
    if (!rollbackSupabase) {
      logger.error('[MCP] complete_challenge: rollback failed — admin client unavailable');
      return false;
    }
    const { error: rollbackErr } = await rollbackSupabase
      .from('active_challenges')
      .update({
        status: 'active',
        completed_at: null,
        // 🔧 Round 120 AUDIT-6 P0 #1 fix: use 'unsettled' (NOT NULL DEFAULT),
        //    NOT null — null causes silent NOT NULL violation.
        deposit_status: 'unsettled',
      })
      .eq('id', challengeId)
      .eq('user_id', userId);
    if (rollbackErr) {
      logger.error('[MCP] complete_challenge: rollback DB error (user stuck — manual intervention needed):', rollbackErr);
      return false;
    }
    logger.info('[MCP] complete_challenge: rollback succeeded — challenge status reset to active');
    return true;
  } catch (rollbackErr) {
    logger.error('[MCP] complete_challenge: rollback ALSO failed (user stuck — manual intervention needed):', rollbackErr);
    return false;
  }
}
