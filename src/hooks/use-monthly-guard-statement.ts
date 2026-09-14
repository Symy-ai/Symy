'use client';

/**
 * useMonthlyGuardStatement — 月度守护账单数据源 (batch54-b)
 *
 * 读现有 /api/buddy/health-events, 拉四类事件 (challenge_completed /
 * challenge_failed / challenge_reward / mindful_recovery — 后者为
 * green-alt 采纳台账), 分页游标续拉后交给纯函数 buildMonthlyStatement
 * 聚合 (monthKey 取当前自然月)。零 DDL、不新增 API route;
 * 失败静默降级为 null (非关键展示路径)。
 */

import { useEffect, useState } from 'react';
import { apiFetch } from '@/lib/api-client';
import { logger } from '@/lib/logger';
import { useHourlyRate } from '@/hooks/use-hourly-rate';
import { useI18n } from '@/i18n/provider';
import {
  buildMonthlyStatement,
  type MonthlyGuardEventInput,
  type MonthlyGuardStatement,
} from '@/lib/monthly-guard-statement';

const PAGE_SIZE = 100;
const MAX_PAGES = 20;
const EVENT_TYPES = ['challenge_completed', 'challenge_failed', 'challenge_reward', 'mindful_recovery'] as const;

/** 当前自然月 key 'YYYY-MM' (本地时间) */
function currentMonthKey(now: Date): string {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

export interface UseMonthlyGuardStatementResult {
  statement: MonthlyGuardStatement | null;
  isLoading: boolean;
}

async function fetchEventsOfType(eventType: string): Promise<MonthlyGuardEventInput[]> {
  let cursor: string | null = null;
  let events: MonthlyGuardEventInput[] = [];

  for (let page = 0; page < MAX_PAGES; page += 1) {
    const url = new URL('/api/buddy/health-events', window.location.origin);
    url.searchParams.set('event_type', eventType);
    url.searchParams.set('limit', String(PAGE_SIZE));
    if (cursor) url.searchParams.set('before', cursor);

    const data = await apiFetch<{ events?: MonthlyGuardEventInput[] }>(url.toString());
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

export function useMonthlyGuardStatement(): UseMonthlyGuardStatementResult {
  const { hourlyRate } = useHourlyRate();
  const { locale } = useI18n();
  const [statement, setStatement] = useState<MonthlyGuardStatement | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        // eslint-disable-next-line symy/no-raw-fetch-in-use-effect -- one-shot decorative read; failure degrades to empty state, mirrors use-weekly-guard-compare exception
        const batches = await Promise.all(EVENT_TYPES.map(fetchEventsOfType));
        if (cancelled) return;
        setStatement(buildMonthlyStatement(batches.flat(), {
          monthKey: currentMonthKey(new Date()),
          hourlyRate,
          locale,
        }));
      } catch (err) {
        // safe to ignore: 非关键装饰性读 — 拉不到就不渲染, 不报错不阻塞页面
        logger.warn('[useMonthlyGuardStatement] fetch failed:', err instanceof Error ? err.message : String(err));
        if (!cancelled) setStatement(null);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [hourlyRate, locale]);

  return { statement, isLoading };
}
