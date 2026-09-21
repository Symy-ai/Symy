'use client';

/**
 * PrepurchaseFollowup — 买前三问「冷静 24h」次日回访条 (一次性, batch50-a)
 *
 * 三问后选了「冷静 24h」的用户, 24h 后下次打开 chat 时展示:
 * 「昨天问过的那件 XX, 现在还想要吗?」二选一, 用户可改判:
 *   - 还想要 → 真诚祝福 (守护过程而非结果, 荣誉框架不破, 零上报)
 *   - 不想要了 → 记一次「三问守护成功」: POST /api/buddy/health-events
 *     (eventType=manual_adjustment — 客户端唯一允许的纯审计类型, 零 vitality 副作用;
 *     metadata 标 prepurchase_success 供守护统计消费; 用户填过价格则金额随记 —
 *     只进用户自己的决策记录, 永不进分享/荣誉面)
 * 用户二选一后记录消解 (localStorage), 回访条不再出现。
 */

import { useState } from 'react';
import { useI18n } from '@/i18n/provider';
import { apiFetch } from '@/lib/api-client';
import { logger } from '@/lib/logger';
import {
  recordPrepurchaseLetGo,
  resolvePendingPrepurchase,
} from '@/components/chat/parts/prepurchase-store';
import {
  FollowupAnsweredBubble,
  FollowupBubble,
} from '@/components/chat/parts/followup-bubble';
import type { PendingPrepurchaseFollowup } from '@/types/prepurchase';

export interface PrepurchaseFollowupProps {
  record: PendingPrepurchaseFollowup;
  /** 二选一后由调用方清空派生 state (回访条卸载) */
  onResolved?: () => void;
}

export function PrepurchaseFollowup({ record, onResolved }: PrepurchaseFollowupProps) {
  const { t } = useI18n();
  const [answered, setAnswered] = useState<'want' | 'passed' | null>(null);

  const itemName = record.subject || t('chat.prepurchase.itemGeneric');

  const answer = async (stillWant: boolean) => {
    // 先消解防连点 (记录清除后回访条卸载), 上报失败静默 — 不追问用户第二遍
    resolvePendingPrepurchase();
    setAnswered(stillWant ? 'want' : 'passed');
    onResolved?.();
    if (stillWant) return; // 祝福分支零上报 — 买了不评判
    recordPrepurchaseLetGo(record.amount); // 改判放弃 → 金额此时才计入周累计
    try {
      await apiFetch('/api/buddy/health-events', {
        method: 'POST',
        body: {
          eventType: 'manual_adjustment',
          triggerSource: 'manual',
          description: 'Pre-purchase three questions success (24h follow-up: let it go)',
          metadata: {
            source: 'prepurchase_followup',
            prepurchase_success: true,
            ...(record.amount ? { guarded_amount: record.amount } : {}),
          },
        },
      });
    } catch (err) {
      // safe to ignore: 计数上报失败不弹错不阻塞 chat (祝福/成功文案照常展示)
      logger.warn('[prepurchase-followup] count report failed (silently skipped):', err instanceof Error ? err.message : String(err));
    }
  };

  if (answered) {
    return (
      <FollowupAnsweredBubble
        testId="prepurchase-followup-answered"
        answer={answered === 'want' ? t('chat.prepurchase.followupBlessing') : t('chat.prepurchase.followupSuccessNote')}
      />
    );
  }

  return (
    <FollowupBubble
      testId="prepurchase-followup"
      question={t('chat.prepurchase.followupQuestion', { item: itemName })}
      primaryAction={{
        label: t('chat.prepurchase.followupStillWant'),
        testId: 'prepurchase-followup-want',
        onSelect: () => {
          void answer(true);
        },
      }}
      secondaryAction={{
        label: t('chat.prepurchase.followupLetGo'),
        testId: 'prepurchase-followup-passed',
        onSelect: () => {
          void answer(false);
        },
      }}
    />
  );
}
