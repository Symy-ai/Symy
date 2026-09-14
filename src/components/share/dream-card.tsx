'use client';

import type { Ref } from 'react';
import { Award, CalendarCheck } from 'lucide-react';
import { useI18n } from '@/i18n/provider';
import { formatShareHoursLabel } from './card-templates';

export interface DreamCardProps {
  name: string;
  savedHours: number;
  streakDays?: number;
  date?: string;
  cardRef?: Ref<HTMLDivElement>;
}

export function DreamCard({ name, savedHours, streakDays, date, cardRef }: DreamCardProps) {
  const { t, locale } = useI18n();
  const parsedDate = date ? new Date(date) : new Date();
  const safeDate = Number.isNaN(parsedDate.getTime()) ? new Date() : parsedDate;
  const dateLabel = new Intl.DateTimeFormat(locale === 'zh' ? 'zh-CN' : 'en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  }).format(safeDate);
  const hoursLabel = formatShareHoursLabel(savedHours, locale);

  return (
    <div
      ref={cardRef}
      data-testid="dream-card"
      className="relative w-[375px] select-none overflow-hidden rounded-[28px]"
      style={{ height: 600, background: 'linear-gradient(165deg, #1c4130 0%, #143527 52%, #0c2017 100%)' }}
    >
      <div className="absolute -top-20 left-1/2 h-[280px] w-[420px] -translate-x-1/2 rounded-full bg-emerald-400/15 blur-[90px]" />
      <div className="relative z-10 flex h-full flex-col p-7">
        <div className="flex items-center gap-1.5 self-start rounded-full border border-emerald-300/25 bg-white/5 px-3 py-1">
          <Award className="h-3.5 w-3.5 text-emerald-300" aria-hidden="true" />
          <span className="text-[11px] font-semibold tracking-wide text-emerald-200">
            {t('share.template.dream', { defaultValue: 'Dream Medal' })}
          </span>
        </div>
        <span className="self-end text-[11px] text-[#88a292]">{dateLabel}</span>
        <div className="flex flex-1 flex-col items-center justify-center text-center">
          <div className="relative flex h-[150px] w-[150px] items-center justify-center">
            <div className="absolute inset-0 rounded-full border border-yellow-300/35 bg-white/5" />
            <div className="absolute inset-4 rounded-full border border-yellow-300/15" />
            <span role="img" aria-hidden="true" className="select-none text-[68px] leading-none">🏅</span>
          </div>
          <p className="mt-5 max-w-[290px] text-[24px] font-black leading-tight text-[#f0faf2]" data-testid="dream-card-name">{name}</p>
          <p className="mt-2 max-w-[280px] text-[13px] leading-relaxed text-[#88a292]">
            {t('share.dreamCard.subtitle', { defaultValue: 'We guarded it into being together!' })}
          </p>
          <p className="mt-5 text-[32px] font-black leading-none text-[#f0faf2]" data-testid="dream-card-hours">
            {t('share.dreamCard.hoursLabel', { hours: hoursLabel || '—', defaultValue: '{hours} of freedom won back' })}
          </p>
        </div>
        {streakDays != null && streakDays > 0 && (
          <div className="flex items-center justify-center gap-1.5 border-t border-white/10 pt-4 text-emerald-200" data-testid="dream-card-days">
            <CalendarCheck className="h-3.5 w-3.5" aria-hidden="true" />
            <span className="text-[12px] font-semibold">
              {t('share.dreamCard.guardDaysLabel', { days: streakDays, defaultValue: '{days} days guarded together' })}
            </span>
          </div>
        )}
        <p className="mt-4 text-center text-[10px] text-[#88a292]">
          {t('share.interceptMedal.brandTagline', { defaultValue: 'Buy less. Live more.' })}
        </p>
      </div>
    </div>
  );
}
