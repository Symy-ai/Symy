'use client';

/**
 * useWeeklyReview — 周复盘数据源与主动发起 (batch52-b)
 *
 * chat 历史首屏加载完成后派生一次 (与 use-post-purchase-review 同款一次性展示
 * 模式 = 既有防打扰机制, 不新增 cron): 拉 challenge_completed / challenge_failed /
 * challenge_reward / manual_adjustment 四类, 交给纯函数 deriveWeeklyReview。
 *
 * 两个入口:
 * - 小象主动: status='due' 且派生完成后自动开一次 (auto-open 一次性 ref 锁);
 * - 固定入口: openReview() 任何时候可开 (无数据周走引导态, 已复盘周回看总结卡)。
 * demo 模式不派生。拉取失败静默降级 (derivation=null, 不渲染, 不阻塞 chat)。
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { apiFetch } from '@/lib/api-client';
import { logger } from '@/lib/logger';
import { deriveWeeklyReview, type WeeklyReviewDerivation } from '@/lib/weekly-review';
import type { WeeklyGuardEventInput } from '@/lib/weekly-guard-compare';
import { useHourlyRate } from '@/hooks/use-hourly-rate';

const PAGE_SIZE = 100;
const MAX_PAGES = 5;
const EVENT_TYPES = ['challenge_completed', 'challenge_failed', 'challenge_reward', 'manual_adjustment'] as const;

async function fetchEventsOfType(eventType: string): Promise<WeeklyGuardEventInput[]> {
  let cursor: string | null = null;
  let events: WeeklyGuardEventInput[] = [];

  for (let page = 0; page < MAX_PAGES; page += 1) {
    const url = new URL('/api/buddy/health-events', window.location.origin);
    url.searchParams.set('event_type', eventType);
    url.searchParams.set('limit', String(PAGE_SIZE));
    if (cursor) url.searchParams.set('before', cursor);

    const data = await apiFetch<{ events?: WeeklyGuardEventInput[] }>(url.toString());
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

export interface UseWeeklyReviewResult {
  derivation: WeeklyReviewDerivation | null;
  /** 复盘卡是否打开 (主动 due 自动开一次, 或固定入口 openReview) */
  open: boolean;
  openReview: () => void;
  closeReview: () => void;
  /** 用户完成复盘后调用 — 本地标记 reviewed, 主动态不再弹 */
  markReviewed: () => void;
}

export function useWeeklyReview({ isDemo, historyReady }: { isDemo: boolean; historyReady: boolean }): UseWeeklyReviewResult {
  const { hourlyRate } = useHourlyRate();
  const [derivation, setDerivation] = useState<WeeklyReviewDerivation | null>(null);
  const [open, setOpen] = useState(false);
  const derivedRef = useRef(false);
  const autoOpenedRef = useRef(false);

  useEffect(() => {
    if (derivedRef.current || isDemo || !historyReady) return;
    derivedRef.current = true;
    (async () => {
      try {
        const batches = await Promise.all(EVENT_TYPES.map(fetchEventsOfType));
        const next = deriveWeeklyReview(batches.flat(), new Date(), hourlyRate);
        setDerivation(next);
        // 小象主动发起: 本周有数据且尚未复盘 → 自动开一次 (一次性, 会话内不再弹)
        if (next.status === 'due' && !autoOpenedRef.current) {
          autoOpenedRef.current = true;
          setOpen(true);
        }
      } catch (err) {
        // safe to ignore: 复盘是 best-effort 装饰性读 — 拉不到就不展示, 不报错不阻塞 chat
        logger.warn('[useWeeklyReview] fetch failed:', err instanceof Error ? err.message : String(err));
      }
    })();
  }, [isDemo, historyReady, hourlyRate]);

  const openReview = useCallback(() => setOpen(true), []);
  const closeReview = useCallback(() => setOpen(false), []);
  const markReviewed = useCallback(() => {
    setDerivation((d) => (d ? { ...d, status: 'reviewed' } : d));
  }, []);

  return { derivation, open, openReview, closeReview, markReviewed };
}
