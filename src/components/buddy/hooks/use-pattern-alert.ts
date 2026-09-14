'use client';

import { useState, useEffect } from 'react';
import { logger } from '@/lib/logger';

// 🔧 P1-2 Pattern Alert (Round 91): 从 BuddyTab 内部 fetch, 避免 React 19 effect 问题
export interface PatternAlertData {
  alert: boolean;
  failedCount: number;
  recentFailures: Array<{ itemName: string; amount: number; createdAt: string }>;
}

/**
 * 🔧 P1-2 Pattern Alert (Round 91): 在 BuddyTab 内部 fetch, 避免 React 19 effect 问题
 * (原为 buddy-tab.tsx 内联逻辑 — File Split Wave 1 纯搬运, 行为零变化)
 */
export function usePatternAlert({ isDemo, userId }: { isDemo: boolean; userId?: string }): PatternAlertData | null {
  const [patternAlertData, setPatternAlertData] = useState<PatternAlertData | null>(null);
  useEffect(() => {
    if (isDemo || !userId) return;
    let active = true;
  // eslint-disable-next-line symy/no-raw-fetch-in-use-effect
    fetch('/api/buddy/pattern-alert')
      .then(r => r.ok ? r.json() : null)
      .then((d: PatternAlertData | null) => { if (active && d?.alert) setPatternAlertData(d); })
      .catch((err) => logger.warn('[BuddyTab] pattern-alert fetch failed:', err instanceof Error ? err.message : String(err)));
    return () => { active = false; };
  }, [userId, isDemo]);
  return patternAlertData;
}
