/**
 * Guardian rank ladder — pure display logic from cumulative guard facts.
 * Any threshold factor unlocks the rank. Cumulative intercepts and badges never
 * decrease, so a broken streak cannot demote a rank proven by those factors.
 */
export type GuardRankId = 'sprout' | 'trainee' | 'companion' | 'partner' | 'ambassador' | 'honoree';

export interface GuardRank {
  id: GuardRankId;
  level: number;
  nameKey: string;
  emoji: string;
  minIntercepts: number;
  altStreakDays: number;
  altBadges: number;
}

export interface GuardRankStats {
  totalIntercepts: number;
  streakDays: number;
  badgesUnlocked: number;
}

export const GUARD_RANKS: GuardRank[] = [
  { id: 'sprout', level: 0, nameKey: 'profile.guardRank.sprout', emoji: '🌱', minIntercepts: 0, altStreakDays: 0, altBadges: 0 },
  { id: 'trainee', level: 1, nameKey: 'profile.guardRank.trainee', emoji: '🛡️', minIntercepts: 3, altStreakDays: 7, altBadges: 3 },
  { id: 'companion', level: 2, nameKey: 'profile.guardRank.companion', emoji: '🤝', minIntercepts: 10, altStreakDays: 30, altBadges: 6 },
  { id: 'partner', level: 3, nameKey: 'profile.guardRank.partner', emoji: '🎗️', minIntercepts: 25, altStreakDays: 60, altBadges: 9 },
  { id: 'ambassador', level: 4, nameKey: 'profile.guardRank.ambassador', emoji: '🏆', minIntercepts: 50, altStreakDays: 120, altBadges: 12 },
  { id: 'honoree', level: 5, nameKey: 'profile.guardRank.honoree', emoji: '👑', minIntercepts: 100, altStreakDays: 365, altBadges: 14 },
];

export function getGuardRank(stats: GuardRankStats): GuardRank {
  return GUARD_RANKS.reduce(
    (highest, rank) =>
      stats.totalIntercepts >= rank.minIntercepts || stats.streakDays >= rank.altStreakDays || stats.badgesUnlocked >= rank.altBadges
        ? rank
        : highest,
    GUARD_RANKS[0],
  );
}

export type GuardRankChannel = 'intercepts' | 'streakDays' | 'badges';

export function getNextGuardRankProgress(
  current: GuardRank,
  stats: GuardRankStats,
): { next: GuardRank; channel: GuardRankChannel; remainingLabelKey: string; remainingCount: number } | null {
  const next = GUARD_RANKS[current.level + 1];
  if (!next) return null;

  const candidates: { channel: GuardRankChannel; count: number; key: string }[] = [
    { channel: 'intercepts', count: next.minIntercepts - stats.totalIntercepts, key: 'profile.guardRank.nextHintIntercepts' },
    { channel: 'streakDays', count: next.altStreakDays - stats.streakDays, key: 'profile.guardRank.nextHintDays' },
    { channel: 'badges', count: next.altBadges - stats.badgesUnlocked, key: 'profile.guardRank.nextHintBadges' },
  ];
  const options = candidates.filter((option) => option.count > 0);
  if (options.length === 0) return null;

  const closest = options.reduce((best, option) => (option.count < best.count ? option : best));
  return { next, channel: closest.channel, remainingLabelKey: closest.key, remainingCount: closest.count };
}
