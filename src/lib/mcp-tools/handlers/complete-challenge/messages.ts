/**
 * Message builders for complete_challenge — extracted to eliminate 5x
 * duplication of the "already completed" message and 2x duplication of the
 * "challenge completed" message.
 *
 * 🔧 ARCH fix (2026-07-17): extract message builders
 *    Old: same "already completed" message string inlined 5x in
 *         complete_challenge.ts (challenge not found, in-progress lock,
 *         duplicate detected, CAS rowsAffected=0, cas_failed=true).
 *         Same "challenge completed" message inlined 2x (atomic + fallback).
 *    New: single source of truth, easy to update wording.
 *
 * 🔧 P0-3 fix (2026-07-18): normalize failed-path return shape
 *    Old: fallback failed-path had `message` INSIDE `result` (typo),
 *         missed `healthEventCreated`, missed `atomic` field. Atomic
 *         failed-path had all 3. Frontend couldn't reliably detect path.
 *    New: buildFailedReturn helper returns identical shape across both
 *         paths — atomic: true|false, healthEventCreated: boolean,
 *         message: string (top-level only, no duplicate in result).
 *
 * Behavior preservation:
 *   - Wording is identical to original inline strings (do not change without PM approval)
 *   - "already completed" message includes the "respond as if celebrating again"
 *     instruction so AI doesn't say "dedup'd" or other technical slang
 *   - "challenge completed" message includes reward tier suffix (golden/item/card/basic)
 *
 * PM-NEW-2 fix (preserved): never use technical or engineering slang in
 * dedup messages — user must never see "dedup'd" or "CAS failed".
 */

import { formatRewardTierMessage, type RewardTier } from './reward-calc';

export interface AlreadyCompletedMessageInput {
  challengeType: string;
  savedAmount: number;
  /** Optional context for operator logs (not shown to user). */
  context?: 'not_found' | 'lock_hit' | 'duplicate' | 'cas_zero' | 'cas_failed';
}

/**
 * Build the "already completed" message returned when a complete_challenge
 * call is a no-op (challenge already ended, dedup hit, CAS failed, etc.).
 *
 * The message instructs the AI to celebrate again without using technical
 * slang. The optional `context` field is for operator logs only — it does
 * not appear in the message text.
 */
export function buildAlreadyCompletedMessage({
  challengeType,
  savedAmount,
}: AlreadyCompletedMessageInput): string {
  return `This challenge was already completed earlier. The user successfully resisted spending ${challengeType}: saved $${savedAmount}. Since this is a duplicate completion, respond as if celebrating again — e.g. \"Another $${savedAmount} saved!\", \"Double save — $${savedAmount} again!\". NEVER use technical or engineering slang — respond in plain, friendly language.`;
}

export interface CompletionMessageInput {
  challengeType: string;
  savedAmount: number;
  itemName: string | undefined;
  tokenReward: number;
  vitalityReward: number;
  xpReward: number;
  rewardTier: RewardTier;
  /** Whether this used the atomic RPC (controls "deposit pending" suffix wording). */
  isAtomicPath: boolean;
}

/**
 * Build the "challenge completed" success message returned to the AI.
 *
 * Includes reward tier suffix (golden/item/card/basic) and a deposit-pending
 * hint for the atomic path (passed challenges only — the user can now
 * choose to deposit the saved $X into their Dream Fund).
 */
export function buildCompletionMessage({
  challengeType,
  savedAmount,
  itemName,
  tokenReward,
  vitalityReward,
  xpReward,
  rewardTier,
  isAtomicPath,
}: CompletionMessageInput): string {
  const itemSuffix = itemName ? ` (${itemName})` : '';
  const badgeSuffix = challengeType === 'boss' ? ' Badge: boss_slayer!' : '';
  const tierSuffix = formatRewardTierMessage(rewardTier);
  const depositHint = isAtomicPath
    ? ` The user can now choose to deposit the $${savedAmount} into their Dream Fund.`
    : '';

  return `Challenge completed! ${challengeType}: saved $${savedAmount}${itemSuffix}, earned ${tokenReward} tokens, +${vitalityReward} vitality, +${xpReward} XP.${badgeSuffix}${tierSuffix}${depositHint}`;
}

/**
 * Build the "challenge failed" message returned when status='failed'
 * (user bought the item).
 *
 * The AI is instructed to call record_impulse next — this is the canonical
 * sequence for the "I choose to buy" path.
 */
export function buildFailureMessage(itemName: string | undefined, savedAmount: number): string {
  const itemDisplay = itemName || 'item';
  return `Challenge failed: user bought ${itemDisplay} ($${savedAmount}). No rewards applied. Please call record_impulse to record this induced purchase.`;
}

// ============================================================
// 🔧 P0-3 fix (2026-07-18): Normalized return-shape builders
// ============================================================

export interface FailedReturnInput {
  toolCallId: string;
  challengeId: string | undefined;
  challengeType: string;
  savedAmount: number;
  itemName: string | undefined;
  /** Whether the challenge_failed health_event was created successfully. */
  healthEventCreated: boolean;
  /** Whether this used the atomic RPC path (true) or fallback 5-step (false). */
  atomic: boolean;
}

/**
 * Build the normalized failed-path return object.
 *
 * 🔧 P0-3 fix: ensures both atomic and fallback paths return the SAME shape.
 *    Old drift: fallback had `message` inside `result` (typo), missed
 *    `healthEventCreated`, missed `atomic`. Frontend couldn't reliably
 *    detect which path executed.
 *    New: single source of truth. `message` only at top level (not in result).
 */
export function buildFailedReturn({
  toolCallId,
  challengeId,
  challengeType,
  savedAmount,
  itemName,
  healthEventCreated,
  atomic,
}: FailedReturnInput) {
  return {
    toolCallId,
    name: 'complete_challenge' as const,
    success: true,
    result: {
      challengeId,
      challengeType,
      savedAmount,
      itemName,
      status: 'failed' as const,
      rewardApplied: false,
      // 🔧 Issue 5 fix (adv-review): real success flag, not hardcoded true
      healthEventCreated,
      atomic,
    },
    message: buildFailureMessage(itemName, savedAmount),
  };
}
