'use client';

/**
 * useEmotionGuardFollowup — 「先等 10 分钟」到期待追问条的派生 (batch60-c)
 *
 * 与 use-cooldown-followup 同一一次性展示模式: chat 历史首屏加载完成后派生一次
 * (localStorage 等待记录是否到期), 之后锁定 — 本次会话内新到期的等待由卡内
 * 计时器负责, 不重复弹条。demo 模式不派生。派生前顺手清理超龄 (>24h) 僵尸记录。
 * 刷新/换会话后记录仍在 → 此处接棒到期追问 (不做跨设备同步承诺)。
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { getDueEmotionWait, pruneStaleEmotionWait } from '@/components/chat/parts/emotion-guard-store';
import type { PendingEmotionWait } from '@/types/emotion-guard';

export interface UseEmotionGuardFollowupParams {
  isDemo: boolean;
  historyReady: boolean;
}

export interface UseEmotionGuardFollowupResult {
  dueRecord: PendingEmotionWait | null;
  /** 等待记录消解后调用 (追问条内部消解 store, 一般无需手动 clear) */
  clear: () => void;
}

export function useEmotionGuardFollowup({ isDemo, historyReady }: UseEmotionGuardFollowupParams): UseEmotionGuardFollowupResult {
  const [dueRecord, setDueRecord] = useState<PendingEmotionWait | null>(null);
  const derivedRef = useRef(false);

  useEffect(() => {
    if (derivedRef.current || isDemo || !historyReady) return;
    derivedRef.current = true;
    pruneStaleEmotionWait();
    setDueRecord(getDueEmotionWait());
  }, [isDemo, historyReady]);

  const clear = useCallback(() => setDueRecord(null), []);
  return { dueRecord, clear };
}
