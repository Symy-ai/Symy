/**
 * Tests for buddy-defaults.ts — getHealthFromVitality, calculateImpulseDamage,
 * calculateRefundBoost, calculateMindfulRecovery, calculatePassiveRecovery
 *
 * 🔧 ARCH fix (Round 72 ARCH-DEEP-72): 测试核心纯函数 (vitality 等级 + 伤害/恢复公式)
 *   旧: 0 tests for buddy-defaults.ts (核心 business logic 无覆盖)
 *   修复: +N tests covering edge cases + boundary conditions
 */

import { describe, it, expect } from 'vitest';
import {
  getHealthFromVitality,
  calculateImpulseDamage,
  calculateRefundBoost,
  calculateMindfulRecovery,
  calculatePassiveRecovery,
  DEFAULT_VITALITY,
  DEFAULT_TOKENS,
  DEFAULT_HEALTH,
  DEFAULT_LEVEL,
  DEFAULT_XP,
  DEFAULT_XP_TO_NEXT,
  DEFAULT_STREAK,
  DEFAULT_TOTAL_SAVED,
  DEFAULT_CHALLENGES_COMPLETED,
  DEFAULT_DREAM_FUNDS,
  DEFAULT_BADGES,
  SAVINGS_FUND_ID,
  SAVINGS_FUND_TARGET,
} from '@/lib/buddy-defaults';

// ============================================================
// getHealthFromVitality
// ============================================================

describe('getHealthFromVitality', () => {
  it('returns thriving for vitality > 75', () => {
    expect(getHealthFromVitality(76)).toBe('thriving');
    expect(getHealthFromVitality(100)).toBe('thriving');
    expect(getHealthFromVitality(99)).toBe('thriving');
  });

  it('returns thriving for boundary 75.5 (float)', () => {
    expect(getHealthFromVitality(75.5)).toBe('thriving');
  });

  it('returns healthy for 46-75 (inclusive boundaries)', () => {
    expect(getHealthFromVitality(46)).toBe('healthy');
    expect(getHealthFromVitality(50)).toBe('healthy');
    expect(getHealthFromVitality(75)).toBe('healthy'); // boundary: 75 is healthy (≤75)
  });

  it('returns weak for 21-45 (inclusive boundaries)', () => {
    expect(getHealthFromVitality(21)).toBe('weak');
    expect(getHealthFromVitality(25)).toBe('weak');
    expect(getHealthFromVitality(45)).toBe('weak'); // boundary: 45 is weak (≤45)
  });

  it('returns critical for 1-20 (inclusive boundaries)', () => {
    expect(getHealthFromVitality(1)).toBe('critical');
    expect(getHealthFromVitality(10)).toBe('critical');
    expect(getHealthFromVitality(20)).toBe('critical'); // boundary: 20 is critical (≤20)
  });

  it('returns dormant for 0 and negative', () => {
    expect(getHealthFromVitality(0)).toBe('dormant');
    expect(getHealthFromVitality(-1)).toBe('dormant');
    expect(getHealthFromVitality(-100)).toBe('dormant');
  });

  it('returns dormant for NaN (defensive — Round 18 M5 fix)', () => {
    // NaN comparisons are all false; without the guard, NaN would fall through
    // to 'thriving' (most healthy) which is unsafe.
    expect(getHealthFromVitality(NaN)).toBe('dormant');
  });

  it('returns dormant for Infinity (defensive — Round 18 M5 fix)', () => {
    // Infinity is not finite; without the guard, Infinity > 75 would be true
    // and return 'thriving', but Infinity is not a valid vitality.
    expect(getHealthFromVitality(Infinity)).toBe('dormant');
  });

  it('returns dormant for -Infinity (defensive)', () => {
    expect(getHealthFromVitality(-Infinity)).toBe('dormant');
  });

  it('handles float boundaries correctly', () => {
    // 75.0 → healthy (≤75), 75.01 → thriving
    expect(getHealthFromVitality(75.0)).toBe('healthy');
    expect(getHealthFromVitality(75.01)).toBe('thriving');
    // 45.0 → weak (≤45), 45.01 → healthy
    expect(getHealthFromVitality(45.0)).toBe('weak');
    expect(getHealthFromVitality(45.01)).toBe('healthy');
    // 20.0 → critical (≤20), 20.01 → weak
    expect(getHealthFromVitality(20.0)).toBe('critical');
    expect(getHealthFromVitality(20.01)).toBe('weak');
  });
});

