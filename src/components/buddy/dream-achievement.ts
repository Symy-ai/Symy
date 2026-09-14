import type { DreamFund } from '@/types/buddy-state';

export const DREAM_ACHIEVEMENT_PREFIX = 'symy-dream-achieved:';
export type DreamAchievementState = 'unachieved' | '1';

export function dreamAchievementKey(fundId: string): string {
  return `${DREAM_ACHIEVEMENT_PREFIX}${fundId}`;
}

export function isDreamFundAchieved(fund: DreamFund): boolean {
  return fund.id !== 'savings' && fund.target > 0 && fund.current >= fund.target;
}

export function resetDreamAchievement(fundId: string): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(dreamAchievementKey(fundId));
  } catch {
    // Privacy-mode failures are safe to ignore; the next observation remains idempotent.
  }
}

export function claimDreamAchievement(fundId: string): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(dreamAchievementKey(fundId), '1');
  } catch {
    // Privacy-mode failures are safe to ignore; memory guards prevent a repeat this session.
  }
}

export function readDreamAchievement(fundId: string): DreamAchievementState | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(dreamAchievementKey(fundId));
    return raw === 'unachieved' || raw === '1' ? raw : null;
  } catch {
    // safe to ignore: privacy-mode failures fall back to a null baseline.
    return null;
  }
}

export function markDreamBaseline(fundId: string): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(dreamAchievementKey(fundId), 'unachieved');
  } catch {
    // Privacy-mode failures are safe to ignore.
  }
}

export function resolveDreamAchievement(funds: DreamFund[], claimed: (fundId: string) => boolean): DreamFund | null {
  const firstTimeWinners = funds.filter((fund) => isDreamFundAchieved(fund) && !claimed(fund.id));
  if (firstTimeWinners.length === 0) return null;
  return [...firstTimeWinners].sort((a, b) => b.current - a.current)[0] ?? null;
}
