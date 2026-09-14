'use client';

/**
 * useGuardMoments — 守护时刻时间线数据源 (batch58-a)
 *
 * 读现有 /api/buddy/health-events 两个 event_type (challenge_completed +
 * mindful_recovery, 分页游标续拉), 前端用纯函数 aggregateGuardMoments 聚合。
 * 零 DDL、不新增查询 API。失败静默降级为空态。
 *
 * 私享金额: totalSaved 只在本 hook 返回 (App 内私享, 55-c 先例),
 * 永不进分享/荣誉面 (分享面只收计数/天数)。
 */

import { useEffect, useState } from 'react';
import { apiFetch } from '@/lib/api-client';
import { logger } from '@/lib/logger';
import {
  aggregateGuardMoments,
  type GuardMomentsTimeline,
} from '@/lib/guard-moments';

const PAGE_SIZE = 100;
const MAX_PAGES = 10;

/** 时间线要全覆盖, 每类最多回看的条数 */
const MAX_EVENTS_PER_TYPE = 500;

interface EventLite {
  eventType: string;
  triggerId: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
}

async function fetchEvents(eventType: string): Promise<EventLite[]> {
  let cursor: string | null = null;
  let events: EventLite[] = [];

  for (let page = 0; page < MAX_PAGES; page += 1) {
    const url = new URL('/api/buddy/health-events', window.location.origin);
    url.searchParams.set('event_type', eventType);
    url.searchParams.set('limit', String(PAGE_SIZE));
    if (cursor) url.searchParams.set('before', cursor);

    const data = await apiFetch<{ events?: EventLite[] }>(url.toString());
    const pageEvents = data?.events || [];
    events = events.concat(pageEvents);
    if (pageEvents.length < PAGE_SIZE || events.length >= MAX_EVENTS_PER_TYPE) break;

    const oldest = pageEvents.reduce(
      (min, e) => (e.createdAt < min ? e.createdAt : min),
      pageEvents[0].createdAt,
    );
    if (!oldest || oldest === cursor) break;
    cursor = oldest;
  }

  return events;
}

export interface UseGuardMomentsResult {
  timeline: GuardMomentsTimeline | null;
  isLoading: boolean;
}

export function useGuardMoments(): UseGuardMomentsResult {
  const [timeline, setTimeline] = useState<GuardMomentsTimeline | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const [guardEvents, recoveryEvents] = await Promise.all([
          fetchEvents('challenge_completed'),
          fetchEvents('mindful_recovery'),
        ]);
        if (cancelled) return;
        setTimeline(aggregateGuardMoments([...guardEvents, ...recoveryEvents]));
      } catch (err) {
        // safe to ignore: 时间线是非关键回看路径, 失败静默降级为空态
        logger.warn('[useGuardMoments] load failed:', err instanceof Error ? err.message : String(err));
        if (!cancelled) setTimeline(null);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  return { timeline, isLoading };
}
