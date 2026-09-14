'use client';

/**
 * use-welcome-back — 回归欢迎检测 (纯客户端)
 *
 * 规则:
 * - demo 模式永不触发;
 * - 间隔 <3 天: 只刷新 last-seen, 不触发;
 * - 间隔 >=3 天: 触发一次, 展示后立即更新 last-seen (同一次离开只欢迎一次);
 * - localStorage 不可用: 静默 no-op.
 *
 * 复用 getLimitWindow() 的 UTC 4AM 窗口作为日期分界 (与 daily-ritual / daily-green-report 一致).
 */

import { useState, useEffect, useCallback } from 'react';
import { getLimitWindow } from '@/lib/limit-window';

const WELCOME_BACK_STORAGE_KEY = 'symy-welcome-back-last-seen';
const WELCOME_BACK_THRESHOLD_DAYS = 3;

export interface UseWelcomeBackResult {
  /** 触发时返回缺失天数, 否则 null */
  welcomeBack: { absenceDays: number } | null;
  /** 调用后立即更新 last-seen 为当前窗口, 避免重复触发 */
  ack: () => void;
}

export function useWelcomeBack(isDemo: boolean): UseWelcomeBackResult {
  const [welcomeBack, setWelcomeBack] = useState<{ absenceDays: number } | null>(null);

  useEffect(() => {
    if (isDemo) return;
    if (typeof window === 'undefined') return;

    let cancelled = false;

    try {
      const todayWindow = getLimitWindow();
      const stored = localStorage.getItem(WELCOME_BACK_STORAGE_KEY);
      const lastSeen = stored || null;

      if (!lastSeen) {
        // 首次访问, 不触发 (没有"离开"可比较)
        if (!cancelled) localStorage.setItem(WELCOME_BACK_STORAGE_KEY, todayWindow);
        return;
      }

      const lastDate = new Date(lastSeen + 'T00:00:00Z');
      const todayDate = new Date(todayWindow + 'T00:00:00Z');
      const diffMs = todayDate.getTime() - lastDate.getTime();
      const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

      if (diffDays >= WELCOME_BACK_THRESHOLD_DAYS) {
        if (!cancelled) setWelcomeBack({ absenceDays: diffDays });
        // 立即更新 last-seen, 同一次离开只欢迎一次
        if (!cancelled) localStorage.setItem(WELCOME_BACK_STORAGE_KEY, todayWindow);
      } else {
        // 刷新 last-seen 到当前窗口 (同一次会话内不重复触发)
        if (!cancelled) localStorage.setItem(WELCOME_BACK_STORAGE_KEY, todayWindow);
      }
    } catch {
      // safe to ignore: localStorage 不可用 (隐私模式) — 静默降级
    }

    return () => {
      cancelled = true;
    };
  }, [isDemo]);

  const ack = useCallback(() => {
    setWelcomeBack(null);
    try {
      if (typeof window !== 'undefined') {
        localStorage.setItem(WELCOME_BACK_STORAGE_KEY, getLimitWindow());
      }
    } catch {
      // safe to ignore: non-critical persistence failure
    }
  }, []);

  return { welcomeBack, ack };
}
