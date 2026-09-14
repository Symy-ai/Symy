/**
 * guard-rank-progress 纯函数测试 (Tier 53)
 *
 * 规则：
 * - pct = (base + current) / (base + target)，取最高通道作为主进度
 * - 负值/NaN/非法输入防御返回 null
 * - getAvgHoursPerGuard：分母 0 或缺失/null 返回 null；正常除法
 */

import { describe, it, expect } from 'vitest';
import { getRankProgressPct, getAvgHoursPerGuard } from '@/lib/guard-rank-progress';
import { GUARD_RANKS } from '@/lib/guard-rank';
import type { GuardRank, GuardRankStats } from '@/lib/guard-rank';

function rank(id: GuardRank['id']): GuardRank {
  return GUARD_RANKS.find((r) => r.id === id)!;
}

describe('getRankProgressPct', () => {
  it('computes pct = (base + current) / (base + target) and caps at 1 when already past next threshold', () => {
    const current = rank('trainee');
    // trainee(3)->companion(10): intercepts already at 10 => pct capped to 1
    const stats: GuardRankStats = { totalIntercepts: 10, streakDays: 2, badgesUnlocked: 1 };
    const best = getRankProgressPct(current, stats);
    expect(best).toEqual({ channel: 'intercepts', pct: 1 });
  });

  it('picks the highest pct channel when multiple are close', () => {
    const current = rank('companion');
    const stats: GuardRankStats = { totalIntercepts: 15, streakDays: 31, badgesUnlocked: 7 };
    // companion(10)->partner(25): intercepts=(10+15)/(10+25)=25/35≈0.714; streak=(30+31)/(30+60)=61/90≈0.677; badges=(6+7)/(6+9)=13/15≈0.866
    const best = getRankProgressPct(current, stats);
    expect(best!.channel).toBe('badges');
  });

  it('ignores invalid channels and returns best valid channel when some inputs are negative/NaN', () => {
    const current = rank('trainee');
    // one invalid channel shouldn't block the other valid channels
    expect(getRankProgressPct(current, { totalIntercepts: -1, streakDays: 5, badgesUnlocked: 3 })).toEqual({ channel: 'badges', pct: 6 / 9 });
    expect(getRankProgressPct(current, { totalIntercepts: 5, streakDays: -1, badgesUnlocked: 3 })).toEqual({ channel: 'badges', pct: 6 / 9 });
    expect(getRankProgressPct(current, { totalIntercepts: NaN, streakDays: 5, badgesUnlocked: 3 })).toEqual({ channel: 'badges', pct: 6 / 9 });
  });

  it('returns null when current.level is invalid', () => {
    const current = { ...rank('trainee'), level: NaN };
    expect(getRankProgressPct(current, { totalIntercepts: 5, streakDays: 5, badgesUnlocked: 5 })).toBeNull();
  });
});

describe('getAvgHoursPerGuard', () => {
  it('returns null when weekly is null/undefined', () => {
    expect(getAvgHoursPerGuard(null, 25)).toBeNull();
    expect(getAvgHoursPerGuard(undefined as never, 25)).toBeNull();
  });

  it('returns null when challengesCompleted <= 0', () => {
    expect(getAvgHoursPerGuard({ challengesCompleted: 0, totalSaved: 100 }, 25)).toBeNull();
    expect(getAvgHoursPerGuard({ challengesCompleted: -1, totalSaved: 100 }, 25)).toBeNull();
  });

  it('returns null when totalSaved <= 0', () => {
    expect(getAvgHoursPerGuard({ challengesCompleted: 5, totalSaved: 0 }, 25)).toBeNull();
    expect(getAvgHoursPerGuard({ challengesCompleted: 5, totalSaved: -10 }, 25)).toBeNull();
  });

  it('computes average correctly', () => {
    // $200 / 10 guards / $25/hr = 0.8 h/guard
    expect(getAvgHoursPerGuard({ challengesCompleted: 10, totalSaved: 200 }, 25)).toBeCloseTo(0.8, 4);
  });

  it('falls back to default rate 25 when hourlyRate is invalid', () => {
    expect(getAvgHoursPerGuard({ challengesCompleted: 2, totalSaved: 50 }, 25)).toBeCloseTo(1.0, 4);
    expect(getAvgHoursPerGuard({ challengesCompleted: 2, totalSaved: 50 }, 0)).toBeCloseTo(1.0, 4);
    expect(getAvgHoursPerGuard({ challengesCompleted: 2, totalSaved: 50 }, NaN)).toBeCloseTo(1.0, 4);
  });
});
