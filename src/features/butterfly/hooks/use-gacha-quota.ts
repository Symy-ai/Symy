/**
 * useGachaQuota — Round 126 用户决策 5 (AUDIT-7 Step 5)
 *
 * 🔧 提取自 butterfly-tab.tsx:83-212 (gacha 配额 state + load + increment + decrement)
 *
 * 管理 gacha 每日限制:
 * - demo 模式: localStorage 追踪 (1 次/天)
 * - 登录模式: /api/buddy/gacha-limit API (3 次/天, premium 无限)
 * - API 失败时 fail-closed (防 airplane mode exploit)
 */

import { useState, useEffect, useCallback } from 'react';
import { logger } from '@/lib/logger';
import { getLimitWindow } from '@/lib/limit-window';

const DAILY_GACHA_LIMIT = 3;
const DEMO_DAILY_GACHA_LIMIT = 1;

export interface GachaQuota {
  gachaUsedToday: number;
  gachaRemaining: number;
  isGachaPremium: boolean;
  incrementGachaCount: () => Promise<void>;
  decrementGachaCount: () => Promise<void>;
}

export function useGachaQuota(isDemo: boolean, onAuthPrompt?: (type: string) => void): GachaQuota {
  const [gachaUsedToday, setGachaUsedToday] = useState(0);
  const [isGachaPremium, setIsGachaPremium] = useState(false);
  const gachaRemaining = isDemo
    ? Math.max(0, DEMO_DAILY_GACHA_LIMIT - gachaUsedToday)
    : isGachaPremium
      ? Infinity
      : Math.max(0, DAILY_GACHA_LIMIT - gachaUsedToday);

  // Load on mount
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (isDemo) {
      const today = getLimitWindow();
      const key = `symy_gacha_demo_count_${today}`;
      try {
        const stored = parseInt(localStorage.getItem(key) || '0', 10);
        setGachaUsedToday(isNaN(stored) ? 0 : stored);
      } catch {
        setGachaUsedToday(0);
      }
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const { apiFetch } = await import('@/lib/api-client');
  // eslint-disable-next-line symy/no-raw-fetch-in-use-effect
        const data = await apiFetch<{ count?: number; remaining?: number; isPremium?: boolean }>('/api/buddy/gacha-limit');
        if (!cancelled) {
          setGachaUsedToday(data?.count || 0);
          setIsGachaPremium(data?.isPremium ?? false);
        }
      } catch {
        if (!cancelled) {
          logger.warn('[ButterflyTab] Gacha limit API unreachable — failing closed');
          setGachaUsedToday(DAILY_GACHA_LIMIT);
        }
      }
    })();
    return () => { cancelled = true; };
  }, [isDemo]);

  const incrementGachaCount = useCallback(async () => {
    if (typeof window === 'undefined') return;
    if (isDemo) {
      const today = getLimitWindow();
      const key = `symy_gacha_demo_count_${today}`;
      const newCount = gachaUsedToday + 1;
      try { localStorage.setItem(key, String(newCount)); } catch { /* privacy mode */ }
      setGachaUsedToday(newCount);
      if (newCount >= DEMO_DAILY_GACHA_LIMIT && onAuthPrompt) {
        setTimeout(() => onAuthPrompt('gacha'), 1500);
      }
      return;
    }
    try {
      const { apiFetch } = await import('@/lib/api-client');
      const data = await apiFetch<{ count?: number; remaining?: number; success?: boolean; isPremium?: boolean }>('/api/buddy/gacha-limit', {
        method: 'POST',
        body: { action: 'increment' },
      });
      if (typeof data?.count === 'number') {
        setGachaUsedToday(data.count);
      } else {
        setGachaUsedToday(prev => prev + 1);
      }
      if (typeof data?.isPremium === 'boolean') {
        setIsGachaPremium(data.isPremium);
      }
    } catch {
      logger.error('[ButterflyTab] Gacha increment API failed — failing closed');
      setGachaUsedToday(DAILY_GACHA_LIMIT);
    }
  }, [isDemo, gachaUsedToday, onAuthPrompt]);

  const decrementGachaCount = useCallback(async () => {
    if (typeof window === 'undefined') return;
    if (isDemo) {
      const today = getLimitWindow();
      const key = `symy_gacha_demo_count_${today}`;
      const newCount = Math.max(0, gachaUsedToday - 1);
      try { localStorage.setItem(key, String(newCount)); } catch { /* privacy mode */ }
      setGachaUsedToday(newCount);
      return;
    }
    try {
      const { apiFetch } = await import('@/lib/api-client');
      const data = await apiFetch<{ count?: number; refunded?: boolean }>('/api/buddy/gacha-limit', { method: 'POST', body: { action: 'decrement' } });
      if (typeof data?.count === 'number') { setGachaUsedToday(data.count); logger.info('[ButterflyTab] Gacha refunded. Count:', data.count); }
    } catch (err) {
      logger.warn('[ButterflyTab] Failed to refund gacha count:', err);
      setGachaUsedToday(prev => Math.max(0, prev - 1));
    }
  }, [isDemo, gachaUsedToday]);

  return { gachaUsedToday, gachaRemaining, isGachaPremium, incrementGachaCount, decrementGachaCount };
}
