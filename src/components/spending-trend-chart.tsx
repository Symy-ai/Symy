'use client';

/**
 * SpendingTrendChart — Guardian Trend weekly view (语义已反转)
 *
 * 纯 CSS 柱状图，展示最近 7 天（含今天）的守护金额：
 * - 柱高 = 当日 challenge_completed (守住) + refund_processed (退款找回) 金额之和
 * - 金额与自由小时只在应用内柱内/悬浮/合计区出现，不进入任何分享导出
 * - 趋势 = 本周守护金额对比上周；上升是正向消息，因此 TrendingUp 为绿色
 *
 * 数据口径 SSOT: daily-green-report / weekly-green-report — 仅
 * challenge_completed + refund_processed 计为守护；challenge_failed 与消费事件
 * 不计入、不渲染羞辱文案。本周合计与 weekly-green-report 的近 7 天（含今天）
 * moneyLeft 口口一致，均来自既有 ImpulseEvent 管道，零 DDL。
 * 组件名保留 SpendingTrendChart，避免扩大 import 面；重命名另立任务。
 */

import { useMemo, memo, useState, useEffect } from 'react';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { subDays } from 'date-fns';
import type { ImpulseEvent } from '@/lib/impulse-detector';
import { useI18n } from '@/i18n/provider';
import { DEFAULT_HOURLY_RATE, moneyToFreedomLabel } from '@/lib/freedom-time';
import { formatCurrency } from '@/lib/format';

interface SpendingTrendChartProps {
  events: ImpulseEvent[];
  moneySaved: number;
}

interface DayData {
  date: Date;
  label: string;
  events: ImpulseEvent[];
  amount: number;
  isToday: boolean;
}

function isGuardEvent(event: ImpulseEvent): boolean {
  return event.subType === 'challenge_completed' || event.subType === 'refund_processed';
}

function timestampOf(event: ImpulseEvent): Date | null {
  const timestamp = event.timestamp instanceof Date ? event.timestamp : new Date(event.timestamp);
  return Number.isNaN(timestamp.getTime()) ? null : timestamp;
}

function sumGuardAmount(events: ImpulseEvent[], start: Date, end: Date): number {
  return events.reduce((sum, event) => {
    if (!isGuardEvent(event)) return sum;
    const timestamp = timestampOf(event);
    if (!timestamp || timestamp < start || timestamp > end) return sum;
    return sum + (event.amount || 0);
  }, 0);
}

