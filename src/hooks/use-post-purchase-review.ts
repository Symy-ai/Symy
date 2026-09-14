'use client';

/**
 * usePostPurchaseReview — 购后复盘数据源与回访派生 (batch51-a)
 *
 * chat 历史首屏加载完成后派生一次 (与 use-prepurchase-followup 同款一次性展示
 * 模式): 拉 challenge_failed (穿过拦截的购买) + manual_adjustment (筛出本流评价),
 * 交给纯函数 deriveDuePostPurchaseReview / deriveReviewSummary。demo 模式不派生。
 *
 * 零 DDL、不新增 API route、不碰 push cron; 拉取失败静默降级为 null
 * (回访是 best-effort, 不阻塞 chat)。不依赖 Letta — 回应全走本地模板。
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { apiFetch } from '@/lib/api-client';
import { logger } from '@/lib/logger';
import {
  deriveDuePostPurchaseReview,
  deriveReviewSummary,
  isPostPurchaseReviewEvent,
  type PostPurchaseEventInput,
} from '@/lib/post-purchase-review';
import type { DuePostPurchaseReview, PostPurchaseReviewSummary, PostPurchaseRating } from '@/types/post-purchase-review';

const PAGE_SIZE = 100;
const MAX_PAGES = 5;
const EVENT_TYPES = ['challenge_failed', 'manual_adjustment'] as const;

async function fetchEventsOfType(eventType: string): Promise<PostPurchaseEventInput[]> {
  let cursor: string | null = null;
  let events: PostPurchaseEventInput[] = [];

  for (let page = 0; page < MAX_PAGES; page += 1) {
    const url = new URL('/api/buddy/health-events', window.location.origin);
    url.searchParams.set('event_type', eventType);
    url.searchParams.set('limit', String(PAGE_SIZE));
    if (cursor) url.searchParams.set('before', cursor);

    const data = await apiFetch<{ events?: PostPurchaseEventInput[] }>(url.toString());
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

export interface UsePostPurchaseReviewResult {
  dueReview: DuePostPurchaseReview | null;
  reviewSummary: PostPurchaseReviewSummary;
  /** 用户三选一后调用 — 回访条消失, 小结本地 +1 (上报失败也不回滚, 不追问第二遍) */
  recordReview: (rating: PostPurchaseRating) => void;
}

export function usePostPurchaseReview({ isDemo, historyReady }: { isDemo: boolean; historyReady: boolean }): UsePostPurchaseReviewResult {
  const [dueReview, setDueReview] = useState<DuePostPurchaseReview | null>(null);
  const [reviewSummary, setReviewSummary] = useState<PostPurchaseReviewSummary>({ worth: 0, ok: 0, regret: 0, total: 0 });
  const derivedRef = useRef(false);

  useEffect(() => {
    if (derivedRef.current || isDemo || !historyReady) return;
    derivedRef.current = true;
    (async () => {
      try {
        const batches = await Promise.all(EVENT_TYPES.map(fetchEventsOfType));
        const failedEvents = batches[0];
        const reviewEvents = batches[1].filter(isPostPurchaseReviewEvent);
        setDueReview(deriveDuePostPurchaseReview(failedEvents, reviewEvents));
        setReviewSummary(deriveReviewSummary(reviewEvents));
      } catch (err) {
        // safe to ignore: 回访是 best-effort 装饰性读 — 拉不到就不展示, 不报错不阻塞 chat
        logger.warn('[usePostPurchaseReview] fetch failed:', err instanceof Error ? err.message : String(err));
      }
    })();
  }, [isDemo, historyReady]);

  const recordReview = useCallback((rating: PostPurchaseRating) => {
    setDueReview(null);
    setReviewSummary((s) => ({ ...s, [rating]: s[rating] + 1, total: s.total + 1 }));
  }, []);

  return { dueReview, reviewSummary, recordReview };
}
