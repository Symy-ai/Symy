'use client';

/**
 * WeeklyReviewCard — 小象引导式周复盘对话卡 (batch52-b)
 *
 * 3–4 轮: 数据回顾 (weeklyGuardCompare 聚合, 复用不重算) → 自评 chips
 * (超预期/还行/有点艰难, 回应分层复用 guard-intensity 三档; 艰难分支温暖
 * 不指责, 禁任何"你浪费了"式表述) → 选本周最骄傲守护时刻 → 总结卡。
 *
 * 完成时写 manual_adjustment + metadata {source='weekly_review', week_key
 * (周一日期, 对齐 triggerId 式 key), rating, proud_key, proud_item} — 零 DDL,
 * 沿用 batch51-a 元数据通道模式; 上报失败静默 (复盘是私密自我记录)。
 *
 * 总结卡可分享: 数据走 WeeklyReviewShareFace (类型上拿不到金额), 卡内私有面
 * 也只出小时/次数。无数据周走引导态, 不渲染假数据。不依赖 Letta — 全本地模板。
 */

import { useState } from 'react';
import { Share2 } from 'lucide-react';
import { useI18n } from '@/i18n/provider';
import { apiFetch } from '@/lib/api-client';
import { logger } from '@/lib/logger';
import { WEEKLY_REVIEW_SOURCE, type WeeklyReviewDerivation } from '@/lib/weekly-review';
import { getGuardIntensity } from '@/hooks/use-guard-intensity';
import { useImpulseWindow } from '@/hooks/use-impulse-window';
import { formatDiaryHours } from '@/lib/guard-diary';
import type { WeeklyReviewRating } from '@/types/weekly-review';
import { WeeklyReviewShareFace } from '@/components/chat-parts/weekly-review-share';

export interface WeeklyReviewCardProps {
  derivation: WeeklyReviewDerivation;
  /** 用户完成复盘后调用 (主动态消解, 防再弹) */
  onCompleted: () => void;
  onClose: () => void;
}

type Step = 'recap' | 'rating' | 'proud' | 'summary';

const RATINGS: WeeklyReviewRating[] = ['exceeded', 'okay', 'tough'];

/** 下周守护建议的窗口 key — 无主导窗口时回退 generic */
function tipKeyOf(topWindow: string | null, tipStatus: string): string {
  if (tipStatus !== 'ok' || !topWindow) return 'chat.weeklyReview.tip.generic';
  return `chat.weeklyReview.tip.${topWindow}`;
}

