'use client';

/**
 * PostPurchaseReview — 购后复盘回访条 (一次性, batch51-a)
 *
 * 拦截失败 (用户穿过拦截买了) 后 1–2 天, 小象在 chat 顶部问一句
 * 「前几天买下的那件 X, 用上了吗?」三个快捷回应 chip:
 *   真值 → 祝福 + "好消费也是守护的一部分" (值得庆祝的正当结果)
 *   还行 → 中性温和, 轻引导
 *   有点后悔 → 温暖共情 + 一句具体反思引导 (绝不说"我早就说过")
 * 评价写 POST /api/buddy/health-events (eventType=manual_adjustment — 客户端唯一
 * 允许的纯审计类型, 零 DDL 零 vitality 副作用; metadata.source=
 * 'post_purchase_review' 标记语义子类型, review_key 与 challenge_failed 的
 * triggerId 对齐防重复回访)。回应文案复用 guard intensity 三档语气 (48-a)。
 *
 * 红线: 金额永不进此卡任何展示; 小结只数次数; 评价不进分享/荣誉面。
 * 不依赖 Letta — 回应全走本地模板, 无 503 面。
 */

import { useState } from 'react';
import { useI18n } from '@/i18n/provider';
import { apiFetch } from '@/lib/api-client';
import { logger } from '@/lib/logger';
import { POST_PURCHASE_REVIEW_SOURCE } from '@/lib/post-purchase-review';
import { getGuardIntensity } from '@/hooks/use-guard-intensity';
import type { DuePostPurchaseReview, PostPurchaseReviewSummary, PostPurchaseRating } from '@/types/post-purchase-review';

export interface PostPurchaseReviewProps {
  record: DuePostPurchaseReview;
  summary: PostPurchaseReviewSummary;
  /** 三选一后由调用方清空派生 state (回访条切到回应态) */
  onAnswered: (rating: PostPurchaseRating) => void;
}

const RATINGS: PostPurchaseRating[] = ['worth', 'ok', 'regret'];

export function PostPurchaseReview({ record, summary, onAnswered }: PostPurchaseReviewProps) {
  const { t } = useI18n();
  const [answered, setAnswered] = useState<PostPurchaseRating | null>(null);
  const intensity = getGuardIntensity();

  const itemName = record.itemName || t('chat.postPurchaseReview.itemGeneric');

  const answer = async (rating: PostPurchaseRating) => {
    // 先消解防连点, 上报失败静默 — 评价是私密自我记录, 不追问第二遍
    setAnswered(rating);
    onAnswered(rating);
    try {
      await apiFetch('/api/buddy/health-events', {
        method: 'POST',
        body: {
          eventType: 'manual_adjustment',
          triggerSource: 'manual',
          description: `Post-purchase review (${rating}): ${record.itemName || 'unnamed item'}`,
          metadata: {
            source: POST_PURCHASE_REVIEW_SOURCE,
            rating,
            review_key: record.key,
          },
        },
      });
    } catch (err) {
      // safe to ignore: 评价上报失败不弹错不阻塞 chat (回应文案照常展示)
      logger.warn('[post-purchase-review] review report failed (silently skipped):', err instanceof Error ? err.message : String(err));
    }
  };

  return (
    <div
      data-testid="post-purchase-review"
      className="mt-2 mx-3 p-3 rounded-xl border border-glass-border bg-glass-fill backdrop-blur-sm"
    >
      <p className="text-[11px] text-text-secondary" data-testid="post-purchase-review-question">
        🐘 {t('chat.postPurchaseReview.question', { item: itemName })}
      </p>

      {answered ? (
        <p className="mt-1.5 text-[11px] text-text-primary" data-testid="post-purchase-review-reply">
          🐘 {t(`chat.postPurchaseReview.reply.${answered}.${intensity}`)}
        </p>
      ) : (
        <div className="mt-2 flex items-center gap-2" data-testid="post-purchase-review-chips">
          {RATINGS.map((rating) => (
            <button
              key={rating}
              onClick={() => answer(rating)}
              className="rounded-lg border border-glass-border bg-glass-fill px-2.5 py-1 text-[11px] font-medium text-text-primary transition-colors hover:border-emerald-500/30"
              data-testid={`post-purchase-review-${rating}`}
            >
              {t(`chat.postPurchaseReview.chip.${rating}`)}
            </button>
          ))}
        </div>
      )}

      {summary.total > 0 && (
        <p className="mt-1.5 text-[11px] text-text-tertiary" data-testid="post-purchase-review-summary">
          🌱 {t('chat.postPurchaseReview.summary', {
            total: String(summary.total),
            worth: String(summary.worth),
            regret: String(summary.regret),
          })}
        </p>
      )}
    </div>
  );
}
