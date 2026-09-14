/**
 * Tests for cultivation.ts — pure severity/stage assessment functions
 *
 * 🔧 ARCH fix (Round 74 ARCH-DEEP-74):
 *   旧: 0 tests for cultivation.ts (severity_tier + cultivation_stage 评估无覆盖)
 *   修复: +N tests covering assessSeverityTier (score formula + tier boundaries) +
 *         assessCultivationStage (upgrade/downgrade transitions)
 *
 * Tests ONLY pure functions — fetchWeeklyMetrics / fetchMonthlyMetrics /
 * reassessProfile / triggerReassessIfNeeded require Supabase mocks, 跳过.
 */

import { describe, it, expect } from 'vitest';
import {
  assessSeverityTier,
  assessCultivationStage,
  type SeverityTier,
  type CultivationStage,
} from '@/lib/cultivation';

// ============================================================
// assessSeverityTier — score formula + tier boundaries
// ============================================================

describe('assessSeverityTier', () => {
  // --- score formula ---
  // score = impulseCount * 4 + totalAmount / 10 + avgImpulseScore * 0.3
  // severe: >= 40, moderate: >= 20, light: < 20

  it('returns light for all-zero metrics (score = 0)', () => {
    const result = assessSeverityTier({
      impulseCount: 0,
      totalAmount: 0,
      avgImpulseScore: 0,
      refundCount: 0,
    });
    expect(result.tier).toBe('light');
    expect(result.score).toBe(0);
    expect(result.reason).toContain('score=0.0');
  });

  it('returns light for low metrics (score < 20)', () => {
    // 2 * 4 + 50 / 10 + 30 * 0.3 = 8 + 5 + 9 = 22 → moderate
    // Let's pick lower: 1 * 4 + 10 / 10 + 10 * 0.3 = 4 + 1 + 3 = 8 → light
    const result = assessSeverityTier({
      impulseCount: 1,
      totalAmount: 10,
      avgImpulseScore: 10,
      refundCount: 0,
    });
    expect(result.tier).toBe('light');
    expect(result.score).toBeCloseTo(8, 1);
  });

  it('returns moderate for mid metrics (20 <= score < 40)', () => {
    // 2 * 4 + 50 / 10 + 30 * 0.3 = 8 + 5 + 9 = 22 → moderate
    const result = assessSeverityTier({
      impulseCount: 2,
      totalAmount: 50,
      avgImpulseScore: 30,
      refundCount: 0,
    });
    expect(result.tier).toBe('moderate');
    expect(result.score).toBeCloseTo(22, 1);
  });

  it('returns severe for high metrics (score >= 40)', () => {
    // 5 * 4 + 100 / 10 + 80 * 0.3 = 20 + 10 + 24 = 54 → severe
    const result = assessSeverityTier({
      impulseCount: 5,
      totalAmount: 100,
      avgImpulseScore: 80,
      refundCount: 0,
    });
    expect(result.tier).toBe('severe');
    expect(result.score).toBeCloseTo(54, 1);
  });

  // --- tier boundaries ---

  it('boundary: score exactly 20 → moderate', () => {
    // 5 * 4 + 0 + 0 = 20 → moderate
    const result = assessSeverityTier({
      impulseCount: 5,
      totalAmount: 0,
      avgImpulseScore: 0,
      refundCount: 0,
    });
    expect(result.tier).toBe('moderate');
    expect(result.score).toBe(20);
  });

  it('boundary: score just below 20 → light', () => {
    // 4 * 4 + 30 / 10 + 3 * 0.3 = 16 + 3 + 0.9 = 19.9 → light
    const result = assessSeverityTier({
      impulseCount: 4,
      totalAmount: 30,
      avgImpulseScore: 3,
      refundCount: 0,
    });
    expect(result.tier).toBe('light');
    expect(result.score).toBeCloseTo(19.9, 1);
  });

  it('boundary: score exactly 40 → severe', () => {
    // 10 * 4 + 0 + 0 = 40 → severe
    const result = assessSeverityTier({
      impulseCount: 10,
      totalAmount: 0,
      avgImpulseScore: 0,
      refundCount: 0,
    });
    expect(result.tier).toBe('severe');
    expect(result.score).toBe(40);
  });

  it('boundary: score just below 40 → moderate', () => {
    // 9 * 4 + 30 / 10 + 3 * 0.3 = 36 + 3 + 0.9 = 39.9 → moderate
    const result = assessSeverityTier({
      impulseCount: 9,
      totalAmount: 30,
      avgImpulseScore: 3,
      refundCount: 0,
    });
    expect(result.tier).toBe('moderate');
    expect(result.score).toBeCloseTo(39.9, 1);
  });

  // --- refundCount is NOT in score formula (only the 3 factors) ---

  it('refundCount does NOT affect score (only impulseCount/amount/avgScore)', () => {
    const base = assessSeverityTier({
      impulseCount: 3,
      totalAmount: 50,
      avgImpulseScore: 50,
      refundCount: 0,
    });
    const withRefunds = assessSeverityTier({
      impulseCount: 3,
      totalAmount: 50,
      avgImpulseScore: 50,
      refundCount: 100,
    });
    expect(base.score).toBe(withRefunds.score);
    expect(base.tier).toBe(withRefunds.tier);
  });

  // --- reason string ---

  it('reason includes all metric values', () => {
    const result = assessSeverityTier({
      impulseCount: 7,
      totalAmount: 200,
      avgImpulseScore: 65,
      refundCount: 2,
    });
    expect(result.reason).toContain('impulseCount=7');
    expect(result.reason).toContain('amount=$200');
    expect(result.reason).toContain('avgScore=65');
  });

  // --- edge cases ---

  it('handles negative metrics (defensive — score can go negative)', () => {
    const result = assessSeverityTier({
      impulseCount: -1,
      totalAmount: -100,
      avgImpulseScore: -10,
      refundCount: 0,
    });
    // -4 + -10 + -3 = -17 → light
    expect(result.tier).toBe('light');
    expect(result.score).toBeCloseTo(-17, 1);
  });

  it('handles very high metrics (no upper clamp)', () => {
    const result = assessSeverityTier({
      impulseCount: 100,
      totalAmount: 10000,
      avgImpulseScore: 100,
      refundCount: 0,
    });
    // 400 + 1000 + 30 = 1430 → severe
    expect(result.tier).toBe('severe');
    expect(result.score).toBe(1430);
  });

  it('handles fractional amount (decimal dollars)', () => {
    const result = assessSeverityTier({
      impulseCount: 0,
      totalAmount: 199.99,
      avgImpulseScore: 0,
      refundCount: 0,
    });
    // 0 + 19.999 + 0 = 19.999 → light (just below 20)
    expect(result.tier).toBe('light');
    expect(result.score).toBeCloseTo(19.999, 2);
  });

  it('all possible tier values are returned', () => {
    const tiers = new Set<SeverityTier>();
    tiers.add(assessSeverityTier({ impulseCount: 0, totalAmount: 0, avgImpulseScore: 0, refundCount: 0 }).tier);
    tiers.add(assessSeverityTier({ impulseCount: 5, totalAmount: 0, avgImpulseScore: 0, refundCount: 0 }).tier);
    tiers.add(assessSeverityTier({ impulseCount: 10, totalAmount: 0, avgImpulseScore: 0, refundCount: 0 }).tier);
    expect(tiers.has('light')).toBe(true);
    expect(tiers.has('moderate')).toBe(true);
    expect(tiers.has('severe')).toBe(true);
  });
});

