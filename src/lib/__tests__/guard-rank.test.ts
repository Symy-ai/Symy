import { describe, expect, it } from 'vitest';

import { GUARD_RANKS, getGuardRank, getNextGuardRankProgress, type GuardRankStats } from '../guard-rank';

/**
 * guard-rank.ts (62行) — 守护者段位阶梯 (纯显示逻辑)。
 *
 * 锁定:
 * - 六档阶梯 (sprout→honoree), level 连续 0-5
 * - OR 语义: 任一因子达标即解锁 (三通道)
 * - 连胜断裂不降级 (intercepts/badges 单调)
 * - getGuardRank 取最高已达档
 * - 下一档进度: 三通道最小剩余; 满级/已可升 → null
 */
describe('GUARD_RANKS 阶梯', () => {
  it('六档 level 0-5 连续', () => {
    expect(GUARD_RANKS).toHaveLength(6);
    GUARD_RANKS.forEach((r, i) => {
      expect(r.level).toBe(i);
      expect(r.emoji).toBeTruthy();
      expect(r.nameKey).toBe(`profile.guardRank.${r.id}`);
    });
  });

  it('阈值单调升 (intercepts 通道)', () => {
    const th = GUARD_RANKS.map((r) => r.minIntercepts);
    expect([...th].sort((a, b) => a - b)).toEqual(th);
  });
});

describe('getGuardRank OR 语义', () => {
  const z: GuardRankStats = { totalIntercepts: 0, streakDays: 0, badgesUnlocked: 0 };

  it('全零 → sprout', () => {
    expect(getGuardRank(z).id).toBe('sprout');
  });

  it('三通道各自解锁 trainee (3 拦/7 天/3 徽章)', () => {
    expect(getGuardRank({ ...z, totalIntercepts: 3 }).id).toBe('trainee');
    expect(getGuardRank({ ...z, streakDays: 7 }).id).toBe('trainee');
    expect(getGuardRank({ ...z, badgesUnlocked: 3 }).id).toBe('trainee');
  });

  it('streak 通道单独升 ambassador; 断裂连胜不降级语义 (intercepts 单调保档)', () => {
    // streakDays 120 → ambassador (level 4)
    expect(getGuardRank({ ...z, streakDays: 120 }).id).toBe('ambassador');
    // streak 断裂后: intercepts 100 已证 honoree — rank 不降 (reduce 取最高已达)
    expect(getGuardRank({ ...z, totalIntercepts: 100, streakDays: 0, badgesUnlocked: 0 }).id).toBe('honoree');
  });

  it('取最高已达档 (跨通道组合)', () => {
    expect(getGuardRank({ totalIntercepts: 10, streakDays: 60, badgesUnlocked: 0 }).id).toBe('partner');
  });
});

describe('getNextGuardRankProgress 下一档进度', () => {
  const sprout = GUARD_RANKS[0];

  it('sprout 零数据 → 最小剩余通道 (3 拦 vs 7 天 vs 3 徽章 → 3)', () => {
    const p = getNextGuardRankProgress(sprout, { totalIntercepts: 0, streakDays: 0, badgesUnlocked: 0 });
    expect(p?.next.id).toBe('trainee');
    expect(p?.channel).toBe('intercepts');
    expect(p?.remainingCount).toBe(3);
    expect(p?.remainingLabelKey).toBe('profile.guardRank.nextHintIntercepts');
  });

  it('最接近的通道胜出 (badges 差 1)', () => {
    const p = getNextGuardRankProgress(sprout, { totalIntercepts: 0, streakDays: 0, badgesUnlocked: 2 });
    expect(p?.channel).toBe('badges');
    expect(p?.remainingCount).toBe(1);
  });

  it('已可升下一档 (count<=0 全滤) → null', () => {
    const p = getNextGuardRankProgress(sprout, { totalIntercepts: 3, streakDays: 7, badgesUnlocked: 3 });
    expect(p).toBeNull();
  });

  it('满级 honoree → null (无下一档)', () => {
    const honoree = GUARD_RANKS[5];
    expect(getNextGuardRankProgress(honoree, { totalIntercepts: 999, streakDays: 999, badgesUnlocked: 99 })).toBeNull();
  });
});
