'use client';

/**
 * WeeklyReviewEntry — 周复盘固定入口条 (batch52-b)
 *
 * chat 顶部常驻轻入口 (小象主动发起之外的另一条路): 无数据周点击走引导态,
 * 已复盘周点击回看总结卡。条上只出引导语, 不出数字 (数字留给卡内)。
 */

import { CalendarCheck } from 'lucide-react';
import { useI18n } from '@/i18n/provider';

export interface WeeklyReviewEntryProps {
  onOpen: () => void;
}

export function WeeklyReviewEntry({ onOpen }: WeeklyReviewEntryProps) {
  const { t } = useI18n();

  return (
    <button
      onClick={onOpen}
      data-testid="weekly-review-entry"
      className="mt-2 mx-3 flex w-[calc(100%-1.5rem)] items-center gap-2 rounded-xl border border-glass-border bg-glass-fill px-3 py-2 text-left backdrop-blur-sm transition-colors hover:border-emerald-500/30"
    >
      <CalendarCheck className="h-3.5 w-3.5 shrink-0 text-text-tertiary" aria-hidden="true" />
      <span className="min-w-0 flex-1 text-[11px] leading-relaxed text-text-secondary">
        🐘 {t('chat.weeklyReview.entryHint')}
      </span>
    </button>
  );
}
