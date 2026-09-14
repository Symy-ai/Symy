'use client';

import { useState } from 'react';
import { useI18n } from '@/i18n/provider';
import { reportDuplicateDecision, savePendingReuseConfirmation } from './duplicate-purchase-store';
import type { DuplicatePrecheckCardData, DuplicatePrecheckDecision } from '@/types/duplicate-purchase';

export function DuplicatePrecheckCard({ data }: { data: DuplicatePrecheckCardData }) {
  const { t } = useI18n();
  const [decision, setDecision] = useState<DuplicatePrecheckDecision | null>(null);
  const itemName = data.itemTitle === 'it' ? t('chat.duplicatePrecheck.genericItem') : data.itemTitle;

  const act = (choice: DuplicatePrecheckDecision) => {
    if (decision) return;
    setDecision(choice);
    if (choice === 'reuse') savePendingReuseConfirmation(data);
    reportDuplicateDecision(data, choice);
  };

  return (
    <aside
      className="mt-3 rounded-xl border border-glass-border bg-glass-fill p-3 backdrop-blur-sm"
      aria-label={t('chat.duplicatePrecheck.title')}
      data-testid="duplicate-precheck-card"
    >
      <h4 className="flex items-center gap-1.5 text-xs font-medium text-text-primary">
        <span aria-hidden>🐘</span>
        <span>{t('chat.duplicatePrecheck.title')}</span>
      </h4>
      <p className="mt-1.5 text-xs leading-relaxed text-text-secondary">
        {t('chat.duplicatePrecheck.pause', { item: itemName })}
      </p>
      <p className="mt-1 text-[11px] text-text-tertiary">
        {t(`chat.duplicatePrecheck.places.${data.category}`)}
      </p>
      {decision ? (
        <p className="mt-2 border-t border-glass-border pt-2 text-[11px] text-text-secondary" data-testid="duplicate-precheck-decision">
          {decision === 'reuse' ? t('chat.duplicatePrecheck.reuseNote') : t('chat.duplicatePrecheck.waitNote')}
        </p>
      ) : (
        <div className="mt-2 flex flex-wrap gap-2 border-t border-glass-border pt-2">
          <button type="button" onClick={() => act('reuse')} className="rounded-lg border border-glass-border bg-glass-fill px-3 py-1.5 text-[11px] font-medium text-text-primary hover:border-emerald-500/30" data-testid="duplicate-precheck-reuse">
            {t('chat.duplicatePrecheck.reuseButton')}
          </button>
          <button type="button" onClick={() => act('wait')} className="rounded-lg px-3 py-1.5 text-[11px] font-medium text-text-tertiary hover:text-text-secondary" data-testid="duplicate-precheck-wait">
            {t('chat.duplicatePrecheck.waitButton')}
          </button>
        </div>
      )}
    </aside>
  );
}
