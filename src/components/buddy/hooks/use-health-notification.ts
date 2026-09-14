'use client';

import { useState, useEffect, useRef } from 'react';
import { useI18n } from '@/i18n/provider';

export interface HealthNotification {
  message: string;
  type: 'damage' | 'recovery' | 'badge';
  vitalityChange: number;
}

/**
 * Track vitality changes and show notification
 * (原为 buddy-tab.tsx 内联逻辑 — File Split Wave 1 纯搬运, 行为零变化)
 */
export function useHealthNotification({ vitality, isDemo, isLoading }: { vitality: number; isDemo: boolean; isLoading: boolean }): HealthNotification | null {
  const { t } = useI18n();
  //    Round 20 H4 把缓存逻辑从 state 移到 ref (cachedChallengeRef), 但忘了删 state。
  //    4 处 setState 触发不必要的 re-render, 已全部移除。
  const [healthNotification, setHealthNotification] = useState<HealthNotification | null>(null);
  // Track vitality changes and show notification
  const prevVitalityRef = useRef<number | null>(null);
  // BUG-90 fix: Store timeout ref for cleanup on unmount
  const healthNotifTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    // 🔧 P1-4 fix (2026-07-20): isLoading 时跳过 vitality 通知
    //   旧代码: 页面刷新时 buddyState 先用 fallback (vitality=72), 服务器数据到达后变成真实值 (如 100)
    //          → effect 触发 prev=72, current=100, change=+28 → 每次刷新都弹 "Symy feels happier! +28 mood"
    //   修复: isLoading 时不更新 prevVitalityRef, 等真实数据到达后再开始追踪
    if (isLoading) {
      prevVitalityRef.current = null;
      return;
    }
    const prev = prevVitalityRef.current;
    const current = vitality;
    // Skip the very first render (prev is null)
    if (prev !== null && prev !== current) {
      const change = Math.round(current - prev);
      if (Math.abs(change) >= 1) {
        setHealthNotification({
          message: change > 0
            ? t('buddy.symyFeelsBetter', { change: `+${change}` })
            : t('buddy.symyWasHurt', { change }),
          type: change > 0 ? 'recovery' : 'damage',
          vitalityChange: change,
        });
        // BUG-90 fix: Auto-dismiss after 3s with cleanup on unmount
        if (healthNotifTimerRef.current) clearTimeout(healthNotifTimerRef.current);
        healthNotifTimerRef.current = setTimeout(() => setHealthNotification(null), 3000);
      }
    }
    prevVitalityRef.current = current;
    return () => {
      if (healthNotifTimerRef.current) clearTimeout(healthNotifTimerRef.current);
    };
  }, [vitality, isDemo, t, isLoading]);

  return healthNotification;
}
