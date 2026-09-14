'use client';

/**
 * GuardMomentsEntry — 守护时刻时间线固定入口条 (batch58-a)
 *
 * chat 顶部常驻轻入口 (与 weekly-review / green-commitment 同模式):
 * 条上只出引导语, 不出数字 (数字留给时间线卡内)。
 */

import { Milestone } from 'lucide-react';
import { useI18n } from '@/i18n/provider';

export interface GuardMomentsEntryProps {
  onOpen: () => void;
}

export function GuardMomentsEntry({ onOpen }: GuardMomentsEntryProps) {
  const { t } = useI18n();

  return (
    <button
      onClick={onOpen}
      data-testid="guard-moments-entry"
      className="mt-2 mx-3 flex w-[calc(100%-1.5rem)] items-center gap-2 rounded-xl border border-glass-border bg-glass-fill px-3 py-2 text-left backdrop-blur-sm transition-colors hover:border-emerald-500/30"
    >
      <Milestone className="h-3.5 w-3.5 shrink-0 text-text-tertiary" aria-hidden="true" />
      <span className="min-w-0 flex-1 text-[11px] leading-relaxed text-text-secondary">
        🐘 {t('chat.guardMoments.entryHint')}
      </span>
    </button>
  );
}
