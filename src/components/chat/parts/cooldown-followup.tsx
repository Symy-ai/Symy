'use client';

/**
 * CooldownFollowup — 冷静卡次日回访条 (一次性, batch48-b)
 *
 * 冷静卡确认 24h 后, 下次打开 chat 时展示: 「昨天那件 XX, 还想要吗?」二选一。
 *   - 还想要 → 真诚祝福 (守护过程而非结果, 荣誉框架不破)
 *   - 不要了 → 记一次「冷静守护成功」: POST /api/buddy/health-events
 *     (eventType=manual_adjustment — 客户端唯一允许的纯审计类型, 零 vitality 副作用;
 *     只计次数不涉金额, metadata 标 cooldown_success 供守护统计消费)
 * 用户二选一后记录消解 (localStorage), 回访条不再出现。
 */

import { useState } from 'react';
import { useI18n } from '@/i18n/provider';
import { apiFetch } from '@/lib/api-client';
import { logger } from '@/lib/logger';
import { resolvePendingCooldown } from '@/components/chat/parts/cooldown-store';
import type { PendingCooldownFollowup } from '@/types/cooldown';

export interface CooldownFollowupProps {
  record: PendingCooldownFollowup;
}

export function CooldownFollowup({ record }: CooldownFollowupProps) {
  const { t } = useI18n();
  const [answered, setAnswered] = useState<'want' | 'passed' | null>(null);

  const itemName = record.category
    ? t(`chat.cooldown.itemName.${record.category}`)
    : t('chat.cooldown.itemGeneric');

  const answer = async (stillWant: boolean) => {
    // 先消解防连点 (记录清除后回访条卸载), 上报失败静默 — 不追问用户第二遍
    resolvePendingCooldown();
    setAnswered(stillWant ? 'want' : 'passed');
    if (stillWant) return; // 祝福分支零上报 — 买了不评判
    try {
      await apiFetch('/api/buddy/health-events', {
        method: 'POST',
        body: {
          eventType: 'manual_adjustment',
          triggerSource: 'manual',
          description: 'Cooldown guard success (24h wishlist follow-up: let it go)',
          metadata: { source: 'cooldown_followup', cooldown_success: true, category: record.category },
        },
      });
    } catch (err) {
      // safe to ignore: 计数上报失败不弹错不阻塞 chat (祝福/成功文案照常展示)
      logger.warn('[cooldown-followup] count report failed (silently skipped):', err instanceof Error ? err.message : String(err));
    }
  };

  if (answered) {
    return (
      <div
        data-testid="cooldown-followup-answered"
        className="mt-2 mx-3 p-2.5 rounded-xl bg-glass-fill border border-glass-border text-[11px] text-text-secondary"
      >
        🐘 {answered === 'want' ? t('chat.cooldown.followupBlessing') : t('chat.cooldown.followupSuccessNote')}
      </div>
    );
  }

  return (
    <div
      data-testid="cooldown-followup"
      className="mt-2 mx-3 p-2.5 rounded-xl bg-glass-fill border border-glass-border flex items-center gap-2"
    >
      <span className="text-[11px] text-text-secondary flex-1 min-w-0">
        🐘 {t('chat.cooldown.followupQuestion', { item: itemName })}
      </span>
      <button
        onClick={() => answer(true)}
        className="shrink-0 px-2.5 py-1 rounded-lg border border-glass-border bg-glass-fill text-[11px] font-medium text-text-primary transition-colors hover:border-emerald-500/30"
        data-testid="cooldown-followup-want"
      >
        {t('chat.cooldown.followupStillWant')}
      </button>
      <button
        onClick={() => answer(false)}
        className="shrink-0 rounded-lg px-2 py-1 text-[11px] font-medium text-text-tertiary transition-colors hover:text-text-secondary"
        data-testid="cooldown-followup-passed"
      >
        {t('chat.cooldown.followupLetGo')}
      </button>
    </div>
  );
}
