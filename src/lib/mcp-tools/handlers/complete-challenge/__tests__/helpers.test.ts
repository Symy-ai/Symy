/**
 * Unit tests for complete-challenge pure helpers.
 *
 * Coverage:
 *   - getBaseRewardsForChallengeType: 3 challenge types + unknown fallback
 *   - rollVariableReward: 4 tiers via seeded values + Math.random fallback
 *   - formatRewardTierMessage: 4 tier suffixes
 *   - buildAlreadyCompletedMessage: wording preservation (PM-NEW-2 no-slang rule)
 *   - buildCompletionMessage: atomic vs fallback path, with/without itemName, boss badge
 *   - buildFailureMessage: with/without itemName
 *   - buildFailedReturn: P0-3 fix — normalized shape across paths
 *   - validateChallengeId: P1-6 fix — UUID validation
 *   - normalizeStatus: P1-7 fix — case-insensitive
 *   - validateSavedAmount: P2-13 fix — both modes
 *   - normalizeLocale: P2-12 fix — locale variants
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  getBaseRewardsForChallengeType,
  rollVariableReward,
  formatRewardTierMessage,
  buildAlreadyCompletedMessage,
  buildCompletionMessage,
  buildFailureMessage,
  buildFailedReturn,
  validateChallengeId,
  normalizeStatus,
  validateSavedAmount,
  normalizeLocale,
} from '../index';

describe('getBaseRewardsForChallengeType', () => {
  it('returns boss rewards for boss type', () => {
    const r = getBaseRewardsForChallengeType('boss');
    expect(r).toEqual({ tokenReward: 10, vitalityReward: 10, xpReward: 50, badge: 'boss_slayer' });
  });

  it('returns standard rewards for standard type', () => {
    const r = getBaseRewardsForChallengeType('standard');
    expect(r).toEqual({ tokenReward: 4, vitalityReward: 5, xpReward: 25, badge: null });
  });

  it('returns quick_pass rewards for quick_pass type', () => {
    const r = getBaseRewardsForChallengeType('quick_pass');
    expect(r).toEqual({ tokenReward: 2, vitalityReward: 2, xpReward: 10, badge: null });
  });

  it('returns quick_pass rewards (smallest) for unknown type as fail-safe', () => {
    const r = getBaseRewardsForChallengeType('unknown_type');
    expect(r).toEqual({ tokenReward: 2, vitalityReward: 2, xpReward: 10, badge: null });
  });
});

describe('rollVariableReward', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns golden tier when Math.random < 0.02', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.019);
    const r = rollVariableReward();
    expect(r).toEqual({ tier: 'golden', bonusTokens: 20, bonusVitality: 10 });
  });

  it('returns golden tier when Math.random === 0 (edge case)', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const r = rollVariableReward();
    expect(r.tier).toBe('golden');
  });

  it('returns item tier when 0.02 <= Math.random < 0.10', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.05);
    const r = rollVariableReward();
    expect(r).toEqual({ tier: 'item', bonusTokens: 10, bonusVitality: 5 });
  });

  it('returns item tier when Math.random === 0.02 (boundary inclusive)', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.02);
    const r = rollVariableReward();
    expect(r.tier).toBe('item');
  });

  it('returns card tier when 0.10 <= Math.random < 0.30', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.20);
    const r = rollVariableReward();
    expect(r).toEqual({ tier: 'card', bonusTokens: 5, bonusVitality: 0 });
  });

  it('returns card tier when Math.random === 0.10 (boundary inclusive)', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.10);
    const r = rollVariableReward();
    expect(r.tier).toBe('card');
  });

  it('returns basic tier when Math.random >= 0.30', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.50);
    const r = rollVariableReward();
    expect(r).toEqual({ tier: 'basic', bonusTokens: 0, bonusVitality: 0 });
  });

  it('returns basic tier when Math.random === 0.99 (edge case)', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.99);
    const r = rollVariableReward();
    expect(r.tier).toBe('basic');
  });

  // 🔧 P1-5 fix: deterministic when seeded
  it('🔧 P1-5: returns the SAME tier for the SAME seed (deterministic)', () => {
    const r1 = rollVariableReward('challenge-uuid-1:user-uuid-1');
    const r2 = rollVariableReward('challenge-uuid-1:user-uuid-1');
    const r3 = rollVariableReward('challenge-uuid-1:user-uuid-1');
    expect(r1).toEqual(r2);
    expect(r2).toEqual(r3);
  });

  it('🔧 P1-5: different seeds usually produce different tiers (uniform distribution)', () => {
    // Run 1000 different seeds — should see at least 3 distinct tiers
    // (basic + at least 2 of golden/item/card) to confirm the seed varies output
    const tiers = new Set<string>();
    for (let i = 0; i < 1000; i++) {
      tiers.add(rollVariableReward(`seed-${i}`).tier);
    }
    expect(tiers.size).toBeGreaterThanOrEqual(3);
    expect(tiers.has('basic')).toBe(true); // basic is 70%, should always appear
  });

  it('🔧 P1-5: seeded distribution approximates Math.random distribution', () => {
    // Statistical sanity check — 10000 seeds
    const counts = { golden: 0, item: 0, card: 0, basic: 0 };
    const N = 10000;
    for (let i = 0; i < N; i++) {
      counts[rollVariableReward(`seed-${i}`).tier]++;
    }
    // Allow tolerance — seeded PRNG may not perfectly match Math.random
    expect(counts.golden / N).toBeGreaterThan(0.005);
    expect(counts.golden / N).toBeLessThan(0.05);
    expect(counts.basic / N).toBeGreaterThan(0.60);
    expect(counts.basic / N).toBeLessThan(0.80);
  });
});

describe('formatRewardTierMessage', () => {
  it('returns golden suffix with Symy celebration wording', () => {
    const msg = formatRewardTierMessage('golden');
    expect(msg).toContain('GOLDEN GUARD');
    expect(msg).toContain('+20 tokens');
    expect(msg).toContain('+10 vitality');
    expect(msg).toContain('Symy trumpets for you');
  });

  it('returns item suffix with gift emoji', () => {
    const msg = formatRewardTierMessage('item');
    expect(msg).toContain('🎁');
    expect(msg).toContain('+10 tokens');
    expect(msg).toContain('+5 vitality');
  });

  it('returns card suffix with card emoji', () => {
    const msg = formatRewardTierMessage('card');
    expect(msg).toContain('🃏');
    expect(msg).toContain('+5 tokens');
  });

  it('returns empty string for basic tier', () => {
    const msg = formatRewardTierMessage('basic');
    expect(msg).toBe('');
  });
});

describe('buildAlreadyCompletedMessage', () => {
  it('includes challenge type and saved amount', () => {
    const msg = buildAlreadyCompletedMessage({ challengeType: 'standard', savedAmount: 100 });
    expect(msg).toContain('standard');
    expect(msg).toContain('$100');
  });

  it('instructs AI to celebrate again (PM-NEW-2)', () => {
    const msg = buildAlreadyCompletedMessage({ challengeType: 'standard', savedAmount: 100 });
    expect(msg).toContain('respond as if celebrating again');
    expect(msg).toContain('Another $100 saved!');
  });

  it('forbids technical slang (PM-NEW-2)', () => {
    const msg = buildAlreadyCompletedMessage({ challengeType: 'standard', savedAmount: 100 });
    expect(msg).toContain('NEVER use technical or engineering slang');
  });

  it('does not leak context field into message text', () => {
    const msg = buildAlreadyCompletedMessage({
      challengeType: 'standard',
      savedAmount: 100,
      context: 'cas_failed',
    });
    expect(msg).not.toContain('cas_failed');
    expect(msg).not.toContain('context');
  });
});

describe('buildCompletionMessage', () => {
  it('includes core reward info', () => {
    const msg = buildCompletionMessage({
      challengeType: 'standard',
      savedAmount: 50,
      itemName: 'Wireless earbuds',
      tokenReward: 4,
      vitalityReward: 5,
      xpReward: 25,
      rewardTier: 'basic',
      isAtomicPath: true,
    });
    expect(msg).toContain('standard');
    expect(msg).toContain('$50');
    expect(msg).toContain('(Wireless earbuds)');
    expect(msg).toContain('4 tokens');
    expect(msg).toContain('+5 vitality');
    expect(msg).toContain('+25 XP');
  });

  it('includes boss badge suffix for boss challenges', () => {
    const msg = buildCompletionMessage({
      challengeType: 'boss',
      savedAmount: 500,
      itemName: 'iPhone',
      tokenReward: 10,
      vitalityReward: 10,
      xpReward: 50,
      rewardTier: 'basic',
      isAtomicPath: true,
    });
    expect(msg).toContain('Badge: boss_slayer');
  });

  it('omits badge suffix for non-boss challenges', () => {
    const msg = buildCompletionMessage({
      challengeType: 'standard',
      savedAmount: 50,
      itemName: undefined,
      tokenReward: 4,
      vitalityReward: 5,
      xpReward: 25,
      rewardTier: 'basic',
      isAtomicPath: true,
    });
    expect(msg).not.toContain('boss_slayer');
    expect(msg).not.toContain('(undefined)');
  });

  it('includes deposit hint for atomic path', () => {
    const msg = buildCompletionMessage({
      challengeType: 'standard',
      savedAmount: 50,
      itemName: undefined,
      tokenReward: 4,
      vitalityReward: 5,
      xpReward: 25,
      rewardTier: 'basic',
      isAtomicPath: true,
    });
    expect(msg).toContain('deposit the $50');
  });

  it('omits deposit hint for fallback path', () => {
    const msg = buildCompletionMessage({
      challengeType: 'standard',
      savedAmount: 50,
      itemName: undefined,
      tokenReward: 4,
      vitalityReward: 5,
      xpReward: 25,
      rewardTier: 'basic',
      isAtomicPath: false,
    });
    expect(msg).not.toContain('deposit');
  });

  it('includes tier suffix for non-basic tiers', () => {
    const msg = buildCompletionMessage({
      challengeType: 'standard',
      savedAmount: 50,
      itemName: undefined,
      tokenReward: 4,
      vitalityReward: 5,
      xpReward: 25,
      rewardTier: 'golden',
      isAtomicPath: true,
    });
    expect(msg).toContain('GOLDEN GUARD');
  });
});

describe('buildFailureMessage', () => {
  it('includes item name when provided', () => {
    const msg = buildFailureMessage('Coffee machine', 89);
    expect(msg).toContain('Coffee machine');
    expect(msg).toContain('$89');
  });

  it('falls back to "item" when itemName is undefined', () => {
    const msg = buildFailureMessage(undefined, 89);
    expect(msg).toContain('item');
    expect(msg).toContain('$89');
    expect(msg).not.toContain('undefined');
  });

  it('instructs AI to call record_impulse', () => {
    const msg = buildFailureMessage('Coffee machine', 89);
    expect(msg).toContain('record_impulse');
    expect(msg).toContain('No rewards applied');
  });
});

// ============================================================
// 🔧 P0-3 fix: normalized failed return shape
// ============================================================

describe('buildFailedReturn (P0-3 fix: normalized shape)', () => {
  it('returns identical shape for atomic and fallback paths', () => {
    const atomicResult = buildFailedReturn({
      toolCallId: 'tc-1',
      challengeId: 'ch-1',
      challengeType: 'standard',
      savedAmount: 50,
      itemName: 'Earbuds',
      healthEventCreated: true,
      atomic: true,
    });
    const fallbackResult = buildFailedReturn({
      toolCallId: 'tc-2',
      challengeId: 'ch-2',
      challengeType: 'standard',
      savedAmount: 50,
      itemName: 'Earbuds',
      healthEventCreated: true,
      atomic: false,
    });
    // Same shape — only toolCallId, challengeId, atomic differ
    expect(Object.keys(atomicResult).sort()).toEqual(Object.keys(fallbackResult).sort());
    expect(Object.keys(atomicResult.result).sort()).toEqual(Object.keys(fallbackResult.result).sort());
  });

  it('does NOT have `message` inside `result` (P0-3 typo fix)', () => {
    const result = buildFailedReturn({
      toolCallId: 'tc-1',
      challengeId: 'ch-1',
      challengeType: 'standard',
      savedAmount: 50,
      itemName: 'Earbuds',
      healthEventCreated: true,
      atomic: true,
    });
    // `message` must NOT be a key in `result` — only at top level
    expect('message' in result.result).toBe(false);
    expect(typeof result.message).toBe('string');
  });

  it('includes healthEventCreated flag (P0-3 missing field fix)', () => {
    const success = buildFailedReturn({
      toolCallId: 'tc-1', challengeId: 'ch-1', challengeType: 'standard',
      savedAmount: 50, itemName: 'X', healthEventCreated: true, atomic: true,
    });
    const failure = buildFailedReturn({
      toolCallId: 'tc-1', challengeId: 'ch-1', challengeType: 'standard',
      savedAmount: 50, itemName: 'X', healthEventCreated: false, atomic: true,
    });
    expect(success.result.healthEventCreated).toBe(true);
    expect(failure.result.healthEventCreated).toBe(false);
  });

  it('includes atomic flag (P0-3 missing field fix)', () => {
    const atomic = buildFailedReturn({
      toolCallId: 'tc-1', challengeId: 'ch-1', challengeType: 'standard',
      savedAmount: 50, itemName: 'X', healthEventCreated: true, atomic: true,
    });
    const fallback = buildFailedReturn({
      toolCallId: 'tc-1', challengeId: 'ch-1', challengeType: 'standard',
      savedAmount: 50, itemName: 'X', healthEventCreated: true, atomic: false,
    });
    expect(atomic.result.atomic).toBe(true);
    expect(fallback.result.atomic).toBe(false);
  });

  it('returns success: true (failed status, but tool call succeeded)', () => {
    const result = buildFailedReturn({
      toolCallId: 'tc-1', challengeId: 'ch-1', challengeType: 'standard',
      savedAmount: 50, itemName: 'X', healthEventCreated: true, atomic: true,
    });
    expect(result.success).toBe(true);
    expect(result.result.status).toBe('failed');
    expect(result.result.rewardApplied).toBe(false);
  });
});

// ============================================================
// 🔧 P1-6 fix: validateChallengeId UUID validation
// ============================================================

describe('validateChallengeId (P1-6 fix: UUID validation)', () => {
  it('returns undefined for undefined input', () => {
    expect(validateChallengeId(undefined)).toBeUndefined();
  });

  it('returns undefined for null input', () => {
    expect(validateChallengeId(null)).toBeUndefined();
  });

  it('returns undefined for empty string', () => {
    expect(validateChallengeId('')).toBeUndefined();
  });

  it('returns the string for valid UUID v4', () => {
    const uuid = 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d';
    expect(validateChallengeId(uuid)).toBe(uuid);
  });

  it('returns the string for valid UUID (any hex in version/variant positions)', () => {
    // 🔧 ARCH fix (2026-07-18): relaxed regex accepts any hex digit
    const uuid = 'a1b2c3d4-e5f6-5a7b-9c9d-0e1f2a3b4c5d';
    expect(validateChallengeId(uuid)).toBe(uuid);
  });

  it('🔧 ARCH fix: accepts test fixture format (all a-f hex)', () => {
    const uuid = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
    expect(validateChallengeId(uuid)).toBe(uuid);
  });

  it('throws Error for plain number string (12345)', () => {
    expect(() => validateChallengeId('12345')).toThrowError(/UUID/);
  });

  it('throws Error for object stringified as [object Object]', () => {
    expect(() => validateChallengeId(String({ id: 'x' }))).toThrowError(/UUID/);
  });

  it('throws Error for UUID with wrong segment count', () => {
    expect(() => validateChallengeId('a1b2c3d4-e5f6-4a7b-8c9d')).toThrowError(/UUID/);
  });

  it('throws Error for UUID with invalid hex chars', () => {
    expect(() => validateChallengeId('x1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d')).toThrowError(/UUID/);
  });

  it('accepts string input that is a valid UUID', () => {
    const uuid = '12345678-1234-4234-8234-123456789012';
    expect(validateChallengeId(uuid)).toBe(uuid);
  });

  it('accepts non-string input that stringifies to a valid UUID', () => {
    // Edge case: if AI passes a UUID as a non-string, String() conversion works
    const uuid = '12345678-1234-4234-8234-123456789012';
    expect(validateChallengeId({ toString: () => uuid } as unknown)).toBe(uuid);
  });
});

// ============================================================
// 🔧 P1-7 fix: normalizeStatus case-insensitive
// ============================================================

describe('normalizeStatus (P1-7 fix: case-insensitive)', () => {
  it('returns "passed" for undefined', () => {
    expect(normalizeStatus(undefined)).toBe('passed');
  });

  it('returns "passed" for non-string input', () => {
    expect(normalizeStatus(123)).toBe('passed');
    expect(normalizeStatus({})).toBe('passed');
    expect(normalizeStatus(null)).toBe('passed');
  });

  it('returns "failed" for lowercase "failed"', () => {
    expect(normalizeStatus('failed')).toBe('failed');
  });

  it('🔧 P1-7: returns "failed" for "Failed" (capital)', () => {
    expect(normalizeStatus('Failed')).toBe('failed');
  });

  it('🔧 P1-7: returns "failed" for "FAILED" (all caps)', () => {
    expect(normalizeStatus('FAILED')).toBe('failed');
  });

  it('🔧 P1-7: returns "failed" for "failed " (trailing space)', () => {
    expect(normalizeStatus('failed ')).toBe('failed');
  });

  it('🔧 P1-7: returns "failed" for "  failed  " (leading+trailing spaces)', () => {
    expect(normalizeStatus('  failed  ')).toBe('failed');
  });

  it('returns "passed" for "passed"', () => {
    expect(normalizeStatus('passed')).toBe('passed');
  });

  it('returns "passed" for "Passed"', () => {
    expect(normalizeStatus('Passed')).toBe('passed');
  });

  it('returns "passed" for unknown strings (default safe path)', () => {
    expect(normalizeStatus('success')).toBe('passed');
    expect(normalizeStatus('complete')).toBe('passed');
    expect(normalizeStatus('won')).toBe('passed');
  });
});

// ============================================================
// 🔧 P2-13 fix: validateSavedAmount for both modes
// ============================================================

describe('validateSavedAmount (P2-13 fix: validates in both modes)', () => {
  it('returns the number for positive number input', () => {
    expect(validateSavedAmount(50, 'args')).toBe(50);
    expect(validateSavedAmount(0.01, 'args')).toBe(0.01);
  });

  it('returns the number for numeric string input', () => {
    expect(validateSavedAmount('50', 'args')).toBe(50);
    expect(validateSavedAmount('50.5', 'args')).toBe(50.5);
  });

  it('throws Error for 0', () => {
    expect(() => validateSavedAmount(0, 'args')).toThrowError(/must be > 0/);
  });

  it('throws Error for negative numbers', () => {
    expect(() => validateSavedAmount(-10, 'args')).toThrowError(/must be > 0/);
  });

  it('throws Error for NaN', () => {
    expect(() => validateSavedAmount(NaN, 'args')).toThrowError(/must be > 0/);
  });

  it('throws Error for Infinity', () => {
    expect(() => validateSavedAmount(Infinity, 'args')).toThrowError(/must be > 0/);
  });

  it('throws Error for non-numeric string', () => {
    expect(() => validateSavedAmount('abc', 'args')).toThrowError(/must be > 0/);
  });

  it('throws Error for null', () => {
    expect(() => validateSavedAmount(null, 'db')).toThrowError(/must be > 0/);
  });

  it('throws Error for undefined', () => {
    expect(() => validateSavedAmount(undefined, 'db')).toThrowError(/must be > 0/);
  });

  it('includes source in error message (db vs args)', () => {
    try {
      validateSavedAmount(-5, 'db');
      expect.fail('Should have thrown');
    } catch (e) {
      expect((e as Error).message).toContain('from db');
    }
    try {
      validateSavedAmount(-5, 'args');
      expect.fail('Should have thrown');
    } catch (e) {
      expect((e as Error).message).toContain('from args');
    }
  });
});

// ============================================================
// 🔧 P2-12 fix: normalizeLocale accepts variants
// ============================================================

describe('normalizeLocale (P2-12 fix: accepts locale variants)', () => {
  it('returns undefined for undefined', () => {
    expect(normalizeLocale(undefined)).toBeUndefined();
  });

  it('returns undefined for non-string', () => {
    expect(normalizeLocale(123)).toBeUndefined();
    expect(normalizeLocale({})).toBeUndefined();
  });

  it('returns "en" for "en"', () => {
    expect(normalizeLocale('en')).toBe('en');
  });

  it('returns "zh" for "zh"', () => {
    expect(normalizeLocale('zh')).toBe('zh');
  });

  it('🔧 P2-12: returns "en" for "en-US"', () => {
    expect(normalizeLocale('en-US')).toBe('en');
  });

  it('🔧 P2-12: returns "zh" for "zh-CN"', () => {
    expect(normalizeLocale('zh-CN')).toBe('zh');
  });

  it('🔧 P2-12: returns "zh" for "zh-Hans"', () => {
    expect(normalizeLocale('zh-Hans')).toBe('zh');
  });

  it('🔧 P2-12: returns "en" for "EN" (uppercase)', () => {
    expect(normalizeLocale('EN')).toBe('en');
  });

  it('🔧 P2-12: returns "en" for "en-US-u-ca-gregory" (BCP 47)', () => {
    expect(normalizeLocale('en-US-u-ca-gregory')).toBe('en');
  });

  it('returns undefined for unknown language', () => {
    expect(normalizeLocale('fr')).toBeUndefined();
    expect(normalizeLocale('ja')).toBeUndefined();
    expect(normalizeLocale('es-ES')).toBeUndefined();
  });

  it('returns undefined for empty string', () => {
    expect(normalizeLocale('')).toBeUndefined();
  });
});
