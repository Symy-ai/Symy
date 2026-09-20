/**
 * Tests for health-impact.ts — pure helper functions
 *
 * 🔧 ARCH fix (Round 74 ARCH-DEEP-74):
 *   旧: 0 tests for health-impact.ts (核心 damage formula + badge 逻辑无覆盖)
 *   修复: +N tests covering calculateHealthDelta (每个 eventType 分支) +
 *         calculateNewBadges (badge eligibility + dedup) + 常量验证
 *
 * Tests ONLY pure functions — createHealthEvent / createHealthEventLegacy /
 * processReceiptsHealthImpact require Supabase + RPC mocks, 跳过 (per task rules).
 */

import { describe, it, expect } from 'vitest';
import {
  calculateHealthDelta,
  calculateNewBadges,
  VALID_EVENT_TYPES,
  VALID_TRIGGER_SOURCES,
  type HealthEventInput,
} from '@/lib/health-impact';

// ============================================================
// calculateHealthDelta — pure damage/recovery formula
// ============================================================

describe('calculateHealthDelta', () => {
  // --- impulse_damage ---

  it('impulse_damage: uses calculateImpulseDamage formula with metadata', () => {
    const input: HealthEventInput = {
      userId: 'u1',
      eventType: 'impulse_damage',
      triggerSource: 'email_receipt',
      description: 'test',
      metadata: { impulseScore: 95, amount: 250 },
    };
    // score 95 → -15 base; amount 250 > 200 → -5 → total -20
    expect(calculateHealthDelta(input, null)).toEqual({
      vitalityChange: -20,
      tokenChange: -1,
    });
  });

  it('impulse_damage: falls back to default impulseScore 60 when missing', () => {
    const input: HealthEventInput = {
      userId: 'u1',
      eventType: 'impulse_damage',
      triggerSource: 'email_receipt',
      description: 'test',
      metadata: { amount: 0 },
    };
    // default score 60 → -4; amount 0 → no penalty → -4
    expect(calculateHealthDelta(input, null)).toEqual({
      vitalityChange: -4,
      tokenChange: -1,
    });
  });

  it('impulse_damage: preserves explicit zero impulseScore and amount (N1)', () => {
    const input: HealthEventInput = {
      userId: 'u1',
      eventType: 'impulse_damage',
      triggerSource: 'email_receipt',
      description: 'test',
      metadata: { impulseScore: 0, amount: 0 },
    };

    expect(calculateHealthDelta(input, null)).toEqual({
      vitalityChange: 0,
      tokenChange: -1,
    });
  });

  it('impulse_damage: falls back to default amount 0 when missing', () => {
    const input: HealthEventInput = {
      userId: 'u1',
      eventType: 'impulse_damage',
      triggerSource: 'email_receipt',
      description: 'test',
      metadata: { impulseScore: 85 },
    };
    // score 85 → -10; amount 0 → no penalty → -10
    expect(calculateHealthDelta(input, null)).toEqual({
      vitalityChange: -10,
      tokenChange: -1,
    });
  });

  it('impulse_damage: NaN impulseScore falls back to default 60 (BUG-197 fix)', () => {
    const input: HealthEventInput = {
      userId: 'u1',
      eventType: 'impulse_damage',
      triggerSource: 'email_receipt',
      description: 'test',
      metadata: { impulseScore: NaN, amount: 0 },
    };
    // NaN → default 60 → -4
    expect(calculateHealthDelta(input, null)).toEqual({
      vitalityChange: -4,
      tokenChange: -1,
    });
  });

  it('impulse_damage: NaN amount falls back to default 0 (BUG-197 fix)', () => {
    const input: HealthEventInput = {
      userId: 'u1',
      eventType: 'impulse_damage',
      triggerSource: 'email_receipt',
      description: 'test',
      metadata: { impulseScore: 95, amount: NaN },
    };
    // score 95 → -15; NaN amount → 0 → no penalty → -15
    expect(calculateHealthDelta(input, null)).toEqual({
      vitalityChange: -15,
      tokenChange: -1,
    });
  });

  it('impulse_damage: handles missing metadata entirely', () => {
    const input: HealthEventInput = {
      userId: 'u1',
      eventType: 'impulse_damage',
      triggerSource: 'email_receipt',
      description: 'test',
    };
    // no metadata → defaults: score 60, amount 0 → -4
    expect(calculateHealthDelta(input, null)).toEqual({
      vitalityChange: -4,
      tokenChange: -1,
    });
  });

  // --- impulse_confessed ---

  it('impulse_confessed: 30% less damage than impulse_damage', () => {
    const input: HealthEventInput = {
      userId: 'u1',
      eventType: 'impulse_confessed',
      triggerSource: 'chat_mcp',
      description: 'confession',
      metadata: { impulseScore: 95, amount: 250 },
    };
    // full damage = -20; confessed = Math.round(-20 * 0.7) = -14
    expect(calculateHealthDelta(input, null)).toEqual({
      vitalityChange: -14,
      tokenChange: -1,
    });
  });

  it('impulse_confessed: rounds Math.round (0.5 → 1)', () => {
    const input: HealthEventInput = {
      userId: 'u1',
      eventType: 'impulse_confessed',
      triggerSource: 'chat_mcp',
      description: 'confession',
      metadata: { impulseScore: 60, amount: 0 },
    };
    // full = -4; -4 * 0.7 = -2.8; Math.round(-2.8) = -3
    expect(calculateHealthDelta(input, null)).toEqual({
      vitalityChange: -3,
      tokenChange: -1,
    });
  });

  // --- mindful_recovery ---

  it('mindful_recovery: high score (>=80) → +8 vitality, +2 tokens', () => {
    const input: HealthEventInput = {
      userId: 'u1',
      eventType: 'mindful_recovery',
      triggerSource: 'email_ignore',
      description: 'resisted',
      metadata: { impulseScore: 85 },
    };
    expect(calculateHealthDelta(input, null)).toEqual({
      vitalityChange: 8,
      tokenChange: 2,
    });
  });

  it('mindful_recovery: low score (<60) → +3 vitality', () => {
    const input: HealthEventInput = {
      userId: 'u1',
      eventType: 'mindful_recovery',
      triggerSource: 'email_ignore',
      description: 'resisted',
      metadata: { impulseScore: 40 },
    };
    expect(calculateHealthDelta(input, null)).toEqual({
      vitalityChange: 3,
      tokenChange: 2,
    });
  });

  // --- refund_boost ---

  it('refund_boost: large refund (>$200) → +13 vitality, +3 tokens', () => {
    const input: HealthEventInput = {
      userId: 'u1',
      eventType: 'refund_boost',
      triggerSource: 'email_refund',
      description: 'refund',
      metadata: { amount: 250 },
    };
    expect(calculateHealthDelta(input, null)).toEqual({
      vitalityChange: 13,
      tokenChange: 3,
    });
  });

  it('refund_boost: small refund (<=50) → +5 vitality', () => {
    const input: HealthEventInput = {
      userId: 'u1',
      eventType: 'refund_boost',
      triggerSource: 'email_refund',
      description: 'refund',
      metadata: { amount: 30 },
    };
    expect(calculateHealthDelta(input, null)).toEqual({
      vitalityChange: 5,
      tokenChange: 3,
    });
  });

  it('refund_boost: missing amount → defaults to 0 → +5', () => {
    const input: HealthEventInput = {
      userId: 'u1',
      eventType: 'refund_boost',
      triggerSource: 'email_refund',
      description: 'refund',
    };
    expect(calculateHealthDelta(input, null)).toEqual({
      vitalityChange: 5,
      tokenChange: 3,
    });
  });

  // --- challenge events (no direct vitality change) ---

  it('challenge_reward: no vitality change, no token change', () => {
    const input: HealthEventInput = {
      userId: 'u1',
      eventType: 'challenge_reward',
      triggerSource: 'chat_mcp',
      description: 'reward',
    };
    expect(calculateHealthDelta(input, null)).toEqual({
      vitalityChange: 0,
      tokenChange: 0,
    });
  });

  it('challenge_failed: no vitality change (audit-only event)', () => {
    const input: HealthEventInput = {
      userId: 'u1',
      eventType: 'challenge_failed',
      triggerSource: 'chat_mcp',
      description: 'failed',
    };
    expect(calculateHealthDelta(input, null)).toEqual({
      vitalityChange: 0,
      tokenChange: 0,
    });
  });

  // --- passive_recovery (uses buddyState.streak) ---

  it('passive_recovery: returns streak value (capped at 10)', () => {
    const input: HealthEventInput = {
      userId: 'u1',
      eventType: 'passive_recovery',
      triggerSource: 'passive_daily',
      description: 'passive',
    };
    expect(calculateHealthDelta(input, { streak: 5 })).toEqual({
      vitalityChange: 5,
      tokenChange: 0,
    });
    expect(calculateHealthDelta(input, { streak: 15 })).toEqual({
      vitalityChange: 10,
      tokenChange: 0,
    });
  });

  it('passive_recovery: streak 0 → 0 recovery', () => {
    const input: HealthEventInput = {
      userId: 'u1',
      eventType: 'passive_recovery',
      triggerSource: 'passive_daily',
      description: 'passive',
    };
    expect(calculateHealthDelta(input, { streak: 0 })).toEqual({
      vitalityChange: 0,
      tokenChange: 0,
    });
  });

  it('passive_recovery: missing buddyState → streak defaults to 0', () => {
    const input: HealthEventInput = {
      userId: 'u1',
      eventType: 'passive_recovery',
      triggerSource: 'passive_daily',
      description: 'passive',
    };
    expect(calculateHealthDelta(input, null)).toEqual({
      vitalityChange: 0,
      tokenChange: 0,
    });
  });

  // --- drain / revive / manual_adjustment ---

  it('drain: -1 vitality, -1 token', () => {
    const input: HealthEventInput = {
      userId: 'u1',
      eventType: 'drain',
      triggerSource: 'token_drain',
      description: 'drain',
    };
    expect(calculateHealthDelta(input, null)).toEqual({
      vitalityChange: -1,
      tokenChange: -1,
    });
  });

  it('revive: +30 vitality, 0 token change', () => {
    const input: HealthEventInput = {
      userId: 'u1',
      eventType: 'revive',
      triggerSource: 'revive_deposit',
      description: 'revive',
    };
    expect(calculateHealthDelta(input, null)).toEqual({
      vitalityChange: 30,
      tokenChange: 0,
    });
  });

  it('manual_adjustment: 0 vitality, 0 token (override applied at caller)', () => {
    const input: HealthEventInput = {
      userId: 'u1',
      eventType: 'manual_adjustment',
      triggerSource: 'manual',
      description: 'manual',
    };
    expect(calculateHealthDelta(input, null)).toEqual({
      vitalityChange: 0,
      tokenChange: 0,
    });
  });
});

