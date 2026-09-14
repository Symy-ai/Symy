'use client';

/**
 * useImpulseTriggerProfile — 冲动触发画像数据源 (batch52-c)
 *
 * 读现有 /api/buddy/health-events (event_type=challenge_completed, 分页游标续拉),
 * 前端用纯函数 aggregateImpulseTriggerProfile 聚合。零 DDL、不新增 API route。
 * 失败静默降级为 insufficient (非关键展示路径, 不阻塞页面)。
 */

import { useEffect, useState } from 'react';
import { apiFetch } from '@/lib/api-client';
import { logger } from '@/lib/logger';
import {
  aggregateImpulseTriggerProfile,
  type ImpulseTriggerProfile,
} from '@/lib/impulse-trigger-profile';

const PAGE_SIZE = 100;
const MAX_PAGES = 20;

/** 画像聚合只需要最近若干条 — 拉满即止, 不追全量历史 */
const MAX_EVENTS = 500;

export interface UseImpulseTriggerProfileResult {
  profile: ImpulseTriggerProfile | null;
  isLoading: boolean;
}

interface InterceptEventLite {
  metadata: Record<string, unknown> | null;
  createdAt: string;
}

async function fetchInterceptEvents(): Promise<InterceptEventLite[]> {
  let cursor: string | null = null;
  let events: InterceptEventLite[] = [];

  for (let page = 0; page < MAX_PAGES; page += 1) {
    const url = new URL('/api/buddy/health-events', window.location.origin);
    url.searchParams.set('event_type', 'challenge_completed');
    url.searchParams.set('limit', String(PAGE_SIZE));
    if (cursor) url.searchParams.set('before', cursor);

    const data = await apiFetch<{ events?: InterceptEventLite[] }>(url.toString());
    const pageEvents = data?.events || [];
    events = events.concat(pageEvents);
    if (pageEvents.length < PAGE_SIZE || events.length >= MAX_EVENTS) break;

    const oldest = pageEvents.reduce(
      (min, e) => (e.createdAt < min ? e.createdAt : min),
      pageEvents[0].createdAt,
    );
    if (!oldest || oldest === cursor) break;
    cursor = oldest;
  }

  return events;
}

export function useImpulseTriggerProfile(): UseImpulseTriggerProfileResult {
  const [profile, setProfile] = useState<ImpulseTriggerProfile | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        // eslint-disable-next-line symy/no-raw-fetch-in-use-effect -- one-shot decorative read; failure degrades to empty card, mirrors use-guard-category-insight exception
        const events = await fetchInterceptEvents();
        if (cancelled) return;
        setProfile(aggregateImpulseTriggerProfile(events));
      } catch (err) {
        // safe to ignore: 非关键装饰性读 — 拉不到就显示引导态, 不报错不阻塞页面
        logger.warn('[useImpulseTriggerProfile] fetch failed:', err instanceof Error ? err.message : String(err));
        if (!cancelled) setProfile(null);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return { profile, isLoading };
}
