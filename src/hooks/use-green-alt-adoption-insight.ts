'use client';

import { useEffect, useState } from 'react';
import { apiFetch } from '@/lib/api-client';
import { logger } from '@/lib/logger';
import {
  aggregateGreenAltAdoptionInsight,
  type GreenAltAdoptionInsight,
  type GreenAltInsightEventInput,
} from '@/lib/green-alt-adoption-insight';

const PAGE_SIZE = 100;
const MAX_PAGES = 10;
const EVENT_TYPES = ['mindful_recovery', 'manual_adjustment', 'challenge_failed'] as const;

async function fetchEvents(): Promise<GreenAltInsightEventInput[]> {
  const groups = await Promise.all(EVENT_TYPES.map(async (eventType) => {
    const events: GreenAltInsightEventInput[] = [];
    let cursor: string | null = null;
    for (let page = 0; page < MAX_PAGES; page += 1) {
      const url = new URL('/api/buddy/health-events', window.location.origin);
      url.searchParams.set('event_type', eventType);
      url.searchParams.set('limit', String(PAGE_SIZE));
      if (cursor) url.searchParams.set('before', cursor);
      const data = await apiFetch<{ events?: GreenAltInsightEventInput[] }>(url.toString());
      const batch = data?.events || [];
      events.push(...batch);
      if (batch.length < PAGE_SIZE || !batch.at(-1)?.createdAt) break;
      let oldest = String(batch[0].createdAt ?? '');
      for (const event of batch) {
        const time = String(event.createdAt ?? '');
        if (time && time < oldest) oldest = time;
      }
      if (oldest === cursor) break;
      cursor = oldest;
    }
    return events;
  }));
  return groups.flat();
}

export function useGreenAltAdoptionInsight(): { insight: GreenAltAdoptionInsight; isLoading: boolean } {
  const [insight, setInsight] = useState<GreenAltAdoptionInsight>(() => aggregateGreenAltAdoptionInsight([]));
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const result = aggregateGreenAltAdoptionInsight(await fetchEvents());
        if (!cancelled) setInsight(result);
      } catch (error) {
        logger.warn('[GreenAltAdoptionInsight] fetch failed:', error instanceof Error ? error.message : String(error));
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  return { insight, isLoading };
}