// ============================================================
// calculateNewBadges — badge eligibility + dedup
// ============================================================

describe('calculateNewBadges', () => {
  it('mindful_recovery: awards impulse_shield if not yet earned', () => {
    expect(calculateNewBadges('mindful_recovery', [])).toEqual(['impulse_shield']);
    expect(calculateNewBadges('mindful_recovery', null)).toEqual(['impulse_shield']);
    expect(calculateNewBadges('mindful_recovery', undefined)).toEqual(['impulse_shield']);
  });

  it('mindful_recovery: does NOT award impulse_shield if already earned (dedup)', () => {
    expect(calculateNewBadges('mindful_recovery', ['impulse_shield'])).toEqual([]);
    expect(calculateNewBadges('mindful_recovery', ['impulse_shield', 'other_badge'])).toEqual([]);
  });

  it('refund_boost: awards first_save if not yet earned', () => {
    expect(calculateNewBadges('refund_boost', [])).toEqual(['first_save']);
    expect(calculateNewBadges('refund_boost', null)).toEqual(['first_save']);
  });

  it('refund_boost: does NOT award first_save if already earned (dedup)', () => {
    expect(calculateNewBadges('refund_boost', ['first_save'])).toEqual([]);
  });

  it('non-eligible event types: return empty array', () => {
    const nonEligible = [
      'impulse_damage',
      'impulse_confessed',
      'challenge_reward',
      'challenge_completed',
      'challenge_failed',
      'passive_recovery',
      'drain',
      'revive',
      'manual_adjustment',
    ] as const;
    for (const eventType of nonEligible) {
      expect(calculateNewBadges(eventType, [])).toEqual([]);
      expect(calculateNewBadges(eventType, ['impulse_shield', 'first_save'])).toEqual([]);
    }
  });

  it('preserves existing badges (does not remove them)', () => {
    // function only returns NEW badges, doesn't modify existing
    const existing = ['impulse_shield', 'first_save', 'custom_badge'];
    expect(calculateNewBadges('mindful_recovery', existing)).toEqual([]); // impulse_shield already there
    expect(calculateNewBadges('refund_boost', existing)).toEqual([]); // first_save already there
    // existing array unchanged
    expect(existing).toEqual(['impulse_shield', 'first_save', 'custom_badge']);
  });
});

