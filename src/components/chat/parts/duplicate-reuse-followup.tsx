'use client';

import { useState } from 'react';
import { useI18n } from '@/i18n/provider';
import { clearPendingReuseConfirmation, reportReuseConclusion } from './duplicate-purchase-store';
import type { DuplicatePrecheckCardData } from '@/types/duplicate-purchase';

export function DuplicateReuseFollowup({ card, decisionId, onResolved }: { card: DuplicatePrecheckCardData; decisionId: string; onResolved?: () => void }) {
  const { t } = useI18n();
  const [answered, setAnswered] = useState<'avoided' | 'bought' | null>(null);
  const itemName = card.itemTitle === 'it' ? t('chat.duplicatePrecheck.genericItem') : card.itemTitle;

  const answer = (avoided: boolean) => {
    clearPendingReuseConfirmation();
    reportReuseConclusion(decisionId, avoided);
    setAnswered(avoided ? 'avoided' : 'bought');
    onResolved?.();
  };

  return (
    <div className="mx-3 mt-2 rounded-xl border border-glass-border bg-glass-fill p-2.5 text-[11px] text-text-secondary" data-testid="duplicate-reuse-followup">
      {answered ? (
        <span data-testid="duplicate-reuse-followup-answered">
          {answered === 'avoided' ? t('chat.duplicatePrecheck.followupAvoided') : t('chat.duplicatePrecheck.followupBought')}
        </span>
      ) : (
        <div className="flex items-center gap-2">
          <span className="min-w-0 flex-1">{t('chat.duplicatePrecheck.followupQuestion', { item: itemName })}</span>
          <button type="button" onClick={() => answer(true)} className="rounded-lg border border-glass-border px-2.5 py-1 font-medium text-text-primary" data-testid="duplicate-reuse-avoided">{t('chat.duplicatePrecheck.followupAvoidedButton')}</button>
          <button type="button" onClick={() => answer(false)} className="px-2 py-1 text-text-tertiary" data-testid="duplicate-reuse-bought">{t('chat.duplicatePrecheck.followupBoughtButton')}</button>
        </div>
      )}
    </div>
  );
}
