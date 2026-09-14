'use client';

/**
 * GuardYearReviewShareFace — 年度守护画像分享面 (batch66-a)
 *
 * 只接收次数、天数与月份，结构上拿不到金额、重复购买计数或碳数值。
 */

import { CalendarRange } from 'lucide-react';
import { useI18n } from '@/i18n/provider';
import type { GuardYearReviewShare } from '@/lib/guard-year-review';

export interface GuardYearReviewShareFaceProps {
  data: GuardYearReviewShare;
}

export function GuardYearReviewShareFace({ data }: GuardYearReviewShareFaceProps) {
  const { t, locale } = useI18n();
  const monthLabel = data.steadiestMonth === null ? null : new Intl.DateTimeFormat(
    locale === 'zh' ? 'zh-CN' : 'en-US',
    { month: 'long' },
  ).format(new Date(data.year, data.steadiestMonth, 1));

  return (
    <div
      data-testid="guard-year-review-share-face"
      className="relative w-[375px] select-none overflow-hidden rounded-[28px]"
      style={{ height: 600, background: 'linear-gradient(165deg, #1c4130 0%, #143527 52%, #0c2017 100%)' }}
    >
      <div
        className="absolute -top-24 left-1/2 h-[300px] w-[420px] -translate-x-1/2 rounded-full blur-[90px]"
        style={{ background: 'rgba(74, 222, 128, 0.16)' }}
        aria-hidden="true"
      />
      <div className="relative z-10 flex h-full flex-col p-7">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5 rounded-full border border-emerald-300/25 bg-white/5 px-3 py-1">
            <CalendarRange className="h-3.5 w-3.5 text-emerald-300" aria-hidden="true" />
            <span className="text-[11px] font-semibold tracking-wide text-emerald-200">
              {t('profile.guardYearReview.share.pill')}
            </span>
          </div>
          <span className="text-[11px] tracking-wide text-[#88a292]">{data.year}</span>
        </div>

        <div className="flex flex-1 flex-col justify-center">
          <p className="text-[12px] tracking-wide text-[#88a292]">
            {t('profile.guardYearReview.share.identity')}
          </p>
          <p className="mt-2 text-[30px] font-black leading-tight text-[#f0faf2]" data-testid="guard-year-review-share-headline">
            {t('profile.guardYearReview.share.headline', { count: data.intercepts })}
          </p>
          {monthLabel && (
            <p className="mt-2 text-[12px] text-[#b6cbbe]" data-testid="guard-year-review-share-month">
              {t('profile.guardYearReview.share.month', { month: monthLabel })}
            </p>
          )}

          <div className="mt-6 grid grid-cols-3 gap-2" data-testid="guard-year-review-share-stats">
            {[
              { value: data.commitments, key: 'commitments' as const },
              { value: data.adoptions, key: 'adoptions' as const },
              { value: data.longestStreakDays, key: 'streak' as const },
            ].map((item) => (
              <div key={item.key} className="rounded-2xl border border-white/10 bg-white/5 p-3 text-center">
                <div className="text-[24px] font-black leading-none text-[#f0faf2]">{item.value}</div>
                <div className="mt-1 text-[10px] leading-4 text-[#88a292]">
                  {t(`profile.guardYearReview.share.${item.key}`)}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="flex items-center justify-between border-t border-white/10 pt-4">
          <span className="text-sm font-bold tracking-wide text-white">Symy</span>
          <span className="text-[11px] text-[#b6cbbe]">{t('share.interceptMedal.brandTagline')}</span>
        </div>
      </div>
    </div>
  );
}
