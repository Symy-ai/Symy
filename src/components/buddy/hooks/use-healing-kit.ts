'use client';

import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useI18n } from '@/i18n/provider';
import { logger } from '@/lib/logger';
import type { BuddyState } from '@/types/buddy-state';

interface UseHealingKitArgs {
  buddyState: BuddyState;
  isDemo: boolean;
  /** 🔧 Round 3 C4: 服务端强制 healing-kit 每日限制 */
  onUseHealingKit?: () => Promise<'success' | 'already_used' | 'error'>;
  onAddTokens: (amount: number, reason: 'survival' | 'growth' | 'pleasure') => void;
  onToast?: (message: string, type?: 'success' | 'info') => void;
  onBuddyStateRefresh?: () => void;
  /** 详情 modal 的开启器 (state 与 modal JSX 都在 BuddyTab 壳上) */
  setShowCompanionDetail: (open: boolean) => void;
  /** BUG-131 fix: 共享 pulse timer refs (与 challenge pulse 共用, 卸载时统一清理) */
  pulseTimerRefs: { current: ReturnType<typeof setTimeout>[] };
}

/**
 * Pet Symy (healing kit): 点击头像 → 打开详情 modal + 触发抚摸
 * (原为 buddy-tab.tsx 内联逻辑 — File Split Wave 1 纯搬运, 行为零变化)
 */
export function useHealingKit({ buddyState, isDemo, onUseHealingKit, onAddTokens, onToast, onBuddyStateRefresh, setShowCompanionDetail, pulseTimerRefs }: UseHealingKitArgs) {
  const { t } = useI18n();
  const [healingPulse, setHealingPulse] = useState(false);
  // Without this, 5 rapid clicks fire 5 POSTs → 1 success + 4 silent 409 failures.
  //   React state updates are async — 5 synchronous clicks all see isHealingKitPending=false
  //   because the state hasn't re-rendered yet. A ref updates synchronously, so the 2nd-5th
  //   clicks see healingKitInFlightRef.current=true and bail out immediately.
  const healingKitInFlightRef = useRef(false);
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [isHealingKitPending, setIsHealingKitPending] = useState(false); // for UI (disabled style)

  // 使用 buddyState.lastHealingKitAt (数据库持久化)
  // 移到 handleCompanionClick 之前 (避免 used-before-declaration 错误)
  const healingKitUsed = useMemo(() => {
    if (isDemo) return false; // Demo 模式始终可用
    if (!buddyState.lastHealingKitAt) return false;
    const now = new Date();
    const lastUsed = new Date(buddyState.lastHealingKitAt);
    // 计算当前"healing day"的开始时间 (凌晨4点)
    const dayStart = new Date(now);
    dayStart.setHours(4, 0, 0, 0);
    // 如果当前时间在凌晨0-4点, "今天"实际是昨天的 healing day
    if (now.getHours() < 4) {
      dayStart.setDate(dayStart.getDate() - 1);
    }
    // 如果上次使用时间 >= 当前 healing day 的开始时间, 则已使用
    return lastUsed >= dayStart;
  }, [buddyState.lastHealingKitAt, isDemo]);

  // Round 105: 点击头像 → 打开详情 + 触发 Pet Symy (healing kit)
  const handleCompanionClick = useCallback(() => {
    setShowCompanionDetail(true);
    // Round 105: 同时触发 Pet Symy (原 healing kit 功能)
    if (!healingKitUsed && !healingKitInFlightRef.current && !isDemo) {
      healingKitInFlightRef.current = true;
      setIsHealingKitPending(true);
      setHealingPulse(true);
      const tid = setTimeout(() => {
        setHealingPulse(false);
        pulseTimerRefs.current = pulseTimerRefs.current.filter(t => t !== tid);
      }, 600);
      pulseTimerRefs.current.push(tid);
      if (onUseHealingKit) {
        onUseHealingKit().then(result => {
          if (result === 'success') {
            onToast?.(t('buddy.healingKitUsed'), 'success');
            // 成功后立即 forceRefresh, 更新 healingKitUsed
            //    防止 Realtime 延迟导致 healingKitUsed 仍为 false → 用户可重复点击
            onBuddyStateRefresh?.();
          } else if (result === 'already_used') {
            onToast?.(t('buddy.usedToday'), 'info');
          }
        }).catch((err: unknown) => {
          // Was .catch(() => {}) — silently swallowed healing kit errors.
          logger.warn('[BuddyTab] Pet Symy (healing kit) failed on avatar click:', err instanceof Error ? err.message : String(err));
          onToast?.(t('buddy.healingKitFailed', { defaultValue: 'Could not clear the mirror — please try again.' }), 'info');
        }).finally(() => {
          healingKitInFlightRef.current = false;
          setIsHealingKitPending(false);
        });
      } else {
        onAddTokens(3, 'pleasure');
        onToast?.(t('buddy.healingKitUsed'), 'success');
        healingKitInFlightRef.current = false;
        setIsHealingKitPending(false);
      }
    } else if (isDemo) {
      // Demo 模式也触发 + 显示 healingPulse
      setHealingPulse(true);
      const tid = setTimeout(() => {
        setHealingPulse(false);
        pulseTimerRefs.current = pulseTimerRefs.current.filter(t => t !== tid);
      }, 600);
      pulseTimerRefs.current.push(tid);
      onAddTokens(3, 'pleasure');
    } else if (healingKitUsed) {
      // Round 105 P1-3 fix: 今日已用过, 弹 info toast 告知用户 (避免困惑)
      onToast?.(t('buddy.usedToday'), 'info');
    }
    // Round 105: healingKitUsed=true 时不触发抚摸, modal 仍打开
  }, [healingKitUsed, isDemo, onUseHealingKit, onAddTokens, onToast, t, onBuddyStateRefresh, setShowCompanionDetail, pulseTimerRefs]);

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [healingKitResetTime, setHealingKitResetTime] = useState('');
  useEffect(() => {
    const compute = () => {
      const now = new Date();
      const nextReset = new Date(now);
      nextReset.setHours(4, 0, 0, 0);
      if (now.getHours() >= 4) {
        nextReset.setDate(nextReset.getDate() + 1);
      }
      setHealingKitResetTime(nextReset.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }));

      // Schedule next update at 4:00 AM (or 1s after, to ensure we're past midnight)
      const msUntilReset = nextReset.getTime() - now.getTime() + 1000;
      const timer = setTimeout(compute, msUntilReset);
      return () => clearTimeout(timer);
    };
    const cleanup = compute();
    return cleanup;
  }, []);

  return { healingPulse, handleCompanionClick };
}
