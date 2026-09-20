import { describe, expect, it } from 'vitest';
import { GUARD_RANKS, getGuardRank, getNextGuardRankProgress } from '@/lib/guard-rank';

describe('getGuardRank', () => {
  it.each([
    ['sprout', { totalIntercepts: 0, streakDays: 0, badgesUnlocked: 0 }],
    ['trainee', { totalIntercepts: 3, streakDays: 0, badgesUnlocked: 0 }],
    ['trainee', { totalIntercepts: 0, streakDays: 7, badgesUnlocked: 0 }],
    ['trainee', { totalIntercepts: 0, streakDays: 0, badgesUnlocked: 3 }],
    ['companion', { totalIntercepts: 9, streakDays: 30, badgesUnlocked: 0 }],
    ['partner', { totalIntercepts: 25, streakDays: 0, badgesUnlocked: 0 }],
    ['ambassador', { totalIntercepts: 0, streakDays: 0, badgesUnlocked: 12 }],
    ['honoree', { totalIntercepts: 100, streakDays: 365, badgesUnlocked: 14 }],
  ])('returns %s for %j', (id, stats) => {
    expect(getGuardRank(stats).id).toBe(id);
  });

  it('keeps the rank when a current streak recedes but cumulative intercepts remain', () => {
    expect(getGuardRank({ totalIntercepts: 25, streakDays: 0, badgesUnlocked: 0 }).id).toBe('partner');
  });
});

describe('getNextGuardRankProgress', () => {
  it('uses the factor with the smallest remaining count and reports its channel', () => {
    const progress = getNextGuardRankProgress(GUARD_RANKS[2], { totalIntercepts: 20, streakDays: 58, badgesUnlocked: 8 });
    expect(progress).toMatchObject({
      channel: 'badges',
      remainingLabelKey: 'profile.guardRank.nextHintBadges',
      remainingCount: 1,
      next: GUARD_RANKS[3],
    });
  });

  it.each([
    // trainee(1)→companion(2) 门槛 10/30/6 — 各构造单通道恰差 1
    ['intercepts', { totalIntercepts: 9, streakDays: 0, badgesUnlocked: 0 }],
    ['streakDays', { totalIntercepts: 0, streakDays: 29, badgesUnlocked: 0 }],
    ['badges', { totalIntercepts: 0, streakDays: 0, badgesUnlocked: 5 }],
  ] as const)('reports channel %s when it is the closest factor', (channel, stats) => {
    const progress = getNextGuardRankProgress(GUARD_RANKS[1], stats);
    expect(progress).toMatchObject({ channel, remainingCount: 1, next: GUARD_RANKS[2] });
  });

  it('skips a channel already at the next threshold and picks the next closest', () => {
    // intercepts 已恰好在 companion 门槛 (10) — 差距为 0 被过滤, 剩余通道里 badges (6) 最近
    const progress = getNextGuardRankProgress(GUARD_RANKS[1], { totalIntercepts: 10, streakDays: 0, badgesUnlocked: 0 });
    expect(progress).toMatchObject({ channel: 'badges', remainingCount: 6, next: GUARD_RANKS[2] });
  });

  it('returns null at the top rank', () => {
    expect(getNextGuardRankProgress(GUARD_RANKS[5], { totalIntercepts: 999, streakDays: 999, badgesUnlocked: 99 })).toBeNull();
  });
});
