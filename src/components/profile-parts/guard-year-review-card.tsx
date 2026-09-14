'use client';

/**
 * GuardYearReviewCard — 年度守护画像卡 (batch66-a)
 *
 * 深读层：12 个月趋势、场景稳定度、替代采纳结构、连续天数与对比。
 * 私有详情只展示小时/次数；分享面结构上无金额与碳数值。
 */

import { useState } from 'react';
import { CalendarRange, EyeOff, Share2 } from 'lucide-react';
import { useI18n } from '@/i18n/provider';
import { useHourlyRate } from '@/hooks/use-hourly-rate';
import { useGuardYearReview } from '@/hooks/use-guard-year-review';
import { formatFreedomTime } from '@/lib/freedom-time';
import { REUSE_CATEGORIES } from '@/lib/reuse-categories';
import {
  buildGuardYearReviewShare,
  type GuardYearSceneRow,
} from '@/lib/guard-year-review';
import { GuardYearReviewShareFace } from '@/components/profile-parts/guard-year-review-share';

function useCategoryLabel(): (row: GuardYearSceneRow) => string {
  const { t, locale } = useI18n();
  return (row) => {
    if (row.categorySource === 'reuse') {
      const category = REUSE_CATEGORIES.find((item) => item.id === row.category);
      if (category) return category.label[locale === 'zh' ? 'zh' : 'en'];
    }
    return t(`profile.guardMatrix.cat.${row.category}`);
  };
}

function TrendWord({ value }: { value: 'up' | 'flat' | 'down' }) {
  const { t } = useI18n();
  return <span data-testid={`guard-year-review-trend-${value}`}>{t(`profile.guardYearReview.trend.${value}`)}</span>;
}

