import { describe, expect, it } from 'vitest';

import {
  formatRewardTierMessage,
  getBaseRewardsForChallengeType,
  rollVariableReward,
} from '../reward-calc';

/**
 * reward-calc.ts (128行) — 奖励计算纯函数 (P1-5 确定性 + 2x 去重)。
 *
 * 锁定:
 * - 三档基础奖励阈值 (boss/standard/quick_pass+未知兜底)
 * - 四 tier 奖励与概率区间 (2%/8%/20%/70%)
 * - P1-5: 同 seed 同结果 (重试一致性)
 * - tier 文案四态 (golden/item/card/basic 空)
 */
describe('getBaseRewardsForChallengeType', () => {
  it('boss: 10/10/50 + boss_slayer 徽章', () => {
    expect(getBaseRewardsForChallengeType('boss')).toEqual({
      tokenReward: 10, vitalityReward: 10, xpReward: 50, badge: 'boss_slayer',
    });
  });

  it('standard: 4/5/25 无徽章', () => {
    expect(getBaseRewardsForChallengeType('standard')).toEqual({
      tokenReward: 4, vitalityReward: 5, xpReward: 25, badge: null,
    });
  });

  it('quick_pass 与未知类型兜底最小奖励', () => {
    const min = { tokenReward: 2, vitalityReward: 2, xpReward: 10, badge: null };
    expect(getBaseRewardsForChallengeType('quick_pass')).toEqual(min);
    expect(getBaseRewardsForChallengeType('bogus-type')).toEqual(min);
  });
});

describe('rollVariableReward (P1-5 确定性)', () => {
  it('同 seed → 同结果 (重试一致)', () => {
    for (const seed of ['ch1+u1', 'abc', 'x'.repeat(50), '挑战+用户']) {
      const a = rollVariableReward(seed);
      const b = rollVariableReward(seed);
      expect(a).toEqual(b);
    }
  });

  it('不同 seed → 分布合理 (500 采样覆盖 basic+至少一个 bonus tier)', () => {
    const tiers = new Set<string>();
    for (let i = 0; i < 500; i++) {
      const r = rollVariableReward(`seed-${i}`);
      tiers.add(r.tier);
      expect(r.bonusTokens).toBeGreaterThanOrEqual(0);
    }
    expect(tiers.has('basic')).toBe(true);
    expect(tiers.size).toBeGreaterThanOrEqual(2); // 500 样本至少撞出两种
  });

  it('四 tier 奖励数字锚定', () => {
    // 用采样找到各 tier 验证 bonus 数字
    const seen: Record<string, { bonusTokens: number; bonusVitality: number }> = {};
    for (let i = 0; i < 2000 && Object.keys(seen).length < 4; i++) {
      const r = rollVariableReward(`s-${i}`);
      seen[r.tier] = { bonusTokens: r.bonusTokens, bonusVitality: r.bonusVitality };
    }
    expect(seen.golden).toEqual({ bonusTokens: 20, bonusVitality: 10 });
    expect(seen.item).toEqual({ bonusTokens: 10, bonusVitality: 5 });
    expect(seen.card).toEqual({ bonusTokens: 5, bonusVitality: 0 });
    expect(seen.basic).toEqual({ bonusTokens: 0, bonusVitality: 0 });
  });

  it('无 seed → Math.random 路径不炸', () => {
    const r = rollVariableReward();
    expect(['basic', 'card', 'item', 'golden']).toContain(r.tier);
  });
});

describe('formatRewardTierMessage', () => {
  it('四态文案 (basic 空)', () => {
    expect(formatRewardTierMessage('golden')).toContain('GOLDEN GUARD');
    expect(formatRewardTierMessage('golden')).toContain('+20 tokens');
    expect(formatRewardTierMessage('item')).toContain('🎁');
    expect(formatRewardTierMessage('card')).toContain('Bonus +5 tokens');
    expect(formatRewardTierMessage('basic')).toBe('');
  });
});
