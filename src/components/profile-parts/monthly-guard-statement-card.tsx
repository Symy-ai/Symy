'use client';

/**
 * MonthlyGuardStatementCard — 月度守护账单卡 (batch54-b)
 *
 * 个人页统计区 (周对比卡之下): 本月拦截局数 + pass/abandon 结构 +
 * 守护自由小时 + 品类 top3 + 最长连胜 + 绿色替代采纳 + 上月对比行。
 * 金额行 (本月守护金额) 标注"仅自己可见", 仅 app 内展示, 永不进
 * 分享/荣誉面 (红线, 对齐 win-rate 卡措辞先例)。空月显示引导文案。
 * 品类 top3 复用 guardCategoryName 既有词表, 不新造一套。
 */

import { useState } from 'react';
import { CalendarCheck, Share2, TrendingDown, TrendingUp, Minus } from 'lucide-react';
import { useI18n } from '@/i18n/provider';
import { useMonthlyGuardStatement } from '@/hooks/use-monthly-guard-statement';
import { formatCurrencyShort } from '@/lib/format';
import type { TrendDirection } from '@/lib/weekly-guard-compare';
import { MonthlyGuardStatementShareFace } from '@/components/profile-parts/monthly-guard-statement-share';

const TREND_ICON: Record<TrendDirection, React.ReactNode> = {
  up: <TrendingUp className="h-3 w-3 text-emerald-300" aria-hidden="true" />,
  flat: <Minus className="h-3 w-3 text-text-tertiary" aria-hidden="true" />,
  down: <TrendingDown className="h-3 w-3 text-amber-200/85" aria-hidden="true" />,
};

