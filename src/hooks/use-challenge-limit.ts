'use client';

/**
 * useChallengeLimit — 挑战每日限制客户端 hook (需求六)
 *
 * 🔧 需求六: 免费版每日 3 次挑战限制
 *    - mount 时 GET /api/challenge/limit 获取剩余次数
 *    - canStartChallenge(): 检查是否还能挑战 (true=可以, false=已达上限)
 *    - refresh(): 重新 fetch (挑战完成后刷新剩余次数)
 *
 * 🔧 P0 fix (2026-07-10): 挑战完成后 "5 left" 计数器不实时更新
 *    - 旧代码: refresh() 只在 429 错误时调用, 挑战完成 (I saw it / I choose to buy) 后不刷新
 *    - 根因: BuddyTab 的 useChallengeLimit hook 与 ChatTab 的挑战完成流程解耦, 无事件传递
 *    - 修复: 监听 window 事件 'symy:challenge-completed' 自动 refresh
 *      事件由 page.tsx handleChallengePassed 派发 (挑战完成回调)
 *    - 同时监听 'symy:challenge-created' (挑战创建后也刷新, 立即扣减 remaining)
 *
 * 优雅降级: API 失败或 degraded=true → 假设不限 (不阻塞用户)
 */

import { useState, useEffect, useCallback } from 'react';
import { apiFetch } from '@/lib/api-client';
import { logger } from '@/lib/logger';

export interface ChallengeLimitData {
  count: number;
  remaining: number;
  limit: number;
  isPremium: boolean;
  degraded?: boolean;
}

/**
 * 触发挑战限制刷新的全局事件。
 * 任何组件完成或创建挑战后都应派发此事件, 让所有 useChallengeLimit 订阅者刷新。
 *
 * 用法:
 *   window.dispatchEvent(new CustomEvent('symy:challenge-completed'));
 *   window.dispatchEvent(new CustomEvent('symy:challenge-created'));
 */
export const CHALLENGE_COMPLETED_EVENT = 'symy:challenge-completed';
export const CHALLENGE_CREATED_EVENT = 'symy:challenge-created';

export function useChallengeLimit(isDemo: boolean = false) {
  const [limitData, setLimitData] = useState<ChallengeLimitData | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const refresh = useCallback(async () => {
    if (isDemo) return; // Demo 模式不限
    setIsLoading(true);
    try {
      const data = await apiFetch<ChallengeLimitData>('/api/challenge/limit');
      setLimitData(data);
    } catch (err) {
      logger.warn('[useChallengeLimit] Failed to fetch challenge limit:', err);
      // 优雅降级: 假设不限
      setLimitData({ count: 0, remaining: Infinity, limit: Infinity, isPremium: false, degraded: true });
    } finally {
      setIsLoading(false);
    }
  }, [isDemo]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // 🔧 P0 fix: 监听挑战完成/创建事件, 自动刷新剩余次数
  //    旧代码: 只在 mount 时 fetch 一次, 挑战完成后不刷新 → "5 left" 一直显示
  //    新代码: 监听全局事件, 挑战完成/创建后立即 refresh
  useEffect(() => {
    if (isDemo) return; // Demo 模式不限

    const handleChallengeCompleted = () => {
      logger.info('[useChallengeLimit] Challenge completed event received, refreshing limit');
      refresh();
    };

    const handleChallengeCreated = () => {
      logger.info('[useChallengeLimit] Challenge created event received, refreshing limit');
      refresh();
    };

    window.addEventListener(CHALLENGE_COMPLETED_EVENT, handleChallengeCompleted);
    window.addEventListener(CHALLENGE_CREATED_EVENT, handleChallengeCreated);

    return () => {
      window.removeEventListener(CHALLENGE_COMPLETED_EVENT, handleChallengeCompleted);
      window.removeEventListener(CHALLENGE_CREATED_EVENT, handleChallengeCreated);
    };
  }, [isDemo, refresh]);

  // 🔧 P0 fix: 当用户从 Chat tab 切回 Buddy tab 时刷新 (visibilitychange 不适用于 tab 切换,
  //    因为 Buddy tab 始终挂载在 DOM 中只是 hidden. 用 custom event 替代)
  //    补充: 监听 symy:tab-change 事件, 当切到 buddy tab 时刷新
  useEffect(() => {
    if (isDemo) return;

    // 🔧 ARCH fix (2026-07-21): Track pending timer for cleanup
    //    Old: setTimeout(() => refresh(), 100) with no cleanup — if component
    //    unmounts within 100ms, refresh() fires on unmounted component.
    let pendingTimer: ReturnType<typeof setTimeout> | null = null;

    const handleTabChange = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail?.tab === 'buddy') {
        // 切到 buddy tab 时刷新 (延迟 100ms 让 chat tab 的 challenge 完成先提交)
        pendingTimer = setTimeout(() => refresh(), 100);
      }
    };

    window.addEventListener('symy:tab-change', handleTabChange);
    return () => {
      window.removeEventListener('symy:tab-change', handleTabChange);
      if (pendingTimer) clearTimeout(pendingTimer);
    };
  }, [isDemo, refresh]);

  const canStartChallenge = useCallback(() => {
    if (isDemo) return true;
    if (!limitData) return true; // 未加载完 → 允许 (乐观)
    if (limitData.degraded) return true; // 降级 → 不限
    if (limitData.isPremium) return true; // Premium 不限
    return limitData.remaining > 0;
  }, [isDemo, limitData]);

  return {
    limitData,
    isLoading,
    canStartChallenge,
    refresh,
  };
}
