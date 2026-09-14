'use client';

/**
 * WeeklyReviewCard — 本周看见周度回顾卡片 (精简版)
 *
 * 🔧 ARCH fix Round 78: Simplified per user request.
 *    - Only top section: title + streak + 3 metrics (no bar chart, no footer)
 *    - Entire card is clickable → opens Insights overlay
 *    - Removed separate settings icon (this card replaces it as the entry point)
 */

import { useState, useEffect, useRef } from 'react';
import { Calendar, TrendingUp, Coins, Flame } from 'lucide-react';
import { useI18n } from '@/i18n/provider';
import { apiFetch } from '@/lib/api-client';
import { logger } from '@/lib/logger';
// 🔧 P1-19 fix: 统一金额格式化
import { moneyToFreedomLabel } from '@/lib/freedom-time';
import { useHourlyRate } from '@/hooks/use-hourly-rate';

interface DailyBreakdown {
  date: string;
  count: number;
  savedAmount: number;
}

interface WeeklyReviewData {
  challengesCompleted: number;
  totalSaved: number;
  tokensEarned: number;
  dailyBreakdown: DailyBreakdown[];
  streakDays: number;
  todayDateStr?: string;
}

interface WeeklyReviewCardProps {
  isActive?: boolean;
  /** 🔧 ARCH fix Round 78: Click card → open Insights overlay */
  onOpenInsights?: () => void;
}

