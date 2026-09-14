/**
 * useHealthEvents — Health event log fetching with generation counter (race-safe)
 *
 * 🔧 架构优化 Round 66: 从 buddy-tab.tsx 提取 health events 获取逻辑 (~100 行)
 *    好处:
 *      1. buddy-tab.tsx 行数减少
 *      2. 获取逻辑独立, 复用 useDebouncedFetch 模式
 *      3. 关注点分离 — buddy-tab 专注渲染, 此 hook 专注数据获取
 */

'use client';

import { useState, useEffect, useRef } from 'react';
import { apiFetch, ApiError } from '@/lib/api-client';
import { logger } from '@/lib/logger';
import type { HealthEvent } from '@/types/buddy-state';
import { createClient } from '@/lib/supabase-browser';

export interface UseHealthEventsArgs {
  isDemo: boolean;
  userId?: string;
  vitality: number;
}

export interface UseHealthEventsResult {
  healthEvents: HealthEvent[];
  isLoadingEvents: boolean;
  healthEventsError: string | null;
  retryFetch: () => void;
}

export function useHealthEvents({ isDemo, userId, vitality }: UseHealthEventsArgs): UseHealthEventsResult {
  const [healthEvents, setHealthEvents] = useState<HealthEvent[]>([]);
  const [isLoadingEvents, setIsLoadingEvents] = useState(true);
  const [healthEventsError, setHealthEventsError] = useState<string | null>(null);

  const hasFetchedOnceRef = useRef(false);
  const healthFetchGenRef = useRef(0);
  const healthDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const healthActiveRef = useRef(true);
  const prevBuddyUserIdRef = useRef<string | undefined>(undefined);
  // 🔧 2026-07-15 (ARCH-11 #11): retryNonce as state (was ref — didn't trigger re-render)
  const [retryNonce, setRetryNonce] = useState(0);

  // Cleanup on unmount
  useEffect(() => {
    healthActiveRef.current = true;
    return () => {
      healthActiveRef.current = false;
      if (healthDebounceRef.current) {
        clearTimeout(healthDebounceRef.current);
        healthDebounceRef.current = null;
      }
    };
  }, []);

  // Cross-user cleanup
  useEffect(() => {
    if (prevBuddyUserIdRef.current !== undefined && prevBuddyUserIdRef.current !== userId) {
      setHealthEvents([]);
      hasFetchedOnceRef.current = false;
      healthFetchGenRef.current = 0;
      setHealthEventsError(null);
    }
    prevBuddyUserIdRef.current = userId;
  }, [userId]);

  // Debounced fetch with generation counter
  useEffect(() => {
    if (isDemo) {
      setHealthEvents([]);
      setIsLoadingEvents(false);
      hasFetchedOnceRef.current = true;
      return;
    }
    // 🔧 F2 fix (Round 101): Don't fetch if user is not authenticated.
    //   Old code fired the fetch even when userId was undefined → 401 errors on cold load.
    if (!userId) {
      setHealthEvents([]);
      setIsLoadingEvents(false);
      hasFetchedOnceRef.current = true;
      return;
    }

    if (healthDebounceRef.current) clearTimeout(healthDebounceRef.current);
    healthDebounceRef.current = setTimeout(() => {
      healthDebounceRef.current = null;
      const myGen = ++healthFetchGenRef.current;

      async function fetchEvents() {
        if (!hasFetchedOnceRef.current) {
          setIsLoadingEvents(true);
        }
        try {
          // 🔧 F4 fix (Round 101): Use limit=50 (same as page.tsx) to share the server-side
          //   cache. Old code used limit=10 which caused a separate API call that couldn't
          //   be deduplicated with the limit=50 call from page.tsx.
          //   The UI only displays the first 10 anyway (sliced in the component), so we
          //   fetch 50 and let the component slice — this also gives us more data for free
          //   if the user scrolls.
  // eslint-disable-next-line symy/no-raw-fetch-in-use-effect
          const data = await apiFetch<{ events?: HealthEvent[] }>('/api/buddy/health-events?limit=50');
          if (myGen !== healthFetchGenRef.current) return;
          if (!healthActiveRef.current) return;
          const events = Array.isArray(data?.events) ? data.events : [];
          setHealthEvents(events);
          setHealthEventsError(null);
        } catch (err) {
          if (myGen !== healthFetchGenRef.current) return;
          if (!healthActiveRef.current) return;
          if (!hasFetchedOnceRef.current) {
            const msg = err instanceof ApiError && (err.status === 401 || err.status === 403)
              ? 'Authentication required'
              : err instanceof Error ? err.message : 'Failed to load';
            setHealthEventsError(msg);
          } else {
            logger.warn('[useHealthEvents] Failed to fetch (subsequent):', err instanceof Error ? err.message : String(err));
          }
        } finally {
          if (myGen === healthFetchGenRef.current && healthActiveRef.current) {
            setIsLoadingEvents(false);
            hasFetchedOnceRef.current = true;
          }
        }
      }
      void fetchEvents();
    }, 500);

    return () => {
      if (healthDebounceRef.current) {
        clearTimeout(healthDebounceRef.current);
        healthDebounceRef.current = null;
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional omission (stable ref/callback)
  }, [isDemo, vitality, userId, retryNonce]);

  // 🔧 2026-07-15 (ARCH-11 #11 修复): retryFetch 用 state 而非 ref 触发 re-render
  const retryFetch = () => {
    hasFetchedOnceRef.current = false;
    healthFetchGenRef.current = 0;
    setHealthEventsError(null);
    setRetryNonce(n => n + 1);
  };

  // 🔧 F13 fix (Round 101): Subscribe to Realtime changes on health_events table.
  useEffect(() => {
    if (isDemo || !userId) return;
    const supabase = createClient();
    if (!supabase) return;

    let debounceTimer: ReturnType<typeof setTimeout> | null = null;
    const channel = supabase
      .channel(`health_events_rt:${userId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'health_events',
          filter: `user_id=eq.${userId}`,
        },
        () => {
          // Debounce — prevents rapid refetches when multiple events arrive
          if (debounceTimer) clearTimeout(debounceTimer);
          debounceTimer = setTimeout(() => {
            logger.info('[useHealthEvents] 📡 Realtime UPDATE — refetching');
            retryFetch();
            debounceTimer = null;
          }, 1000);
        }
      )
      .subscribe();

    return () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      try { supabase.removeChannel(channel); } catch { /* ignore */ }
    };
  }, [isDemo, userId]);

  return { healthEvents, isLoadingEvents, healthEventsError, retryFetch };
}
