'use client';

/**
 * GuardCategoryCard — 品类透视卡 (batch46-a)
 *
 * 主面: top 3 品类 (图标 + 名称 + 拦截次数) — 只有次数, 零金额。
 * 展开详情: 每品类 hours_reclaimed 与 est_saved (金额只出现在此私有区,
 * 永不进分享/荣誉面)。
 * 少于 2 个品类时显示引导文案 (鼓励向, 不暗示做得差)。
 */

import { useState } from 'react';
import { ChartPie, ChevronDown, Shirt, Smartphone, Shapes, Sofa, Sparkles, UtensilsCrossed } from 'lucide-react';
import { useI18n } from '@/i18n/provider';
import { useGuardCategoryInsight } from '@/hooks/use-guard-category-insight';
import { topGuardCategories, type GuardInsightCategory } from '@/lib/guard-category-insight';
import { formatCurrency } from '@/lib/format';
import { formatFreedomTime } from '@/lib/freedom-time';

const CATEGORY_ICONS: Record<GuardInsightCategory, React.ComponentType<{ className?: string }>> = {
  clothing: Shirt,
  beauty: Sparkles,
  home: Sofa,
  electronics: Smartphone,
  food: UtensilsCrossed,
  other: Shapes,
};

export function GuardCategoryCard() {
  const { t, locale } = useI18n();
  const { insights, isLoading } = useGuardCategoryInsight();
  const [expanded, setExpanded] = useState(false);

  if (isLoading) {
    return (
      <div
        className="mt-2.5 flex items-start gap-3 p-3 rounded-xl border border-glass-border bg-glass-fill animate-pulse"
        data-testid="guard-category-card-skeleton"
      >
        <div className="flex-shrink-0 w-9 h-9 rounded-lg bg-white/10" />
        <div className="flex-1">
          <div className="h-4 w-32 rounded bg-white/10 mb-2" />
          <div className="h-3 w-full rounded bg-white/10" />
        </div>
      </div>
    );
  }

  const top = topGuardCategories(insights);

  if (top.length < 2) {
    return (
      <div
        className="mt-2.5 flex items-start gap-3 p-3 rounded-xl border border-glass-border bg-glass-fill"
        data-testid="guard-category-card-empty"
      >
        <div className="flex-shrink-0 w-9 h-9 rounded-lg bg-glass-fill flex items-center justify-center text-icon-muted">
          <ChartPie className="w-4 h-4" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-text-primary">
            {t('profile.guardCategoryTitle')}
          </p>
          <p className="mt-1 text-xs text-text-tertiary">
            {t('profile.guardCategoryEmpty')}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div
      className="mt-2.5 p-3 rounded-xl border border-glass-border bg-glass-fill"
      data-testid="guard-category-card"
    >
      <div className="flex items-start gap-3">
        <div className="flex-shrink-0 w-9 h-9 rounded-lg bg-glass-fill flex items-center justify-center text-icon-muted">
          <ChartPie className="w-4 h-4" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-text-primary">
            {t('profile.guardCategoryTitle')}
          </p>
          <p className="text-xs text-text-tertiary mb-2">
            {t('profile.guardCategoryDesc')}
          </p>
          <ul className="space-y-1.5" data-testid="guard-category-card-list">
            {top.map((row) => {
              const Icon = CATEGORY_ICONS[row.category];
              return (
                <li key={row.category} className="flex items-center gap-2" data-testid={`guard-category-row-${row.category}`}>
                  <Icon className="w-3.5 h-3.5 text-icon-muted flex-shrink-0" />
                  <span className="text-xs text-text-primary flex-1 truncate">
                    {t(`profile.guardCategoryName.${row.category}`)}
                  </span>
                  <span className="text-xs font-bold text-text-secondary" data-testid={`guard-category-count-${row.category}`}>
                    {t('profile.guardCategoryIntercepts', { count: row.count })}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      </div>

      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="mt-2 flex items-center gap-1 text-[11px] text-text-tertiary hover:text-text-secondary transition-colors"
        aria-expanded={expanded}
        data-testid="guard-category-card-toggle"
      >
        {expanded
          ? t('profile.guardCategoryHideDetail')
          : t('profile.guardCategoryShowDetail')}
        <ChevronDown className={`w-3 h-3 transition-transform ${expanded ? 'rotate-180' : ''}`} />
      </button>

      {expanded && (
        <div className="mt-2 pt-2 border-t border-glass-border" data-testid="guard-category-card-detail">
          {insights.map((row) => (
            <p key={row.category} className="text-[11px] text-text-tertiary leading-relaxed">
              {t(`profile.guardCategoryName.${row.category}`)}
              {' · '}
              {t('profile.guardCategoryHours', {
                hours: formatFreedomTime(row.hoursReclaimed, locale === 'zh' ? 'zh' : 'en'),
              })}
              {' · '}
              {t('profile.guardCategorySaved', {
                amount: formatCurrency(row.estSaved, { decimals: false }),
              })}
            </p>
          ))}
        </div>
      )}
    </div>
  );
}
