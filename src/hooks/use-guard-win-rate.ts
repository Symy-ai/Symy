'use client';

/**
 * useGuardWinRate — 守护胜率数据源 (batch49-c)
 *
 * 读现有 /api/buddy/health-events, 分别拉 challenge_completed /
 * challenge_failed / challenge_reward 三类 (API 单 event_type 过滤),
 * 分页游标续拉后交给纯函数 deriveGuardWinRate 聚合。
 * 零 DDL、不新增 API route; 失败静默降级为 null (非关键展示路径)。
 */

import { useEffect, useState } from 'react';
import { apiFetch } from '@/lib/api-client';
import { logger } from '@/lib/logger';
import { deriveGuardWinRate, type GuardWinRateEventInput, type GuardWinRateSummary } from '@/lib/guard-win-rate';

const PAGE_SIZE = 100;
const MAX_PAGES = 20;
const EVENT_TYPES = ['challenge_completed', 'challenge_failed', 'challenge_reward'] as const;

export interface UseGuardWinRateResult {
  summary: GuardWinRateSummary | null;
  isLoading: boolean;
}

async function fetchEventsOfType(eventType: string): Promise<GuardWinRateEventInput[]> {
  let cursor: string | null = null;
  let events: GuardWinRateEventInput[] = [];

  for (let page = 0; page < MAX_PAGES; page += 1) {
    const url = new URL('/api/buddy/health-events', window.location.origin);
    url.searchParams.set('event_type', eventType);
    url.searchParams.set('limit', String(PAGE_SIZE));
    if (cursor) url.searchParams.set('before', cursor);

    const data = await apiFetch<{ events?: GuardWinRateEventInput[] }>(url.toString());
    const pageEvents = data?.events || [];
    events = events.concat(pageEvents);
    if (pageEvents.length < PAGE_SIZE) break;

    const oldest = pageEvents.reduce(
      (min, e) => (e.createdAt < min ? e.createdAt : min),
      pageEvents[0].createdAt,
    );
    if (!oldest || oldest === cursor) break;
    cursor = oldest;
  }

  return events;
}

export function useGuardWinRate(): UseGuardWinRateResult {
  const [summary, setSummary] = useState<GuardWinRateSummary | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        // eslint-disable-next-line symy/no-raw-fetch-in-use-effect -- one-shot decorative read; failure degrades to empty state, mirrors use-impulse-window exception
        const batches = await Promise.all(EVENT_TYPES.map(fetchEventsOfType));
        if (cancelled) return;
        setSummary(deriveGuardWinRate(batches.flat()));
      } catch (err) {
        // safe to ignore: 非关键装饰性读 — 拉不到就不渲染, 不报错不阻塞页面
        logger.warn('[useGuardWinRate] fetch failed:', err instanceof Error ? err.message : String(err));
        if (!cancelled) setSummary(null);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return { summary, isLoading };
}
