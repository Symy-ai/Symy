'use client';

/**
 * useGuardCategoryInsight — 品类级守护透视数据源 (batch46-a)
 *
 * 读现有 /api/buddy/health-events (challenge_reward, 与 guard_ledger 同管道,
 * 分页游标续拉), 前端用纯函数按 metadata 品类聚合。零 DDL、不新增 API route。
 * 失败静默降级为空 (非关键展示路径, 不阻塞页面)。
 */

import { useEffect, useState } from 'react';
import { apiFetch } from '@/lib/api-client';
import { logger } from '@/lib/logger';
import { useHourlyRate } from './use-hourly-rate';
import {
  aggregateGuardCategoryInsights,
  type GuardCategoryInsight,
} from '@/lib/guard-category-insight';

const PAGE_SIZE = 100;
const MAX_PAGES = 20;

export interface UseGuardCategoryInsightResult {
  /** 全品类聚合 (other 恒排最后); 主面展示用 topGuardCategories 取前 3 */
  insights: GuardCategoryInsight[];
  isLoading: boolean;
}

async function fetchGuardEvents(): Promise<GuardCategoryEventLite[]> {
  let cursor: string | null = null;
  let events: GuardCategoryEventLite[] = [];

  for (let page = 0; page < MAX_PAGES; page += 1) {
    const url = new URL('/api/buddy/health-events', window.location.origin);
    url.searchParams.set('event_type', 'challenge_reward');
    url.searchParams.set('limit', String(PAGE_SIZE));
    if (cursor) url.searchParams.set('before', cursor);

    const data = await apiFetch<{ events?: GuardCategoryEventLite[] }>(url.toString());
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

/** health_events 返回形状的最小子集 — 只需 metadata 参与聚合 */
interface GuardCategoryEventLite {
  metadata: Record<string, unknown> | null;
  createdAt: string;
}

export function useGuardCategoryInsight(): UseGuardCategoryInsightResult {
  const { hourlyRate } = useHourlyRate();
  const [insights, setInsights] = useState<GuardCategoryInsight[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        // eslint-disable-next-line symy/no-raw-fetch-in-use-effect -- one-shot decorative read; failure degrades to empty card, mirrors use-green-alt-adoption exception
        const events = await fetchGuardEvents();
        if (cancelled) return;
        setInsights(aggregateGuardCategoryInsights(events, hourlyRate > 0 ? hourlyRate : 25));
      } catch (err) {
        // safe to ignore: 非关键装饰性读 — 拉不到就显示空态, 不报错不阻塞页面
        logger.warn('[useGuardCategoryInsight] fetch failed:', err instanceof Error ? err.message : String(err));
        if (!cancelled) setInsights([]);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [hourlyRate]);

  return { insights, isLoading };
}
