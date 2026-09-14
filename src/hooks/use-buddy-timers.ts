/**
 * useBuddyTimers — Token drain + streak bonus
 *
 * 🔧 Round 95: Updated for React Query — removed markLocalDirty/pushToServer.
 * 🔧 Round 97: Fixed — use pushMutation pattern (optimistic + rollback + version update)
 *    instead of raw apiFetch (which bypassed version CAS and had no rollback).
 * 🔧 F3 fix (Round 101): On 409 conflict, invalidate the query to refetch server state
 *    instead of just rolling back. The old rollback discarded the user's intended update
 *    AND didn't sync with the server's newer version → next push would 409 again.
 */

'use client';

import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { getHealthFromVitality } from '@/lib/buddy-defaults';
import type { BuddyState, BuddyHealth } from '@/types/buddy-state';
import { apiFetch, ApiError } from '@/lib/api-client';
import { logger } from '@/lib/logger';

const BUDDY_STATE_KEY = ['buddy-state'] as const;

export interface UseBuddyTimersArgs {
  isLoaded: boolean;
  userId: string | undefined;
}

export function useBuddyTimers({ isLoaded, userId }: UseBuddyTimersArgs) {
  const queryClient = useQueryClient();

  // ============================================================
  // Helper: optimistic update + push to server + rollback on failure
  // 🔧 Round 97: Replaces raw apiFetch that had no rollback + ignored version
  // 🔧 F3 fix (Round 101): On 409, invalidate to refetch server state (don't just rollback)
  // ============================================================
  const updateBuddyState = (updater: (prev: BuddyState) => BuddyState) => {
    const prev = queryClient.getQueryData<BuddyState>(BUDDY_STATE_KEY);
    if (!prev) return;

    const newState = updater(prev);
    // Optimistic update (functional updater preserves any concurrent changes)
    queryClient.setQueryData(BUDDY_STATE_KEY, newState);

    // Push to server with version CAS
    // 🔧 Round 97 P0 fix: API expects { buddyState: { ... } }, not raw BuddyState
    // 🔧 F3 note (Round 101): PUT /api/buddy/state uses version CAS. On 409, we invalidate
    //   the query to refetch server state (see catch handler below). Long-term: migrate to
    //   apply_buddy_state_delta RPC. Short-term: 409 refetch recovery is the correct pattern.
    // eslint-disable-next-line symy/no-put-state-endpoints -- F3: version CAS with 409 refetch recovery
    apiFetch<{ version?: number }>('/api/buddy/state', {
      method: 'PUT',
      body: { buddyState: newState },
    }).then((result) => {
      // 🔧 BUG-003 fix: Use functional updater instead of full-replace.
      //   Old code: setQueryData(key, { ...newState, version }) — full replacement
      //   that clobbers any concurrent cache changes (Realtime invalidate refetch,
      //   addTokens, dream fund mutations) that happened between the optimistic
      //   setQueryData above and this .then() callback. This caused Tokens/Mood/EXP
      //   to visibly jump when switching tabs (which can trigger staleTime refetch).
      //   New code: merge the server-returned version into the CURRENT cache value,
      //   preserving concurrent updates. The timer's effect (token drain, streak
      //   bonus) was already applied optimistically and is included in newState;
      //   we only need to update the version field.
      const newVersion = result.version ?? newState.version + 1;
      queryClient.setQueryData<BuddyState>(BUDDY_STATE_KEY, (current) => {
        if (!current) return { ...newState, version: newVersion };
        // Only update version; preserve all current field values (which may
        // include concurrent updates from other sources).
        // If current.version is already >= newVersion (server processed another
        // update in between), don't downgrade the version.
        if (current.version >= newVersion) return current;
        return { ...current, version: newVersion };
      });
    }).catch((err) => {
      // 🔧 F3 fix (Round 101): On 409 conflict, the server has a newer version than we do.
      //   Old code: just rollback to prev (which has the OLD version) → next push 409s again.
      //   New code: invalidate the query to refetch the server's current state, then the
      //   next timer tick will compute the delta against the fresh server state.
      if (err instanceof ApiError && err.status === 409) {
        logger.info('[BuddyTimers] Version conflict (409) — refetching server state');
        queryClient.invalidateQueries({ queryKey: BUDDY_STATE_KEY });
      } else {
        // 🔧 BUG-003 fix: Use functional rollback to only revert the fields this
        //   timer changed, rather than clobbering the entire cache state.
        //   Old code: setQueryData(key, prev) — full replacement that would
        //   overwrite concurrent updates from other sources.
        logger.warn('[BuddyTimers] Push failed — rolling back:', err);
        queryClient.setQueryData<BuddyState>(BUDDY_STATE_KEY, (current) => {
          if (!current) return prev;
          // Revert to prev only if the cache still holds our optimistic state.
          // If something else changed it (e.g. a newer server refetch arrived),
          // keep the newer data.
          if (current.version === newState.version) return prev;
          return current;
        });
      }
    });
  };

  // ======== Token drain (30-minute interval) ========
  useEffect(() => {
    if (!isLoaded || !userId) return;
    const DRAIN_INTERVAL = 30 * 60 * 1000;
    const STORAGE_KEY = `symy-buddy-last-drain-${userId}`;

    const getLastDrain = (): number => {
      try {
        const saved = localStorage.getItem(STORAGE_KEY);
        if (!saved) return Date.now();
        const ts = parseInt(saved, 10);
        if (!Number.isFinite(ts) || ts > Date.now()) return Date.now();
        return ts;
      // safe to ignore: non-critical background operation, error already logged
      } catch {
                // safe to ignore: non-critical background operation, error already logged
        return Date.now();
      }
    };

    const saveLastDrain = (ts: number) => {
      try { localStorage.setItem(STORAGE_KEY, String(ts)); } catch { /* non-critical */ }
    };

    const checkAndDrain = () => {
      const now = Date.now();
      const lastDrain = getLastDrain();
      const elapsed = now - lastDrain;

      if (elapsed < 0) {
        saveLastDrain(now);
        return;
      }

      if (elapsed >= DRAIN_INTERVAL) {
        const missedIntervals = Math.min(Math.floor(elapsed / DRAIN_INTERVAL), 48);

        updateBuddyState((prev) => {
          const newTokens = Math.max(0, prev.tokens - missedIntervals);
          const newVitality = Math.max(0, Math.min(100, prev.vitality - missedIntervals * 0.5));
          return {
            ...prev,
            tokens: newTokens,
            vitality: newVitality,
            health: getHealthFromVitality(newVitality) as BuddyHealth,
          };
        });
        saveLastDrain(lastDrain + missedIntervals * DRAIN_INTERVAL);
      }
    };

    checkAndDrain();
    const interval = setInterval(checkAndDrain, 60 * 1000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- updateBuddyState is stable (closure over queryClient)
  }, [isLoaded, userId, queryClient]);

  // ======== Daily streak vitality bonus ========
  useEffect(() => {
    if (!isLoaded || !userId) return;
    const STREAK_KEY = `symy-buddy-last-streak-day-${userId}`;

    const checkStreakBonus = () => {
      const today = new Date().toISOString().split('T')[0];
      try {
        const lastStreakDay = localStorage.getItem(STREAK_KEY);
        if (lastStreakDay !== today) {
          const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];
          const isConsecutive = lastStreakDay === yesterday;

          localStorage.setItem(STREAK_KEY, today);

          updateBuddyState((prev) => {
            const newStreak = isConsecutive ? prev.streak + 1 : 1;
            // 🔧 S4 fix: 断签时保存 prev_streak, 供"代币补救"功能恢复
            //   存到 localStorage (无需 DB 迁移), key: symy-buddy-prev-streak-{userId}
            if (!isConsecutive && prev.streak > 1) {
              try {
                localStorage.setItem(`symy-buddy-prev-streak-${userId}`, String(prev.streak));
              } catch { /* silent: non-critical */ }
            }
            const newVitality = Math.min(100, prev.vitality + 3);
            const newXp = prev.xp + 2;
            const leveledUp = newXp >= prev.xpToNext;
            return {
              ...prev,
              vitality: newVitality,
              health: getHealthFromVitality(newVitality) as BuddyHealth,
              xp: leveledUp ? newXp - prev.xpToNext : newXp,
              xpToNext: leveledUp ? Math.floor(prev.xpToNext * 1.3) : prev.xpToNext,
              level: leveledUp ? prev.level + 1 : prev.level,
              streak: newStreak,
            };
          });
        }
      } catch {
        // localStorage not available
      }
    };

    checkStreakBonus();
    const interval = setInterval(checkStreakBonus, 60 * 60 * 1000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- updateBuddyState is stable (closure over queryClient)
  }, [isLoaded, userId, queryClient]);
}
