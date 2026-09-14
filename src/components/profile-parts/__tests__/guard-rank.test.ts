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
  it('uses the factor with the smallest remaining count', () => {
    const progress = getNextGuardRankProgress(GUARD_RANKS[2], { totalIntercepts: 20, streakDays: 58, badgesUnlocked: 8 });
    expect(progress).toMatchObject({
      remainingLabelKey: 'profile.guardRank.nextHintBadges',
      remainingCount: 1,
      next: GUARD_RANKS[3],
    });
  });

  it('returns null at the top rank', () => {
    expect(getNextGuardRankProgress(GUARD_RANKS[5], { totalIntercepts: 999, streakDays: 999, badgesUnlocked: 99 })).toBeNull();
  });
});
