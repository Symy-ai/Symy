/**
 * Buddy State Helpers — Shared type definitions and conversion utilities.
 *
 * 🔧 Round 95: Removed LocalBuddyState/Dexie conversion functions.
 *    React Query uses BuddyState directly — no more local↔server conversion.
 *    Kept: DEFAULT_STATE, getHealthFromVitality, mergeServerStateIntoReact.
 */

import { getHealthFromVitality as sharedGetHealthFromVitality } from '@/lib/buddy-defaults';
// eslint-disable-next-line no-duplicate-imports
import {
  DEFAULT_VITALITY, DEFAULT_TOKENS, DEFAULT_HEALTH, DEFAULT_LEVEL,
  DEFAULT_XP, DEFAULT_XP_TO_NEXT, DEFAULT_STREAK,
  DEFAULT_BADGES, DEFAULT_TOTAL_SAVED, DEFAULT_CHALLENGES_COMPLETED,
  DEFAULT_GROWTH_STAGE, DEFAULT_PERSONALITY, DEFAULT_INTIMACY,
  DEFAULT_DAILY_NEEDS,
} from '@/lib/buddy-defaults';

export type { BuddyHealth, DreamFund, BuddyState, GrowthStage, Personality, DailyNeeds, ProactiveMessage } from '@/types/buddy-state';
import type { BuddyHealth, BuddyState } from '@/types/buddy-state';

export function getHealthFromVitality(v: number): BuddyHealth {
  return sharedGetHealthFromVitality(v) as BuddyHealth;
}

export const DEFAULT_STATE: BuddyState = {
  vitality: DEFAULT_VITALITY,
  tokens: DEFAULT_TOKENS,
  health: DEFAULT_HEALTH as BuddyHealth,
  level: DEFAULT_LEVEL,
  xp: DEFAULT_XP,
  xpToNext: DEFAULT_XP_TO_NEXT,
  streak: DEFAULT_STREAK,
  dreamFunds: [
    { id: 'df-savings', name: 'Savings', target: 2147483647, current: 0, emoji: '🏦' },
  ],
  badges: [...DEFAULT_BADGES],
  totalSaved: DEFAULT_TOTAL_SAVED,
  challengesCompleted: DEFAULT_CHALLENGES_COMPLETED,
  lastHealingKitAt: null,
  version: 0,
  growthStage: DEFAULT_GROWTH_STAGE,
  personality: DEFAULT_PERSONALITY,
  intimacy: DEFAULT_INTIMACY,
  dailyNeeds: { ...DEFAULT_DAILY_NEEDS },
  proactiveMessages: [],
  personalityAwakenedAt: null,
  lastActiveAt: null,
};

/**
 * Merge server state into React state, preserving local streak.
 * Used by React Query's Realtime invalidation callback.
 */
export function mergeServerStateIntoReact<T extends { streak: number }>(
  prev: T,
  serverState: T,
): T {
  return {
    ...serverState,
    streak: Math.max(prev.streak, serverState.streak),
  };
}
