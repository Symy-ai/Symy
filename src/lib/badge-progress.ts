import type { BadgeDef } from '@/lib/badge-constants';
import { isDreamFundAchieved } from '@/lib/dream-achievement';
import { DEFAULT_HOURLY_RATE, moneyToHours } from '@/lib/freedom-time';
import type { BuddyState } from '@/types/buddy-state';

const UNTRACKABLE_PROGRESS_TYPES = new Set(['big_truth', 'clear_mind_streak']);

export function isProgressTrackable(progressType: BadgeDef['progressType']): boolean {
  return !UNTRACKABLE_PROGRESS_TYPES.has(progressType);
}

export function calcBadgeProgress(
  badge: BadgeDef,
  buddyState?: BuddyState | null,
  hourlyRate: number = DEFAULT_HOURLY_RATE
): number {
  if (!buddyState) return 0;

  switch (badge.progressType) {
    case 'challenge_wins':
      return buddyState.challengesCompleted || 0;
    case 'total_saves':
      return buddyState.totalSaved || 0;
    case 'streak_days':
      return buddyState.streak || 0;
    case 'invited_count':
      return buddyState.invitedCount || 0;
    case 'big_truth':
    case 'clear_mind_streak':
      return 0;
    case 'dream_fund_count':
      return buddyState.dreamFunds?.length || 0;
    case 'dream_fund_funded':
      return buddyState.dreamFunds?.filter((fund) => (fund.current || 0) > 0).length || 0;
    case 'won_back_hours':
      return Math.floor(moneyToHours(buddyState.totalSaved || 0, hourlyRate));
    case 'dream_fund_completed':
      return buddyState.dreamFunds?.filter(isDreamFundAchieved).length || 0;
    default:
      return 0;
  }
}
