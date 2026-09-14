/**
 * P1-5: buddy-companion 纯函数测试
 *
 * 覆盖 buddy-defaults.ts 中 P1-5 新增的函数:
 * - getGrowthStageFromLevel
 * - isValidGrowthStage / isValidPersonality / isValidNeedType
 * - clampNeedValue / clampIntimacy
 * - parseDailyNeeds
 * - replenishNeed / decayAllNeeds
 * - getHarmonyStatus
 * - assessPersonality
 * - calculateIntimacyDelta
 */

import { describe, it, expect } from 'vitest';
import {
  getGrowthStageFromLevel,
  isValidGrowthStage,
  isValidPersonality,
  isValidNeedType,
  clampNeedValue,
  clampIntimacy,
  parseDailyNeeds,
  replenishNeed,
  decayAllNeeds,
  getHarmonyStatus,
  assessPersonality,
  calculateIntimacyDelta,
  DAILY_NEEDS_DECAY_AMOUNT,
  NEED_REPLENISH_AMOUNT,
} from '../buddy-defaults';

describe('P1-5: getGrowthStageFromLevel', () => {
  it('returns baby for level 1-5', () => {
    expect(getGrowthStageFromLevel(1)).toBe('baby');
    expect(getGrowthStageFromLevel(3)).toBe('baby');
    expect(getGrowthStageFromLevel(5)).toBe('baby');
  });

  it('returns young for level 6-15', () => {
    expect(getGrowthStageFromLevel(6)).toBe('young');
    expect(getGrowthStageFromLevel(10)).toBe('young');
    expect(getGrowthStageFromLevel(15)).toBe('young');
  });

  it('returns adult for level 16-40', () => {
    expect(getGrowthStageFromLevel(16)).toBe('adult');
    expect(getGrowthStageFromLevel(25)).toBe('adult');
    expect(getGrowthStageFromLevel(40)).toBe('adult');
  });

  it('returns elder for level 41+', () => {
    expect(getGrowthStageFromLevel(41)).toBe('elder');
    expect(getGrowthStageFromLevel(50)).toBe('elder');
    expect(getGrowthStageFromLevel(100)).toBe('elder');
  });

  it('returns baby for invalid level (NaN, < 1, Infinity)', () => {
    expect(getGrowthStageFromLevel(NaN)).toBe('baby');
    expect(getGrowthStageFromLevel(-1)).toBe('baby');
    expect(getGrowthStageFromLevel(0)).toBe('baby');
    // Infinity is not finite → baby (per implementation guard)
    expect(getGrowthStageFromLevel(Infinity)).toBe('baby');
  });
});

describe('P1-5: isValidGrowthStage', () => {
  it('accepts valid stages', () => {
    expect(isValidGrowthStage('baby')).toBe(true);
    expect(isValidGrowthStage('young')).toBe(true);
    expect(isValidGrowthStage('adult')).toBe(true);
    expect(isValidGrowthStage('elder')).toBe(true);
  });

  it('rejects invalid stages', () => {
    expect(isValidGrowthStage('teen')).toBe(false);
    expect(isValidGrowthStage('')).toBe(false);
    expect(isValidGrowthStage('BABY')).toBe(false); // case sensitive
  });
});

describe('P1-5: isValidPersonality', () => {
  it('accepts valid personalities including unknown', () => {
    expect(isValidPersonality('unknown')).toBe(true);
    expect(isValidPersonality('sage')).toBe(true);
    expect(isValidPersonality('playmate')).toBe(true);
    expect(isValidPersonality('guardian')).toBe(true);
    expect(isValidPersonality('ascetic')).toBe(true);
  });

  it('rejects invalid personalities', () => {
    expect(isValidPersonality('wise')).toBe(false);
    expect(isValidPersonality('')).toBe(false);
  });
});

describe('P1-5: isValidNeedType', () => {
  it('accepts valid need types', () => {
    expect(isValidNeedType('clarity')).toBe(true);
    expect(isValidNeedType('connection')).toBe(true);
  });

  it('rejects invalid need types', () => {
    expect(isValidNeedType('breath')).toBe(false); // 🔧 PM-P2-7: breath removed
    expect(isValidNeedType('hunger')).toBe(false);
    expect(isValidNeedType('')).toBe(false);
  });
});

