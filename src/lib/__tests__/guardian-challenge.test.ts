import { describe, expect, it } from 'vitest';

import type {
  ChallengePeriod,
  ChallengeProgressSource,
  ChallengeTier,
  GuardianChallenge,
} from '../guardian-challenge';

/**
 * guardian-challenge.ts (37行) — 守护挑战纯类型 (第十一用)。
 *
 * 锁定:
 * - period 三档 / tier 三层 / progressSource 八源
 * - GuardianChallenge 九字段 satisfies (title/desc/done 三 key 约定)
 */
describe('guardian-challenge 纯类型件第十一用', () => {
  it('period 三档 / tier 三层 / 八 progressSource', () => {
    const periods: ChallengePeriod[] = ['daily', 'weekly', 'all_time'];
    const tiers: ChallengeTier[] = ['starter', 'regular', 'hard'];
    const sources: ChallengeProgressSource[] = [
      'today_see_it', 'today_chat', 'week_see_it', 'week_streak_days',
      'week_money_left', 'total_see_it', 'total_money_left', 'dream_funds_funded',
    ];
    expect(periods).toHaveLength(3);
    expect(tiers).toHaveLength(3);
    expect(sources).toHaveLength(8);
  });

  it('GuardianChallenge satisfies 九字段', () => {
    const c: GuardianChallenge = {
      id: 'season_double11',
      period: 'weekly',
      titleKey: 'buddy.guardSeason.challenges.double11.title',
      descKey: 'buddy.guardSeason.challenges.double11.desc',
      doneTitleKey: 'buddy.guardSeason.challenges.double11.done',
      progressSource: 'week_money_left',
      target: 100,
      tier: 'hard',
      rewardBadgeId: 'money_meadow_100',
    } satisfies GuardianChallenge;
    expect(c.titleKey).toContain('double11'); // key 段约定锚 (buddy.guardSeason.challenges.<key 段>)
    expect(c.target).toBe(100);
    expect(c.tier).toBe('hard');
  });
});
