"use client";

import { Leaf, PartyPopper } from 'lucide-react';
import { useI18n } from '@/i18n/provider';

export interface CheckoutSuccessPanelProps {
  greenCount: number;
  totalHours: string;
  toastVisible: boolean;
}

export function CheckoutSuccessPanel({ greenCount, totalHours, toastVisible }: CheckoutSuccessPanelProps) {
  const { t } = useI18n();
  return (
    <section className="px-4 py-8 text-center" data-testid="checkout-success">
      <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-emerald-500/15 text-2xl" aria-hidden>
        🐘
      </div>
      <h3 className="mt-4 flex items-center justify-center gap-2 text-sm font-bold text-text-primary">
        <PartyPopper className="h-4 w-4 text-emerald-400" aria-hidden />
        {t('chat.cart.successTitle')}
      </h3>
      <p className="mt-2 text-xs text-text-secondary">{t('chat.cart.successBody')}</p>
      <p className="mt-4 inline-flex items-center gap-2 rounded-full bg-emerald-500/15 px-3 py-1.5 text-xs font-medium text-emerald-600 dark:text-emerald-400">
        <Leaf className="h-3.5 w-3.5" aria-hidden />
        {t('chat.cart.successSummary', { greenCount, hours: totalHours })}
      </p>
      {toastVisible && (
        <div className="fixed bottom-6 left-1/2 z-[230] -translate-x-1/2 rounded-full bg-emerald-500 px-4 py-2 text-xs font-semibold text-white shadow-lg">
          {t('chat.cart.successToast')}
        </div>
      )}
    </section>
  );
}
