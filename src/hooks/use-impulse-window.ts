'use client';

/**
 * useImpulseWindow — 冲动高发时段数据源 (batch48-c)
 *
 * 读现有 /api/buddy/health-events (challenge_reward, 与 guard_ledger 同管道,
 * 分页游标续拉), 前端用纯函数按 createdAt 本地小时聚合。零 DDL、不新增 API route。
 * 失败静默降级为空 (非关键展示路径, 不阻塞页面)。
 */

import { useEffect, useState } from 'react';
import { apiFetch } from '@/lib/api-client';
import { logger } from '@/lib/logger';
import { aggregateImpulseWindows, type ImpulseWindowSummary } from '@/lib/impulse-window';
import { useNightWindow } from '@/hooks/use-night-window';
import { nightWindowToHours } from '@/lib/night-window';

const PAGE_SIZE = 100;
const MAX_PAGES = 20;

export interface UseImpulseWindowResult {
  summary: ImpulseWindowSummary | null;
  isLoading: boolean;
}

/** health_events 返回形状的最小子集 — 只需 createdAt 参与聚合 */
interface ImpulseWindowEventLite {
  createdAt: string;
}

async function fetchGuardEvents(): Promise<ImpulseWindowEventLite[]> {
  let cursor: string | null = null;
  let events: ImpulseWindowEventLite[] = [];

  for (let page = 0; page < MAX_PAGES; page += 1) {
    const url = new URL('/api/buddy/health-events', window.location.origin);
    url.searchParams.set('event_type', 'challenge_reward');
    url.searchParams.set('limit', String(PAGE_SIZE));
    if (cursor) url.searchParams.set('before', cursor);

    const data = await apiFetch<{ events?: ImpulseWindowEventLite[] }>(url.toString());
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

export function useImpulseWindow(): UseImpulseWindowResult {
  const [summary, setSummary] = useState<ImpulseWindowSummary | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const { nightWindow } = useNightWindow();

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        // eslint-disable-next-line symy/no-raw-fetch-in-use-effect -- one-shot decorative read; failure degrades to empty state, mirrors use-guard-category-insight exception
        const events = await fetchGuardEvents();
        if (cancelled) return;
        // batch49-a: 深夜桶跟随用户夜间窗口设置 (off 时用默认窗口, 统计照常)
        setSummary(aggregateImpulseWindows(events, nightWindowToHours(nightWindow)));
      } catch (err) {
        // safe to ignore: 非关键装饰性读 — 拉不到就不渲染, 不报错不阻塞页面
        logger.warn('[useImpulseWindow] fetch failed:', err instanceof Error ? err.message : String(err));
        if (!cancelled) setSummary(null);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [nightWindow]);

  return { summary, isLoading };
}
