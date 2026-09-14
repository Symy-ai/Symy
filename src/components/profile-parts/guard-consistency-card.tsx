'use client';

/**
 * GuardConsistencyCard — 守护行动一致性矩阵卡 (batch63-b)
 *
 * 个人页统计区 (守护胜率卡之下): 域 × 三轨结果矩阵 — 每个生活域的
 * 守护/替代/复用/放行计数 + 稳定度, 最稳域与"还在拉扯、值得陪一下"的域。
 * 金额行 (各域累计估算节省) 仅 app 内展示, 永不进分享面 (红线)。
 * 三态: no-data (无记录) / insufficient (样本不足) / normal (矩阵);
 * 低稳定域措辞是"还在拉扯", 不出现失败/失控类词。
 */

import { useState } from 'react';
import { LayoutGrid, Share2 } from 'lucide-react';
import { useI18n } from '@/i18n/provider';
import { useGuardConsistencyMatrix } from '@/hooks/use-guard-consistency-matrix';
import { buildGuardConsistencyShare } from '@/lib/guard-consistency-matrix';
import { REUSE_CATEGORIES } from '@/lib/reuse-categories';
import { formatCurrencyShort } from '@/lib/format';
import { GuardConsistencyShareFace } from '@/components/profile-parts/guard-consistency-share';

/** 品类显示名双来源: reuse 类目走 REUSE_CATEGORIES 既有 label, 其余走 i18n cat.<id> */
function useCategoryLabel(): (category: string) => string {
  const { t, locale } = useI18n();
  return (category: string) => {
    const reuse = REUSE_CATEGORIES.find((c) => c.id === category);
    if (reuse) return reuse.label[locale === 'zh' ? 'zh' : 'en'];
    return t(`profile.guardMatrix.cat.${category}`);
  };
}

