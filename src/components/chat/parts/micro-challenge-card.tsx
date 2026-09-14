'use client';

/**
 * MicroChallengeCard — chat 内微型守护挑战卡 (陪伴叙事)
 *
 * chat route 预检命中 (购买意图 + 品类 + 7 天频控) 时随 SSE micro_challenge 事件 /
 * 非流式 JSON microChallenge 字段附带, ChatBubble 在 AI 回复气泡下方渲染。
 *   - 接受 → 调现有 /api/challenge/create (24h 单人挑战, 名义小额 → quick_pass 档),
 *     写入待回访记录, 次日回访条接棒
 *   - 跳过 → 卡片温和收起 (频控标记已在展示时记录), 零负面文案
 *
 * 视觉红线: 不用拦截卡深绿金配色 — 用现有 chat 结构化卡底色 (bg-glass-fill 中性边)。
 * 金额不进卡片 (只提 24 小时时长); 绿色守护开关关闭时整卡静默。
 */

import { useEffect, useRef, useState } from 'react';
import { useI18n } from '@/i18n/provider';
import { useGreenPref } from '@/hooks/use-green-pref';
import { apiFetch } from '@/lib/api-client';
import { logger } from '@/lib/logger';
import {
  recordMicroChallengeOffered,
  savePendingMicroChallenge,
} from '@/components/chat/parts/micro-challenge-store';
import type { MicroChallengeProposal } from '@/types/micro-challenge';

/** 名义金额: 只为满足挑战表 amount>0 + quick_pass 档 (≤30), 不进任何展示面 */
const MICRO_CHALLENGE_AMOUNT_USD = 5;
const MICRO_CHALLENGE_DURATION_HOURS = 24;

export function MicroChallengeCard({ proposal }: { proposal: MicroChallengeProposal }) {
  const { t } = useI18n();
  const { greenPrefEnabled } = useGreenPref();
  const [accepted, setAccepted] = useState(false);
  const [skipped, setSkipped] = useState(false);
  // 频控锚点: 卡片展示即记一次发起 (React 18 dev 双执行由 ref 防重)
  const offeredRef = useRef(false);

  useEffect(() => {
    if (offeredRef.current) return;
    offeredRef.current = true;
    recordMicroChallengeOffered(proposal.category);
  }, [proposal.category]);

  if (!greenPrefEnabled || skipped) return null;

  const handleAccept = async () => {
    if (accepted) return;
    setAccepted(true); // 先进已确认态防连点重复创建
    const itemName = t(`chat.microChallenge.itemName.${proposal.category}`);
    try {
      const res = await apiFetch<{ challengeId?: string }>('/api/challenge/create', {
        method: 'POST',
        body: { itemName, amount: MICRO_CHALLENGE_AMOUNT_USD },
      });
      if (res?.challengeId) {
        savePendingMicroChallenge({
          challengeId: res.challengeId,
          category: proposal.category,
          itemName,
          amount: MICRO_CHALLENGE_AMOUNT_USD,
          dueAt: Date.now() + MICRO_CHALLENGE_DURATION_HOURS * 60 * 60 * 1000,
        });
      }
    } catch (err) {
      // safe to ignore: 挑战创建失败不弹错不阻塞 chat — 已确认态照常展示, 只是次日无回访
      logger.warn('[micro-challenge-card] create failed (silently skipped):', err instanceof Error ? err.message : String(err));
    }
  };

  const handleSkip = () => {
    // 温和收起: 频控标记已在展示时记录, 这里零文案零负面
    setSkipped(true);
  };

  return (
    <aside
      className="mt-3 rounded-xl border border-glass-border bg-glass-fill backdrop-blur-sm p-3"
      aria-label={t('chat.microChallenge.title')}
      data-testid="micro-challenge-card"
    >
      <h4 className="flex items-center gap-1.5 text-xs font-medium text-text-primary">
        <span aria-hidden>🐘</span>
        <span>{t('chat.microChallenge.title')}</span>
        <span className="ml-auto shrink-0 rounded-md border border-glass-border px-1.5 py-0.5 text-[10px] font-normal text-text-tertiary">
          {t('chat.microChallenge.duration')}
        </span>
      </h4>

      <p className="mt-1.5 text-xs leading-relaxed text-text-secondary">
        {t(proposal.titleKey)}
      </p>

      <div className="mt-2 border-t border-glass-border pt-2">
        {accepted ? (
          <p className="text-[11px] font-medium text-text-secondary" data-testid="micro-challenge-accepted-note">
            {t('chat.microChallenge.acceptedNote')}
          </p>
        ) : (
          <div className="flex gap-2">
            <button
              type="button"
              onClick={handleAccept}
              className="flex-1 rounded-lg border border-glass-border bg-glass-fill px-3 py-1.5 text-[11px] font-medium text-text-primary transition-colors hover:border-emerald-500/30"
              data-testid="micro-challenge-accept-button"
            >
              {t('chat.microChallenge.accept')}
            </button>
            <button
              type="button"
              onClick={handleSkip}
              className="rounded-lg px-3 py-1.5 text-[11px] font-medium text-text-tertiary transition-colors hover:text-text-secondary"
              data-testid="micro-challenge-skip-button"
            >
              {t('chat.microChallenge.skip')}
            </button>
          </div>
        )}
      </div>
    </aside>
  );
}
