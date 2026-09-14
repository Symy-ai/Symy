/**
 * Companion-RPC side-effect helpers for complete_challenge — extracted to
 * eliminate 3x duplication of the same `Promise.all([fireReplenishDailyNeed,
 * fireBumpIntimacy, fireAddProactiveMessageWithVariety])` call.
 *
 * 🔧 ARCH fix (2026-07-17): extract side-effect helper
 *    Old: same Promise.all block inlined 3x in complete_challenge.ts
 *         (atomic-failed path, atomic-completed path, fallback path).
 *    New: single source of truth, callers pass 'passed' | 'failed'.
 *
 * 🔧 P0-5 fix (2026-07-18): wrap in try/catch — non-blocking on failure
 *    Old: bare `await Promise.all([...])` — if ANY of the 3 RPCs rejected,
 *         Promise.all rejected, handler threw 500 EVEN THOUGH the challenge
 *         was already committed (CAS + applyBuddyStateDelta + health_event).
 *         AI retried → hit dedup → returned "already completed" → user saw
 *         no reward confirmation.
 *    New: try/catch inside helper logs failure but doesn't throw. Challenge
 *         completion succeeds even if companion RPCs are down.
 *
 * Behavior preservation:
 *   - 'passed' path: clarity +20, intimacy +3, message key 'challenge_completed'
 *   - 'failed' path: clarity +20, intimacy +1, message key 'challenge_failed'
 *   - All three RPCs run in parallel (Promise.all) — same as before
 *   - Caller awaits (Vercel serverless kills fire-and-forget)
 *
 * The reason we catch errors HERE (not in caller): the caller's outer
 * try/finally only releases the lock. If companion RPCs threw, the error
 * would propagate as unhandled rejection. By catching here, we ensure the
 * challenge completion succeeds even when companion services are degraded.
 */

import {
  fireReplenishDailyNeed,
  fireBumpIntimacy,
  fireAddProactiveMessageWithVariety,
} from '@/lib/companion-rpc';
import { logger } from '@/lib/logger';

export type CompletionStatus = 'passed' | 'failed';

/**
 * Fire companion side-effects after a challenge completion.
 *
 * @param userId - User UUID
 * @param status - 'passed' (user resisted) | 'failed' (user bought)
 *
 * Caller MUST await — fire-and-forget is killed by Vercel serverless.
 *
 * 🔧 P0-5 fix: NEVER throws. If companion RPCs fail, logs warning and returns.
 *    Challenge completion is already committed at this point — companion
 *    effects are best-effort enrichment, not critical to the transaction.
 */
export async function fireCompletionCompanionEffects(
  userId: string,
  status: CompletionStatus,
): Promise<void> {
  // 🔧 ARCH fix (2026-07-21): Use Promise.allSettled (not Promise.all) — if one RPC fails,
  //    the others should still complete. All three are independent side effects.
  //    Old: Promise.all + try/catch — if one RPC failed, the other two were aborted.
  //    New: Promise.allSettled — all three run to completion, failures are logged individually.
  if (status === 'failed') {
    // Failed: user saw the cost but still chose to buy. Still counts as
    // "seeing" → replenish clarity. Intimacy +1 (less than passed's +3
    // because the user didn't follow through, but still engaged).
    // Message variety: 'challenge_failed' trigger — acceptance, not judgment.
    const results = await Promise.allSettled([
      fireReplenishDailyNeed(userId, 'clarity', 20),
      fireBumpIntimacy(userId, 1),
      fireAddProactiveMessageWithVariety(userId, 'challenge_failed'),
    ]);
    logSettledFailures(results, 'failed');
    return;
  }
  // Passed: user resisted. clarity +20, intimacy +3 (full success interaction).
  // Message variety: 'challenge_completed' trigger.
  const results = await Promise.allSettled([
    fireReplenishDailyNeed(userId, 'clarity', 20),
    fireBumpIntimacy(userId, 3),
    fireAddProactiveMessageWithVariety(userId, 'challenge_completed'),
  ]);
  logSettledFailures(results, 'passed');
}

/** Log individual RPC failures from Promise.allSettled results (non-blocking). */
function logSettledFailures(
  results: PromiseSettledResult<unknown>[],
  status: CompletionStatus,
): void {
  const failed = results.filter((r): r is PromiseRejectedResult => r.status === 'rejected');
  if (failed.length > 0) {
    logger.warn(
      `[MCP] complete_challenge: ${failed.length}/${results.length} companion RPCs failed (non-blocking — challenge already committed, status=${status}):`,
      failed.map(r => r.reason),
    );
  }
}
