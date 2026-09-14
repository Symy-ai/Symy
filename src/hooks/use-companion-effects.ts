/**
 * P1-5 机制闭合 (Round 90): 主动留言生成 + 个性觉醒 + challenge stats
 *
 * 提取自 page.tsx 的 3 个 effect, 避免超过 800 行限制
 */

'use client';

import { useEffect, useState } from 'react';
import { apiFetch } from '@/lib/api-client';
import { logger } from '@/lib/logger';
import type { BuddyState } from '@/types/buddy-state';

interface UseCompanionEffectsParams {
  isDemo: boolean;
  buddyIsLoaded: boolean;
  userId?: string;
  realBuddyState: BuddyState;
  buddyChallengesCompleted: number;
}

export function useCompanionEffects({
  isDemo,
  buddyIsLoaded,
  userId,
  realBuddyState,
  buddyChallengesCompleted,
}: UseCompanionEffectsParams) {
  const [challengeStats, setChallengeStats] = useState<{ totalSaw: number } | null>(null);

  // 1. 主动留言生成 — mount 时调 API (每天最多 1 次)
  useEffect(() => {
    if (isDemo || !buddyIsLoaded || !userId) return;
    const todayKey = new Date().toISOString().slice(0, 10);
    const storageKey = `symy-proactive-checked-${userId}`;
    const lastChecked = typeof window !== 'undefined' ? localStorage.getItem(storageKey) : null;
    if (lastChecked === todayKey) return;

    const lastOpenDate = typeof window !== 'undefined' ? localStorage.getItem(`symy-last-open-${userId}`) : null;

  // eslint-disable-next-line symy/no-raw-fetch-in-use-effect
    fetch('/api/buddy/proactive-messages/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ lastOpenDate }),
    }).catch((err) => {
      // 🔧 Round 99 Rule 9: was empty catch — proactive message generation failure was invisible
      logger.warn('[CompanionEffects] Proactive message generation failed:', err);
    });

    if (typeof window !== 'undefined') {
      localStorage.setItem(storageKey, todayKey);
      localStorage.setItem(`symy-last-open-${userId}`, todayKey);
    }
  }, [isDemo, buddyIsLoaded, userId]);

  // 2. 个性觉醒 — 第 7 天自动评估
  useEffect(() => {
    if (isDemo || !buddyIsLoaded || !userId) return;
    if (realBuddyState.personality !== 'unknown') return;
    if (realBuddyState.personalityAwakenedAt) return;

    const storageKey = `symy-personality-checked-${userId}`;
    const lastChecked = typeof window !== 'undefined' ? localStorage.getItem(storageKey) : null;
    const todayKey = new Date().toISOString().slice(0, 10);
    if (lastChecked === todayKey) return;

  // eslint-disable-next-line symy/no-raw-fetch-in-use-effect
    fetch('/api/buddy/personality', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    })
      .then(res => res.json())
      .then(data => {
        if (data.success && data.personality && data.personality !== 'unknown') {
          if (typeof window !== 'undefined') {
            localStorage.setItem(storageKey, todayKey);
          }
        }
      })
      .catch((err) => {
        // 🔧 Round 99 Rule 9: was empty catch — personality awakening failure was invisible
        logger.warn('[CompanionEffects] Personality awakening failed:', err);
      });

    if (typeof window !== 'undefined') {
      localStorage.setItem(storageKey, todayKey);
    }
  }, [isDemo, buddyIsLoaded, userId, realBuddyState.personality, realBuddyState.personalityAwakenedAt]);

  // 3. Challenge stats — 从 active_challenges 表查 (不受 health_events Clear 影响)
  useEffect(() => {
    if (isDemo || !userId) return;
    // 🔧 2026-07-15 (deep audit NEW #2): Add cancelled guard — prevents setState
    // after unmount or cross-user data leak on rapid account switch
    let cancelled = false;
  // eslint-disable-next-line symy/no-raw-fetch-in-use-effect
    apiFetch<{ totalSaw: number; totalPassed: number; totalFailed: number }>('/api/challenge/stats')
      .then(data => { if (!cancelled && data) setChallengeStats(data); })
      .catch((err) => {
        if (!cancelled) logger.warn('[CompanionEffects] Challenge stats fetch failed:', err);
      });
    return () => { cancelled = true; };
  }, [isDemo, userId, buddyChallengesCompleted]);

  return { challengeStats };
}
