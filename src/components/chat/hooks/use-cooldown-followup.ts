'use client';

/**
 * useCooldownFollowup — 冷静卡次日回访条的派生与生命周期 (batch48-b)
 *
 * 与 use-micro-challenge-followup 同一一次性展示模式: chat 历史首屏加载完成后
 * 派生一次 (localStorage 的待回访记录是否到期), 之后锁定 — 本次会话内新到期的
 * 记录不当场弹回访条。demo 模式不派生。派生前顺手清理超龄 (>7 天) 僵尸记录。
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { getDueCooldown, pruneStalePendingCooldown } from '@/components/chat/parts/cooldown-store';
import type { PendingCooldownFollowup } from '@/types/cooldown';

export interface UseCooldownFollowupParams {
  isDemo: boolean;
  historyReady: boolean;
}

export interface UseCooldownFollowupResult {
  dueRecord: PendingCooldownFollowup | null;
  /** 用户二选一后调用 — 回访条消失 */
  clear: () => void;
}

export function useCooldownFollowup({ isDemo, historyReady }: UseCooldownFollowupParams): UseCooldownFollowupResult {
  const [dueRecord, setDueRecord] = useState<PendingCooldownFollowup | null>(null);
  const derivedRef = useRef(false);

  useEffect(() => {
    if (derivedRef.current || isDemo || !historyReady) return;
    derivedRef.current = true;
    pruneStalePendingCooldown();
    setDueRecord(getDueCooldown());
  }, [isDemo, historyReady]);

  const clear = useCallback(() => setDueRecord(null), []);

  return { dueRecord, clear };
}
