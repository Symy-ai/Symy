/**
 * Reward calculation helpers for complete_challenge — extracted to eliminate
 * duplication between atomic-RPC path and fallback 5-step path.
 *
 * 🔧 ARCH fix (2026-07-17): extract pure helpers
 *    Old: getBaseRewardsForChallengeType / rollVariableReward / formatRewardTierMessage
 *         were inlined 2x each in complete_challenge.ts (atomic + fallback paths).
 *    New: single source of truth here, unit-testable in isolation.
 *
 * 🔧 ARCH fix (2026-07-18, P1-5): make rollVariableReward DETERMINISTIC
 *    Old: Math.random() — crash after commit loses bonus info on retry.
 *    New: rollVariableReward(seed) takes a seed derived from challengeId+userId,
 *         so the same challenge always rolls the same tier. This means retries
 *         after handler crashes see the same bonus tier — consistent UX.
 *
 * Behavior preservation:
 *   - getBaseRewardsForChallengeType: identical thresholds (boss/standard/quick_pass)
 *   - rollVariableReward: identical probabilities (2% golden / 8% item / 20% card / 70% basic)
 *   - formatRewardTierMessage: identical emoji + wording
 */

export type RewardTier = 'basic' | 'card' | 'item' | 'golden';

export interface BaseRewards {
  tokenReward: number;
  vitalityReward: number;
  xpReward: number;
  /** 'boss_slayer' for boss challenges, null otherwise. */
  badge: string | null;
}

/**
 * Look up base rewards (tokens / vitality / XP / badge) for a given challenge type.
 *
 * Thresholds (unchanged from inline version):
 *   boss:     10 tokens, 10 vitality, 50 XP, boss_slayer badge
 *   standard:  4 tokens,  5 vitality, 25 XP, no badge
 *   quick_pass: 2 tokens, 2 vitality, 10 XP, no badge
 */
export function getBaseRewardsForChallengeType(challengeType: string): BaseRewards {
  if (challengeType === 'boss') {
    return { tokenReward: 10, vitalityReward: 10, xpReward: 50, badge: 'boss_slayer' };
  }
  if (challengeType === 'standard') {
    return { tokenReward: 4, vitalityReward: 5, xpReward: 25, badge: null };
  }
  // quick_pass (and any unknown type — fallback to smallest reward)
  return { tokenReward: 2, vitalityReward: 2, xpReward: 10, badge: null };
}

export interface VariableRewardRoll {
  tier: RewardTier;
  bonusTokens: number;
  bonusVitality: number;
}

/**
 * 🔧 P1-5 fix (2026-07-18): seed-based pseudo-random for determinism.
 *
 * Old behavior: `Math.random()` — non-deterministic. If the handler crashed
 * after `applyBuddyStateDelta` (bonus applied to DB) but before returning the
 * result to AI, the retry's `isDuplicateHealthEvent` check would return
 * "already completed" with no bonus info. The user got a golden bonus in DB
 * but never saw the celebration message.
 *
 * New behavior: callers pass a seed string (challengeId+userId). Same seed
 * → same tier. Retries see the same bonus, so the user sees consistent UX.
 *
 * The seed is hashed via a simple mulberry32 PRNG — same input always
 * produces the same output, but the distribution over distinct inputs is
 * uniform enough to approximate Math.random() for our 4-bucket split.
 *
 * Probabilities (unchanged):
 *   2%  → golden  (+20 tokens, +10 vitality)
 *   8%  → item    (+10 tokens, +5 vitality)
 *  20%  → card    (+5 tokens)
 *  70%  → basic   (no bonus)
 */
export function rollVariableReward(seed?: string): VariableRewardRoll {
  const roll = seed !== undefined ? seededRandom(seed) : Math.random();
  if (roll < 0.02) return { tier: 'golden', bonusTokens: 20, bonusVitality: 10 };
  if (roll < 0.10) return { tier: 'item', bonusTokens: 10, bonusVitality: 5 };
  if (roll < 0.30) return { tier: 'card', bonusTokens: 5, bonusVitality: 0 };
  return { tier: 'basic', bonusTokens: 0, bonusVitality: 0 };
}

/**
 * Mulberry32 PRNG — deterministic 32-bit pseudo-random generator.
 * Returns a float in [0, 1). Same seed string always produces the same
 * sequence, so the first call is stable across retries.
 *
 * Implementation adapted from public-domain mulberry32 — no crypto needed
 * here (this is for game-ification rewards, not security).
 */
function seededRandom(seed: string): number {
  // Simple FNV-1a hash to get a 32-bit seed from the string
  let h = 0x811c9dc5;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  // Mulberry32
  let t = (h += 0x6d2b79f5);
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  // Convert to [0, 1) — `>>> 0` for unsigned
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

/**
 * Format the bonus tier suffix for the AI message.
 * Returns empty string for basic tier (no suffix).
 *
 * Wording is identical to the original inline implementation — do not change
 * without coordinating with PM (these are user-visible strings reflected by AI).
 */
export function formatRewardTierMessage(tier: RewardTier): string {
  switch (tier) {
    case 'golden':
      return ' ✨ GOLDEN GUARD! Bonus +20 tokens, +10 vitality! Symy trumpets for you! 🐘';
    case 'item':
      return ' 🎁 Bonus reward! +10 tokens, +5 vitality.';
    case 'card':
      return ' 🃏 Bonus +5 tokens!';
    case 'basic':
      return '';
  }
}