export function GuardConsistencyCard() {
  const { t } = useI18n();
  const categoryLabel = useCategoryLabel();
  const { matrix, isLoading } = useGuardConsistencyMatrix();
  const [shareOpen, setShareOpen] = useState(false);

  if (isLoading) {
    return (
      <div
        className="mt-2.5 flex items-start gap-3 p-3 rounded-xl border border-glass-border bg-glass-fill animate-pulse"
        data-testid="guard-consistency-card-skeleton"
      >
        <div className="flex-shrink-0 w-9 h-9 rounded-lg bg-white/10" />
        <div className="flex-1">
          <div className="h-4 w-32 rounded bg-white/10 mb-2" />
          <div className="h-3 w-full rounded bg-white/10" />
        </div>
      </div>
    );
  }

  // 态 1: no-data — 拉取失败或还没有任何三轨记录
  if (!matrix || matrix.status === 'empty') {
    return (
      <div
        className="mt-2.5 flex items-start gap-3 p-3 rounded-xl border border-glass-border bg-glass-fill"
        data-testid="guard-consistency-card-empty"
      >
        <div className="flex-shrink-0 w-9 h-9 rounded-lg bg-glass-fill flex items-center justify-center text-icon-muted">
          <LayoutGrid className="w-4 h-4" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-text-primary">
            {t('profile.guardMatrix.title')}
          </p>
          <p className="mt-1 text-xs text-text-tertiary">
            {t('profile.guardMatrix.empty')}
          </p>
        </div>
      </div>
    );
  }

  // 态 2: insufficient — 有记录但还没有域达样本阈值, 不造结论
  if (matrix.status === 'insufficient') {
    return (
      <div
        className="mt-2.5 flex items-start gap-3 p-3 rounded-xl border border-glass-border bg-glass-fill"
        data-testid="guard-consistency-card-insufficient"
      >
        <div className="flex-shrink-0 w-9 h-9 rounded-lg bg-glass-fill flex items-center justify-center text-icon-muted">
          <LayoutGrid className="w-4 h-4" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-text-primary">
            {t('profile.guardMatrix.title')}
          </p>
          <p className="mt-1 text-xs text-text-tertiary">
            {t('profile.guardMatrix.insufficient')}
          </p>
        </div>
      </div>
    );
  }

  // 态 3: normal — 矩阵
  const share = buildGuardConsistencyShare(matrix);
  const shareRows = share.rows.slice(0, 3).map((row) => ({
    label: categoryLabel(row.category),
    actions: row.actions,
    activeDays: row.activeDays,
    title: row.title,
  }));
  const totalPrivateSaved = Object.values(matrix.privateEstSavedByCategory).reduce((sum, v) => sum + v, 0);

  return (
    <div
      className="mt-2.5 p-3 rounded-xl border border-glass-border bg-glass-fill"
      data-testid="guard-consistency-card"
    >
      <div className="flex items-start gap-3">
        <div className="flex-shrink-0 w-9 h-9 rounded-lg bg-glass-fill flex items-center justify-center text-icon-muted">
          <LayoutGrid className="w-4 h-4" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm font-medium text-text-primary">
              {t('profile.guardMatrix.title')}
            </p>
            <p className="text-[11px] text-text-tertiary" data-testid="guard-consistency-card-headline">
              {t('profile.guardMatrix.headline', { domains: matrix.rows.length, days: matrix.activeDays })}
            </p>
          </div>
          <p className="mt-0.5 text-xs text-text-tertiary mb-2">
            {t('profile.guardMatrix.desc')}
          </p>

          {/* 域行 — 守护/替代/复用/放行计数 + 稳定度 (样本不足只说"先记着") */}
          <ul className="space-y-2" data-testid="guard-consistency-card-rows">
            {matrix.rows.slice(0, 4).map((row) => (
              <li
                key={row.category}
                className="rounded-lg bg-white/[0.03] px-2.5 py-1.5"
                data-testid={`guard-consistency-row-${row.category}`}
              >
                <div className="flex items-center gap-2">
                  <span className="truncate text-xs font-bold text-text-primary">
                    {categoryLabel(row.category)}
                  </span>
                  {row.category === matrix.steadiestCategory && (
                    <span className="flex-shrink-0 rounded-full border border-emerald-300/25 bg-emerald-950/40 px-1.5 py-0.5 text-[10px] text-emerald-200/90">
                      {t('profile.guardMatrix.titleSteadiest')}
                    </span>
                  )}
                  {row.category === matrix.needsCareCategory && (
                    <span className="flex-shrink-0 rounded-full border border-amber-300/25 bg-amber-950/30 px-1.5 py-0.5 text-[10px] text-amber-200/90">
                      {t('profile.guardMatrix.titleNeedsCare')}
                    </span>
                  )}
                  <span className="ml-auto flex-shrink-0 text-[10px] text-text-tertiary">
                    {row.status === 'ok'
                      ? t('profile.guardMatrix.rowStability', { percent: Math.round(row.stability * 100) })
                      : t('profile.guardMatrix.rowFew')}
                  </span>
                </div>
                <div className="mt-0.5 flex items-center gap-2 text-[11px] text-text-secondary">
                  <span className="truncate">{t('profile.guardMatrix.rowActions', { guarded: row.guarded, alt: row.adoptedAlt, reuse: row.reused })}</span>
                  {row.released > 0 && (
                    <span className="flex-shrink-0 text-text-tertiary">
                      {t('profile.guardMatrix.rowReleased', { released: row.released })}
                    </span>
                  )}
                </div>
              </li>
            ))}
          </ul>

          {/* 守护身份结论 — 非羞辱: 低稳定域是"还在拉扯, 值得陪一下" */}
          {matrix.steadiestCategory && (
            <p className="mt-2 text-[11px] text-text-secondary" data-testid="guard-consistency-card-steadiest">
              {t('profile.guardMatrix.steadiestLine', { category: categoryLabel(matrix.steadiestCategory) })}
            </p>
          )}
          {matrix.needsCareCategory && (
            <p className="mt-1 text-[11px] text-text-secondary" data-testid="guard-consistency-card-needs-care">
              {t('profile.guardMatrix.needsCareLine', { category: categoryLabel(matrix.needsCareCategory) })}
            </p>
          )}
          {matrix.needsCareCategory && (
            <p className="mt-2 rounded-lg bg-emerald-950/40 px-2.5 py-1.5 text-[11px] leading-5 text-emerald-50/90" data-testid="guard-consistency-card-suggest">
              🐘 {t('profile.guardMatrix.suggestLine', { category: categoryLabel(matrix.needsCareCategory) })}
            </p>
          )}
          {matrix.unclassified > 0 && (
            <p className="mt-1 text-[11px] text-text-tertiary" data-testid="guard-consistency-card-unclassified">
              {t('profile.guardMatrix.unclassifiedLine', { count: matrix.unclassified })}
            </p>
          )}
          {/* 各域累计估算节省 — 仅 app 内展示, 不进分享面 (红线) */}
          {totalPrivateSaved > 0 && (
            <p className="mt-1 text-[11px] text-text-tertiary" data-testid="guard-consistency-card-amount">
              {t('profile.guardMatrix.amountLine', { amount: formatCurrencyShort(totalPrivateSaved) })}
            </p>
          )}
        </div>
      </div>

      <div className="mt-2 flex justify-end">
        <button
          type="button"
          onClick={() => setShareOpen(true)}
          className="flex items-center gap-1 rounded-full border border-emerald-300/25 bg-emerald-950/40 px-2.5 py-1 text-[11px] text-emerald-50/90 transition-colors hover:bg-emerald-900/50"
          data-testid="guard-consistency-share-btn"
        >
          <Share2 className="h-3 w-3" aria-hidden="true" />
          {t('profile.guardMatrix.shareBtn')}
        </button>
      </div>

      {/* 分享弹层 — 面子字段 only (shareData 类型上无金额) */}
      {shareOpen && (
        <div
          className="fixed inset-0 z-[320] flex items-center justify-center bg-black/60 p-4"
          role="dialog"
          aria-modal="true"
          onClick={() => setShareOpen(false)}
          data-testid="guard-consistency-share-modal"
        >
          <div className="max-h-full overflow-auto" onClick={(e) => e.stopPropagation()}>
            <GuardConsistencyShareFace
              data={{
                rows: shareRows,
                steadiestLabel: share.steadiestCategory ? categoryLabel(share.steadiestCategory) : null,
                needsCareLabel: share.needsCareCategory ? categoryLabel(share.needsCareCategory) : null,
                totalActions: share.totalActions,
                activeDays: share.activeDays,
              }}
            />
            <div className="mt-3 flex items-center justify-center gap-3">
              <button
                onClick={() => setShareOpen(false)}
                className="rounded-lg border border-glass-border px-4 py-1.5 text-[12px] text-text-secondary"
              >
                {t('profile.guardMatrix.shareClose')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