export function MonthlyGuardStatementCard() {
  const { t } = useI18n();
  const { statement, isLoading } = useMonthlyGuardStatement();
  const [shareOpen, setShareOpen] = useState(false);

  if (isLoading) {
    return (
      <div
        className="mt-2.5 flex items-start gap-3 p-3 rounded-xl border border-glass-border bg-glass-fill animate-pulse"
        data-testid="monthly-statement-card-skeleton"
      >
        <div className="flex-shrink-0 w-9 h-9 rounded-lg bg-white/10" />
        <div className="flex-1">
          <div className="h-4 w-32 rounded bg-white/10 mb-2" />
          <div className="h-3 w-full rounded bg-white/10" />
        </div>
      </div>
    );
  }

  // 拉取失败 (null) 或空月 → 引导态 (鼓励向, 不暗示做得差)
  if (!statement || statement.status !== 'ok') {
    return (
      <div
        className="mt-2.5 flex items-start gap-3 p-3 rounded-xl border border-glass-border bg-glass-fill"
        data-testid="monthly-statement-card-empty"
      >
        <div className="flex-shrink-0 w-9 h-9 rounded-lg bg-glass-fill flex items-center justify-center text-icon-muted">
          <CalendarCheck className="w-4 h-4" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-text-primary">
            {t('profile.monthlyStatement.title')}
          </p>
          <p className="mt-1 text-xs text-text-tertiary">
            {t('profile.monthlyStatement.empty')}
          </p>
        </div>
      </div>
    );
  }

  const pub = statement.public;
  const [year, monthNum] = pub.monthKey.split('-').map(Number);
  const monthLabel = t('profile.monthlyStatement.monthLabel', { year, month: monthNum });
  const compareToneKey = pub.compare.status === 'ok'
    ? `profile.monthlyStatement.compareTip.${pub.compare.intercepts}`
    : null;

  return (
    <div
      className="mt-2.5 p-3 rounded-xl border border-glass-border bg-glass-fill"
      data-testid="monthly-statement-card"
    >
      <div className="flex items-start gap-3">
        <div className="flex-shrink-0 w-9 h-9 rounded-lg bg-glass-fill flex items-center justify-center text-icon-muted">
          <CalendarCheck className="w-4 h-4" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm font-medium text-text-primary">
              {t('profile.monthlyStatement.title')}
            </p>
            <p className="text-[11px] text-text-tertiary">{monthLabel}</p>
          </div>
          <p className="mt-0.5 text-xs text-text-tertiary mb-2">
            {t('profile.monthlyStatement.desc')}
          </p>

          {/* 结算单主行: 拦截局数 + pass/abandon 结构 (win-rate 同口径, 纯计数) */}
          <p className="text-xs text-text-secondary" data-testid="monthly-statement-card-headline">
            {t('profile.monthlyStatement.headline', {
              count: pub.intercepts,
              passed: pub.passed,
              abandoned: pub.abandoned,
            })}
          </p>
          {/* 守护自由小时 — 小时数可晒, 金额不可 (金额只在下方私享行) */}
          <p className="mt-1 text-xs text-text-secondary" data-testid="monthly-statement-card-hours">
            {t('profile.monthlyStatement.hoursLine', { hours: pub.hoursLabel })}
          </p>

          {/* 品类 top3 — 复用 guardCategoryName 既有 chip 词汇 */}
          {pub.topCategories.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5" data-testid="monthly-statement-card-categories">
              {pub.topCategories.map((row) => (
                <span
                  key={row.category}
                  className="rounded-full border border-glass-border bg-glass-fill px-2 py-0.5 text-[11px] text-text-secondary"
                >
                  {t(`profile.guardCategoryName.${row.category}`)} ×{row.count}
                </span>
              ))}
            </div>
          )}

          {/* 最长连胜 + 绿色替代采纳 — 纯计数亮点行 */}
          <p className="mt-2 text-[11px] text-text-tertiary" data-testid="monthly-statement-card-streak">
            {t('profile.monthlyStatement.streakLine', { days: pub.longestStreakDays })}
            {pub.greenAltAdoptions > 0 && (
              <>
                {' · '}
                {t('profile.monthlyStatement.adoptionLine', { count: pub.greenAltAdoptions })}
              </>
            )}
          </p>

          {/* 上月对比行 — 涨跌三档, decline 温暖不羞辱 */}
          {compareToneKey && (
            <p className="mt-1 flex items-center gap-1 text-[11px] text-text-tertiary" data-testid="monthly-statement-card-compare">
              {TREND_ICON[pub.compare.intercepts]}
              {t('profile.monthlyStatement.compareLine', { count: pub.compare.prevIntercepts })}
            </p>
          )}
          {compareToneKey && (
            <p className="mt-1 text-[11px] text-text-tertiary" data-testid="monthly-statement-card-compare-tip">
              {t(compareToneKey)}
            </p>
          )}

          {/* 本月守护金额 — 仅 app 内展示, 标注"仅自己可见", 不进分享面 (红线) */}
          <p className="mt-1 text-[11px] text-text-tertiary" data-testid="monthly-statement-card-amount">
            {t('profile.monthlyStatement.amountLine', { amount: formatCurrencyShort(statement.private.guardedAmount) })}
          </p>
        </div>
      </div>

      <div className="mt-2 flex justify-end">
        <button
          type="button"
          onClick={() => setShareOpen(true)}
          className="flex items-center gap-1 rounded-full border border-emerald-300/25 bg-emerald-950/40 px-2.5 py-1 text-[11px] text-emerald-50/90 transition-colors hover:bg-emerald-900/50"
          data-testid="monthly-statement-share-btn"
        >
          <Share2 className="h-3 w-3" aria-hidden="true" />
          {t('profile.monthlyStatement.shareBtn')}
        </button>
      </div>

      {/* 分享弹层 — 面子字段 only (shareData 类型上无金额) */}
      {shareOpen && (
        <div
          className="fixed inset-0 z-[320] flex items-center justify-center bg-black/60 p-4"
          role="dialog"
          aria-modal="true"
          onClick={() => setShareOpen(false)}
          data-testid="monthly-statement-share-modal"
        >
          <div className="max-h-full overflow-auto" onClick={(e) => e.stopPropagation()}>
            <MonthlyGuardStatementShareFace
              data={{
                monthLabel,
                interceptCount: pub.intercepts,
                hoursLabel: pub.hoursLabel,
                longestStreakDays: pub.longestStreakDays,
                tone: pub.tone,
              }}
            />
            <div className="mt-3 flex items-center justify-center gap-3">
              <button
                onClick={() => setShareOpen(false)}
                className="rounded-lg border border-glass-border px-4 py-1.5 text-[12px] text-text-secondary"
              >
                {t('profile.monthlyStatement.shareClose')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
