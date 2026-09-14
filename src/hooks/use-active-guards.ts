'use client';

/**
 * useActiveGuards — 进行中守护面板数据源 (batch59-a)
 *
 * 三路只读: /api/challenge/active (挑战) + /api/buddy/health-events
 * (manual_adjustment 承诺登记 + challenge_completed 助攻计数, 分页游标续拉)
 * + 冷静期 pending (由调用方组件层读 localStorage 传入 — hooks 层禁依赖
 * @/components/, 架构守卫红线)。
 * 前端纯函数 aggregateActiveGuards 聚合; 零 DDL、无新 cron、失败静默降级空态。
 * SOS 求助事件由面板组件在用户点击时另写 (source=guard_sos)。
 */

import { useEffect, useState } from 'react';
import { apiFetch } from '@/lib/api-client';
import { logger } from '@/lib/logger';
import {
  aggregateActiveGuards,
  type ActiveGuardsCooldownInput,
  type ActiveGuardsEventInput,
  type ActiveGuardsSummary,
} from '@/lib/active-guards';

const PAGE_SIZE = 100;
const MAX_PAGES = 5;

interface ActiveChallengeLite {
  id: string;
  itemName: string;
  amount: number | null;
  createdAt: string;
}

async function fetchEventsOfType(eventType: string): Promise<ActiveGuardsEventInput[]> {
  let cursor: string | null = null;
  let events: ActiveGuardsEventInput[] = [];

  for (let page = 0; page < MAX_PAGES; page += 1) {
    const url = new URL('/api/buddy/health-events', window.location.origin);
    url.searchParams.set('event_type', eventType);
    url.searchParams.set('limit', String(PAGE_SIZE));
    if (cursor) url.searchParams.set('before', cursor);

    const data = await apiFetch<{ events?: ActiveGuardsEventInput[] }>(url.toString());
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

export interface UseActiveGuardsResult {
  summary: ActiveGuardsSummary | null;
  isLoading: boolean;
}

export interface UseActiveGuardsOptions {
  /** 冷静期 pending 记录 (组件层读 localStorage 后传入; 无则 null) */
  cooldown?: ActiveGuardsCooldownInput | null;
}

export function useActiveGuards(options?: UseActiveGuardsOptions): UseActiveGuardsResult {
  const cooldown = options?.cooldown ?? null;
  const [summary, setSummary] = useState<ActiveGuardsSummary | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const [challengeRes, adjustments, completions] = await Promise.all([
          // eslint-disable-next-line symy/no-raw-fetch-in-use-effect -- 与 use-guard-moments 同款一次性派生, 非 query 语义
          apiFetch<{ challenge?: ActiveChallengeLite | null }>('/api/challenge/active'),
          fetchEventsOfType('manual_adjustment'),
          fetchEventsOfType('challenge_completed'),
        ]);
        if (cancelled) return;
        setSummary(aggregateActiveGuards({
          now: new Date(),
          challenge: challengeRes?.challenge ?? null,
          events: [...adjustments, ...completions],
          cooldown,
        }));
      } catch (err) {
        // safe to ignore: 面板是非关键回看路径, 失败静默降级为空态
        logger.warn('[useActiveGuards] load failed:', err instanceof Error ? err.message : String(err));
        if (!cancelled) setSummary(null);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  // safe to ignore: cooldown 取挂载时快照即可 (pending 记录本会话内不变化, 派生一次与 use-green-commitment 同款一次性展示语义)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { summary, isLoading };
}
