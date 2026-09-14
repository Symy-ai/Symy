'use client';

/**
 * useSilentMoment — 沉默时刻状态管理 (需求九)
 *
 * 🔧 需求九: 挑战结束后 2s 沉默时刻, 再显示 DepositDialog (saw) 或结束 (bought)
 *
 * 从 chat-tab.tsx 提取 (架构守卫: chat-tab < 850 行)
 *    - triggerSaw(challengeId, savedAmount, itemName): saw 路径 → 沉默后弹 DepositDialog
 *    - triggerBought(amount, itemName): bought 路径 → 沉默后结束 (无存款)
 *    - silentMoment: 当前沉默时刻状态 (null = 无)
 *    - completeSilentMoment(): 沉默结束回调 (saw → 弹 DepositDialog, bought → 清空)
 *    - consumePendingDeposit(): 取出 pendingDeposit (调一次后清空)
 *
 * 🔧 REVIEW-1 CRITICAL-1 fix: bought 路径去重
 *    handleChooseToBuy 调 onChallengeBought, AI SSE complete_challenge(status='failed') 也调 onChallengeBought
 *    → 用户看到沉默时刻重启。修复: boughtAmountRef 记录已显示的金额, 同金额 2s 内不重复触发。
 *    saw 路径也去重 (lastSawRef 记录 challengeId, 同 challengeId 不重复触发).
 *
 * 🔧 ARCH fix Round 74 (Finding 4+5):
 *    旧代码: onChallengeCompleted 同时触发 triggerSawSilentMoment + onChallengePassed
 *    → SilentMomentOverlay (z-[300]) + AhaMomentOnboarding (z-[300]) 同时显示, UX 冲突.
 *    根因修复: onChallengePassed 推迟到 SilentMomentOverlay.onComplete 之后.
 *    silentMoment.pendingAhaMoment 存储 onChallengePassed 参数, completeSilentMoment 时一起触发.
 */

import { useState, useCallback, useRef } from 'react';
import { useHourlyRate } from '@/hooks/use-hourly-rate';

/** 挑战结果: saw = 用户不买 (看见), bought = 用户清醒地买 */
export type SilentMomentOutcome = 'saw' | 'bought';

export interface PendingAhaMoment {
  challengeId: string;
  itemName: string;
  amount: number;
}

export interface SilentMomentState {
  outcome: SilentMomentOutcome;
  amount: number;
  itemName: string;
  hoursOfLife: number;
  pendingDeposit?: { challengeId: string; savedAmount: number };
  /** 🔧 ARCH fix Round 74: deferred onChallengePassed — fires AFTER silent moment completes */
  pendingAhaMoment?: PendingAhaMoment;
}

export function useSilentMoment(isDemo: boolean) {
  const { hourlyRate } = useHourlyRate(isDemo);
  const [silentMoment, setSilentMoment] = useState<SilentMomentState | null>(null);
  // 🔧 REVIEW-1 CRITICAL-1: bought 路径去重 — 同金额 2s 内不重复触发
  const lastBoughtRef = useRef<{ amount: number; ts: number } | null>(null);
  // 🔧 REVIEW-1: saw 路径也去重 (同 challengeId 不重复)
  const lastSawRef = useRef<string | null>(null);

  const triggerSaw = useCallback((challengeId: string, savedAmount: number, itemName: string) => {
    // 🔧 REVIEW-1 + REGRESSION fix: 同 challengeId 不重复触发 (3 个 SSE 路径并发去重)
    //    但 completeSilentMoment 时重置 lastSawRef, 让下一次挑战能正常显示沉默时刻
    if (lastSawRef.current === challengeId) return;
    lastSawRef.current = challengeId;
    const effectiveRate = hourlyRate || 25;
    setSilentMoment({
      outcome: 'saw',
      amount: savedAmount,
      itemName,
      hoursOfLife: savedAmount / effectiveRate,
      pendingDeposit: { challengeId, savedAmount },
    });
  }, [hourlyRate]);

  const triggerBought = useCallback((amount: number, itemName: string) => {
    // 🔧 REVIEW-1 CRITICAL-1: 同金额 2s 内不重复触发 (handleChooseToBuy + SSE 双触发)
    const now = Date.now();
    if (lastBoughtRef.current && lastBoughtRef.current.amount === amount && (now - lastBoughtRef.current.ts) < 2000) {
      return; // 2s 内同金额已触发, 跳过
    }
    lastBoughtRef.current = { amount, ts: now };
    const effectiveRate = hourlyRate || 25;
    setSilentMoment({
      outcome: 'bought',
      amount,
      itemName,
      hoursOfLife: amount / effectiveRate,
    });
  }, [hourlyRate]);

  /**
   * 🔧 ARCH fix Round 74 (Finding 4): Attach pending Aha Moment to the silent moment.
   * The Aha Moment fires when the silent moment completes (in completeSilentMoment),
   * NOT synchronously with triggerSaw. This preserves the ritual pacing.
   */
  const attachPendingAhaMoment = useCallback((ahaMoment: PendingAhaMoment) => {
    setSilentMoment(prev => prev ? { ...prev, pendingAhaMoment: ahaMoment } : prev);
  }, []);

  const completeSilentMoment = useCallback(() => {
    // 🔧 REGRESSION fix: 重置 lastSawRef, 让下一次挑战能正常显示沉默时刻
    //    (旧代码 lastSawRef 永不清除 → 第二次挑战后 silent moment 永远不显示)
    lastSawRef.current = null;
    setSilentMoment(null);
  }, []);

  return { silentMoment, triggerSaw, triggerBought, attachPendingAhaMoment, completeSilentMoment };
}
