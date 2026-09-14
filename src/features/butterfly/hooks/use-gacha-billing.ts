/**
 * useGachaBilling — Round 126 用户决策 5 (AUDIT-7 Step 5)
 *
 * 🔧 提取自 butterfly-tab.tsx:378-433 (gacha 计费 refs + effects)
 *
 * 管理 gacha 次数扣减 + 退款:
 * - chapter_start 到达时扣减 (pullAttemptIdRef 防重复)
 * - 故事失败后退款 (排除 429 限流错误)
 * - phase 回到 idle 时重置 refs
 */

import { useEffect, useRef } from 'react';
import { logger } from '@/lib/logger';

export interface GachaBillingRefs {
  gachaIncrementedForSessionRef: React.RefObject<string | null>;
  pullAttemptIdRef: React.RefObject<string | null>;
  gachaRefundedForSessionRef: React.RefObject<string | null>;
}

export function useGachaBilling(
  isDemo: boolean,
  phase: string,
  decisionDescP: string | null,
  currentChapterInfoP: unknown,
  completedChaptersLength: number,
  errorP: string | null,
  playerError: string | null,
  incrementGachaCount: () => Promise<void>,
  decrementGachaCount: () => Promise<void>,
): GachaBillingRefs {
  const gachaIncrementedForSessionRef = useRef<string | null>(null);
  const pullAttemptIdRef = useRef<string | null>(null);
  const gachaRefundedForSessionRef = useRef<string | null>(null);

  // chapter_start → increment
  useEffect(() => {
    if (!currentChapterInfoP) return;
    if (completedChaptersLength > 0) return;
    const sessionKey = pullAttemptIdRef.current;
    if (!sessionKey) return;
    if (gachaIncrementedForSessionRef.current === sessionKey) return;
    gachaIncrementedForSessionRef.current = sessionKey;
    logger.info('[ButterflyTab] chapter_start received, incrementing gacha count for pull attempt:', sessionKey.substring(0, 8));
    void incrementGachaCount();
  }, [currentChapterInfoP, completedChaptersLength, incrementGachaCount]);

  // Reset refs on idle
  useEffect(() => {
    if (phase === 'idle' && !decisionDescP) {
      gachaIncrementedForSessionRef.current = null;
      pullAttemptIdRef.current = null;
      gachaRefundedForSessionRef.current = null;
    }
  }, [phase, decisionDescP]);

  // Refund on error (excluding 429)
  useEffect(() => {
    if (isDemo || !errorP) return;
    const sessionKey = gachaIncrementedForSessionRef.current;
    if (!sessionKey) return;
    if (gachaRefundedForSessionRef.current === sessionKey) return;
    const rawError = playerError ?? '';
    if (rawError.includes('429') || rawError.includes('Too Many') || rawError.includes('rate limit') || rawError.includes('Daily limit reached')) {
      return;
    }
    gachaRefundedForSessionRef.current = sessionKey;
    logger.info('[ButterflyTab] Story failed after chapter_start, refunding gacha count for pull attempt:', sessionKey.substring(0, 8));
    void decrementGachaCount();
  }, [errorP, playerError, isDemo, decrementGachaCount]);

  return { gachaIncrementedForSessionRef, pullAttemptIdRef, gachaRefundedForSessionRef };
}
