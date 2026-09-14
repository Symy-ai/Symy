'use client';

/**
 * EmotionGuardCheckin — 「先等 10 分钟」到期待追问条 (一次性, batch60-c)
 *
 * 用户在情绪守护卡选了等待、之后刷新/换会话回来 (卡已不在历史里) 时, 由
 * localStorage 等待记录驱动, 到期后在此追问「现在还想买吗」:
 *   - 还想买 → 真诚祝福 (零事件, 买了不评判)
 *   - 放下了 → 写一次 manual_adjustment 审计 (choice=wait_passed, 同 mood
 *     同日幂等), metadata 只有 source/mood/choice
 * 二选一后记录消解 (localStorage), 追问条不再出现。
 */

import { useState } from 'react';
import { useI18n } from '@/i18n/provider';
import { reportEmotionGuardEvent, resolveEmotionWait } from '@/components/chat/parts/emotion-guard-store';
import type { PendingEmotionWait } from '@/types/emotion-guard';

export interface EmotionGuardCheckinProps {
  record: PendingEmotionWait;
}

export function EmotionGuardCheckin({ record }: EmotionGuardCheckinProps) {
  const { t } = useI18n();
  const [answered, setAnswered] = useState<'want' | 'passed' | null>(null);

  const answer = (stillWant: boolean) => {
    // 先消解防连点 (记录清除后追问条卸载); 审计失败静默 — 不追问用户第二遍
    resolveEmotionWait();
    setAnswered(stillWant ? 'want' : 'passed');
    if (stillWant) return; // 祝福分支零上报 — 买了不评判
    reportEmotionGuardEvent(record.mood, 'wait_passed');
  };

  if (answered) {
    return (
      <div
        data-testid="emotion-guard-checkin-answered"
        className="mt-2 mx-3 p-2.5 rounded-xl bg-glass-fill border border-glass-border text-[11px] text-text-secondary"
      >
        🐘 {answered === 'want' ? t('chat.emotionGuard.checkinBlessing') : t('chat.emotionGuard.checkinSuccessNote')}
      </div>
    );
  }

  return (
    <div
      data-testid="emotion-guard-checkin-bar"
      className="mt-2 mx-3 p-2.5 rounded-xl bg-glass-fill border border-glass-border flex items-center gap-2"
    >
      <span className="text-[11px] text-text-secondary flex-1 min-w-0">
        🐘 {t('chat.emotionGuard.checkinQuestion')}
      </span>
      <button
        onClick={() => answer(true)}
        className="shrink-0 px-2.5 py-1 rounded-lg border border-glass-border bg-glass-fill text-[11px] font-medium text-text-primary transition-colors hover:border-emerald-500/30"
        data-testid="emotion-guard-checkin-want"
      >
        {t('chat.emotionGuard.checkinStillWant')}
      </button>
      <button
        onClick={() => answer(false)}
        className="shrink-0 rounded-lg px-2 py-1 text-[11px] font-medium text-text-tertiary transition-colors hover:text-text-secondary"
        data-testid="emotion-guard-checkin-passed"
      >
        {t('chat.emotionGuard.checkinLetGo')}
      </button>
    </div>
  );
}
