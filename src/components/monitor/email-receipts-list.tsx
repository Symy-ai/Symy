/**
 * EmailReceiptsList — 邮箱收据列表（从 monitor-tab.tsx 抽出，C3 拆分）
 *
 * 行为零变化。
 */

'use client';

import {
  MessageCircle, RotateCcw, CheckCircle2, DollarSign, Clock,
} from 'lucide-react';
import { useI18n } from '@/i18n/provider';
import { moneyToFreedomLabel } from '@/lib/freedom-time';
import { cn, formatPlatformName } from '@/lib/utils';
import { useHourlyRate } from '@/hooks/use-hourly-rate';
import { getPlatformEmoji, formatReceiptTime } from './helpers';
import type { EmailReceiptsListProps } from './types';

export function EmailReceiptsList({
  receipts,
  onTalkToAI,
  onIgnore,
  onRefund,
  onMarkRefunded,
  isDemoMode = false,
}: EmailReceiptsListProps) {
  const { t } = useI18n();
  const { locale } = useI18n();
  const { hourlyRate } = useHourlyRate(isDemoMode);

  // BUG-3 FIX: Separate actionable and refunding receipts for display
  const actionableReceipts = receipts.filter((r) => r.status !== 'refunding');
  const refundingReceipts = receipts.filter((r) => r.status === 'refunding');

  if (receipts.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <div className="w-16 h-16 rounded-full bg-green-500/10 flex items-center justify-center mb-4">
          <CheckCircle2 className="w-8 h-8 text-green-500" />
        </div>
        {/* 🔧 N15 fix: In demo mode, guide users to Notifications tab for demo data */}
        <p className="text-text-secondary text-sm">{isDemoMode ? t('monitor.demoNoReceipts') : t('monitor.noActionableReceipts')}</p>
        <p className="text-text-tertiary text-xs mt-1">{isDemoMode ? t('monitor.demoNoReceiptsHint') : t('monitor.allPurchasesIntentional')}</p>
      </div>
    );
  }

  return (
    <div className="space-y-2.5">
      {/* BUG-3 FIX: "Refund Pending" section — shown above actionable receipts */}
      {refundingReceipts.length > 0 && (
        <div className="mb-2">
          <p className="text-xs text-amber-400 font-medium mb-2 flex items-center gap-1.5">
            <RotateCcw className="w-3 h-3" />
            {t('monitor.refundPendingSection', { n: refundingReceipts.length })}
          </p>
          {refundingReceipts.map((receipt) => (
            <div
              key={receipt.id}
              className="rounded-xl p-3 border bg-amber-500/8 border-amber-500/20 mb-2.5"
            >
              {/* Refund pending badge + header */}
              <div className="flex items-start gap-2.5 mb-2">
                <div className="flex-shrink-0 w-9 h-9 rounded-lg flex items-center justify-center text-sm bg-amber-500/20 text-amber-400">
                  {getPlatformEmoji(receipt.platform)}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium text-text-primary truncate">
                      {(receipt.item_name || receipt.subject || '').length > 60
                        ? (receipt.item_name || receipt.subject || '').substring(0, 60) + '...'
                        : receipt.item_name || receipt.subject}
                    </p>
                  </div>
                  <p className="text-xs text-amber-400 font-medium">{t('monitor.refundPending')}</p>
                </div>
                <div className="text-sm font-bold text-amber-400">
                  {receipt.amount ? `${receipt.currency || '$'} ${receipt.amount.toFixed(2)}` : ''}
                </div>
              </div>

              {/* Manual refund guidance */}
              <p className="text-xs text-text-secondary mb-2">
                {t('monitor.refundGuidance', { platform: formatPlatformName(receipt.platform) })}
              </p>

              {/* Action: Mark as Refunded */}
              <div className="flex gap-2">
                {onMarkRefunded && (
                  <button
                    type="button"
                    onClick={() => onMarkRefunded(receipt.id)}
                    className="flex-1 flex items-center justify-center gap-1.5 px-2 py-2.5 rounded-lg bg-green-500/20 text-green-600 dark:text-green-400 text-xs font-medium hover:bg-green-500/30 transition-colors active:scale-95 cursor-pointer select-none"
                  >
                    <CheckCircle2 className="w-3 h-3" />
                    {t('monitor.markRefunded')}
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => onIgnore(receipt.id)}
                  className="px-3 py-2.5 rounded-lg bg-glass-fill text-text-secondary text-xs hover:bg-glass-fill-strong transition-colors active:scale-95 cursor-pointer select-none"
                >
                  {t('monitor.ignore')}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Actionable receipts (normal view) */}
      {actionableReceipts.map((receipt) => (
        <div
          key={receipt.id}
          className={cn(
            'rounded-xl p-3 border',
            receipt.impulse_score >= 60
              ? 'bg-amber-500/10 border-amber-600/30'
              : receipt.impulse_score >= 30
                ? 'bg-yellow-500/10 border-yellow-500/30'
                : 'bg-glass-fill border-glass-border',
          )}
        >
          {/* Header */}
          <div className="flex items-start gap-2.5 mb-2">
            <div className={cn(
              'flex-shrink-0 w-9 h-9 rounded-lg flex items-center justify-center text-sm',
              receipt.impulse_score >= 60 ? 'bg-amber-500/20 text-amber-600 dark:text-amber-400' :
              receipt.impulse_score >= 30 ? 'bg-yellow-500/20 text-yellow-400' :
              'bg-glass-fill text-text-secondary',
            )}>
              {getPlatformEmoji(receipt.platform)}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-text-primary truncate">
                {(receipt.item_name || receipt.subject || '').length > 60
                  ? (receipt.item_name || receipt.subject || '').substring(0, 60) + '...'
                  : receipt.item_name || receipt.subject}
              </p>
              <p className="text-xs text-text-secondary truncate">{receipt.from_address}</p>
            </div>
            <div className={cn(
              'text-xs font-semibold',
              receipt.impulse_score >= 60 ? 'text-amber-600 dark:text-amber-400' :
              receipt.impulse_score >= 30 ? 'text-yellow-400' :
              'text-green-400',
            )}>
              {receipt.impulse_score}
            </div>
          </div>

          {/* Details */}
          <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-text-secondary mb-2">
            {receipt.amount && (
              <span className="flex flex-col">
                <span className="flex items-center gap-1">
                  <DollarSign className="w-3 h-3" />
                  {receipt.currency} {receipt.amount.toFixed(2)}
                </span>
                <span className="text-[10px] text-text-tertiary">
                  ≈ {moneyToFreedomLabel(receipt.amount, locale, hourlyRate)}
                  {t('monitor.freedomTimeSuffix', { defaultValue: locale === 'zh' ? '自由时间' : ' of freedom' })}
                </span>
              </span>
            )}
            {receipt.order_id && (
              <span>{t('monitor.order')}: {receipt.order_id}</span>
            )}
            <span className="flex items-center gap-1">
              <Clock className="w-3 h-3" />
              {formatReceiptTime(receipt.received_at, t)}
            </span>
            {receipt.refund_eligible && (
              <span className="text-green-400 flex items-center gap-0.5">
                <CheckCircle2 className="w-3 h-3" />
                {t('monitor.refundable')}
              </span>
            )}
          </div>

          {/* Actions */}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() =>
                onTalkToAI({
                  platform: receipt.platform,
                  amount: receipt.amount || 0,
                  reasons: [`Email receipt from ${formatPlatformName(receipt.platform)}`],
                  time: new Date(receipt.received_at).toLocaleTimeString(),
                })
              }
              className="flex-1 flex items-center justify-center gap-1.5 px-2 py-2.5 rounded-lg bg-green-500/20 text-green-600 dark:text-green-400 text-xs font-medium hover:bg-green-500/30 transition-colors active:scale-95 cursor-pointer select-none"
            >
              <MessageCircle className="w-3 h-3" />
              {t('monitor.talkToAI')}
            </button>
            {receipt.refund_eligible && (
              <button
                type="button"
                onClick={() => onRefund(receipt.id)}
                className="flex-1 flex items-center justify-center gap-1.5 px-2 py-2.5 rounded-lg bg-red-500/20 text-red-400 text-xs font-medium hover:bg-red-500/30 transition-colors active:scale-95 cursor-pointer select-none"
              >
                <RotateCcw className="w-3 h-3" />
                {t('monitor.refund')}
              </button>
            )}
            <button
              type="button"
              onClick={() => onIgnore(receipt.id)}
              className="px-3 py-2.5 rounded-lg bg-glass-fill text-text-secondary text-xs hover:bg-glass-fill-strong transition-colors active:scale-95 cursor-pointer select-none"
            >
              {t('monitor.ignore')}
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
