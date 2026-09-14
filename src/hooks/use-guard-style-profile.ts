'use client';

/**
 * useGuardStyleProfile — 守护风格画像数据源 (batch56-c)
 *
 * 读现有 /api/buddy/health-events 两个 event_type (challenge_completed +
 * mindful_recovery, 分页游标续拉), 前端用纯函数 aggregateGuardStyleProfile
 * 聚合。零 DDL、不新增查询 API。失败静默降级为 insufficient。
 *
 * 私享金额: 三轨 estSaved/savedAmount 汇总只在本 hook 返回 (App 内私享,
 * 55-c in-app 私享金额先例), 永不进分享/荣誉面 (分享面只收计数)。
 */

import { useEffect, useState } from 'react';
import { apiFetch } from '@/lib/api-client';
import { logger } from '@/lib/logger';
import {
  aggregateGuardStyleProfile,
  type GuardStyleProfile,
} from '@/lib/guard-style-profile';

const PAGE_SIZE = 100;
const MAX_PAGES = 10;

/** 风格看分布, 每轨最近若干条足够 */
const MAX_EVENTS_PER_TYPE = 300;

export interface GuardStyleSavedEstimates {
  guard: number;
  alt: number;
  reuse: number;
}

export interface UseGuardStyleProfileResult {
  profile: GuardStyleProfile | null;
  /** 三轨里子汇总 (App 内私享 only); 样本不足时全 0 */
  savedEstimates: GuardStyleSavedEstimates;
  isLoading: boolean;
}

interface EventLite {
  eventType: string;
  triggerId: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
}

/**
 * batch58-b: 拉取守护档案导出所需的两类事件 (challenge_completed +
 * mindful_recovery, 分页游标续拉) — 与本 hook 共用同一读取通道,
 * 供设置页 GuardProfileExportSetting 直接喂给 buildGuardProfileExport。
 */
export async function fetchGuardStyleEvents(): Promise<EventLite[]> {
  const [guardEvents, recoveryEvents] = await Promise.all([
    fetchEvents('challenge_completed'),
    fetchEvents('mindful_recovery'),
  ]);
  return [...guardEvents, ...recoveryEvents];
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

function sumSaved(events: EventLite[], pick: (meta: Record<string, unknown>) => unknown): number {
  let sum = 0;
  for (const e of events) {
    if (!e.metadata || typeof e.metadata !== 'object') continue;
    const n = Number(pick(e.metadata));
    if (Number.isFinite(n) && n > 0) sum += n;
  }
  return sum;
}

export function useGuardStyleProfile(): UseGuardStyleProfileResult {
  const [profile, setProfile] = useState<GuardStyleProfile | null>(null);
  const [savedEstimates, setSavedEstimates] = useState<GuardStyleSavedEstimates>({ guard: 0, alt: 0, reuse: 0 });
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

        const result = aggregateGuardStyleProfile([...guardEvents, ...recoveryEvents]);
        setProfile(result);
        if (result.status === 'ok') {
          const altEvents = recoveryEvents.filter((e) => e.metadata?.kind === 'green_alt_adoption');
          const reuseEvents = recoveryEvents.filter((e) => e.metadata?.kind === 'reuse_adoption');
          setSavedEstimates({
            guard: sumSaved(guardEvents, (m) => m.savedAmount),
            alt: sumSaved(altEvents, (m) => m.estSaved),
            reuse: sumSaved(reuseEvents, (m) => m.estSaved),
          });
        }
      } catch (err) {
        // safe to ignore: 画像是非关键展示路径, 失败静默降级为空态
        logger.warn('[useGuardStyleProfile] load failed:', err instanceof Error ? err.message : String(err));
        if (!cancelled) setProfile(null);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  return { profile, savedEstimates, isLoading };
}
