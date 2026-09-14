'use client';

/**
 * GuardMomentsCard — 守护时刻时间线卡 (batch58-a)
 *
 * chat 内二级视图 (与 weekly-review 卡同形态): 顶部汇总行 (总次数 + 覆盖天数) +
 * 里子私享一行 (累计省钱, 仅 App 内) + 按月分组吸顶的倒序时刻流。
 * 每条时刻: 日期 + 类型徽标 (intercept-reason-chip 视觉词汇) + 一句话描述 +
 * 该条 estSaved (仅 App 内)。
 * 分享面只收计数/天数, 结构上拿不到金额 (GuardMomentsShareData 无金额字段)。
 */

import { useState } from 'react';
import { Leaf, Recycle, Share2, ShieldCheck, X } from 'lucide-react';
import { useI18n } from '@/i18n/provider';
import type {
  GuardMoment,
  GuardMomentTrack,
  GuardMomentsTimeline,
} from '@/lib/guard-moments';
import { GuardMomentsShareFace } from '@/components/chat-parts/guard-moments-share';

const TRACK_ICONS: Record<GuardMomentTrack, typeof Leaf> = {
  guard: ShieldCheck,
  alt: Leaf,
  reuse: Recycle,
};

function formatAmount(n: number, locale: string): string {
  const rounded = Math.round(n);
  return locale === 'zh' ? `¥${rounded}` : `$${rounded}`;
}

function formatDay(date: Date, locale: string): string {
  return new Intl.DateTimeFormat(locale === 'zh' ? 'zh-CN' : 'en-US', {
    month: 'short',
    day: 'numeric',
  }).format(date);
}

function formatMonthLabel(monthKey: string, locale: string): string {
  const [y, m] = monthKey.split('-').map(Number);
  return new Intl.DateTimeFormat(locale === 'zh' ? 'zh-CN' : 'en-US', {
    year: 'numeric',
    month: 'long',
  }).format(new Date(y, m - 1, 1));
}

function MomentRow({ moment, locale }: { moment: GuardMoment; locale: string }) {
  const { t } = useI18n();
  const Icon = TRACK_ICONS[moment.track];

  return (
    <li
      className="flex items-start gap-2 rounded-xl border border-glass-border bg-glass-fill px-2.5 py-2"
      data-testid={`guard-moment-${moment.track}`}
    >
      <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-emerald-300/25 bg-emerald-950/40">
        <Icon className="h-3 w-3 text-emerald-300" aria-hidden="true" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-2">
          <span className="text-[11px] text-text-tertiary">{formatDay(moment.date, locale)}</span>
          {/* 该条省钱估算 — 仅 App 内展示, 永不进分享/荣誉面 */}
          {moment.estSaved > 0 && (
            <span className="text-[11px] text-text-tertiary" data-testid="guard-moment-saved">
              🔒 {t('chat.guardMoments.savedSuffix', { amount: formatAmount(moment.estSaved, locale) })}
            </span>
          )}
        </div>
        <p className="mt-0.5 text-xs leading-relaxed text-text-secondary">
          {t(`chat.guardMoments.momentDesc.${moment.track}`)}
        </p>
      </div>
    </li>
  );
}

export interface GuardMomentsCardProps {
  timeline: GuardMomentsTimeline;
  onClose: () => void;
}