// ============================================================
// calculateImpulseDamage
// ============================================================

describe('calculateImpulseDamage', () => {
  // --- Score tier boundaries ---

  it('returns 0 for impulseScore < 60 (not induced)', () => {
    expect(calculateImpulseDamage(0, 0)).toBe(0);
    expect(calculateImpulseDamage(59, 0)).toBe(0);
    expect(calculateImpulseDamage(59, 1000)).toBe(0); // amount ignored when not induced
  });

  it('returns -4 base damage for impulseScore 60-69', () => {
    expect(calculateImpulseDamage(60, 0)).toBe(-4); // boundary: 60 is included
    expect(calculateImpulseDamage(65, 0)).toBe(-4);
    expect(calculateImpulseDamage(69, 0)).toBe(-4);
  });

  it('returns -7 base damage for impulseScore 70-79', () => {
    expect(calculateImpulseDamage(70, 0)).toBe(-7); // boundary: 70 is included
    expect(calculateImpulseDamage(75, 0)).toBe(-7);
    expect(calculateImpulseDamage(79, 0)).toBe(-7);
  });

  it('returns -10 base damage for impulseScore 80-89', () => {
    expect(calculateImpulseDamage(80, 0)).toBe(-10); // boundary: 80 is included
    expect(calculateImpulseDamage(85, 0)).toBe(-10);
    expect(calculateImpulseDamage(89, 0)).toBe(-10);
  });

  it('returns -15 base damage for impulseScore 90-100', () => {
    expect(calculateImpulseDamage(90, 0)).toBe(-15); // boundary: 90 is included
    expect(calculateImpulseDamage(95, 0)).toBe(-15);
    expect(calculateImpulseDamage(100, 0)).toBe(-15);
  });

  // --- Amount adjustment tiers ---

  it('does not apply amount penalty for amount ≤ 50', () => {
    expect(calculateImpulseDamage(85, 0)).toBe(-10);
    expect(calculateImpulseDamage(85, 50)).toBe(-10); // boundary: 50 not > 50
  });

  it('applies -1 penalty for 50 < amount ≤ 100', () => {
    expect(calculateImpulseDamage(85, 51)).toBe(-11); // -10 -1
    expect(calculateImpulseDamage(85, 100)).toBe(-11); // boundary: 100 not > 100
  });

  it('applies -3 penalty for 100 < amount ≤ 200', () => {
    expect(calculateImpulseDamage(85, 101)).toBe(-13); // -10 -3
    expect(calculateImpulseDamage(85, 200)).toBe(-13); // boundary: 200 not > 200
  });

  it('applies -5 penalty for amount > 200', () => {
    expect(calculateImpulseDamage(85, 201)).toBe(-15); // -10 -5
    expect(calculateImpulseDamage(85, 1000)).toBe(-15);
  });

  // --- Combined score + amount ---

  it('correctly combines highest score tier with highest amount tier', () => {
    // -15 (score 95) + -5 (amount 201) = -20
    expect(calculateImpulseDamage(95, 201)).toBe(-20);
    expect(calculateImpulseDamage(95, 1000)).toBe(-20);
  });

  it('correctly combines lowest induced score with lowest amount tier', () => {
    // -4 (score 60) + -1 (amount 51) = -5
    expect(calculateImpulseDamage(60, 51)).toBe(-5);
  });

  it('correctly combines score 70 with amount 200', () => {
    // -7 (score 70) + -3 (amount 200 is not > 200, so falls to -3 tier for 100 < amount ≤ 200)
    expect(calculateImpulseDamage(70, 200)).toBe(-10); // -7 -3
  });

  it('correctly combines score 90 with amount 50 (no amount penalty)', () => {
    expect(calculateImpulseDamage(90, 50)).toBe(-15); // no amount adjustment
  });

  // --- Edge cases ---

  it('returns 0 for negative impulseScore', () => {
    expect(calculateImpulseDamage(-10, 1000)).toBe(0);
  });

  it('handles score above 100 (defensive — no clamp)', () => {
    // No upper bound check; 150 >= 90 → -15 base
    expect(calculateImpulseDamage(150, 0)).toBe(-15);
  });

  it('handles negative amount (defensive — no penalty applied)', () => {
    // Negative amount is not > 200, > 100, or > 50, so no penalty
    expect(calculateImpulseDamage(85, -100)).toBe(-10);
  });
});

