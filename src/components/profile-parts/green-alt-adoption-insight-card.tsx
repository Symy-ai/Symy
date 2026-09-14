'use client';

import { BarChart3 } from 'lucide-react';
import { useI18n } from '@/i18n/provider';
import { useGreenAltAdoptionInsight } from '@/hooks/use-green-alt-adoption-insight';

export function GreenAltAdoptionInsightCard() {
  const { t } = useI18n();
  const { insight, isLoading } = useGreenAltAdoptionInsight();

  if (isLoading) {
    return <div className="mt-2.5 h-20 animate-pulse rounded-xl border border-glass-border bg-glass-fill" data-testid="green-alt-insight-card-skeleton" />;
  }

  const shell = 'mt-2.5 p-3 rounded-xl border border-glass-border bg-glass-fill';
  if (insight.status !== 'ok') {
    return (
      <div className={shell} data-testid="green-alt-insight-card-empty">
        <p className="text-sm font-medium text-text-primary">{t('profile.greenAltInsight.title')}</p>
        <p className="mt-1 text-xs text-text-tertiary">{t('profile.greenAltInsight.empty')}</p>
      </div>
    );
  }

  const topCategory = insight.topAdoptionCategories[0]?.category;
  const topReason = insight.topRejectionReasons[0]?.reason;

  return (
    <div className={shell} data-testid="green-alt-insight-card">
      <div className="flex items-start gap-3">
        <div className="flex size-9 flex-shrink-0 items-center justify-center rounded-lg bg-glass-fill text-icon-muted">
          <BarChart3 className="size-4" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-text-primary">{t('profile.greenAltInsight.title')}</p>
          <p className="text-xs text-text-tertiary">{t('profile.greenAltInsight.desc')}</p>
          <p className="mt-2 text-xs text-text-secondary" data-testid="green-alt-insight-headline">
            {t('profile.greenAltInsight.headline', { percent: insight.adoptionRate, count: insight.totalSuggestions, days: insight.activeDays })}
          </p>
          <div className="mt-2 grid gap-1.5">
            {topCategory && (
              <p className="text-xs text-text-primary" data-testid="green-alt-insight-category">
                {t('profile.greenAltInsight.topCategory', { category: t(`profile.guardMatrix.cat.${topCategory}`), count: insight.topAdoptionCategories[0].count })}
              </p>
            )}
            {topReason && (
              <p className="text-xs text-text-primary" data-testid="green-alt-insight-reason">
                {t('profile.greenAltInsight.topReason', { reason: t(`chat.greenAlt.feedbackReason.${topReason}`), count: insight.topRejectionReasons[0].count })}
              </p>
            )}
            <p className="text-xs text-text-primary" data-testid="green-alt-insight-non-repurchase">
              {t('profile.greenAltInsight.nonRepurchase', { count: insight.nonRepurchasesWithin7Days, observed: insight.observedAdoptions })}
            </p>
          </div>
          <div className="mt-2 grid gap-1">
            {topCategory && <p className="rounded-lg bg-emerald-950/40 px-2.5 py-1.5 text-[11px] text-emerald-50/90" data-testid="green-alt-insight-keep">{t('profile.greenAltInsight.keepAdvice')}</p>}
            {topReason && <p className="rounded-lg bg-slate-900/40 px-2.5 py-1.5 text-[11px] text-slate-100/90" data-testid="green-alt-insight-less">{t('profile.greenAltInsight.lessAdvice')}</p>}
          </div>
        </div>
      </div>
    </div>
  );
}