describe('P1-5: clampNeedValue', () => {
  it('clamps to 0-100', () => {
    expect(clampNeedValue(50)).toBe(50);
    expect(clampNeedValue(0)).toBe(0);
    expect(clampNeedValue(100)).toBe(100);
    expect(clampNeedValue(-10)).toBe(0);
    expect(clampNeedValue(150)).toBe(100);
  });

  it('rounds to integer', () => {
    expect(clampNeedValue(50.4)).toBe(50);
    expect(clampNeedValue(50.6)).toBe(51);
  });

  it('handles NaN and Infinity', () => {
    expect(clampNeedValue(NaN)).toBe(0);
    // Infinity is not finite → returns 0 (per clampNeedValue implementation)
    expect(clampNeedValue(Infinity)).toBe(0);
  });
});

describe('P1-5: clampIntimacy', () => {
  it('clamps to 0-100', () => {
    expect(clampIntimacy(50)).toBe(50);
    expect(clampIntimacy(-5)).toBe(0);
    expect(clampIntimacy(150)).toBe(100);
    expect(clampIntimacy(NaN)).toBe(0);
  });
});

describe('P1-5: parseDailyNeeds', () => {
  it('parses valid object', () => {
    const needs = parseDailyNeeds({ clarity: 80, connection: 60 });
    expect(needs).toEqual({ clarity: 80, connection: 60 });
  });

  it('clamps values to 0-100', () => {
    const needs = parseDailyNeeds({ clarity: 150, connection: -10 });
    expect(needs).toEqual({ clarity: 100, connection: 0 });
  });

  it('returns defaults for null/undefined/non-object', () => {
    expect(parseDailyNeeds(null)).toEqual({ clarity: 100, connection: 100 });
    expect(parseDailyNeeds(undefined)).toEqual({ clarity: 100, connection: 100 });
    expect(parseDailyNeeds('string')).toEqual({ clarity: 100, connection: 100 });
    expect(parseDailyNeeds(42)).toEqual({ clarity: 100, connection: 100 });
  });

  it('returns defaults for missing fields', () => {
    const needs = parseDailyNeeds({ clarity: 50 });
    expect(needs).toEqual({ clarity: 50, connection: 100 });
  });

  it('handles string numbers', () => {
    const needs = parseDailyNeeds({ clarity: '80', connection: '60' });
    expect(needs).toEqual({ clarity: 80, connection: 60 });
  });
});

describe('P1-5: replenishNeed', () => {
  it('adds amount to specified need', () => {
    const needs = { clarity: 50, connection: 60 };
    const updated = replenishNeed(needs, 'clarity', 20);
    expect(updated.clarity).toBe(70);
    expect(updated.connection).toBe(60); // unchanged // unchanged
  });

  it('clamps to 100', () => {
    const needs = { clarity: 90, connection: 100 };
    const updated = replenishNeed(needs, 'clarity', 50);
    expect(updated.clarity).toBe(100);
  });

  it('does not mutate original', () => {
    const needs = { clarity: 50, connection: 60 };
    const updated = replenishNeed(needs, 'clarity', 20);
    expect(needs.clarity).toBe(50); // unchanged
    expect(updated).not.toBe(needs);
  });

  it('handles negative amount (no effect)', () => {
    const needs = { clarity: 50, connection: 60 };
    const updated = replenishNeed(needs, 'clarity', -10);
    expect(updated.clarity).toBe(50); // no change (negative clamped to 0)
  });
});

describe('P1-5: decayAllNeeds', () => {
  it('decays all needs by default amount', () => {
    const needs = { clarity: 80, connection: 60 };
    const decayed = decayAllNeeds(needs);
    expect(decayed).toEqual({ clarity: 60, connection: 40 });
  });

  it('decays by custom amount', () => {
    const needs = { clarity: 80, connection: 60 };
    const decayed = decayAllNeeds(needs, 10);
    expect(decayed).toEqual({ clarity: 70, connection: 50 });
  });

  it('clamps to 0 (not negative)', () => {
    const needs = { clarity: 10, connection: 5 };
    const decayed = decayAllNeeds(needs, 20);
    expect(decayed).toEqual({ clarity: 0, connection: 0 });
  });

  it('does not mutate original', () => {
    const needs = { clarity: 80, connection: 60 };
    decayAllNeeds(needs);
    expect(needs.clarity).toBe(80);
  });
});

