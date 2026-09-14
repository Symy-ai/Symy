/**
 * Challenge metadata update helpers — extracted to eliminate 3x duplication of
 * "compute challenge_duration + autoDetectPlatform + update metadata" block.
 *
 * 🔧 ARCH fix (2026-07-17): extract metadata-update helper
 *    Old: same block inlined 3x in complete_challenge.ts
 *         (atomic-passed path, atomic-failed path, fallback path).
 *         Each instance was ~20 lines and had subtle differences (e.g. atomic
 *         passed path also sets deposit_status='unsettled' — but the failed
 *         path doesn't). This made it easy to introduce drift bugs.
 *    New: single function with explicit `setUnsettled` flag.
 *
 * 🔧 P1-1 + P1-2 fix (2026-07-18): CHECK the { error } return value
 *    Old: `await supabase.from(...).update(...).eq(...)` — return value
 *         discarded. Supabase-js returns `{ error }` for DB-level failures
 *         WITHOUT throwing. RLS denial / connection timeout / CHECK
 *         constraint violation → silently lost.
 *    New: destructure `{ error }`, log on failure. Caller still treats as
 *         non-critical (challenge is already committed), but the error is
 *         now visible in logs for operator triage.
 *
 * 🔧 P2-11 fix (2026-07-18): use adminSupabase for consistency
 *    Old: atomic RPC used adminSupabase (bypasses RLS), but metadata UPDATE
 *         used RLS-scoped supabase from ctx. If RLS policies restricted
 *         UPDATE on active_challenges, metadata UPDATE silently failed
 *         while RPC succeeded. Inconsistent privilege level.
 *    New: caller passes whichever client they want — but the canonical
 *         pattern is to use adminSupabase (this is a server-side MCP handler
 *         that already trusts userId from ctx, and completeChallenge in
 *         challenge-store.ts already uses admin).
 *
 * Behavior preservation:
 *   - challenge_duration computed from challenge.created_at (seconds, rounded)
 *   - platform detected via autoDetectPlatform (itemName as keyword text)
 *   - completed_at_ts = Date.now()
 *   - Existing metadata is preserved (spread first, then new keys overwrite)
 *   - deposit_status='unsettled' only set when setUnsettled=true (passed + amount>0)
 *
 * Failure handling: caller wraps in try/catch — metadata update is non-critical
 * (challenge is already completed in DB, rewards already applied). We re-throw
 * so the caller can log; we don't swallow the error here. BUT we also log
 * inside the helper for the { error } return path (which doesn't throw).
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { ActiveChallengeRow } from '@/lib/challenge-store';
import { autoDetectPlatform } from '@/lib/platform-detector';
import { logger } from '@/lib/logger';

export interface ChallengeMetadataUpdateInput {
  /** Admin client (bypasses RLS) — preferred for server-side MCP handlers. */
  supabase: SupabaseClient;
  userId: string;
  challengeId: string;
  challenge: ActiveChallengeRow | undefined;
  savedAmount: number;
  itemName: string | undefined;
  /** Whether to also set deposit_status='unsettled' on the row. */
  setUnsettled: boolean;
}

/**
 * Update active_challenges row with completion metadata (challenge_duration,
 * platform, completed_at_ts) and optionally set deposit_status='unsettled'.
 *
 * 🔧 P1-1/P1-2 fix: Checks { error } return. Logs on failure but does NOT
 *    throw — metadata update is non-critical (challenge already committed).
 *    Returns true on success, false on failure (caller can use for telemetry).
 *
 * 🔧 P2-10 fix: guards against invalid created_at (NaN propagation).
 */
export async function updateChallengeMetadataWithPlatform({
  supabase,
  userId,
  challengeId,
  challenge,
  savedAmount,
  itemName,
  setUnsettled,
}: ChallengeMetadataUpdateInput): Promise<boolean> {
  // Compute challenge_duration (seconds) — BlindSpotMap impulse dimension
  // reads metadata.challenge_duration; <30s counts as impulse.
  // 🔧 P2-10 fix: guard against invalid created_at (NaN → undefined, not stored)
  let challengeDurationSec: number | undefined;
  if (challenge?.created_at) {
    const createdMs = new Date(challenge.created_at).getTime();
    if (Number.isFinite(createdMs)) {
      challengeDurationSec = Math.round((Date.now() - createdMs) / 1000);
    }
  }

  // Auto-detect platform — BlindSpotMap livestream dimension reads
  // metadata.platform. autoDetectPlatform scans impulse_events + chat messages.
  // Returns string | null; we normalize to string | undefined for JSON storage.
  let detectedPlatform: string | undefined;
  try {
    const raw: string | null = await autoDetectPlatform(
      supabase,
      userId,
      savedAmount,
      itemName, // item name as keyword detection text
    );
    detectedPlatform = raw ?? undefined;
  } catch (platformErr) {
    // Non-critical — log and continue with undefined platform
    logger.warn('[MCP] complete_challenge: autoDetectPlatform failed (non-critical):', platformErr);
  }

  const existingMetadata = (challenge?.metadata as Record<string, unknown> | null) ?? {};
  const updatedMetadata: Record<string, unknown> = {
    ...existingMetadata,
    challenge_duration: challengeDurationSec,
    platform: detectedPlatform,
    completed_at_ts: Date.now(),
  };

  const updatePayload: Record<string, unknown> = { metadata: updatedMetadata };
  if (setUnsettled) {
    updatePayload.deposit_status = 'unsettled';
  }

  // 🔧 P1-1/P1-2 fix: check { error } return value (Supabase doesn't throw
  //    on DB-level errors — only on network/client crashes)
  const { error: metaErr } = await supabase
    .from('active_challenges')
    .update(updatePayload)
    .eq('id', challengeId)
    .eq('user_id', userId);

  if (metaErr) {
    // 🔧 P0-2 fix implication: deposit_status + challenge_duration + platform
    //    are LOST. This means:
    //    - frontend won't prompt user to deposit → savedAmount never enters dream fund
    //    - BlindSpotMap impulse + livestream dimensions have no data for this challenge
    // Log at error level so operators can triage.
    logger.error('[MCP] complete_challenge: metadata UPDATE failed (deposit_status + challenge_duration + platform LOST):', metaErr);
    return false;
  }
  return true;
}
