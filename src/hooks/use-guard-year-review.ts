'use client';

/**
 * useGuardYearReview — 年度守护画像数据源 (batch66-a)
 *
 * 只读现有 health_events 四类事件，分页拉取后交给纯函数聚合。
 * 零 DDL、不新增 API；失败静默降级为 insufficient，不阻塞设置页。
 */

import { useEffect, useMemo, useState } from 'react';
import { apiFetch } from '@/lib/api-client';
import { logger } from '@/lib/logger';
import {
  buildGuardYearReview,
  type GuardYearReview,
  type GuardYearReviewEventInput,
} from '@/lib/guard-year-review';

const PAGE_SIZE = 100;
const MAX_PAGES = 30;
const EVENT_TYPES = [
  'challenge_completed',
  'challenge_failed',
  'mindful_recovery',
  'manual_adjustment',
] as const;

async function fetchEventsOfType(eventType: string): Promise<GuardYearReviewEventInput[]> {
  const events: GuardYearReviewEventInput[] = [];
  let cursor: string | null = null;

  for (let page = 0; page < MAX_PAGES; page += 1) {
    const url = new URL('/api/buddy/health-events', window.location.origin);
    url.searchParams.set('event_type', eventType);
    url.searchParams.set('limit', String(PAGE_SIZE));
    if (cursor) url.searchParams.set('before', cursor);

    const data = await apiFetch<{ events?: GuardYearReviewEventInput[] }>(url.toString());
    const batch = data?.events || [];
    events.push(...batch);
    if (batch.length < PAGE_SIZE || !batch.at(-1)?.createdAt) break;

    let oldest = String(batch[0].createdAt ?? '');
    for (const event of batch) {
      const time = String(event.createdAt ?? '');
      if (time && time < oldest) oldest = time;
    }
    if (!oldest || oldest === cursor) break;
    cursor = oldest;
  }

  return events;
}

export function useGuardYearReview({ hourlyRate, locale }: { hourlyRate: number; locale: string }): {
  review: GuardYearReview;
  isLoading: boolean;
} {
  const [events, setEvents] = useState<GuardYearReviewEventInput[] | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        // eslint-disable-next-line symy/no-raw-fetch-in-use-effect -- one-shot decorative read; failure degrades to insufficient
        const batches = await Promise.all(EVENT_TYPES.map(fetchEventsOfType));
        if (!cancelled) setEvents(batches.flat());
      } catch (error) {
        // safe to ignore: 年度画像非关键路径, 拉取失败走数据不足态
        logger.warn('[useGuardYearReview] fetch failed:', error instanceof Error ? error.message : String(error));
        if (!cancelled) setEvents([]);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const review = useMemo(
    () => buildGuardYearReview(events, { hourlyRate, locale }),
    [events, hourlyRate, locale],
  );
  return { review, isLoading };
}
