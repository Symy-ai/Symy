'use client';

import { useEffect, useState } from 'react';
import { apiFetch } from '@/lib/api-client';
import { logger } from '@/lib/logger';
import { useHourlyRate } from './use-hourly-rate';

interface BuddyStateLite {
  streak: number;
  totalSaved: number;
  challengesCompleted: number;
}

export interface GreenImpact {
  itemsSaved: number;
  hoursReclaimed: number;
  currentStreak: number;
}

export interface UseGreenImpactResult {
  data: GreenImpact | null;
  isLoading: boolean;
  error: string | null;
}

export function useGreenImpact(): UseGreenImpactResult {
  const { hourlyRate } = useHourlyRate();
  const [data, setData] = useState<GreenImpact | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        setIsLoading(true);
        setError(null);
      // eslint-disable-next-line symy/no-raw-fetch-in-use-effect -- one-shot decorative read; buddy state already cached by RQ elsewhere, absence tolerated
        const state = await apiFetch<BuddyStateLite>('/api/buddy/state');
        if (cancelled) return;

        const challengesCompleted = Number(state.challengesCompleted) || 0;
        const totalSaved = Math.max(0, Number(state.totalSaved) || 0);
        const streak = Math.max(0, Math.floor(state.streak) || 0);
        const rate = hourlyRate > 0 ? hourlyRate : 25;
        const hoursReclaimed = totalSaved / rate;

        setData({
          itemsSaved: challengesCompleted,
          hoursReclaimed: Number.isFinite(hoursReclaimed) ? hoursReclaimed : 0,
          currentStreak: streak,
        });
      } catch (err) {
        if (cancelled) return;
        logger.warn('[useGreenImpact] fetch failed:', err instanceof Error ? err.message : String(err));
        setError(err instanceof Error ? err.message : 'Failed to load green impact');
        setData(null);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [hourlyRate]);

  return { data, isLoading, error };
}
