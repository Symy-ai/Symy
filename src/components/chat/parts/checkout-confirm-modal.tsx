"use client";

import { ShieldCheck, X } from 'lucide-react';
import { useI18n } from '@/i18n/provider';

export interface CheckoutConfirmModalProps {
  greenCount: number;
  nonGreenCount: number;
  total: string;
  totalHours: string;
  submitting: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function CheckoutConfirmModal({
  greenCount,
  nonGreenCount,
  total,
  totalHours,
  submitting,
  onConfirm,
  onCancel,
}: CheckoutConfirmModalProps) {
  const { t } = useI18n();
  return (
    <div className="fixed inset-0 z-[220] flex items-end justify-center bg-black/50 backdrop-blur-sm" onClick={onCancel}>
      <div
        className="w-full max-w-md rounded-t-3xl border border-glass-border bg-surface-1 p-5 animate-in slide-in-from-bottom duration-300"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="checkout-confirm-title"
      >
        <div className="flex items-start justify-between gap-3">
          <h3 id="checkout-confirm-title" className="flex items-center gap-2 text-base font-bold text-text-primary">
            <ShieldCheck className="h-4 w-4 text-emerald-400" aria-hidden />
            {t('chat.cart.confirmTitle')}
          </h3>
          <button onClick={onCancel} className="text-text-secondary hover:text-text-primary" aria-label={t('common.close')} disabled={submitting}>
            <X className="h-5 w-5" />
          </button>
        </div>
        <p className="mt-3 text-sm text-text-secondary">{t('chat.cart.confirmBody', { greenCount, nonGreenCount })}</p>
        <dl className="mt-4 space-y-2 rounded-2xl bg-glass-fill p-4 text-sm">
          <div className="flex justify-between gap-3">
            <dt className="text-text-tertiary">{t('chat.cart.greenCount')}</dt>
            <dd className="font-semibold text-emerald-500">{greenCount}</dd>
          </div>
          {nonGreenCount > 0 && (
            <div className="flex justify-between gap-3">
              <dt className="text-text-tertiary">{t('chat.cart.nonGreenCount')}</dt>
              <dd className="font-semibold text-text-secondary">{nonGreenCount}</dd>
            </div>
          )}
          <div className="flex justify-between gap-3">
            <dt className="text-text-tertiary">{t('chat.cart.total')}</dt>
            <dd className="font-bold text-text-primary">{total}</dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="text-text-tertiary">{t('chat.cart.totalHoursLabel')}</dt>
            <dd className="font-semibold text-text-primary">{totalHours}</dd>
          </div>
        </dl>
        <p className="mt-3 text-xs text-text-tertiary">{t('chat.cart.checkoutHonesty')}</p>
        <div className="mt-5 flex gap-3">
          <button
            onClick={onConfirm}
            disabled={submitting}
            className="flex-1 rounded-full bg-emerald-500 px-4 py-2.5 text-sm font-bold text-white transition-colors hover:bg-emerald-600 disabled:opacity-60"
          >
            {submitting ? t('chat.cart.submitting') : t('chat.cart.confirmCheckout')}
          </button>
          <button
            onClick={onCancel}
            disabled={submitting}
            className="flex-1 rounded-full border border-glass-border px-4 py-2.5 text-sm font-semibold text-text-secondary transition-colors hover:text-text-primary disabled:opacity-60"
          >
            {t('chat.cart.cancelCheckout')}
          </button>
        </div>
      </div>
    </div>
  );
}
