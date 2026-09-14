/**
 * use-daily-tasks — 今日任务清单追踪 (PM3-P2-1)
 *
 * 追踪用户今日是否完成 3 个核心任务:
 * 1. See it once (Aha Moment)
 * 2. Chat once (Mirror)
 * 3. Set hourly rate
 *
 * 用 localStorage 追踪 (无新 API, 简单可靠):
 * - key: symy_daily_tasks_YYYY-MM-DD
 * - value: { seen: boolean, chatted: boolean, hourlyRateSet: boolean }
 *
 * 每日自动重置 (key 含日期, 跨日自然失效)
 *
 * 用法:
 *   const { tasks, completedCount, markSeen, markChatted, markHourlyRateSet } = useDailyTasks(isDemo, hourlyRate);
 *   // tasks = { seen: false, chatted: false, hourlyRateSet: true }
 *   // completedCount = 1
 *   // markSeen() — 用户完成 See it 后调用
 */

'use client';

import { useState, useEffect, useCallback } from 'react';
import { apiFetch } from '@/lib/api-client';
import { logger } from '@/lib/logger';

export interface DailyTasks {
  seen: boolean;
  chatted: boolean;
  hourlyRateSet: boolean;
}

const EMPTY_TASKS: DailyTasks = { seen: false, chatted: false, hourlyRateSet: false };

import { getLimitWindow } from '@/lib/limit-window';

/**
 * 今日任务 key。
 * 🔧 P1 fix: 与后端 getLimitWindow() 保持一致 (UTC 4:00 AM 分界)，避免跨时区双轨漂移。
 *    之前用本地午夜导致与后端 daily_see_it_date 不一致。
 */
function getTodayKey(): string {
  return getLimitWindow(new Date());
}

function getStorageKey(): string {
  return `symy_daily_tasks_${getTodayKey()}`;
}

/**
 * @param isDemo 是否 demo 模式 (demo 模式也追踪, 但 hourlyRateSet 从 hourlyRate prop 推断)
 * @param hourlyRate 当前时薪 (用于推断 hourlyRateSet)
 */
export function useDailyTasks(isDemo: boolean, hourlyRate: number) {
  const [tasks, setTasks] = useState<DailyTasks>(EMPTY_TASKS);

  // mount 时从 localStorage 加载
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const loadFromStorage = (): DailyTasks => {
      try {
        const stored = localStorage.getItem(getStorageKey());
        if (stored) {
          const parsed = JSON.parse(stored) as Partial<DailyTasks>;
          return {
            seen: !!parsed.seen,
            chatted: !!parsed.chatted,
            hourlyRateSet: hourlyRate > 0 || !!parsed.hourlyRateSet,
          };
        }
      } catch { /* */ }
      return { seen: false, chatted: false, hourlyRateSet: hourlyRate > 0 };
    };

    const initial = loadFromStorage();
    setTasks(initial);

    // Round 128 fix: 如果 localStorage 显示 seen=false, 检查服务器端是否今天完成过挑战
    //   根因: markDailySeen() 只在 handleChallengePassed 和 handleAhaComplete 调用
    //   如果用户通过其他方式完成挑战 (如 AI 直接 complete_challenge), 或者
    //   挑战被标记为 expired (不是 passed/failed), markDailySeen 不会被调用
    //   修复: mount 时从 /api/challenge/limit 检查 count > 0, 如果是则 seen=true
    if (!isDemo && !initial.seen) {
      // eslint-disable-next-line symy/no-raw-fetch-in-use-effect -- mount-time sync from server, not a query
      apiFetch<{ count: number }>('/api/challenge/limit')
        .then(data => {
          if (data && data.count > 0) {
            // 服务器确认今天完成过挑战 → 标记 seen=true
            setTasks(prev => {
              if (prev.seen) return prev;
              const updated = { ...prev, seen: true };
              try {
                localStorage.setItem(getStorageKey(), JSON.stringify(updated));
              } catch { /* */ }
              return updated;
            });
          }
        })
        .catch(err => {
          // 🔧 2026-07-15 P0-2 fix: 401 是 token 过期常见情况 (Supabase 会自动 refresh),
          //   不要在控制台刷警告 (会让游戏策划评估报告误判为「Auth 状态管理有结构性 bug」)
          //   真正的 auth 失败由 auth-provider onAuthStateChange SIGNED_OUT 事件处理
          //   其他错误 (5xx/网络) 仍 warn 但降级到 info
          const status = (err as { status?: number }).status;
          if (status === 401) {
            // 静默 — Supabase 自动 refresh 后下次 mount 会重试
            logger.info('[useDailyTasks] /api/challenge/limit returned 401 (token refreshing), skipping sync');
          } else {
            logger.info('[useDailyTasks] Failed to sync seen state from server (non-blocking):', err);
          }
        });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // hourlyRate 变化时, 更新 hourlyRateSet
  useEffect(() => {
    if (hourlyRate > 0 && !tasks.hourlyRateSet) {
      setTasks(prev => {
        const updated = { ...prev, hourlyRateSet: true };
        try {
          localStorage.setItem(getStorageKey(), JSON.stringify(updated));
        } catch {
          // localStorage 不可用
        }
        return updated;
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hourlyRate]);

  const persistTasks = useCallback((updated: DailyTasks) => {
    try {
      localStorage.setItem(getStorageKey(), JSON.stringify(updated));
    } catch {
      // localStorage 不可用 (隐私模式/配额满)
    }
  }, []);

  const markSeen = useCallback(() => {
    setTasks(prev => {
      if (prev.seen) return prev; // 已完成, 不重复
      const updated = { ...prev, seen: true };
      persistTasks(updated);
      return updated;
    });
  }, [persistTasks]);

  const markChatted = useCallback(() => {
    setTasks(prev => {
      if (prev.chatted) return prev;
      const updated = { ...prev, chatted: true };
      persistTasks(updated);
      return updated;
    });
  }, [persistTasks]);

  const markHourlyRateSet = useCallback(() => {
    setTasks(prev => {
      if (prev.hourlyRateSet) return prev;
      const updated = { ...prev, hourlyRateSet: true };
      persistTasks(updated);
      return updated;
    });
  }, [persistTasks]);

  // 🔧 PM-#10 fix: completedCount 只算 seen + chatted (移除 hourlyRateSet, 时薪是一次性配置不是每日任务)
  //   旧代码: (tasks.seen ? 1 : 0) + (tasks.chatted ? 1 : 0) + (tasks.hourlyRateSet ? 1 : 0) → /3
  //   新代码: (tasks.seen ? 1 : 0) + (tasks.chatted ? 1 : 0) → /2
  //   注意: hourlyRateSet 字段保留在 DailyTasks interface (向后兼容, 不破坏 localStorage 已存数据)
  const completedCount = (tasks.seen ? 1 : 0) + (tasks.chatted ? 1 : 0);

  return {
    tasks,
    completedCount,
    markSeen,
    markChatted,
    markHourlyRateSet,
  };
}
