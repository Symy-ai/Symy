'use client';

/**
 * ImpulseTriggerCard — 冲动触发画像卡 (batch52-c)
 *
 * 个人页统计区 (品类透视卡之下): Top 3 触发原因 + 最常被拦品类 + 危险时段
 * + 一条针对性守护建议 + 分享入口。卡片纯计数展示 (次数/天数), 金额永不出现。
 * 原因标签复用 intercept-reason-chip 既有 i18n 词表 (impulseTriggerReasonTextKey),
 * 品类/时段复用品类卡/时段卡词表。样本不足显示引导文案, 不渲染伪画像。
 */

import { useState } from 'react';
import { Compass, Share2 } from 'lucide-react';
import { useI18n } from '@/i18n/provider';
import { useImpulseTriggerProfile } from '@/hooks/use-impulse-trigger-profile';
import { impulseTriggerReasonTextKey } from '@/lib/impulse-trigger-profile';
import { ImpulseTriggerShareFace } from '@/components/profile-parts/impulse-trigger-share';

export function ImpulseTriggerCard() {
  const { t } = useI18n();
  const { profile, isLoading } = useImpulseTriggerProfile();
  const [shareOpen, setShareOpen] = useState(false);

  if (isLoading) {
    return (
      <div
        className="mt-2.5 flex items-start gap-3 p-3 rounded-xl border border-glass-border bg-glass-fill animate-pulse"
        data-testid="impulse-trigger-card-skeleton"
      >
        <div className="flex-shrink-0 w-9 h-9 rounded-lg bg-white/10" />
        <div className="flex-1">
          <div className="h-4 w-32 rounded bg-white/10 mb-2" />
          <div className="h-3 w-full rounded bg-white/10" />
        </div>
      </div>
    );
  }

  // 拉取失败 (null) 或样本不足 → 引导态 (鼓励向, 不暗示做得差)
  if (!profile || profile.status !== 'ok' || profile.topReasons.length === 0) {
    return (
      <div
        className="mt-2.5 flex items-start gap-3 p-3 rounded-xl border border-glass-border bg-glass-fill"
        data-testid="impulse-trigger-card-empty"
      >
        <div className="flex-shrink-0 w-9 h-9 rounded-lg bg-glass-fill flex items-center justify-center text-icon-muted">
          <Compass className="w-4 h-4" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-text-primary">
            {t('profile.impulseTrigger.title')}
          </p>
          <p className="mt-1 text-xs text-text-tertiary">
            {t('profile.impulseTrigger.empty')}
          </p>
        </div>
      </div>
    );
  }

  const topReasonLabel = t(impulseTriggerReasonTextKey(profile.topReasons[0].reasonId));
  const windowLine = profile.window.status === 'ok' && profile.window.topWindow
    ? t('profile.impulseTrigger.windowLine', {
        window: t(`profile.impulseWindowName.${profile.window.topWindow}`),
        percent: Math.round(profile.window.topShare * 100),
      })
    : null;

  return (
    <div
      className="mt-2.5 p-3 rounded-xl border border-glass-border bg-glass-fill"
      data-testid="impulse-trigger-card"
    >
      <div className="flex items-start gap-3">
        <div className="flex-shrink-0 w-9 h-9 rounded-lg bg-glass-fill flex items-center justify-center text-icon-muted">
          <Compass className="w-4 h-4" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm font-medium text-text-primary">
              {t('profile.impulseTrigger.title')}
            </p>
            <p className="text-[11px] text-text-tertiary" data-testid="impulse-trigger-card-counts">
              {t('profile.impulseTrigger.countsLine', {
                count: profile.totalIntercepts,
                days: profile.activeDays,
              })}
            </p>
          </div>
          <p className="mt-0.5 text-xs text-text-tertiary mb-2">
            {t('profile.impulseTrigger.desc')}
          </p>

          {/* Top 3 触发原因 — 复用 interceptReason 词表, 纯计数 */}
          <ul className="space-y-1.5" data-testid="impulse-trigger-card-reasons">
            {profile.topReasons.map((row, index) => (
              <li
                key={row.reasonId}
                className="flex items-center gap-2"
                data-testid={`impulse-trigger-reason-${index}`}
              >
                <span className="text-[10px] font-bold text-amber-200/85 flex-shrink-0">
                  #{index + 1}
                </span>
                <span className="text-xs text-text-primary flex-1 truncate" data-testid={`impulse-trigger-reason-label-${index}`}>
                  {t(impulseTriggerReasonTextKey(row.reasonId))}
                </span>
                <span className="text-xs font-bold text-text-secondary flex-shrink-0">
                  ×{row.count}
                </span>
              </li>
            ))}
          </ul>

          {/* 最常被拦品类 + 危险时段交叉 */}
          {profile.topCategory && (
            <p className="mt-2 text-[11px] text-text-tertiary" data-testid="impulse-trigger-card-category">
              {t('profile.impulseTrigger.categoryLine', {
                category: t(`profile.guardCategoryName.${profile.topCategory}`),
                count: profile.topCategoryCount,
              })}
            </p>
          )}
          {windowLine && (
            <p className="mt-1 text-[11px] text-text-tertiary" data-testid="impulse-trigger-card-window">
              {windowLine}
            </p>
          )}

          {/* 针对性守护建议 — 非羞辱措辞: 归因"触发", 前置防线 */}
          {profile.adviceId && (
            <p className="mt-2 rounded-lg bg-emerald-950/40 px-2.5 py-1.5 text-[11px] leading-5 text-emerald-50/90" data-testid="impulse-trigger-card-advice">
              🐘 {t(`profile.impulseTriggerAdvice.${profile.adviceId}`)}
            </p>
          )}
        </div>
      </div>

      <div className="mt-2 flex justify-end">
        <button
          type="button"
          onClick={() => setShareOpen(true)}
          className="flex items-center gap-1 rounded-full border border-emerald-300/25 bg-emerald-950/40 px-2.5 py-1 text-[11px] text-emerald-50/90 transition-colors hover:bg-emerald-900/50"
          data-testid="impulse-trigger-share-btn"
        >
          <Share2 className="h-3 w-3" aria-hidden="true" />
          {t('profile.impulseTrigger.shareBtn')}
        </button>
      </div>

      {/* 分享弹层 — 面子字段 only (shareData 类型上无金额) */}
      {shareOpen && (
        <div
          className="fixed inset-0 z-[320] flex items-center justify-center bg-black/60 p-4"
          role="dialog"
          aria-modal="true"
          onClick={() => setShareOpen(false)}
          data-testid="impulse-trigger-share-modal"
        >
          <div className="max-h-full overflow-auto" onClick={(e) => e.stopPropagation()}>
            <ImpulseTriggerShareFace
              data={{
                topReasonLabel,
                interceptCount: profile.totalIntercepts,
                activeDays: profile.activeDays,
              }}
            />
            <div className="mt-3 flex items-center justify-center gap-3">
              <button
                onClick={() => setShareOpen(false)}
                className="rounded-lg border border-glass-border px-4 py-1.5 text-[12px] text-text-secondary"
              >
                {t('profile.impulseTrigger.shareClose')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