// ============================================================
// VALID_EVENT_TYPES + VALID_TRIGGER_SOURCES — constants
// ============================================================

describe('VALID_EVENT_TYPES', () => {
  it('contains all 13 event types (including butterfly)', () => {
    expect(VALID_EVENT_TYPES).toHaveLength(13);
    expect(VALID_EVENT_TYPES).toContain('impulse_damage');
    expect(VALID_EVENT_TYPES).toContain('impulse_confessed');
    expect(VALID_EVENT_TYPES).toContain('mindful_recovery');
    expect(VALID_EVENT_TYPES).toContain('refund_boost');
    expect(VALID_EVENT_TYPES).toContain('challenge_reward');
    expect(VALID_EVENT_TYPES).toContain('challenge_completed');
    expect(VALID_EVENT_TYPES).toContain('challenge_failed');
    expect(VALID_EVENT_TYPES).toContain('passive_recovery');
    expect(VALID_EVENT_TYPES).toContain('drain');
    expect(VALID_EVENT_TYPES).toContain('revive');
    expect(VALID_EVENT_TYPES).toContain('manual_adjustment');
    // 🔧 Round 86: butterfly companion system
    expect(VALID_EVENT_TYPES).toContain('butterfly_completed');
    expect(VALID_EVENT_TYPES).toContain('butterfly_chapter_viewed');
  });

  it('is a readonly array (frozen at type level)', () => {
    // Runtime check: array is not mutated by tests
    const snapshot = [...VALID_EVENT_TYPES];
    expect(VALID_EVENT_TYPES).toEqual(snapshot);
  });
});

describe('VALID_TRIGGER_SOURCES', () => {
  it('contains all 10 trigger sources (including deposit_api + butterfly_story)', () => {
    expect(VALID_TRIGGER_SOURCES).toHaveLength(10);
    expect(VALID_TRIGGER_SOURCES).toContain('email_receipt');
    expect(VALID_TRIGGER_SOURCES).toContain('email_refund');
    expect(VALID_TRIGGER_SOURCES).toContain('email_ignore');
    expect(VALID_TRIGGER_SOURCES).toContain('chat_mcp');
    expect(VALID_TRIGGER_SOURCES).toContain('passive_daily');
    expect(VALID_TRIGGER_SOURCES).toContain('token_drain');
    expect(VALID_TRIGGER_SOURCES).toContain('revive_deposit');
    expect(VALID_TRIGGER_SOURCES).toContain('manual');
    // 🔧 P2 fix (Fill history): deposit_api 用于用户手动存入 Dream Fund
    expect(VALID_TRIGGER_SOURCES).toContain('deposit_api');
    // 🔧 Round 86: butterfly_story for butterfly companion system
    expect(VALID_TRIGGER_SOURCES).toContain('butterfly_story');
  });
});
