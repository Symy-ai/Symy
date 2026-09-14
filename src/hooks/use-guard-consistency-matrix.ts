'use client';

/**
 * useGuardConsistencyMatrix — 守护行动一致性矩阵数据源 (batch63-b)
 *
 * 读现有 /api/buddy/health-events, 拉拦截两轨 (challenge_completed /
 * challenge_failed) + 行动轨 (mindful_recovery, 库内含 green_alt/reuse
 * 两种 kind) 三类, 分页游标续拉后交给纯函数 buildGuardConsistencyMatrix。
 * 零 DDL、不新增 API route; 失败静默降级为 null (非关键展示路径)。
 */

import { useEffect, useState } from 'react';
import { apiFetch } from '@/lib/api-client';
import { logger } from '@/lib/logger';
import { buildGuardConsistencyMatrix, type GuardConsistencyMatrix, type GuardMatrixEventInput } from '@/lib/guard-consistency-matrix';

const PAGE_SIZE = 100;
const MAX_PAGES = 20;
const EVENT_TYPES = ['challenge_completed', 'challenge_failed', 'mindful_recovery'] as const;

export interface UseGuardConsistencyMatrixResult {
  matrix: GuardConsistencyMatrix | null;
  isLoading: boolean;
}

async function fetchEventsOfType(eventType: string): Promise<GuardMatrixEventInput[]> {
  let cursor: string | null = null;
  let events: GuardMatrixEventInput[] = [];

  for (let page = 0; page < MAX_PAGES; page += 1) {
    const url = new URL('/api/buddy/health-events', window.location.origin);
    url.searchParams.set('event_type', eventType);
    url.searchParams.set('limit', String(PAGE_SIZE));
    if (cursor) url.searchParams.set('before', cursor);

    const data = await apiFetch<{ events?: GuardMatrixEventInput[] }>(url.toString());
    const pageEvents = data?.events || [];
    events = events.concat(pageEvents);
    if (pageEvents.length < PAGE_SIZE) break;

    const oldest = pageEvents.reduce(
      (min, e) => (String(e.createdAt) < min ? String(e.createdAt) : min),
      String(pageEvents[0].createdAt),
    );
    if (!oldest || oldest === cursor) break;
    cursor = oldest;
  }

  return events;
}

export function useGuardConsistencyMatrix(): UseGuardConsistencyMatrixResult {
  const [matrix, setMatrix] = useState<GuardConsistencyMatrix | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        // eslint-disable-next-line symy/no-raw-fetch-in-use-effect -- one-shot decorative read; failure degrades to empty state, mirrors use-guard-win-rate exception
        const batches = await Promise.all(EVENT_TYPES.map(fetchEventsOfType));
        if (cancelled) return;
        setMatrix(buildGuardConsistencyMatrix(batches.flat()));
      } catch (err) {
        // safe to ignore: 非关键装饰性读 — 拉不到就不渲染, 不报错不阻塞页面
        logger.warn('[useGuardConsistencyMatrix] fetch failed:', err instanceof Error ? err.message : String(err));
        if (!cancelled) setMatrix(null);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return { matrix, isLoading };
}
