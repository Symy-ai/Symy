'use client';

/**
 * useMicroChallengeFollowup — 微挑战次日回访条的派生与生命周期
 *
 * 与 use-chat-recap 同一一次性展示模式: chat 历史首屏加载完成后派生一次 (localStorage
 * 的待回访记录是否到期), 之后锁定 — 本次会话内新到期的记录不当场弹回访条。
 * demo 模式不派生。派生前顺手清理超龄 (>7 天) 的僵尸记录。
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  getDueMicroChallenge,
  pruneStalePendingMicroChallenge,
  type PendingMicroChallenge,
} from '@/components/chat/parts/micro-challenge-store';

export interface UseMicroChallengeFollowupParams {
  isDemo: boolean;
  historyReady: boolean;
}

export interface UseMicroChallengeFollowupResult {
  dueRecord: PendingMicroChallenge | null;
  /** 用户二选一后调用 — 回访条消失 */
  clear: () => void;
}

export function useMicroChallengeFollowup({ isDemo, historyReady }: UseMicroChallengeFollowupParams): UseMicroChallengeFollowupResult {
  const [dueRecord, setDueRecord] = useState<PendingMicroChallenge | null>(null);
  const derivedRef = useRef(false);

  useEffect(() => {
    if (derivedRef.current || isDemo || !historyReady) return;
    derivedRef.current = true;
    pruneStalePendingMicroChallenge();
    setDueRecord(getDueMicroChallenge());
  }, [isDemo, historyReady]);

  const clear = useCallback(() => setDueRecord(null), []);

  return { dueRecord, clear };
}
