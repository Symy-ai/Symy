/**
 * EmailConnectionCard — 邮箱连接卡片（从 monitor-tab.tsx 抽出，C3 拆分）
 *
 * 行为零变化。
 */

'use client';

import { useState } from 'react';
import { Mail, MailCheck, MailX, RefreshCw, Trash2, ExternalLink, Timer, AlertTriangle } from 'lucide-react';
import { useI18n } from '@/i18n/provider';
import { cn } from '@/lib/utils';
import { formatCountdown } from './helpers';
import type { EmailConnectionCardProps } from './types';

export function EmailConnectionCard({
  connections,
  isConnecting,
  isLoadingEmail,
  onConnectGmail,
  onConnectIMAP,
  onDisconnect,
  onScan,
  isScanning,
  scanResult,
  actionableCount,
  autoSyncEnabled,
  nextSyncIn,
  onToggleAutoSync,
}: EmailConnectionCardProps) {
  const { t } = useI18n();
  const [showIMAPForm, setShowIMAPForm] = useState(false);
  const [imapEmail, setImapEmail] = useState('');
  const [imapAuthCode, setImapAuthCode] = useState('');

  const activeConnection = connections.find((c) => c.status === 'active');

  // Loading skeleton
  if (isLoadingEmail) {
    return (
      <div className="bg-glass-fill border border-glass-border rounded-2xl p-4 mb-4 animate-pulse">
        <div className="flex items-center gap-3 mb-3">
          <div className="w-10 h-10 rounded-xl bg-glass-fill" />
          <div className="flex-1 space-y-2">
            <div className="h-4 bg-glass-fill rounded w-1/3" />
            <div className="h-3 bg-glass-fill rounded w-2/3" />
          </div>
        </div>
        <div className="h-9 bg-glass-fill rounded-xl" />
      </div>
    );
  }

  // Active connection card (green)
  if (activeConnection) {
    const isIMAP = activeConnection.provider?.startsWith('imap_');
    const providerLabel = isIMAP ? t('monitor.imapConnected') : t('monitor.gmailConnected');

    return (
      <div className="bg-green-500/10 border border-green-500/30 rounded-2xl p-4 mb-4">
        <div className="flex items-center gap-3 mb-3">
          <div className="w-10 h-10 rounded-xl bg-green-500/20 flex items-center justify-center">
            <MailCheck className="w-5 h-5 text-green-400" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-green-400">{providerLabel}</p>
            <p className="text-xs text-text-secondary truncate">{activeConnection.email_address}</p>
          </div>
          <button
            onClick={() => onDisconnect(activeConnection.id)}
            className="p-2 rounded-lg hover:bg-red-500/10 text-icon-muted hover:text-red-400 transition-colors active:scale-90 cursor-pointer select-none"
            title={t('monitor.disconnect')}
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>

        {/* Auto-sync toggle + Re-sync button */}
        <div className="flex gap-2">
          <button
            onClick={onScan}
            disabled={isScanning}
            className={cn(
              'flex-1 flex items-center justify-center gap-2 py-2 rounded-xl text-sm font-medium transition-all',
              isScanning
                ? 'bg-glass-fill-strong text-text-secondary cursor-wait'
                : 'bg-green-500/20 text-green-400 hover:bg-green-500/30 active:scale-95',
            )}
          >
            <RefreshCw className={cn('w-4 h-4', isScanning && 'animate-spin')} />
            {isScanning ? t('monitor.syncing') : t('monitor.reSync')}
          </button>
          <button
            onClick={onToggleAutoSync}
            className={cn(
              'px-3 py-2 rounded-xl text-xs font-medium transition-all flex items-center gap-1.5',
              autoSyncEnabled
                ? 'bg-blue-500/20 text-blue-400 hover:bg-blue-500/30 active:scale-95'
                : 'bg-glass-fill text-text-tertiary hover:bg-glass-fill-strong active:scale-95',
            )}
            title={autoSyncEnabled ? t('monitor.autoSyncOn') : t('monitor.autoSyncOff')}
          >
            <Timer className="w-3.5 h-3.5" />
            {autoSyncEnabled ? formatCountdown(nextSyncIn, t) : t('monitor.off')}
          </button>
        </div>

        {scanResult && (
          <div className="mt-2 text-xs text-text-secondary">
            {t('monitor.scannedEmails', { n: scanResult.scanned, m: scanResult.newReceipts })}
          </div>
        )}

        {actionableCount > 0 && (
          <div className="mt-2 flex items-center gap-1.5 text-xs text-yellow-400">
            <AlertTriangle className="w-3 h-3" />
            {t('monitor.purchasesNeedAttention', { n: actionableCount })}
          </div>
        )}

        <div className="mt-1.5 flex items-center justify-between">
          {activeConnection.last_sync_at && (
            <div className="text-[10px] text-text-tertiary">
              {t('monitor.lastSync')} {new Date(activeConnection.last_sync_at).toLocaleString()}
            </div>
          )}
          {autoSyncEnabled && (
            <div className="text-[10px] text-blue-400/60 flex items-center gap-1">
              <Timer className="w-2.5 h-2.5" />
              {t('monitor.autoEvery5m')}
            </div>
          )}
        </div>
      </div>
    );
  }

  // Expired connection card (yellow)
  const expiredConnection = connections.find((c) => c.status === 'expired');
  if (expiredConnection) {
    return (
      <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-2xl p-4 mb-4">
        <div className="flex items-center gap-3 mb-3">
          <div className="w-10 h-10 rounded-xl bg-yellow-500/20 flex items-center justify-center">
            <MailX className="w-5 h-5 text-yellow-400" />
          </div>
          <div className="flex-1">
            <p className="text-sm font-medium text-yellow-400">{t('monitor.gmailTokenExpired')}</p>
            <p className="text-xs text-text-secondary">{expiredConnection.email_address}</p>
          </div>
        </div>
        <button
          onClick={onConnectGmail}
          disabled={isConnecting}
          className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-yellow-500/20 text-yellow-400 text-sm font-medium hover:bg-yellow-500/30 transition-colors active:scale-95"
        >
          <RefreshCw className="w-4 h-4" />
          {t('monitor.reAuthorizeGmail')}
        </button>
      </div>
    );
  }

  // Not connected card with Gmail + IMAP options
  return (
    <div className="bg-glass-fill border border-glass-border rounded-2xl p-4 mb-4">
      <div className="flex items-center gap-3 mb-3">
        <div className="w-10 h-10 rounded-xl bg-symy-blue/40 flex items-center justify-center">
          <Mail className="w-5 h-5 text-blue-300" />
        </div>
        <div className="flex-1">
          <p className="text-sm font-medium text-text-primary">{t('monitor.connectYourEmail')}</p>
          <p className="text-xs text-text-secondary">{t('monitor.connectEmailDesc')}</p>
        </div>
      </div>

      {!showIMAPForm ? (
        <>
          <div className="flex gap-2 mb-2">
            <button
              onClick={onConnectGmail}
              disabled={isConnecting}
              className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-symy-blue text-white text-sm font-medium hover:bg-symy-blue/90 transition-colors active:scale-95"
            >
              {isConnecting ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  {t('monitor.connecting')}
                </>
              ) : (
                <>
                  <ExternalLink className="w-4 h-4" />
                  {t('monitor.connectGmail')}
                </>
              )}
            </button>
            <button
              onClick={() => setShowIMAPForm(true)}
              disabled={isConnecting}
              className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-glass-fill-strong text-text-secondary text-sm font-medium hover:bg-glass-fill-strong transition-colors active:scale-95"
            >
              <Mail className="w-4 h-4" />
              {t('monitor.connectIMAP')}
            </button>
          </div>
          <p className="text-[10px] text-text-tertiary text-center">
            {t('monitor.privacyNote')}
          </p>
        </>
      ) : (
        <div className="space-y-2.5">
          <div>
            <label className="text-xs text-text-secondary mb-1 block">{t('monitor.emailAddress')}</label>
            <input
              type="email"
              value={imapEmail}
              onChange={(e) => setImapEmail(e.target.value)}
              placeholder={t('monitor.imapPlaceholder')}
              className="w-full px-3 py-2 rounded-lg bg-glass-fill border border-glass-border text-sm text-text-primary placeholder:text-text-tertiary focus:outline-none focus:border-green-500/50 focus:ring-1 focus:ring-green-500/30 transition-colors"
            />
          </div>
          <div>
            <label className="text-xs text-text-secondary mb-1 block">{t('monitor.authorizationCode')}</label>
            <input
              type="password"
              value={imapAuthCode}
              onChange={(e) => setImapAuthCode(e.target.value)}
              placeholder={t('monitor.imapAuthPlaceholder')}
              className="w-full px-3 py-2 rounded-lg bg-glass-fill border border-glass-border text-sm text-text-primary placeholder:text-text-tertiary focus:outline-none focus:border-green-500/50 focus:ring-1 focus:ring-green-500/30 transition-colors"
            />
            <p className="text-[10px] text-text-tertiary mt-1">
              {t('monitor.imapHelpText')}
            </p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={async () => {
                if (imapEmail && imapAuthCode) {
                  // 🔧 ARCH fix (Round 26 R25-18 — 表单在 onConnectIMAP resolve 前清空):
                  //    旧代码同步清空表单 + 隐藏, 若 onConnectIMAP 失败用户失去输入。
                  //    根因修复: 等 onConnectIMAP 完成 (成功才清表单, 失败保留输入让用户修改重试)。
                  try {
                    await onConnectIMAP(imapEmail, imapAuthCode);
                    setImapEmail('');
                    setImapAuthCode('');
                    setShowIMAPForm(false);
                  } catch {
                    // 保留输入, use-email-monitor 已 setToast 提示错误
                  }
                }
              }}
              disabled={isConnecting || !imapEmail || !imapAuthCode}
              className={cn(
                'flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-medium transition-all',
                isConnecting || !imapEmail || !imapAuthCode
                  ? 'bg-glass-fill-strong text-text-secondary cursor-not-allowed'
                  : 'bg-green-500/20 text-green-400 hover:bg-green-500/30 active:scale-95',
              )}
            >
              {isConnecting ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  {t('monitor.connecting')}
                </>
              ) : (
                <>
                  <MailCheck className="w-4 h-4" />
                  {t('monitor.connect')}
                </>
              )}
            </button>
            <button
              onClick={() => {
                setShowIMAPForm(false);
                setImapEmail('');
                setImapAuthCode('');
              }}
              disabled={isConnecting}
              className="px-4 py-2.5 rounded-xl bg-glass-fill text-text-secondary text-sm font-medium hover:bg-glass-fill-strong transition-colors"
            >
              {t('common.cancel')}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

