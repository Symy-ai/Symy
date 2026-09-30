'use client';

/**
 * ActiveGuardsEntry — 进行中守护面板固定入口条 (batch59-a)
 *
 * chat 顶部常驻轻入口 (与 guard-moments-entry 同模式):
 * 条上只出引导语, 不出数字 (数字留给面板内)。
 */

import { ShieldCheck, X } from 'lucide-react';
import { useI18n } from '@/i18n/provider';

export interface ActiveGuardsEntryProps {
  onOpen: () => void;
  /** 🔧 2026-09-30 (owner 需求): 入口条彻底关闭 — 点击后本会话不再出现 (use-entry-dismiss) */
  onDismiss?: () => void;
}

export function ActiveGuardsEntry({ onOpen, onDismiss }: ActiveGuardsEntryProps) {
  const { t } = useI18n();

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') onOpen(); }}
      data-testid="active-guards-entry"
      className="mt-2 mx-3 flex w-[calc(100%-1.5rem)] items-center gap-2 rounded-xl border border-glass-border bg-glass-fill px-3 py-2 text-left backdrop-blur-sm transition-colors hover:border-emerald-500/30"
    >
      <ShieldCheck className="h-3.5 w-3.5 shrink-0 text-text-tertiary" aria-hidden="true" />
      <span className="min-w-0 flex-1 text-[11px] leading-relaxed text-text-secondary">
        🐘 {t('chat.activeGuards.entryHint')}
      </span>
      {onDismiss && (
        <span
          role="button"
          tabIndex={0}
          aria-label={t('common.close', { defaultValue: 'Close' })}
          data-testid="active-guards-entry-dismiss"
          onClick={(e) => { e.stopPropagation(); onDismiss(); }}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.stopPropagation(); onDismiss(); } }}
          className="flex-shrink-0 rounded-lg p-1 text-text-tertiary transition-colors hover:bg-glass-hover hover:text-text-secondary"
        >
          <X className="h-3.5 w-3.5" aria-hidden="true" />
        </span>
      )}
    </div>
  );
}
