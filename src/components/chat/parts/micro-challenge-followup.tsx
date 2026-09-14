'use client';

/**
 * MicroChallengeFollowup — 微挑战次日回访条 (一次性)
 *
 * 接受微挑战 24h 后, 下次打开 chat 时展示: 「昨天的小挑战, 感觉怎么样?」二选一。
 *   - 完成了 → POST /api/challenge/complete (status: passed) — 复用现有 complete_challenge
 *     记法, 完成事件进 health_events (守护账本/勋章进度的既有数据源)
 *   - 没守住 → status: failed — 只更新挑战状态, 零负面文案
 * 用户二选一后记录消解 (localStorage), 回访条不再出现。
 * 展示模式复用 recap bar 的一次性语义 (由 use-micro-challenge-followup 驱动)。
 */

import { useI18n } from '@/i18n/provider';
import { apiFetch } from '@/lib/api-client';
import { logger } from '@/lib/logger';
import { resolvePendingMicroChallenge, type PendingMicroChallenge } from '@/components/chat/parts/micro-challenge-store';

export interface MicroChallengeFollowupProps {
  record: PendingMicroChallenge;
  /** 消解后回调 — 调用方清 state 卸载回访条 */
  onResolved: () => void;
}

export function MicroChallengeFollowup({ record, onResolved }: MicroChallengeFollowupProps) {
  const { t } = useI18n();

  const answer = async (status: 'passed' | 'failed') => {
    // 先消解防连点 (记录清除后回访条卸载), API 失败静默 — 不追问用户第二遍
    resolvePendingMicroChallenge();
    onResolved();
    try {
      await apiFetch('/api/challenge/complete', {
        method: 'POST',
        body: {
          challengeId: record.challengeId,
          status,
          itemName: record.itemName,
          amount: record.amount,
        },
      });
    } catch (err) {
      // safe to ignore: 回访上报失败不弹错不阻塞 chat (挑战状态留在 DB, 不产生重复回访)
      logger.warn('[micro-challenge-followup] complete failed (silently skipped):', err instanceof Error ? err.message : String(err));
    }
  };

  return (
    <div
      data-testid="micro-challenge-followup"
      className="mt-2 mx-3 p-2.5 rounded-xl bg-glass-fill border border-glass-border flex items-center gap-2"
    >
      <span className="text-[11px] text-text-secondary flex-1 min-w-0">
        🐘 {t('chat.microChallenge.followupQuestion')}
      </span>
      <button
        onClick={() => answer('passed')}
        className="shrink-0 px-2.5 py-1 rounded-lg border border-glass-border bg-glass-fill text-[11px] font-medium text-text-primary transition-colors hover:border-emerald-500/30"
        data-testid="micro-challenge-followup-kept"
      >
        {t('chat.microChallenge.followupKept')}
      </button>
      <button
        onClick={() => answer('failed')}
        className="shrink-0 px-2.5 py-1 rounded-lg text-[11px] font-medium text-text-tertiary transition-colors hover:text-text-secondary"
        data-testid="micro-challenge-followup-slipped"
      >
        {t('chat.microChallenge.followupSlipped')}
      </button>
    </div>
  );
}