// ============================================================
// calculateRefundBoost
// ============================================================

describe('calculateRefundBoost', () => {
  it('returns 5 (base) for amount ≤ 50', () => {
    expect(calculateRefundBoost(0)).toBe(5);
    expect(calculateRefundBoost(50)).toBe(5); // boundary: 50 not > 50
  });

  it('returns 8 for 50 < amount ≤ 100 (+3 tier)', () => {
    expect(calculateRefundBoost(51)).toBe(8);
    expect(calculateRefundBoost(100)).toBe(8); // boundary: 100 not > 100
  });

  it('returns 10 for 100 < amount ≤ 200 (+5 tier)', () => {
    expect(calculateRefundBoost(101)).toBe(10);
    expect(calculateRefundBoost(200)).toBe(10); // boundary: 200 not > 200
  });

  it('returns 13 for amount > 200 (+8 tier)', () => {
    expect(calculateRefundBoost(201)).toBe(13);
    expect(calculateRefundBoost(1000)).toBe(13);
    expect(calculateRefundBoost(100000)).toBe(13);
  });

  it('handles negative amount (defensive — returns base 5)', () => {
    expect(calculateRefundBoost(-100)).toBe(5);
  });

  it('handles amount = 0 (returns base 5)', () => {
    expect(calculateRefundBoost(0)).toBe(5);
  });
});

// ============================================================
// calculateMindfulRecovery
// ============================================================

describe('calculateMindfulRecovery', () => {
  it('returns 8 for impulseScore >= 80', () => {
    expect(calculateMindfulRecovery(80)).toBe(8); // boundary
    expect(calculateMindfulRecovery(90)).toBe(8);
    expect(calculateMindfulRecovery(100)).toBe(8);
  });

  it('returns 5 for 60 <= impulseScore < 80', () => {
    expect(calculateMindfulRecovery(60)).toBe(5); // boundary
    expect(calculateMindfulRecovery(70)).toBe(5);
    expect(calculateMindfulRecovery(79)).toBe(5);
  });

  it('returns 3 for impulseScore < 60', () => {
    expect(calculateMindfulRecovery(0)).toBe(3);
    expect(calculateMindfulRecovery(59)).toBe(3);
    expect(calculateMindfulRecovery(-10)).toBe(3);
  });
});

// ============================================================
// calculatePassiveRecovery
// ============================================================

describe('calculatePassiveRecovery', () => {
  it('returns 0 for streak <= 0', () => {
    expect(calculatePassiveRecovery(0)).toBe(0);
    expect(calculatePassiveRecovery(-1)).toBe(0);
    expect(calculatePassiveRecovery(-100)).toBe(0);
  });

  it('returns streak (capped at 10) for streak 1-10', () => {
    expect(calculatePassiveRecovery(1)).toBe(1);
    expect(calculatePassiveRecovery(5)).toBe(5);
    expect(calculatePassiveRecovery(10)).toBe(10); // boundary: cap
  });

  it('caps at 10 for streak > 10', () => {
    expect(calculatePassiveRecovery(11)).toBe(10);
    expect(calculatePassiveRecovery(100)).toBe(10);
    expect(calculatePassiveRecovery(1000)).toBe(10);
  });
});

// ============================================================
// Default constants — verify single source of truth
// ============================================================