export function WeeklyReviewCard({ isActive = true, onOpenInsights }: WeeklyReviewCardProps) {
  const { t, locale } = useI18n();
  const { hourlyRate } = useHourlyRate();
  const [data, setData] = useState<WeeklyReviewData | null>(null);
  const [isLoading, setIsLoading] = useState(isActive);
  // 🔧 P0-6 fix: 增加 error 状态, fetch 失败时显示重试按钮, 避免静默显示空白
  const [fetchError, setFetchError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!isActive) return;
    if (abortRef.current) abortRef.current.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setIsLoading(true);
    // 🔧 P0-6 fix: 清除上次的 error 状态, 避免旧错误信息残留
    setFetchError(null);

    (async () => {
      try {
  // eslint-disable-next-line symy/no-raw-fetch-in-use-effect
        const result = await apiFetch<WeeklyReviewData>('/api/buddy/weekly-review', {
          signal: controller.signal,
        });
        setData(result);
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') return;
        logger.warn('[WeeklyReviewCard] fetch failed:', err);
        // 🔧 P0-6 fix: 保存错误信息, UI 显示重试按钮
        setFetchError(err instanceof Error ? err.message : 'Failed to load weekly review');
      } finally {
        if (!controller.signal.aborted) {
          setIsLoading(false);
        }
      }
    })();

    return () => {
      controller.abort();
      if (abortRef.current === controller) abortRef.current = null;
    };
  }, [isActive]);

  // 🔧 P0-6 fix: 手动重试函数
  const retry = () => {
    setFetchError(null);
    setIsLoading(true);
    // 触发 useEffect 重新执行 (通过 isActive toggle 不合适, 直接调用 fetch)
    if (abortRef.current) abortRef.current.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    (async () => {
      try {
        const result = await apiFetch<WeeklyReviewData>('/api/buddy/weekly-review', {
          signal: controller.signal,
        });
        setData(result);
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') return;
        logger.warn('[WeeklyReviewCard] retry fetch failed:', err);
        setFetchError(err instanceof Error ? err.message : 'Failed to load weekly review');
      } finally {
        if (!controller.signal.aborted) {
          setIsLoading(false);
        }
      }
    })();
  };

  if (isLoading) {
    return (
      <div className="w-full bg-gradient-to-br from-cyan-500/8 to-purple-500/5 dark:from-cyan-500/12 dark:to-purple-500/8 border border-cyan-500/20 dark:border-cyan-500/30 rounded-2xl p-5">
        <div className="animate-pulse space-y-3">
          <div className="h-5 w-40 bg-glass-fill rounded" />
          <div className="grid grid-cols-3 gap-3">
            <div className="h-16 bg-glass-fill rounded-xl" />
            <div className="h-16 bg-glass-fill rounded-xl" />
            <div className="h-16 bg-glass-fill rounded-xl" />
          </div>
        </div>
      </div>
    );
  }

  // 🔧 P0-6 fix: fetch 失败时显示错误提示 + 重试按钮, 不再静默返回 null
  if (fetchError) {
    return (
      <div className="w-full bg-gradient-to-br from-red-500/8 to-orange-500/5 dark:from-red-500/12 dark:to-orange-500/8 border border-red-500/20 dark:border-red-500/30 rounded-2xl p-5">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-base font-bold text-red-700 dark:text-red-300 leading-tight">
            {t('profile.weeklyReviewTitle', { defaultValue: 'This week\'s seeing' })}
          </h3>
        </div>
        <p className="text-xs text-text-tertiary mb-3">
          {t('profile.weeklyReviewError', { defaultValue: 'Could not load weekly review' })}
        </p>
        <button
          onClick={retry}
          className="text-xs px-3 py-1.5 rounded-lg bg-red-500/20 text-red-400 border border-red-500/30 hover:bg-red-500/30 transition-colors"
        >
          {t('common.retry', { defaultValue: 'Retry' })}
        </button>
      </div>
    );
  }

  if (!data) {
    return null;
  }

  return (
    // 🔧 ARCH fix Round 78: Entire card is clickable → opens Insights overlay
    <div
      onClick={onOpenInsights}
      className={`w-full bg-gradient-to-br from-cyan-500/8 to-purple-500/5 dark:from-cyan-500/12 dark:to-purple-500/8 border border-cyan-500/20 dark:border-cyan-500/30 rounded-2xl p-5 transition-all ${onOpenInsights ? 'cursor-pointer hover:border-cyan-500/40 hover:shadow-lg hover:shadow-cyan-500/10' : ''}`}
    >
      {/* 标题 + streak */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-cyan-500/30 to-purple-500/30 flex items-center justify-center">
            <Calendar className="w-5 h-5 text-cyan-600 dark:text-cyan-400" />
          </div>
          <div>
            <h3 className="text-base font-bold text-cyan-700 dark:text-cyan-300 leading-tight">
              {t('profile.weeklyReviewTitle', { defaultValue: 'This week\'s seeing' })}
            </h3>
            <p className="text-[10px] text-text-tertiary mt-0.5">
              {t('profile.weeklyReviewSubtitle', { defaultValue: 'Past 7 days' })}
            </p>
          </div>
        </div>
        {/* Streak badge — 🔧 P2-6 fix: "2d" → "2d active" with title for full meaning */}
        {data.streakDays > 0 && (
          <div
            className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-orange-500/15 border border-orange-500/30"
            title={t('profile.weeklyActiveDaysFull', { n: data.streakDays, s: data.streakDays !== 1 ? 's' : '' })}
          >
            <Flame className="w-3.5 h-3.5 text-orange-500" />
            <span className="text-xs font-bold text-orange-600 dark:text-orange-400">
              {t('profile.weeklyActiveDays', { n: data.streakDays })}
            </span>
          </div>
        )}
      </div>

      {/* 3 个核心指标 */}
      <div className="grid grid-cols-3 gap-2.5">
        <div className="text-center p-2.5 rounded-xl bg-glass-fill/50 dark:bg-glass-fill/30">
          <div className="flex items-center justify-center mb-1">
            <TrendingUp className="w-3.5 h-3.5 text-cyan-400" />
          </div>
          <p className="text-xl font-bold text-text-primary leading-none">{data.challengesCompleted}</p>
          <p className="text-[9px] text-text-tertiary mt-1 leading-tight">
            {t('profile.weeklyChallenges', { defaultValue: 'Seeing' })}
          </p>
        </div>
        <div className="text-center p-2.5 rounded-xl bg-glass-fill/50 dark:bg-glass-fill/30">
          <div className="flex items-center justify-center mb-1">
            <span className="text-xs">🕐</span>
          </div>
          <p className="text-xl font-bold gradient-text-green leading-none">{moneyToFreedomLabel(data.totalSaved, locale, hourlyRate)}</p>
          <p className="text-[9px] text-text-tertiary mt-1 leading-tight">
            {t('profile.weeklySaved', { defaultValue: 'Saved' })}
          </p>
        </div>
        <div className="text-center p-2.5 rounded-xl bg-glass-fill/50 dark:bg-glass-fill/30">
          <div className="flex items-center justify-center mb-1">
            <Coins className="w-3.5 h-3.5 text-amber-400" />
          </div>
          <p className="text-xl font-bold text-amber-500 dark:text-amber-400 leading-none">{data.tokensEarned}</p>
          <p className="text-[9px] text-text-tertiary mt-1 leading-tight">
            {t('profile.weeklyTokens', { defaultValue: 'Tokens' })}
          </p>
        </div>
      </div>
    </div>
  );
}
