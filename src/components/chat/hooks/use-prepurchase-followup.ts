'use client';

/**
 * usePrepurchaseFollowup — 买前三问「冷静 24h」次日回访的派生与生命周期 (batch50-a)
 *
 * 与 use-cooldown-followup 同一一次性展示模式: chat 历史首屏加载完成后派生一次
 * (localStorage 的待回访记录是否到期), 之后锁定。demo 模式不派生。派生前顺手
 * 清理超龄 (>7 天) 僵尸记录。
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { getDuePrepurchase, pruneStalePendingPrepurchase } from '@/components/chat/parts/prepurchase-store';
import type { PendingPrepurchaseFollowup } from '@/types/prepurchase';

export interface UsePrepurchaseFollowupParams {
  isDemo: boolean;
  historyReady: boolean;
}

export interface UsePrepurchaseFollowupResult {
  dueRecord: PendingPrepurchaseFollowup | null;
  /** 用户二选一后调用 — 回访条消失 */
  clear: () => void;
}

export function usePrepurchaseFollowup({ isDemo, historyReady }: UsePrepurchaseFollowupParams): UsePrepurchaseFollowupResult {
  const [dueRecord, setDueRecord] = useState<PendingPrepurchaseFollowup | null>(null);
  const derivedRef = useRef(false);

  useEffect(() => {
    if (derivedRef.current || isDemo || !historyReady) return;
    derivedRef.current = true;
    pruneStalePendingPrepurchase();
    setDueRecord(getDuePrepurchase());
  }, [isDemo, historyReady]);

  const clear = useCallback(() => setDueRecord(null), []);

  return { dueRecord, clear };
}