describe('P1-5: getHarmonyStatus', () => {
  it('returns harmony when all needs >= 60', () => {
    expect(getHarmonyStatus({ clarity: 60, connection: 60 })).toBe('harmony');
    expect(getHarmonyStatus({ clarity: 100, connection: 80 })).toBe('harmony');
  });

  it('returns discomfort when any need <= 30', () => {
    expect(getHarmonyStatus({ clarity: 30, connection: 100 })).toBe('discomfort');
    expect(getHarmonyStatus({ clarity: 100, connection: 10 })).toBe('discomfort');
  });

  it('returns neutral for middle values', () => {
    expect(getHarmonyStatus({ clarity: 50, connection: 50 })).toBe('neutral');
    expect(getHarmonyStatus({ clarity: 80, connection: 40 })).toBe('neutral');
  });

  it('discomfort takes precedence over harmony (edge: one low, two high)', () => {
    expect(getHarmonyStatus({ clarity: 30, connection: 100 })).toBe('discomfort');
  });
});

describe('P1-5: assessPersonality', () => {
  it('returns unknown when totalDays < 7', () => {
    expect(assessPersonality({
      challengesCompleted: 100,
      challengesFailed: 0,
      petSymyCount: 100,
      gachaCompleted: 100,
      streak: 100,
      reflectionCount: 100,
      totalDays: 6,
    })).toBe('unknown');
  });

  it('returns ascetic when streak >= 30', () => {
    expect(assessPersonality({
      challengesCompleted: 0, challengesFailed: 0, petSymyCount: 0,
      gachaCompleted: 0, streak: 30, reflectionCount: 0, totalDays: 30,
    })).toBe('ascetic');
  });

  it('returns guardian when challengesFailed >= 3 and streak >= 7', () => {
    expect(assessPersonality({
      challengesCompleted: 2, challengesFailed: 3, petSymyCount: 5,
      gachaCompleted: 1, streak: 7, reflectionCount: 1, totalDays: 10,
    })).toBe('guardian');
  });

  it('returns sage when challengesCompleted >= 5 and reflectionCount >= 3', () => {
    expect(assessPersonality({
      challengesCompleted: 5, challengesFailed: 1, petSymyCount: 2,
      gachaCompleted: 1, streak: 10, reflectionCount: 3, totalDays: 10,
    })).toBe('sage');
  });

  it('returns playmate when petSymyCount >= 7', () => {
    expect(assessPersonality({
      challengesCompleted: 1, challengesFailed: 0, petSymyCount: 7,
      gachaCompleted: 2, streak: 7, reflectionCount: 0, totalDays: 7,
    })).toBe('playmate');
  });

  it('returns playmate when gachaCompleted >= 5', () => {
    expect(assessPersonality({
      challengesCompleted: 1, challengesFailed: 0, petSymyCount: 2,
      gachaCompleted: 5, streak: 7, reflectionCount: 0, totalDays: 7,
    })).toBe('playmate');
  });

  it('returns sage as default when 7 days passed but no clear pattern', () => {
    expect(assessPersonality({
      challengesCompleted: 1, challengesFailed: 1, petSymyCount: 2,
      gachaCompleted: 1, streak: 7, reflectionCount: 1, totalDays: 7,
    })).toBe('sage');
  });

  it('priority: ascetic > guardian > sage > playmate', () => {
    // streak 30 + failed 3 + completed 5 + pet 7 → ascetic wins
    expect(assessPersonality({
      challengesCompleted: 5, challengesFailed: 3, petSymyCount: 7,
      gachaCompleted: 5, streak: 30, reflectionCount: 3, totalDays: 30,
    })).toBe('ascetic');
  });
});

describe('P1-5: calculateIntimacyDelta', () => {
  it('returns positive for good actions', () => {
    expect(calculateIntimacyDelta('see_it')).toBe(2);
    expect(calculateIntimacyDelta('challenge_passed')).toBe(3);
    expect(calculateIntimacyDelta('challenge_failed')).toBe(1);
    expect(calculateIntimacyDelta('pet_symy')).toBe(1);
    expect(calculateIntimacyDelta('gacha_completed')).toBe(2);
    expect(calculateIntimacyDelta('reflection')).toBe(2);
    expect(calculateIntimacyDelta('daily_login')).toBe(1);
  });

  it('returns negative for long_absence', () => {
    expect(calculateIntimacyDelta('long_absence')).toBe(-1);
  });

  it('returns 0 for unknown actions', () => {
    expect(calculateIntimacyDelta('unknown')).toBe(0);
    expect(calculateIntimacyDelta('')).toBe(0);
  });
});

describe('P1-5: constants', () => {
  it('DAILY_NEEDS_DECAY_AMOUNT is 20', () => {
    expect(DAILY_NEEDS_DECAY_AMOUNT).toBe(20);
  });

  it('NEED_REPLENISH_AMOUNT has correct values', () => {
    expect(NEED_REPLENISH_AMOUNT.clarity).toBe(20);
    expect(NEED_REPLENISH_AMOUNT.connection).toBe(15);
  });
});
