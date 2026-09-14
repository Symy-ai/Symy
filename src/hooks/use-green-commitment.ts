'use client';

/**
 * useGreenCommitment — 绿色承诺到期回访数据源与主动发起 (batch53-a)
 *
 * chat 历史首屏加载完成后派生一次 (与 use-weekly-review 同款一次性展示模式
 * = 既有防打扰机制, 不新增 cron): 拉 manual_adjustment / challenge_completed /
 * challenge_failed 三类, 交给纯函数 deriveGreenCommitment。
 *
 * - 到期当天首轮对话: dueSettlement 存在时自动开一次结算卡 (一次性 ref 锁);
 * - 用户看完/重启承诺后 markSettled(refKey, outcome): 本地消解主动态 +
 *   写 manual_adjustment + metadata {source='green_commitment_settlement',
 *   ref_key, outcome} 做跨会话一次性消解 (零 DDL)。
 * demo 模式不派生。拉取失败静默降级 (derivation=null, 不渲染, 不阻塞 chat)。
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { apiFetch } from '@/lib/api-client';
import { logger } from '@/lib/logger';
import {
  deriveGreenCommitment,
  GREEN_COMMITMENT_SETTLEMENT_SOURCE,
  type GreenCommitmentDerivation,
} from '@/lib/green-commitment';
import type { WeeklyGuardEventInput } from '@/lib/weekly-guard-compare';
import type { GreenCommitmentOutcome } from '@/types/green-commitment';
import { useHourlyRate } from '@/hooks/use-hourly-rate';

const PAGE_SIZE = 100;
const MAX_PAGES = 5;
const EVENT_TYPES = ['manual_adjustment', 'challenge_completed', 'challenge_failed'] as const;

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

export interface UseGreenCommitmentResult {
  derivation: GreenCommitmentDerivation | null;
  /** 到期结算卡是否打开 (到期自动开一次, 或 markSettled 前 openSettlement) */
  open: boolean;
  openSettlement: () => void;
  closeSettlement: () => void;
  /** 用户看完结算/重启承诺后调用 — 本地消解 + 写结算事件 (跨会话一次性) */
  markSettled: (refKey: string, outcome: GreenCommitmentOutcome) => void;
}

export function useGreenCommitment({ isDemo, historyReady }: { isDemo: boolean; historyReady: boolean }): UseGreenCommitmentResult {
  const { hourlyRate } = useHourlyRate();
  const [derivation, setDerivation] = useState<GreenCommitmentDerivation | null>(null);
  const [open, setOpen] = useState(false);
  const derivedRef = useRef(false);
  const autoOpenedRef = useRef(false);

  useEffect(() => {
    if (derivedRef.current || isDemo || !historyReady) return;
    derivedRef.current = true;
    (async () => {
      try {
        const batches = await Promise.all(EVENT_TYPES.map(fetchEventsOfType));
        const next = deriveGreenCommitment(batches.flat(), new Date(), hourlyRate);
        setDerivation(next);
        // 到期当天首轮对话: 有到期未结算的承诺 → 自动开一次 (会话内不再弹)
        if (next.dueSettlement && !autoOpenedRef.current) {
          autoOpenedRef.current = true;
          setOpen(true);
        }
      } catch (err) {
        // safe to ignore: 承诺回访是 best-effort 装饰性读 — 拉不到就不展示, 不报错不阻塞 chat
        logger.warn('[useGreenCommitment] fetch failed:', err instanceof Error ? err.message : String(err));
      }
    })();
  }, [isDemo, historyReady, hourlyRate]);

  const openSettlement = useCallback(() => setOpen(true), []);
  const closeSettlement = useCallback(() => setOpen(false), []);
  const markSettled = useCallback((refKey: string, outcome: GreenCommitmentOutcome) => {
    setDerivation((d) => (d ? { ...d, dueSettlement: null } : d));
    apiFetch('/api/buddy/health-events', {
      method: 'POST',
      body: {
        eventType: 'manual_adjustment',
        triggerSource: 'manual',
        description: `Green commitment settled (${outcome}) — ${refKey}`,
        metadata: {
          source: GREEN_COMMITMENT_SETTLEMENT_SOURCE,
          ref_key: refKey,
          outcome,
        },
      },
    }).catch((err: unknown) => {
      // safe to ignore: 结算消解失败只影响下次是否重开, 不弹错不阻塞
      logger.warn('[useGreenCommitment] settle report failed (silently skipped):', err instanceof Error ? err.message : String(err));
    });
  }, []);

  return { derivation, open, openSettlement, closeSettlement, markSettled };
}