export function GuardMomentsCard({ timeline, onClose }: GuardMomentsCardProps) {
  const { t, locale } = useI18n();
  const [shareOpen, setShareOpen] = useState(false);

  // 拉取失败 / 无时刻 → 引导空态 (温暖向, 引导去完成第一次拦截)
  if (timeline.status !== 'ok' || timeline.totalMoments === 0) {
    return (
      <aside
        className="mt-2 mx-3 w-[calc(100%-1.5rem)] rounded-xl border border-glass-border bg-glass-fill p-3 backdrop-blur-sm"
        data-testid="guard-moments-empty"
      >
        <div className="flex items-start justify-between gap-2">
          <p className="text-sm font-medium text-text-primary">{t('chat.guardMoments.title')}</p>
          <button
            type="button"
            onClick={onClose}
            aria-label={t('chat.guardMoments.closeBtn')}
            className="text-text-tertiary transition-colors hover:text-text-primary"
          >
            <X className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        </div>
        <p className="mt-2 text-xs leading-relaxed text-text-tertiary">
          🐘 {t('chat.guardMoments.emptyBody')}
        </p>
      </aside>
    );
  }

  return (
    <aside
      className="mt-2 mx-3 flex w-[calc(100%-1.5rem)] max-h-[60vh] flex-col rounded-xl border border-glass-border bg-glass-fill p-3 backdrop-blur-sm"
      data-testid="guard-moments-card"
    >
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm font-medium text-text-primary">{t('chat.guardMoments.title')}</p>
        <button
          type="button"
          onClick={onClose}
          aria-label={t('chat.guardMoments.closeBtn')}
          className="text-text-tertiary transition-colors hover:text-text-primary"
        >
          <X className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
      </div>

      {/* 顶部汇总行 — 纯计数/天数 */}
      <p className="mt-1 text-[11px] text-text-tertiary" data-testid="guard-moments-summary">
        {t('chat.guardMoments.summaryLine', {
          count: timeline.totalMoments,
          days: timeline.activeDays,
        })}
      </p>

      {/* 里子悄悄看 — 累计省钱, 仅 App 内私享, 永不进分享/荣誉面 */}
      <p className="mt-0.5 text-[11px] text-text-tertiary" data-testid="guard-moments-saved-private">
        🔒 {t('chat.guardMoments.savedPrivate', {
          amount: formatAmount(timeline.totalSaved, locale),
        })}
      </p>

      {/* 时刻流 — 按月分组, 月头吸顶, 组内倒序 */}
      <div className="mt-2 min-h-0 flex-1 space-y-2.5 overflow-y-auto pr-0.5" data-testid="guard-moments-list">
        {timeline.months.map((month) => (
          <section key={month.monthKey}>
            <p
              className="sticky top-0 z-10 -mx-0.5 bg-glass-fill/95 px-0.5 py-1 text-[11px] font-semibold text-text-secondary backdrop-blur-sm"
              data-testid="guard-moments-month"
            >
              {formatMonthLabel(month.monthKey, locale)}
            </p>
            <ul className="space-y-1.5">
              {month.moments.map((m) => (
                <MomentRow key={m.id} moment={m} locale={locale} />
              ))}
            </ul>
          </section>
        ))}
      </div>

      <div className="mt-2 flex justify-end">
        <button
          type="button"
          onClick={() => setShareOpen(true)}
          className="flex items-center gap-1 rounded-full border border-emerald-300/25 bg-emerald-950/40 px-2.5 py-1 text-[11px] text-emerald-50/90 transition-colors hover:bg-emerald-900/50"
          data-testid="guard-moments-share-btn"
        >
          <Share2 className="h-3 w-3" aria-hidden="true" />
          {t('chat.guardMoments.shareBtn')}
        </button>
      </div>

      {/* 分享弹层 — 面子字段 only (GuardMomentsShareData 类型上无金额) */}
      {shareOpen && (
        <div
          className="fixed inset-0 z-[320] flex items-center justify-center bg-black/60 p-4"
          role="dialog"
          aria-modal="true"
          onClick={() => setShareOpen(false)}
          data-testid="guard-moments-share-modal"
        >
          <div className="max-h-full overflow-auto" onClick={(e) => e.stopPropagation()}>
            <GuardMomentsShareFace
              data={{
                trackCounts: timeline.trackCounts,
                totalMoments: timeline.totalMoments,
                activeDays: timeline.activeDays,
              }}
            />
            <div className="mt-3 flex items-center justify-center gap-3">
              <button
                onClick={() => setShareOpen(false)}
                className="rounded-lg border border-glass-border px-4 py-1.5 text-[12px] text-text-secondary"
              >
                {t('chat.guardMoments.shareClose')}
              </button>
            </div>
          </div>
        </div>
      )}
    </aside>
  );
}
