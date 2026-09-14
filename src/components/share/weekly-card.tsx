'use client';

import type { Ref } from 'react';
import { CalendarDays, Flame, ShieldCheck, Sprout } from 'lucide-react';
import { useI18n } from '@/i18n/provider';
import { formatShareHoursLabel } from './card-templates';

export interface WeeklyCardData {
  guardDays: number;
  intercepts: number;
  streakDays: number;
  savedHours: number;
  date?: string;
  cardRef?: Ref<HTMLDivElement>;
}

function safeCount(value: number): number {
  return Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;
}

export function WeeklyCard({ guardDays, intercepts, streakDays, savedHours, date, cardRef }: WeeklyCardData) {
  const { t, locale } = useI18n();
  const parsedDate = date ? new Date(date) : new Date();
  const safeDate = isNaN(parsedDate.getTime()) ? new Date() : parsedDate;
  const dateLabel = new Intl.DateTimeFormat(locale === 'zh' ? 'zh-CN' : 'en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  }).format(safeDate);
  const hoursLabel = formatShareHoursLabel(savedHours, locale);

  const metrics = [
    { Icon: CalendarDays, value: safeCount(guardDays), key: 'guardDays' },
    { Icon: ShieldCheck, value: safeCount(intercepts), key: 'intercepts' },
    { Icon: Flame, value: safeCount(streakDays), key: 'streak' },
  ] as const;

  return (
    <div
      ref={cardRef}
      data-testid="weekly-card"
      className="relative w-[375px] select-none overflow-hidden rounded-[28px]"
      style={{ height: 600, background: 'linear-gradient(165deg, #1c4130 0%, #143527 52%, #0c2017 100%)' }}
    >
      <div className="absolute -top-20 left-1/2 h-[280px] w-[420px] -translate-x-1/2 rounded-full blur-[90px] bg-emerald-400/15" />
      <div className="relative z-10 flex h-full flex-col p-7">
        <div className="flex items-center gap-1.5 rounded-full border border-emerald-300/25 bg-white/5 px-3 py-1 self-start">
          <Sprout className="h-3.5 w-3.5 text-emerald-300" aria-hidden="true" />
          <span className="text-[11px] font-semibold tracking-wide text-emerald-200">
            {t('share.weeklyCard.pill', { defaultValue: 'Weekly Green Report' })}
          </span>
        </div>
        <span className="self-end text-[11px] text-[#88a292]">{dateLabel}</span>

        <div className="flex flex-1 flex-col items-center justify-center text-center">
          <div className="relative flex h-[150px] w-[150px] items-center justify-center">
            <div className="absolute inset-0 rounded-full border border-emerald-300/25 bg-white/5" />
            <div className="absolute inset-4 rounded-full border border-emerald-300/12" />
            <Sprout className="h-[62px] w-[62px] text-emerald-300" aria-hidden="true" />
          </div>
          <p className="mt-5 text-[24px] font-black leading-tight text-[#f0faf2]">
            {t('share.weeklyCard.title', { defaultValue: 'Seven days, quietly held' })}
          </p>
          <p className="mt-2 max-w-[280px] text-[13px] leading-relaxed text-[#88a292]">
            {t('share.weeklyCard.warm', {
              defaultValue: 'This week kept showing up for you. Symy is proud to stand beside you.',
            })}
          </p>
          <p className="mt-5 text-[34px] font-black leading-none text-[#f0faf2]">
            {hoursLabel
              ? t('share.weeklyCard.hoursWonBack', { hours: hoursLabel, defaultValue: `${hoursLabel} won back` })
              : t('share.dailyReport.aGreenChoice', { defaultValue: 'a green choice' })}
          </p>
        </div>

        <div className="grid grid-cols-3 gap-2 border-t border-white/10 pt-4">
          {metrics.map((metric) => (
            <div key={metric.key} className="flex flex-col items-center gap-1.5">
              <metric.Icon className="h-4 w-4" aria-hidden="true" />
              <span className="text-[18px] font-black leading-none text-[#f0faf2]">{metric.value}</span>
              <span className="text-[10px] text-[#88a292]">
                {t(`share.weeklyCard.${metric.key}`, { defaultValue: metric.key })}
              </span>
            </div>
          ))}
        </div>
        <p className="mt-4 text-center text-[10px] text-[#88a292]">
          {t('share.interceptMedal.brandTagline', { defaultValue: 'Become a guardian with me' })}
        </p>
      </div>
    </div>
  );
}
