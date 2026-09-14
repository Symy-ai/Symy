/**
 * Badge Goal — localStorage helpers for the active badge goal.
 *
 * Zero-DDL client-only state:
 *  - 'symy-badge-goal' stores the active badge id (or empty string).
 *  - 'symy-badge-goal-celebrated' stores a comma-separated list of badge ids already celebrated.
 *
 * Privacy/no-localStorage → silent no-op.
 */

import { ALL_BADGES } from './badge-constants';

const GOAL_KEY = 'symy-badge-goal';
const CELEBRATED_KEY = 'symy-badge-goal-celebrated';

function isBadgeId(badgeId: string | null | undefined): badgeId is string {
  return !!badgeId && Array.isArray(ALL_BADGES) && ALL_BADGES.some((b) => b.id === badgeId);
}

function safeLocalStorage(): Storage | null {
  try {
    if (typeof window === 'undefined') return null;
    return window.localStorage;
  } catch {
    return null;
  }
}

export function getBadgeGoal(): string | null {
  const storage = safeLocalStorage();
  if (!storage) return null;
  try {
    const raw = storage.getItem(GOAL_KEY);
    if (!raw) return null;
    const value = raw.trim();
    if (!value) return null;
    return isBadgeId(value) ? value : null;
  } catch {
    return null;
  }
}

export function setBadgeGoal(badgeId: string | null): void {
  const storage = safeLocalStorage();
  if (!storage) return;
  try {
    if (!badgeId) {
      storage.removeItem(GOAL_KEY);
      return;
    }
    if (!isBadgeId(badgeId)) return;
    storage.setItem(GOAL_KEY, badgeId);
  } catch {
    // safe to ignore
  }
}

export function isBadgeGoalCelebrated(badgeId: string): boolean {
  const storage = safeLocalStorage();
  if (!storage) return false;
  try {
    const raw = storage.getItem(CELEBRATED_KEY);
    if (!raw) return false;
    const set = new Set(raw.split(',').map((s) => s.trim()).filter(Boolean));
    return set.has(badgeId);
  } catch {
    return false;
  }
}

export function markBadgeGoalCelebrated(badgeId: string): void {
  const storage = safeLocalStorage();
  if (!storage) return;
  try {
    const raw = storage.getItem(CELEBRATED_KEY);
    const set = new Set<string>();
    if (raw) {
      raw.split(',').forEach((s) => {
        const v = s.trim();
        if (v) set.add(v);
      });
    }
    if (isBadgeId(badgeId)) {
      set.add(badgeId);
    }
    storage.setItem(CELEBRATED_KEY, Array.from(set).join(','));
  } catch {
    // safe to ignore
  }
}