// ============================================================
// assessCultivationStage — upgrade/downgrade logic
// ============================================================

describe('assessCultivationStage', () => {
  // --- downgrade checks (priority) ---

  it('downgrade to zhi_yu when monthly impulseCount > 15 (from zhi_zhi)', () => {
    const result = assessCultivationStage('zhi_zhi', {
      impulseCount: 16,
      resistedCount: 0,
      challengePassRate: 0,
    });
    expect(result.stage).toBe('zhi_yu');
    expect(result.changed).toBe(true);
    expect(result.reason).toContain('downgrade');
  });

  it('downgrade to zhi_yu when monthly impulseCount > 15 (from cheng_yi)', () => {
    const result = assessCultivationStage('cheng_yi', {
      impulseCount: 20,
      resistedCount: 0,
      challengePassRate: 0,
    });
    expect(result.stage).toBe('zhi_yu');
    expect(result.changed).toBe(true);
  });

  it('maintain zhi_yu when monthly impulseCount > 15 (already at zhi_yu)', () => {
    const result = assessCultivationStage('zhi_yu', {
      impulseCount: 20,
      resistedCount: 0,
      challengePassRate: 0,
    });
    expect(result.stage).toBe('zhi_yu');
    expect(result.changed).toBe(false);
    expect(result.reason).toContain('maintain');
  });

  it('downgrade to zhi_zhi when 5 < impulseCount <= 15 and current is cheng_yi', () => {
    const result = assessCultivationStage('cheng_yi', {
      impulseCount: 8,
      resistedCount: 0,
      challengePassRate: 0,
    });
    expect(result.stage).toBe('zhi_zhi');
    expect(result.changed).toBe(true);
    expect(result.reason).toContain('downgrade');
    expect(result.reason).toContain('current=cheng_yi');
  });

  it('downgrade to zhi_zhi when 5 < impulseCount <= 15 and current is zheng_xin', () => {
    const result = assessCultivationStage('zheng_xin', {
      impulseCount: 10,
      resistedCount: 0,
      challengePassRate: 0,
    });
    expect(result.stage).toBe('zhi_zhi');
    expect(result.changed).toBe(true);
  });

  it('does NOT downgrade zhi_zhi when 5 < impulseCount <= 15 (zhi_zhi is allowed at this level)', () => {
    // impulseCount=8 is > 5 but <= 15; current=zhi_zhi
    // The downgrade-to-zhi_zhi rule only applies to cheng_yi/zheng_xin
    const result = assessCultivationStage('zhi_zhi', {
      impulseCount: 8,
      resistedCount: 0,
      challengePassRate: 0,
    });
    // Falls through to upgrade check: impulseCount=8 is NOT < 10, so no upgrade
    expect(result.stage).toBe('zhi_zhi');
    expect(result.changed).toBe(false);
    expect(result.reason).toContain('maintain');
  });

  // --- upgrade: cheng_yi → zheng_xin ---

  it('upgrade cheng_yi → zheng_xin when impulseCount < 3 AND passRate > 0.8', () => {
    const result = assessCultivationStage('cheng_yi', {
      impulseCount: 2,
      resistedCount: 10,
      challengePassRate: 0.9,
    });
    expect(result.stage).toBe('zheng_xin');
    expect(result.changed).toBe(true);
    expect(result.reason).toContain('upgrade');
  });

  it('maintain cheng_yi when impulseCount < 3 but passRate <= 0.8', () => {
    const result = assessCultivationStage('cheng_yi', {
      impulseCount: 2,
      resistedCount: 5,
      challengePassRate: 0.7,
    });
    expect(result.stage).toBe('cheng_yi');
    expect(result.changed).toBe(false);
  });

  it('maintain cheng_yi when passRate > 0.8 but impulseCount >= 3', () => {
    const result = assessCultivationStage('cheng_yi', {
      impulseCount: 4,
      resistedCount: 10,
      challengePassRate: 0.9,
    });
    // impulseCount=4 is > 5? No. So no downgrade. Then upgrade check: impulseCount >= 3, no upgrade.
    expect(result.stage).toBe('cheng_yi');
    expect(result.changed).toBe(false);
  });

  it('boundary: cheng_yi upgrade with impulseCount = 2 (just < 3) and passRate = 0.81 (just > 0.8)', () => {
    const result = assessCultivationStage('cheng_yi', {
      impulseCount: 2,
      resistedCount: 10,
      challengePassRate: 0.81,
    });
    expect(result.stage).toBe('zheng_xin');
    expect(result.changed).toBe(true);
  });

  // --- upgrade: zhi_zhi → cheng_yi ---

  it('upgrade zhi_zhi → cheng_yi when impulseCount < 10 AND passRate > 0.6', () => {
    const result = assessCultivationStage('zhi_zhi', {
      impulseCount: 5,
      resistedCount: 10,
      challengePassRate: 0.7,
    });
    expect(result.stage).toBe('cheng_yi');
    expect(result.changed).toBe(true);
    expect(result.reason).toContain('upgrade');
  });

  it('maintain zhi_zhi when impulseCount < 10 but passRate <= 0.6', () => {
    const result = assessCultivationStage('zhi_zhi', {
      impulseCount: 5,
      resistedCount: 5,
      challengePassRate: 0.5,
    });
    expect(result.stage).toBe('zhi_zhi');
    expect(result.changed).toBe(false);
  });

  it('maintain zhi_zhi when passRate > 0.6 but impulseCount >= 10 (but <= 15, so no downgrade)', () => {
    const result = assessCultivationStage('zhi_zhi', {
      impulseCount: 12,
      resistedCount: 10,
      challengePassRate: 0.9,
    });
    // 12 > 5 but <= 15, current=zhi_zhi → no downgrade (rule only for cheng_yi/zheng_xin)
    // upgrade check: impulseCount >= 10, no upgrade → maintain
    expect(result.stage).toBe('zhi_zhi');
    expect(result.changed).toBe(false);
  });

  it('boundary: zhi_zhi upgrade with impulseCount = 9 (just < 10) and passRate = 0.61 (just > 0.6)', () => {
    const result = assessCultivationStage('zhi_zhi', {
      impulseCount: 9,
      resistedCount: 10,
      challengePassRate: 0.61,
    });
    expect(result.stage).toBe('cheng_yi');
    expect(result.changed).toBe(true);
  });

  // --- upgrade: zhi_yu → zhi_zhi ---

  it('upgrade zhi_yu → zhi_zhi when impulseCount < 15', () => {
    const result = assessCultivationStage('zhi_yu', {
      impulseCount: 10,
      resistedCount: 0,
      challengePassRate: 0,
    });
    expect(result.stage).toBe('zhi_zhi');
    expect(result.changed).toBe(true);
    expect(result.reason).toContain('upgrade');
    expect(result.reason).toContain('showing awareness');
  });

  it('maintain zhi_yu when impulseCount >= 15', () => {
    // BUT: impulseCount > 15 → also maintain zhi_yu (first branch returns maintain)
    // impulseCount = 15 exactly: NOT > 15, so falls to upgrade check: 15 < 15? No → maintain
    const result = assessCultivationStage('zhi_yu', {
      impulseCount: 15,
      resistedCount: 0,
      challengePassRate: 0,
    });
    expect(result.stage).toBe('zhi_yu');
    expect(result.changed).toBe(false);
    expect(result.reason).toContain('maintain');
    expect(result.reason).toContain('>= 15');
  });

  it('maintain zhi_yu when impulseCount > 15 (first branch, no change)', () => {
    const result = assessCultivationStage('zhi_yu', {
      impulseCount: 20,
      resistedCount: 0,
      challengePassRate: 0,
    });
    expect(result.stage).toBe('zhi_yu');
    expect(result.changed).toBe(false);
  });

  it('boundary: zhi_yu upgrade with impulseCount = 14 (just < 15)', () => {
    const result = assessCultivationStage('zhi_yu', {
      impulseCount: 14,
      resistedCount: 0,
      challengePassRate: 0,
    });
    expect(result.stage).toBe('zhi_zhi');
    expect(result.changed).toBe(true);
  });

  // --- zheng_xin maintenance ---

  it('maintain zheng_xin when impulseCount <= 5 and passRate any (final fallback)', () => {
    const result = assessCultivationStage('zheng_xin', {
      impulseCount: 2,
      resistedCount: 10,
      challengePassRate: 0.5, // even low passRate keeps zheng_xin (no downgrade rule for low passRate)
    });
    expect(result.stage).toBe('zheng_xin');
    expect(result.changed).toBe(false);
    expect(result.reason).toContain('maintain');
  });

  it('maintain zheng_xin when impulseCount = 5 exactly (not > 5, so no downgrade)', () => {
    const result = assessCultivationStage('zheng_xin', {
      impulseCount: 5,
      resistedCount: 10,
      challengePassRate: 0.9,
    });
    expect(result.stage).toBe('zheng_xin');
    expect(result.changed).toBe(false);
  });

  // --- reason string format ---

  it('reason includes passRate as percentage', () => {
    const result = assessCultivationStage('cheng_yi', {
      impulseCount: 5,
      resistedCount: 5,
      challengePassRate: 0.85,
    });
    expect(result.reason).toContain('passRate=85%');
  });

  // --- all stages reachable ---

  it('all 4 stage values are reachable', () => {
    const stages = new Set<CultivationStage>();
    // zhi_yu (maintain)
    stages.add(assessCultivationStage('zhi_yu', { impulseCount: 20, resistedCount: 0, challengePassRate: 0 }).stage);
    // zhi_zhi (maintain)
    stages.add(assessCultivationStage('zhi_zhi', { impulseCount: 8, resistedCount: 0, challengePassRate: 0 }).stage);
    // cheng_yi (maintain)
    stages.add(assessCultivationStage('cheng_yi', { impulseCount: 4, resistedCount: 0, challengePassRate: 0 }).stage);
    // zheng_xin (maintain)
    stages.add(assessCultivationStage('zheng_xin', { impulseCount: 2, resistedCount: 10, challengePassRate: 0.9 }).stage);
    expect(stages.has('zhi_yu')).toBe(true);
    expect(stages.has('zhi_zhi')).toBe(true);
    expect(stages.has('cheng_yi')).toBe(true);
    expect(stages.has('zheng_xin')).toBe(true);
  });

  // --- edge cases ---

  it('handles impulseCount = 0 (no impulses, ideal case)', () => {
    // From zhi_yu: 0 < 15 → upgrade to zhi_zhi
    expect(assessCultivationStage('zhi_yu', { impulseCount: 0, resistedCount: 10, challengePassRate: 1.0 }).stage).toBe('zhi_zhi');
    // From zhi_zhi: 0 < 10 and 1.0 > 0.6 → upgrade to cheng_yi
    expect(assessCultivationStage('zhi_zhi', { impulseCount: 0, resistedCount: 10, challengePassRate: 1.0 }).stage).toBe('cheng_yi');
    // From cheng_yi: 0 < 3 and 1.0 > 0.8 → upgrade to zheng_xin
    expect(assessCultivationStage('cheng_yi', { impulseCount: 0, resistedCount: 10, challengePassRate: 1.0 }).stage).toBe('zheng_xin');
    // From zheng_xin: 0 <= 5 → maintain
    expect(assessCultivationStage('zheng_xin', { impulseCount: 0, resistedCount: 10, challengePassRate: 1.0 }).stage).toBe('zheng_xin');
  });

  it('handles negative impulseCount (defensive — treated as < threshold)', () => {
    // -5 is not > 15, not > 5 → no downgrade
    // From zhi_yu: -5 < 15 → upgrade to zhi_zhi
    expect(assessCultivationStage('zhi_yu', { impulseCount: -5, resistedCount: 0, challengePassRate: 0 }).stage).toBe('zhi_zhi');
  });
});
