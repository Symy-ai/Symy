'use client';

import type { GuardPolicyChange } from '@/lib/guard-policy-diff';
import type { useI18n } from '@/i18n/provider';

type Locale = ReturnType<typeof useI18n>['locale'];

function localeText(value: { zh: string; en: string }, locale: Locale): string {
  return locale === 'zh' ? value.zh : value.en;
}

export type GuardPolicyReceiptStatus = 'saved' | 'incomplete' | 'restored' | 'restore-failed';

export function GuardPolicyReceiptCard({
  changes,
  status,
  isRestoring,
  locale,
  t,
  onRestore,
  onClose,
}: {
  changes: readonly GuardPolicyChange[];
  status: GuardPolicyReceiptStatus;
  isRestoring: boolean;
  locale: Locale;
  t: (key: string) => string;
  onRestore: () => void;
  onClose: () => void;
}) {
  return (
    <div
      className="rounded-xl border border-glass-border bg-glass-fill p-3 space-y-2"
      data-testid="guard-policy-receipt"
      data-status={status}
    >
      <p className="text-xs font-medium text-text-primary" data-testid="guard-policy-receipt-title">
        {status === 'saved' ? t('profile.guardPolicyReceiptApplied').replace('{count}', String(changes.length)) : t('profile.guardPolicyReceiptTitle')}
      </p>
      <div className="space-y-1" data-testid="guard-policy-receipt-rows">
        {changes.map((change) => (
          <p key={change.field} className="text-[11px] leading-relaxed text-text-secondary" data-testid={`guard-policy-receipt-${change.field}`}>
            {`${localeText(change.label, locale)}: ${localeText(change.before, locale)} → ${localeText(change.after, locale)}. ${localeText(change.effect, locale)}`}
          </p>
        ))}
      </div>
      {status === 'incomplete' && (
        <p className="text-[11px] text-amber-300/90" data-testid="guard-policy-incomplete-warning">
          {t('profile.guardPolicyIncompleteWarning')}
        </p>
      )}
      {status === 'restore-failed' && (
        <p className="text-[11px] text-amber-300/90" data-testid="guard-policy-restore-warning">
          {t('profile.guardPolicyRestoreFailedWarning')}
        </p>
      )}
      <div className="flex gap-2">
        <button
          type="button"
          onClick={onRestore}
          disabled={isRestoring}
          className="px-2.5 py-1.5 text-[11px] rounded-lg border border-glass-border bg-glass-fill text-text-secondary hover:bg-glass-hover cursor-pointer disabled:opacity-50"
          data-testid="guard-policy-restore"
        >
          {isRestoring ? t('profile.guardPolicyRestoring') : t('profile.guardPolicyRestorePrevious')}
        </button>
        <button
          type="button"
          onClick={onClose}
          className="px-2.5 py-1.5 text-[11px] rounded-lg bg-gradient-to-r from-cyan-500 to-purple-500 text-white font-medium cursor-pointer"
          data-testid="guard-policy-receipt-close"
        >
          {t('profile.guardPolicyReceiptDone')}
        </button>
      </div>
    </div>
  );
}
