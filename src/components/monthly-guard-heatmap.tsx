'use client';

import { useMemo, useState } from 'react';
import { useI18n } from '@/i18n/provider';
import type { ImpulseEvent } from '@/lib/impulse-detector';
import {
  aggregateMonth,
  colorForCount,
  dayKey,
  type AggregatedMonth,
  WEEKDAYS_EN,
  WEEKDAYS_ZH,
} from '@/lib/monthly-guard-heatmap';
import { moneyToFreedomLabel, moneyToHours } from '@/lib/freedom-time';
import { useHourlyRate } from '@/hooks/use-hourly-rate';
import { ChevronLeft, ChevronRight, Sprout } from 'lucide-react';

export interface MonthlyGuardHeatmapProps {
  events: ImpulseEvent[];
}

export function MonthlyGuardHeatmap({ events }: MonthlyGuardHeatmapProps) {
  const { t, locale } = useI18n();
  const { hourlyRate } = useHourlyRate();
  const now = useMemo(() => new Date(), []);
  const [currentMonth, setCurrentMonth] = useState<Date>(() => new Date(now.getFullYear(), now.getMonth(), 1));

  const year = currentMonth.getFullYear();
  const month = currentMonth.getMonth();

  const { cells, guardDays, intercepts, refunds, moneyLeft } = useMemo(
    () => aggregateMonth(events, year, month, now),
    [events, year, month, now]
  ) as AggregatedMonth;

  const monthLabel = new Intl.DateTimeFormat(locale === 'zh' ? 'zh-CN' : 'en-US', {
    month: 'long',
    year: 'numeric',
  }).format(currentMonth);

  const weekdays = locale === 'zh' ? WEEKDAYS_ZH : WEEKDAYS_EN;
  const moneyLineVisible = moneyLeft > 0;
  const empty = guardDays === 0;

  const prevMonth = () => {
    setCurrentMonth((m) => new Date(m.getFullYear(), m.getMonth() - 1, 1));
  };
  const nextMonth = () => {
    setCurrentMonth((m) => new Date(m.getFullYear(), m.getMonth() + 1, 1));
  };

  return (
    <section
      data-testid="monthly-guard-heatmap"
      className="relative overflow-hidden rounded-2xl p-5"
      style={{ background: 'linear-gradient(165deg, #1c4130 0%, #143527 52%, #0c2017 100%)' }}
    >
      <div
        className="absolute -top-16 left-1/2 h-40 w-72 -translate-x-1/2 rounded-full blur-[70px]"
        style={{ background: 'rgba(74, 222, 128, 0.14)' }}
        aria-hidden="true"
      />

      {/* 标题 + 月份切换 */}
      <div className="relative z-10 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="inline-flex h-7 w-7 items-center justify-center rounded-lg border border-emerald-300/25 bg-white/5">
            <Sprout className="h-3.5 w-3.5 text-emerald-300" aria-hidden="true" />
          </div>
              <h3 className="text-sm font-semibold text-[#f0faf2]">{t('buddy.dailyTask.monthlyGuard.title')}</h3>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={prevMonth}
            data-testid="monthly-prev"
            className="inline-flex h-7 w-7 items-center justify-center rounded-lg border border-emerald-300/25 bg-white/5 text-emerald-200 transition-colors hover:border-emerald-300/45"
            aria-label={t('buddy.dailyTask.monthlyGuard.nextMonth')}
          >
            <ChevronLeft className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
          <span className="min-w-[120px] text-center text-xs text-[#f0faf2]">{monthLabel}</span>
          <button
            type="button"
            onClick={nextMonth}
            data-testid="monthly-next"
            className="inline-flex h-7 w-7 items-center justify-center rounded-lg border border-emerald-300/25 bg-white/5 text-emerald-200 transition-colors hover:border-emerald-300/45"
            aria-label={t('buddy.dailyTask.monthlyGuard.prevMonth')}
          >
            <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        </div>
      </div>

      {empty ? (
        <div className="relative z-10 mt-6 flex flex-col items-center gap-2 text-center">
          <p className="text-[13px] font-semibold text-[#a7f3d0]">{t('buddy.dailyTask.monthlyGuard.restart')}</p>
          <p className="text-[10px] text-[#88a292]">
            {locale === 'zh' ? '近 30 天内还没有守护记录，先迈出第一步吧。' : 'No guards in the last 30 days. Start fresh — one choice at a time.'}
          </p>
        </div>
      ) : (
        <div className="relative z-10 mt-4 grid grid-cols-7 gap-1 transition-all duration-200">
          {/* Weekday headers */}
          {weekdays.map((w) => (
            <div key={w} className="pb-1 text-center text-[10px] text-[#88a292]">
              {w}
            </div>
          ))}

          {cells.map((cell, idx) => {
            if (!cell.isCurrentMonth) {
              return (
                <div
                  key={`out-${idx}`}
                  className="aspect-square rounded-sm bg-transparent"
                />
              );
            }

            const dateLabel = new Intl.DateTimeFormat(locale === 'zh' ? 'zh-CN' : 'en-US', {
              month: 'short',
              day: 'numeric',
            }).format(cell.date);
            const tooltipLabel = `${dateLabel} · ${cell.count} ${t('buddy.dailyTask.monthlyGuard.guardDays').toLowerCase()}`;

            return (
              <div
                key={dayKey(cell.date)}
                className="group relative aspect-square"
              >
                <div
                  className={`flex h-full w-full items-center justify-center rounded-sm text-[10px] font-medium transition-all duration-200 ${
                    cell.isToday ? 'border border-emerald-300/50' : ''
                  } ${colorForCount(cell.count)} ${
                    cell.count > 0 ? 'text-[#f0faf2]' : 'text-[#88a292]'
                  }`}
                  data-testid={`monthly-cell-${dayKey(cell.date)}`}
                >
                  {cell.date.getDate()}
                </div>

                {/* CSS-only tooltip */}
                <div
                  className="pointer-events-none absolute -top-8 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-md bg-black/80 px-2 py-1 text-[10px] text-[#f0faf2] opacity-0 transition-opacity duration-150 group-hover:opacity-100"
                  role="tooltip"
                >
                  {tooltipLabel}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* 面子区：当月累计统计 */}
      {!empty && (
        <div className="relative z-10 mt-4 grid grid-cols-4 gap-2">
          <div className="flex flex-col items-center rounded-xl border border-emerald-300/15 bg-white/5 p-2">
            <span className="text-lg font-black leading-none text-[#f0faf2]">{guardDays}</span>
            <span className="mt-1 text-[10px] text-[#88a292]">{t('buddy.dailyTask.monthlyGuard.guardDays')}</span>
          </div>
          <div className="flex flex-col items-center rounded-xl border border-emerald-300/15 bg-white/5 p-2">
            <span className="text-lg font-black leading-none text-[#f0faf2]">{intercepts}</span>
            <span className="mt-1 text-[10px] text-[#88a292]">{t('buddy.dailyTask.monthlyGuard.intercepts')}</span>
          </div>
          <div className="flex flex-col items-center rounded-xl border border-emerald-300/15 bg-white/5 p-2">
            <span className="text-lg font-black leading-none text-[#f0faf2]">{refunds}</span>
            <span className="mt-1 text-[10px] text-[#88a292]">{t('buddy.dailyTask.monthlyGuard.refunds')}</span>
          </div>
          <div className="flex flex-col items-center rounded-xl border border-emerald-300/15 bg-white/5 p-2">
            <span className="text-lg font-black leading-none text-[#f0faf2]">{moneyToHours(moneyLeft, hourlyRate || 0).toFixed(1)}</span>
            <span className="mt-1 text-[10px] text-[#88a292]">{t('buddy.dailyTask.monthlyGuard.savedHours')}</span>
          </div>
        </div>
      )}

      {/* 里子区：金额换算为自由小时 */}
      {!empty && (
        <div className="relative z-10 mt-4 border-t border-white/10 pt-3">
          {moneyLineVisible ? (
            <>
              <p className="text-xs text-[#b6cbbe]" data-testid="monthly-money-line">
                {t('buddy.dailyTask.monthlyGuard.moneyLeft', { amount: moneyToFreedomLabel(moneyLeft, locale, hourlyRate) })}
              </p>
              <p className="mt-1 flex items-center gap-1 text-[10px] text-[#88a292]">
                <Sprout className="h-3 w-3" aria-hidden="true" />
                {t('buddy.dailyTask.monthlyGuard.moneyDestination')}
              </p>
            </>
          ) : (
            <p className="flex items-center gap-1 text-[10px] text-[#88a292]" data-testid="monthly-money-hint">
              <Sprout className="h-3 w-3" aria-hidden="true" />
              {t('buddy.dailyTask.monthlyGuard.moneyHint')}
            </p>
          )}
        </div>
      )}
    </section>
  );
}
