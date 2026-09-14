'use client';

/**
 * GuardStyleCard — 守护风格画像卡 (batch56-c)
 *
 * 个人页统计区: 三轨 (拦截/替代/复用) 次数条形对比 + 风格名 + 小象点评
 * (三档 guard-intensity 语气尾句, 均衡型专属鼓励文案) + 连续风格天数。
 * 面子 (卡面/分享) 纯计数零金额; 里子 (三轨 estSaved 汇总) 仅 App 内
 * 私享一行 (55-c in-app 私享金额先例), 分享面结构上拿不到金额。
 */

import { useState } from 'react';
import { Palette, Share2 } from 'lucide-react';
import { useI18n } from '@/i18n/provider';
import { useGuardIntensity } from '@/hooks/use-guard-intensity';
import { useGuardStyleProfile } from '@/hooks/use-guard-style-profile';
import { GuardStyleShareFace } from '@/components/profile-parts/guard-style-share';

function formatAmount(n: number, locale: string): string {
  const rounded = Math.round(n);
  return locale === 'zh' ? `¥${rounded}` : `$${rounded}`;
}

export function GuardStyleCard() {
  const { t, locale } = useI18n();
  const { guardIntensity } = useGuardIntensity();
  const { profile, savedEstimates, isLoading } = useGuardStyleProfile();
  const [shareOpen, setShareOpen] = useState(false);

  if (isLoading) {
    return (
      <div
        className="mt-2.5 flex items-start gap-3 p-3 rounded-xl border border-glass-border bg-glass-fill animate-pulse"
        data-testid="guard-style-card-skeleton"
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
  if (!profile || profile.status !== 'ok') {
    return (
      <div
        className="mt-2.5 flex items-start gap-3 p-3 rounded-xl border border-glass-border bg-glass-fill"
        data-testid="guard-style-card-empty"
      >
        <div className="flex-shrink-0 w-9 h-9 rounded-lg bg-glass-fill flex items-center justify-center text-icon-muted">
          <Palette className="w-4 h-4" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-text-primary">
            {t('profile.guardStyle.title')}
          </p>
          <p className="mt-1 text-xs text-text-tertiary">
            {t('profile.guardStyle.empty')}
          </p>
        </div>
      </div>
    );
  }

  const styleName = t(`profile.guardStyle.styleName.${profile.styleId}`);
  const comment = t(`profile.guardStyle.comment.${profile.styleId}`);
  // 三档语气尾句: balanced 档不加 (与 guard-intensity prompt 行同纪律)
  const intensitySuffix =
    guardIntensity === 'gentle'
      ? t('profile.guardStyle.commentIntensity.gentle')
      : guardIntensity === 'strict'
        ? t('profile.guardStyle.commentIntensity.strict')
        : '';

  const tracks = [
    { key: 'guard' as const, count: profile.trackCounts.guard },
    { key: 'alt' as const, count: profile.trackCounts.alt },
    { key: 'reuse' as const, count: profile.trackCounts.reuse },
  ];
  const maxCount = Math.max(...tracks.map((track) => track.count), 1);

  const verdict = t(`profile.guardStyle.share.verdict.${profile.styleId}`, {
    count: Math.max(...tracks.map((track) => track.count)),
    guard: profile.trackCounts.guard,
    alt: profile.trackCounts.alt,
    reuse: profile.trackCounts.reuse,
  });

  return (
    <div
      className="mt-2.5 p-3 rounded-xl border border-glass-border bg-glass-fill"
      data-testid="guard-style-card"
    >
      <div className="flex items-start gap-3">
        <div className="flex-shrink-0 w-9 h-9 rounded-lg bg-glass-fill flex items-center justify-center text-icon-muted">
          <Palette className="w-4 h-4" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm font-medium text-text-primary">
              {t('profile.guardStyle.title')} · <span className="font-bold" data-testid="guard-style-card-style-name">{styleName}</span>
            </p>
            <p className="text-[11px] text-text-tertiary flex-shrink-0" data-testid="guard-style-card-counts">
              {t('profile.guardStyle.countsLine', { total: profile.totalActions, days: profile.activeDays })}
            </p>
          </div>
          <p className="mt-0.5 text-xs text-text-tertiary mb-2">
            {t('profile.guardStyle.desc')}
          </p>

          {/* 三轨次数条形对比 — 纯计数, 无金额 */}
          <div className="space-y-1.5" data-testid="guard-style-card-tracks">
            {tracks.map((track) => (
              <div key={track.key} className="flex items-center gap-2">
                <span className="w-8 flex-shrink-0 text-[11px] text-text-secondary" data-testid={`guard-style-track-label-${track.key}`}>
                  {t(`profile.guardStyle.trackName.${track.key}`)}
                </span>
                <span className="h-2 flex-1 rounded-full bg-white/5 overflow-hidden">
                  <span
                    className="block h-full rounded-full bg-emerald-500/70"
                    style={{ width: `${Math.round((track.count / maxCount) * 100)}%` }}
                    data-testid={`guard-style-track-bar-${track.key}`}
                  />
                </span>
                <span className="w-7 flex-shrink-0 text-right text-xs font-bold text-text-secondary" data-testid={`guard-style-track-count-${track.key}`}>
                  ×{track.count}
                </span>
              </div>
            ))}
          </div>

          {profile.styleStreakDays > 0 && (
            <p className="mt-2 text-[11px] text-text-tertiary" data-testid="guard-style-card-streak">
              {t('profile.guardStyle.streakLine', { days: profile.styleStreakDays })}
            </p>
          )}

          {/* 小象点评 — 三档 guard-intensity 语气; 均衡型=鼓励文案, 绝不暗示某轨做得不够 */}
          <p className="mt-2 rounded-lg bg-emerald-950/40 px-2.5 py-1.5 text-[11px] leading-5 text-emerald-50/90" data-testid="guard-style-card-comment">
            🐘 {comment}{intensitySuffix ? ` ${intensitySuffix}` : ''}
          </p>

          {/* 里子悄悄看 — 三轨 estSaved 汇总, 仅 App 内私享, 永不进分享/荣誉面 */}
          <p className="mt-1.5 text-[11px] text-text-tertiary" data-testid="guard-style-card-saved-private">
            🔒 {t('profile.guardStyle.savedLine', {
              guard: formatAmount(savedEstimates.guard, locale),
              alt: formatAmount(savedEstimates.alt, locale),
              reuse: formatAmount(savedEstimates.reuse, locale),
            })}
          </p>
        </div>
      </div>

      <div className="mt-2 flex justify-end">
        <button
          type="button"
          onClick={() => setShareOpen(true)}
          className="flex items-center gap-1 rounded-full border border-emerald-300/25 bg-emerald-950/40 px-2.5 py-1 text-[11px] text-emerald-50/90 transition-colors hover:bg-emerald-900/50"
          data-testid="guard-style-share-btn"
        >
          <Share2 className="h-3 w-3" aria-hidden="true" />
          {t('profile.guardStyle.shareBtn')}
        </button>
      </div>

      {/* 分享弹层 — 面子字段 only (GuardStyleShareData 类型上无金额) */}
      {shareOpen && (
        <div
          className="fixed inset-0 z-[320] flex items-center justify-center bg-black/60 p-4"
          role="dialog"
          aria-modal="true"
          onClick={() => setShareOpen(false)}
          data-testid="guard-style-share-modal"
        >
          <div className="max-h-full overflow-auto" onClick={(e) => e.stopPropagation()}>
            <GuardStyleShareFace
              data={{ styleId: profile.styleId, styleName, verdict, trackCounts: profile.trackCounts }}
            />
            <div className="mt-3 flex items-center justify-center gap-3">
              <button
                onClick={() => setShareOpen(false)}
                className="rounded-lg border border-glass-border px-4 py-1.5 text-[12px] text-text-secondary"
              >
                {t('profile.guardStyle.shareClose')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