export function WeeklyReviewCard({ derivation, onCompleted, onClose }: WeeklyReviewCardProps) {
  const { t } = useI18n();
  const { summary: impulseSummary } = useImpulseWindow();
  const intensity = getGuardIntensity();

  const alreadyReviewed = derivation.status === 'reviewed' && !!derivation.completed;
  const [step, setStep] = useState<Step>(alreadyReviewed ? 'summary' : 'recap');
  const [rating, setRating] = useState<WeeklyReviewRating | null>(alreadyReviewed ? derivation.completed!.rating : null);
  // picked=false 未选; key=null 且 picked=true = 跳过 (proud_key 不写)
  const [proud, setProud] = useState<{ picked: boolean; key: string | null; label: string | null }>(
    alreadyReviewed
      ? { picked: true, key: derivation.completed!.proudKey, label: derivation.completed!.proudLabel }
      : { picked: false, key: null, label: null },
  );
  const [shareOpen, setShareOpen] = useState(false);

  const guardCount = derivation.compare.thisWeek.intercepts;
  const hoursLabel = formatDiaryHours(derivation.compare.thisWeek.hoursReclaimed);

  const momentLabel = proud.label;

  const finish = async (chosen: { key: string | null; label: string | null }, chosenRating: WeeklyReviewRating) => {
    // 先消解防连点, 上报失败静默 — 复盘是私密自我记录, 不追问第二遍
    setStep('summary');
    onCompleted();
    try {
      await apiFetch('/api/buddy/health-events', {
        method: 'POST',
        body: {
          eventType: 'manual_adjustment',
          triggerSource: 'manual',
          description: `Weekly review (${chosenRating}) — week of ${derivation.weekKey}`,
          metadata: {
            source: WEEKLY_REVIEW_SOURCE,
            week_key: derivation.weekKey,
            rating: chosenRating,
            proud_key: chosen.key,
            proud_item: chosen.label,
          },
        },
      });
    } catch (err) {
      // safe to ignore: 复盘上报失败不弹错不阻塞 (总结卡照常展示)
      logger.warn('[weekly-review] review report failed (silently skipped):', err instanceof Error ? err.message : String(err));
    }
  };

  const closeCard = () => {
    setShareOpen(false);
    onClose();
  };

  // ===== 无数据周: 引导态 (不空壳不假数据) =====
  if (derivation.status === 'noData') {
    return (
      <div data-testid="weekly-review-card" className="mt-2 mx-3 p-3 rounded-xl border border-glass-border bg-glass-fill backdrop-blur-sm">
        <p className="text-[11px] text-text-secondary" data-testid="weekly-review-empty">
          🐘 {t('chat.weeklyReview.noDataBody')}
        </p>
        <div className="mt-2 flex justify-end">
          <button onClick={closeCard} className="rounded-lg border border-glass-border px-2.5 py-1 text-[11px] text-text-secondary" data-testid="weekly-review-close-empty">
            {t('chat.weeklyReview.closeBtn')}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div data-testid="weekly-review-card" className="mt-2 mx-3 p-3 rounded-xl border border-glass-border bg-glass-fill backdrop-blur-sm">
      <p className="text-[11px] font-semibold text-text-primary" data-testid="weekly-review-title">
        🐘 {t('chat.weeklyReview.title')}
      </p>

      {/* ===== 轮 1: 数据回顾 (weeklyGuardCompare 口径) ===== */}
      {step === 'recap' && (
        <div data-testid="weekly-review-recap">
          <p className="mt-1.5 text-[11px] leading-relaxed text-text-secondary">
            {t('chat.weeklyReview.recapGreeting', { count: String(guardCount), hours: hoursLabel })}
          </p>
          {derivation.compare.status === 'ok' && derivation.compare.trends.intercepts !== 'flat' && (
            <p className="mt-1 text-[11px] text-text-tertiary" data-testid="weekly-review-recap-trend">
              {t(`chat.weeklyReview.recapTrend.${derivation.compare.trends.intercepts}`, {
                last: String(derivation.compare.lastWeek.intercepts),
              })}
            </p>
          )}
          <div className="mt-2 flex justify-end">
            <button
              onClick={() => setStep('rating')}
              className="rounded-lg bg-emerald-600 px-2.5 py-1 text-[11px] font-medium text-white"
              data-testid="weekly-review-continue"
            >
              {t('chat.weeklyReview.continueBtn')}
            </button>
          </div>
        </div>
      )}

      {/* ===== 轮 2: 自评 chips + 分层回应 ===== */}
      {step === 'rating' && (
        <div data-testid="weekly-review-rating">
          <p className="mt-1.5 text-[11px] text-text-secondary">{t('chat.weeklyReview.ratingQuestion')}</p>
          {rating ? (
            <p className="mt-1.5 text-[11px] text-text-primary" data-testid="weekly-review-rating-reply">
              🐘 {t(`chat.weeklyReview.reply.${rating}.${intensity}`)}
            </p>
          ) : (
            <div className="mt-2 flex items-center gap-2" data-testid="weekly-review-rating-chips">
              {RATINGS.map((r) => (
                <button
                  key={r}
                  onClick={() => setRating(r)}
                  className="rounded-lg border border-glass-border bg-glass-fill px-2.5 py-1 text-[11px] font-medium text-text-primary transition-colors hover:border-emerald-500/30"
                  data-testid={`weekly-review-rating-${r}`}
                >
                  {t(`chat.weeklyReview.chip.${r}`)}
                </button>
              ))}
            </div>
          )}
          {rating && (
            <div className="mt-2 flex justify-end">
              <button
                onClick={() => setStep('proud')}
                className="rounded-lg bg-emerald-600 px-2.5 py-1 text-[11px] font-medium text-white"
                data-testid="weekly-review-continue"
              >
                {t('chat.weeklyReview.continueBtn')}
              </button>
            </div>
          )}
        </div>
      )}

      {/* ===== 轮 3: 选最骄傲守护时刻 ===== */}
      {step === 'proud' && rating && (
        <div data-testid="weekly-review-proud">
          <p className="mt-1.5 text-[11px] text-text-secondary">{t('chat.weeklyReview.proudQuestion')}</p>
          {proud.picked ? (
            <p className="mt-1.5 text-[11px] text-text-primary" data-testid="weekly-review-proud-ack">
              🐘 {t('chat.weeklyReview.proudAck', { moment: proud.label || t('chat.weeklyReview.proudSkipped') })}
            </p>
          ) : (
            <div className="mt-2 flex flex-wrap items-center gap-2" data-testid="weekly-review-proud-chips">
              {derivation.candidates.map((c, i) => {
                const label = c.itemName || t('chat.weeklyReview.momentGeneric', { n: String(i + 1) });
                return (
                  <button
                    key={c.key}
                    onClick={() => setProud({ picked: true, key: c.key, label })}
                    className="rounded-lg border border-glass-border bg-glass-fill px-2.5 py-1 text-[11px] font-medium text-text-primary transition-colors hover:border-emerald-500/30"
                    data-testid={`weekly-review-proud-${i}`}
                  >
                    {label}
                  </button>
                );
              })}
              <button
                onClick={() => setProud({ picked: true, key: null, label: null })}
                className="rounded-lg border border-glass-border px-2.5 py-1 text-[11px] text-text-tertiary"
                data-testid="weekly-review-proud-skip"
              >
                {t('chat.weeklyReview.skipProud')}
              </button>
            </div>
          )}
          {proud.picked && (
            <div className="mt-2 flex justify-end">
              <button
                onClick={() => finish(proud, rating)}
                className="rounded-lg bg-emerald-600 px-2.5 py-1 text-[11px] font-medium text-white"
                data-testid="weekly-review-finish"
              >
                {t('chat.weeklyReview.finishBtn')}
              </button>
            </div>
          )}
        </div>
      )}

      {/* ===== 轮 4: 总结卡 (私有面: 次数/小时/所选时刻/寄语; 分享面无金额) ===== */}
      {step === 'summary' && rating && (
        <div data-testid="weekly-review-summary" className="mt-2">
          <div className="flex items-center gap-2" data-testid="weekly-review-stats">
            <span className="rounded-lg border border-glass-border px-2 py-1 text-[11px] text-text-primary">
              {t('chat.weeklyReview.statGuards', { count: String(guardCount) })}
            </span>
            <span className="rounded-lg border border-glass-border px-2 py-1 text-[11px] text-text-primary">
              {t('chat.weeklyReview.statHours', { hours: hoursLabel })}
            </span>
          </div>
          {momentLabel && (
            <p className="mt-1.5 text-[11px] text-text-secondary" data-testid="weekly-review-moment">
              🏅 {t('chat.weeklyReview.momentLine', { moment: momentLabel })}
            </p>
          )}
          <p className="mt-1.5 text-[11px] leading-relaxed text-text-primary" data-testid="weekly-review-blessing">
            🐘 {t(`chat.weeklyReview.blessing.${rating}`)}
          </p>
          <p className="mt-1 text-[11px] text-text-tertiary" data-testid="weekly-review-tip">
            🌱 {t(tipKeyOf(impulseSummary?.topWindow ?? null, impulseSummary?.status ?? 'insufficient'))}
          </p>
          <div className="mt-2 flex items-center justify-end gap-2">
            <button
              onClick={() => setShareOpen(true)}
              className="flex items-center gap-1 rounded-lg border border-glass-border px-2.5 py-1 text-[11px] font-medium text-text-primary transition-colors hover:border-emerald-500/30"
              data-testid="weekly-review-share-btn"
            >
              <Share2 className="h-3.5 w-3.5" aria-hidden="true" />
              {t('chat.weeklyReview.shareBtn')}
            </button>
            <button onClick={closeCard} className="rounded-lg border border-glass-border px-2.5 py-1 text-[11px] text-text-secondary">
              {t('chat.weeklyReview.closeBtn')}
            </button>
          </div>

          {alreadyReviewed && (
            <p className="mt-1 text-[11px] text-text-tertiary" data-testid="weekly-review-reviewed-note">
              {t('chat.weeklyReview.reviewedNote')}
            </p>
          )}
        </div>
      )}

      {/* 分享弹层 — 面子字段 only (shareData 类型上无金额) */}
      {shareOpen && (
        <div
          className="fixed inset-0 z-[320] flex items-center justify-center bg-black/60 p-4"
          role="dialog"
          aria-modal="true"
          onClick={closeCard}
          data-testid="weekly-review-share-modal"
        >
          <div className="max-h-full overflow-auto" onClick={(e) => e.stopPropagation()}>
            <WeeklyReviewShareFace
              data={{
                weekKey: derivation.weekKey,
                guardCount,
                hoursReclaimed: derivation.compare.thisWeek.hoursReclaimed,
                momentLabel: momentLabel || '',
              }}
            />
            <div className="mt-3 flex items-center justify-center gap-3">
              <button
                onClick={closeCard}
                className="rounded-lg border border-glass-border px-4 py-1.5 text-[12px] text-text-secondary"
              >
                {t('chat.weeklyReview.shareClose')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