export function GuardYearReviewCard() {
  const { t, locale } = useI18n();
  const { hourlyRate } = useHourlyRate();
  const { review, isLoading } = useGuardYearReview({ hourlyRate, locale });
  const [shareOpen, setShareOpen] = useState(false);
  const categoryLabel = useCategoryLabel();

  if (isLoading) {
    return (
      <div
        className="mt-2.5 h-24 animate-pulse rounded-xl border border-glass-border bg-glass-fill"
        data-testid="guard-year-review-card-skeleton"
      />
    );
  }

  const shell = 'mt-2.5 p-3 rounded-xl border border-glass-border bg-glass-fill';
  if (review.status !== 'ok') {
    return (
      <div className={shell} data-testid="guard-year-review-card-insufficient">
        <div className="flex items-start gap-3">
          <div className="flex size-9 flex-shrink-0 items-center justify-center rounded-lg bg-glass-fill text-icon-muted">
            <CalendarRange className="size-4" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-text-primary">{t('profile.guardYearReview.title')}</p>
            <p className="mt-1 text-xs text-text-tertiary">{t('profile.guardYearReview.insufficient')}</p>
            {review.last30Days.actions > 0 && (
              <p className="mt-1 text-xs text-text-secondary" data-testid="guard-year-review-last-30">
                {t('profile.guardYearReview.last30Line', {
                  count: review.last30Days.actions,
                  days: review.last30Days.activeDays,
                })}
              </p>
            )}
            <p className="mt-1 text-[11px] text-text-tertiary">{t('profile.guardYearReview.nextYear')}</p>
          </div>
        </div>
      </div>
    );
  }

  const steadiestMonthLabel = review.steadiestMonth === null ? null : new Intl.DateTimeFormat(
    locale === 'zh' ? 'zh-CN' : 'en-US',
    { month: 'long' },
  ).format(new Date(review.year, review.steadiestMonth, 1));
  const maxMonthActions = Math.max(...review.months.map((month) => month.intercepts + month.commitments + month.adoptions), 1);
  const topAdoptionCategories = review.alternativeAdoptionCategories.slice(0, 3);
  const share = buildGuardYearReviewShare(review);

  return (
    <div className={shell} data-testid="guard-year-review-card">
      <div className="flex items-start gap-3">
        <div className="flex size-9 flex-shrink-0 items-center justify-center rounded-lg bg-glass-fill text-icon-muted">
          <CalendarRange className="size-4" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm font-medium text-text-primary">{t('profile.guardYearReview.title')}</p>
            <span className="text-[11px] text-text-tertiary">{review.year}</span>
          </div>
          <p className="text-xs text-text-tertiary">{t('profile.guardYearReview.desc')}</p>
          <p className="mt-2 text-xs font-bold text-text-primary" data-testid="guard-year-review-headline">
            {t('profile.guardYearReview.headline', {
              count: review.totals.intercepts + review.totals.commitments + review.totals.adoptions,
              month: steadiestMonthLabel ?? '',
            })}
          </p>

          <div className="mt-3" data-testid="guard-year-review-months">
            <div className="flex h-20 items-end gap-1">
              {review.months.map((month) => {
                const actions = month.intercepts + month.commitments + month.adoptions;
                return (
                  <div key={month.month} className="flex min-w-0 flex-1 flex-col items-center gap-1">
                    <div
                      className="w-full rounded-t bg-emerald-500/70"
                      style={{ height: `${Math.max(2, Math.round((actions / maxMonthActions) * 64))}px` }}
                      data-testid={`guard-year-review-month-${month.month + 1}`}
                      title={t('profile.guardYearReview.monthAria', {
                        month: month.month + 1,
                        intercepts: month.intercepts,
                        commitments: month.commitments,
                        adoptions: month.adoptions,
                      })}
                    />
                    <span className="text-[9px] text-text-tertiary">{month.month + 1}</span>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="mt-3 grid gap-2 sm:grid-cols-2" data-testid="guard-year-review-scenes">
            <div>
              <p className="text-[11px] font-bold text-text-secondary">{t('profile.guardYearReview.steadyScenes')}</p>
              <ul className="mt-1 space-y-1">
                {review.steadiestScenes.map((row) => (
                  <li key={`${row.categorySource}:${row.category}`} className="text-[11px] text-text-secondary">
                    {categoryLabel(row)} · {t('profile.guardYearReview.sceneCount', { count: row.actions, days: row.activeDays })}
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <p className="text-[11px] font-bold text-text-secondary">{t('profile.guardYearReview.needsCareScenes')}</p>
              <ul className="mt-1 space-y-1">
                {review.needsCareScenes.map((row) => (
                  <li key={`care:${row.categorySource}:${row.category}`} className="text-[11px] text-text-secondary">
                    {categoryLabel(row)} · {t('profile.guardYearReview.sceneReleased', { count: row.released })}
                  </li>
                ))}
                {review.needsCareScenes.length === 0 && (
                  <li className="text-[11px] text-text-tertiary">{t('profile.guardYearReview.noNeedsCare')}</li>
                )}
              </ul>
            </div>
          </div>

          {review.needsCareScenes.length > 0 && (
            <p className="mt-2 rounded-lg bg-emerald-950/40 px-2.5 py-1.5 text-[11px] leading-5 text-emerald-50/90" data-testid="guard-year-review-advice">
              🐘 {t('profile.guardYearReview.advice', { category: categoryLabel(review.needsCareScenes[0]) })}
            </p>
          )}

          {topAdoptionCategories.length > 0 && (
            <div className="mt-3" data-testid="guard-year-review-adoptions">
              <p className="text-[11px] font-bold text-text-secondary">{t('profile.guardYearReview.adoptionTitle')}</p>
              <div className="mt-1 flex flex-wrap gap-1.5">
                {topAdoptionCategories.map((row) => (
                  <span key={row.category} className="rounded-full border border-glass-border bg-glass-fill px-2 py-0.5 text-[11px] text-text-secondary">
                    {t(`profile.guardMatrix.cat.${row.category}`)} ×{row.count}
                  </span>
                ))}
              </div>
            </div>
          )}

          <p className="mt-3 text-[11px] text-text-secondary" data-testid="guard-year-review-streak">
            {t('profile.guardYearReview.streakLine', { days: review.longestStreakDays })}
          </p>

          <div className="mt-2 grid gap-1 text-[11px] text-text-tertiary" data-testid="guard-year-review-compare">
            <p>
              {t('profile.guardYearReview.yearCompare')} <TrendWord value={review.yearOverYear.intercepts} />
            </p>
            <p>
              {t('profile.guardYearReview.monthCompare')} <TrendWord value={review.monthOverMonth.intercepts} />
            </p>
          </div>

          <div className="mt-2 rounded-lg bg-white/[0.03] px-2.5 py-2 text-[11px] leading-5 text-text-secondary" data-testid="guard-year-review-private">
            <p className="flex items-center gap-1 text-[10px] text-text-tertiary">
              <EyeOff className="size-3" aria-hidden="true" />
              {t('profile.guardYearReview.privateTitle')}
            </p>
            <p>{t('profile.guardYearReview.privateHours', { hours: formatFreedomTime(review.private.hoursReclaimed, locale === 'zh' ? 'zh' : 'en') })}</p>
            <p data-testid="guard-year-review-private-counts">
              {t('profile.guardYearReview.privateCounts', {
                impulse: review.private.avoidedImpulsePurchases,
                repeat: review.private.avoidedRepeatPurchases,
                hoarding: review.private.avoidedHoarding,
                reuse: review.private.reuseAdoptions,
              })}
            </p>
          </div>
        </div>
      </div>

      <div className="mt-2 flex justify-end">
        <button
          type="button"
          onClick={() => setShareOpen(true)}
          className="flex items-center gap-1 rounded-full border border-emerald-300/25 bg-emerald-950/40 px-2.5 py-1 text-[11px] text-emerald-50/90 transition-colors hover:bg-emerald-900/50"
          data-testid="guard-year-review-share-btn"
        >
          <Share2 className="h-3 w-3" aria-hidden="true" />
          {t('profile.guardYearReview.shareBtn')}
        </button>
      </div>

      {shareOpen && (
        <div
          className="fixed inset-0 z-[320] flex items-center justify-center bg-black/60 p-4"
          role="dialog"
          aria-modal="true"
          onClick={() => setShareOpen(false)}
          data-testid="guard-year-review-share-modal"
        >
          <div className="max-h-full overflow-auto" onClick={(event) => event.stopPropagation()}>
            <GuardYearReviewShareFace data={share} />
            <div className="mt-3 flex items-center justify-center">
              <button
                type="button"
                onClick={() => setShareOpen(false)}
                className="rounded-lg border border-glass-border px-4 py-1.5 text-[12px] text-text-secondary"
              >
                {t('profile.guardYearReview.shareClose')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