// 🔧 TECH-DEBT-C: React.memo — chart component is expensive to re-render
export const SpendingTrendChart = memo(function SpendingTrendChart({ events, moneySaved }: SpendingTrendChartProps) {
  const { t, locale } = useI18n();

  // SSR uses UTC while the browser uses the local timezone; keep the first render empty to avoid hydration mismatch.
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);

  const { days, maxAmount, weekAmount, trendDirection } = useMemo(() => {
    if (!mounted) {
      return { days: [] as DayData[], maxAmount: 1, weekAmount: 0, prevWeekAmount: 0, trendDirection: 'flat' as const };
    }

    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);
    const endOfToday = new Date(startOfToday.getTime() + 86400000 - 1);
    const weekStart = subDays(startOfToday, 6);
    const prevWeekStart = subDays(startOfToday, 13);
    const prevWeekEnd = subDays(endOfToday, 7);

    const nextDays: DayData[] = [];
    for (let offset = 6; offset >= 0; offset--) {
      const date = subDays(startOfToday, offset);
      const dayEnd = new Date(date.getTime() + 86400000 - 1);
      const dayEvents = events.filter(event => {
        const timestamp = timestampOf(event);
        return !!timestamp && timestamp >= date && timestamp <= dayEnd;
      }).filter(isGuardEvent);

      nextDays.push({
        date,
        label: date.toLocaleDateString(locale === 'zh' ? 'zh-CN' : 'en-US', { weekday: 'short' }),
        events: dayEvents,
        amount: dayEvents.reduce((sum, event) => sum + (event.amount || 0), 0),
        isToday: offset === 0,
      });
    }

    const max = Math.max(...nextDays.map(day => day.amount), 1);
    const currentWeekAmount = sumGuardAmount(events, weekStart, endOfToday);
    const lastWeekAmount = sumGuardAmount(events, prevWeekStart, prevWeekEnd);
    let direction: 'up' | 'down' | 'flat' = 'flat';
    if (currentWeekAmount > lastWeekAmount) direction = 'up';
    else if (currentWeekAmount < lastWeekAmount) direction = 'down';

    return {
      days: nextDays,
      maxAmount: max,
      weekAmount: currentWeekAmount,
      trendDirection: direction,
    };
  }, [events, locale, mounted]);

  const TrendIcon = trendDirection === 'up' ? TrendingUp : trendDirection === 'down' ? TrendingDown : Minus;
  const trendColor = trendDirection === 'up'
    ? 'text-emerald-400'
    : trendDirection === 'down'
      ? 'text-text-tertiary'
      : 'text-text-tertiary';

  const trendLabel = trendDirection === 'up'
    ? t('home.guardianTrendUp')
    : trendDirection === 'down'
      ? t('home.guardianTrendDown')
      : t('home.guardianTrendStable');

  const [expandedDay, setExpandedDay] = useState<number | null>(null);
  const expandedDayData = expandedDay !== null ? days[expandedDay] : null;

  return (
    <div
      data-testid="guardian-trend-chart"
      className="glass-card rounded-xl p-4 bg-gradient-to-br from-emerald-500/8 to-emerald-400/5 border-emerald-400/15"
    >
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-emerald-500/15 flex items-center justify-center">
            <TrendingUp className="w-3.5 h-3.5 text-emerald-400" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-text-primary">{t('home.guardianTrendTitle')}</h3>
            <p className="text-[10px] text-text-tertiary">{t('home.last7Days')}</p>
          </div>
        </div>
        <div className={`flex items-center gap-1 text-[11px] font-medium ${trendColor}`} data-testid="guardian-trend-direction">
          <TrendIcon className="w-3 h-3" />
          <span>{trendLabel}</span>
        </div>
      </div>

      <div className="flex items-end justify-between gap-1.5 h-24 mb-2">
        {days.map((day, index) => {
          const hasData = day.amount > 0;
          const heightPercent = hasData ? Math.max((day.amount / maxAmount) * 100, 12) : 6;
          const isExpanded = expandedDay === index;
          return (
            <div
              key={`${day.date.toISOString()}-${index}`}
              className="flex-1 flex flex-col items-center gap-1 group cursor-pointer"
              onClick={() => setExpandedDay(isExpanded ? null : index)}
              role="button"
              tabIndex={0}
              aria-label={hasData
                ? t('home.guardianTrendDayLabel', { amount: formatCurrency(day.amount, { decimals: false }), hours: moneyToFreedomLabel(day.amount, locale, DEFAULT_HOURLY_RATE) })
                : t('home.guardianTrendEmpty')}
              onKeyDown={event => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault();
                  setExpandedDay(isExpanded ? null : index);
                }
              }}
            >
              <div className="relative w-full flex flex-col justify-end" style={{ height: '80px' }}>
                {hasData && (
                  <div className={`absolute -top-8 left-1/2 -translate-x-1/2 transition-opacity pointer-events-none z-10 ${isExpanded ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}>
                    <div className="px-1.5 py-0.5 rounded-md bg-emerald-950 text-emerald-50 text-[9px] whitespace-nowrap" data-testid="guardian-bar-tooltip">
                      {t('home.guardianTrendTooltip', { amount: formatCurrency(day.amount), hours: moneyToFreedomLabel(day.amount, locale, DEFAULT_HOURLY_RATE) })}
                    </div>
                  </div>
                )}
                <div
                  data-testid={hasData ? 'guardian-bar' : 'guardian-empty-bar'}
                  className={`w-full rounded-t-md transition-all duration-300 ${
                    hasData
                      ? isExpanded
                        ? 'bg-gradient-to-t from-emerald-500 to-emerald-300'
                        : day.isToday
                          ? 'bg-gradient-to-t from-emerald-500/90 to-emerald-400/80'
                          : 'bg-gradient-to-t from-emerald-500/45 to-emerald-400/65'
                      : 'bg-glass-fill border border-glass-border'
                  }`}
                  style={{ height: `${heightPercent}%`, minHeight: '6px' }}
                >
                  {hasData && (
                    <span className="block text-center text-[9px] font-bold text-white pt-0.5">
                      {formatCurrency(day.amount, { decimals: false })}
                    </span>
                  )}
                </div>
              </div>
              <span className={`text-[9px] ${isExpanded ? 'text-emerald-400 font-bold' : day.isToday ? 'text-emerald-400 font-bold' : 'text-text-tertiary'} group-hover:text-emerald-400 transition-colors`}>
                {day.label}
              </span>
              <span className="text-[8px] text-text-tertiary">
                {hasData ? t('home.guardianTrendGuardDay') : t('home.guardianTrendEmpty')}
              </span>
            </div>
          );
        })}
      </div>

      {expandedDayData && (
        <div className="mt-2 mb-2 p-2 rounded-lg bg-glass-fill border border-emerald-500/20">
          <div className="flex items-center justify-between mb-1.5">
            <p className="text-[11px] font-medium text-text-primary">
              {expandedDayData.label}, {expandedDayData.date.toLocaleDateString(locale === 'zh' ? 'zh-CN' : 'en-US', { month: 'short', day: 'numeric' })}
            </p>
            <button
              onClick={() => setExpandedDay(null)}
              className="text-[10px] text-text-tertiary hover:text-text-primary transition-colors"
              aria-label="Close"
            >
              ✕
            </button>
          </div>
          {expandedDayData.events.length === 0 ? (
            <p className="text-[10px] text-text-tertiary italic">{t('home.guardianTrendEmpty')}</p>
          ) : (
            <div className="space-y-1 max-h-32 overflow-y-auto custom-scrollbar">
              {expandedDayData.events.map((event, index) => (
                <div key={`${event.id}-${index}`} className="flex items-center gap-2 text-[10px]">
                  <span>{event.subType === 'refund_processed' ? '↩️' : '🛡️'}</span>
                  <span className="text-text-secondary truncate flex-1">{event.item || t('home.guardianTrendGuardDay')}</span>
                  <span className="font-mono text-emerald-400">
                    +{formatCurrency(event.amount || 0)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="flex items-center justify-between gap-2 pt-2 border-t border-emerald-400/10" data-testid="guardian-week-total">
        <div>
          <p className="text-[10px] text-text-tertiary">{t('home.thisWeek')}</p>
          <p className="text-sm font-bold text-emerald-400">
            {weekAmount > 0
              ? t('home.guardianTrendTotal', { amount: formatCurrency(weekAmount, { decimals: false }) })
              : t('home.guardianTrendEmpty')}
          </p>
        </div>
        <div className="text-right">
          <p className="text-[9px] text-text-tertiary/80">
            {weekAmount > 0 ? moneyToFreedomLabel(weekAmount, locale, DEFAULT_HOURLY_RATE) : t('home.guardianTrendStartHint')}
          </p>
          {moneySaved > 0 && (
            <p className="text-[9px] text-text-tertiary/60">{moneyToFreedomLabel(moneySaved, locale, DEFAULT_HOURLY_RATE)}</p>
          )}
        </div>
      </div>
    </div>
  );
});