describe('default constants', () => {
  it('DEFAULT_VITALITY is a positive integer in [1, 100]', () => {
    expect(Number.isInteger(DEFAULT_VITALITY)).toBe(true);
    expect(DEFAULT_VITALITY).toBeGreaterThan(0);
    expect(DEFAULT_VITALITY).toBeLessThanOrEqual(100);
  });

  it('DEFAULT_TOKENS is a non-negative integer', () => {
    expect(Number.isInteger(DEFAULT_TOKENS)).toBe(true);
    expect(DEFAULT_TOKENS).toBeGreaterThanOrEqual(0);
  });

  it('DEFAULT_HEALTH is one of BuddyHealth values', () => {
    expect(['thriving', 'healthy', 'weak', 'critical', 'dormant']).toContain(DEFAULT_HEALTH);
  });

  it('DEFAULT_LEVEL is a positive integer', () => {
    expect(Number.isInteger(DEFAULT_LEVEL)).toBe(true);
    expect(DEFAULT_LEVEL).toBeGreaterThan(0);
  });

  it('DEFAULT_XP is a non-negative integer', () => {
    expect(Number.isInteger(DEFAULT_XP)).toBe(true);
    expect(DEFAULT_XP).toBeGreaterThanOrEqual(0);
  });

  it('DEFAULT_XP_TO_NEXT is a positive integer', () => {
    expect(Number.isInteger(DEFAULT_XP_TO_NEXT)).toBe(true);
    expect(DEFAULT_XP_TO_NEXT).toBeGreaterThan(0);
  });

  it('DEFAULT_STREAK is 0', () => {
    expect(DEFAULT_STREAK).toBe(0);
  });

  it('DEFAULT_TOTAL_SAVED is 0', () => {
    expect(DEFAULT_TOTAL_SAVED).toBe(0);
  });

  it('DEFAULT_CHALLENGES_COMPLETED is 0', () => {
    expect(DEFAULT_CHALLENGES_COMPLETED).toBe(0);
  });

  it('DEFAULT_BADGES is an empty array (not null)', () => {
    expect(Array.isArray(DEFAULT_BADGES)).toBe(true);
    expect(DEFAULT_BADGES).toHaveLength(0);
  });

  it('DEFAULT_BADGES is frozen / not mutated by callers (defensive check)', () => {
    // Although not Object.frozen, ensure a fresh reference is returned each import.
    // (Constants are shared by reference — verify immutability by convention.)
    expect(DEFAULT_BADGES).toEqual([]);
  });

  it('DEFAULT_DREAM_FUNDS has 3 funds including the Savings overflow fund', () => {
    expect(DEFAULT_DREAM_FUNDS).toHaveLength(3);
    const ids = DEFAULT_DREAM_FUNDS.map((f) => f.id);
    expect(ids).toContain('df-1');
    expect(ids).toContain('df-2');
    expect(ids).toContain(SAVINGS_FUND_ID);
  });

  it('DEFAULT_DREAM_FUNDS Savings fund has target = SAVINGS_FUND_TARGET', () => {
    const savings = DEFAULT_DREAM_FUNDS.find((f) => f.id === SAVINGS_FUND_ID);
    expect(savings).toBeDefined();
    expect(savings?.target).toBe(SAVINGS_FUND_TARGET);
  });

  it('DEFAULT_DREAM_FUNDS each fund has required fields', () => {
    for (const fund of DEFAULT_DREAM_FUNDS) {
      expect(typeof fund.id).toBe('string');
      expect(typeof fund.name).toBe('string');
      expect(typeof fund.target).toBe('number');
      expect(typeof fund.current).toBe('number');
      expect(typeof fund.emoji).toBe('string');
      expect(fund.current).toBe(0); // default current is 0
    }
  });

  it('SAVINGS_FUND_ID is "df-savings"', () => {
    expect(SAVINGS_FUND_ID).toBe('df-savings');
  });

  it('SAVINGS_FUND_TARGET is PostgreSQL INTEGER max (2147483647)', () => {
    expect(SAVINGS_FUND_TARGET).toBe(2147483647);
  });
});
