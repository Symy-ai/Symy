'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { cn, formatPlatformName } from '@/lib/utils';
import { NotificationCard } from './notification-card';
import { useAuth } from '@/components/auth/auth-provider';
import { useI18n } from '@/i18n/provider';
import { apiFetchVoid } from '@/lib/api-client';
import { calculateImpulseScore, getScoreColor, type ImpulseEvent } from '@/lib/impulse-detector';
import {
  Bell, MessageCircle, RotateCcw, Activity, TrendingUp,
  Mail,
} from 'lucide-react';
// C8 拆分: receipt actions 提取到 hook
import { useReceiptActions } from './monitor/hooks/use-receipt-actions';
import { useDemoFeed } from './monitor/hooks/use-demo-feed';
// C9 拆分: email monitor 逻辑提取到 hook
import { useEmailMonitor } from './monitor/hooks/use-email-monitor';
// C3 拆分：子组件/类型/常量/纯辅助函数移到 ./monitor 子目录
import type { MonitorTabProps, ViewMode } from './monitor';
// eslint-disable-next-line no-duplicate-imports
import {
  formatCountdown,
  EmailConnectionCard,
  EmailReceiptsList,
  ToastNotification,
} from './monitor';

// ============================================================
// MonitorTab Component
// ============================================================

export function MonitorTab({ onTalkToAI, onImpulseAlert, isDemo = false, onAuthPrompt }: MonitorTabProps) {
  const { user: _user } = useAuth();
  const { t } = useI18n();

  // BUG-115 fix: Use ref for isDemo to avoid creating new function references on every render.
  const isDemoRef = useRef(isDemo);
  useEffect(() => { isDemoRef.current = isDemo; }, [isDemo]);

  const { notifications, addDemoNotification } = useDemoFeed();
  const [events, setEvents] = useState<ImpulseEvent[]>([]);
  const [isDemoMode, setIsDemoMode] = useState(isDemo);
  useEffect(() => {
     
    setIsDemoMode(isDemo);
  }, [isDemo]);
  const isDemoModeRef = useRef(isDemoMode);
  useEffect(() => { isDemoModeRef.current = isDemoMode; }, [isDemoMode]);

  const [latestScore, setLatestScore] = useState(0);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'info' } | null>(null);
  // 🔧 ARCH fix (Round 13 BUG-2): stable onDismiss for ToastNotification (防每秒重渲染重置 timer)
  const dismissToast = useCallback(() => setToast(null), []);

  // 🔧 C9 拆分: email monitor 逻辑提取到 useEmailMonitor hook
  const {
    emailConnections,
    emailReceipts,
    setEmailReceipts,
    emailReceiptsRef,
    isLoadingEmail,
    isConnecting,
    isScanning,
    scanResult,
    autoSyncEnabled,
    nextSyncIn,
    hasActiveEmail,
    handleConnectGmail,
    handleConnectIMAP,
    handleDisconnectGmail,
    handleScanEmails,
    handleToggleAutoSync,
    pendingIgnoresRef,
  } = useEmailMonitor(setToast, isDemoRef);

  // View mode
  const [viewMode, setViewMode] = useState<ViewMode>(isDemo ? 'notifications' : 'receipts');
  useEffect(() => {
    // isDemo prop → viewMode state 同步
     
    setViewMode(isDemo ? 'notifications' : 'receipts');
  }, [isDemo]);
  // 🔧 C9 拆分: loadEmailData, handleConnect*, handleScanEmails, auto-sync logic
  // 已全部移到 useEmailMonitor hook (上面已调用)

  // Bug #5 修复：用 ref 保存 events，避免 addNotification 闭包陈旧导致 interval 重启
  const eventsRef = useRef<ImpulseEvent[]>([]);
  useEffect(() => { eventsRef.current = events; }, [events]);

  // BUG-115 fix: Stable callbacks for EmailReceiptsList — use isDemoRef instead of inline
  // ternary (isDemo ? () => onAuthPrompt?.('chat') : onTalkToAI) which creates new function
  // references on every render, causing unnecessary re-renders and hydration mismatches.
  // Note: onTalkToAI from page.tsx (handleMonitorTalkToAI) already handles demo mode internally,
  // so the demo guard here is a safety net — the parent callback also checks isDemoRef.
  const handleReceiptsTalkToAI = useCallback(
    (context: { platform: string; amount: number; reasons: string[]; time: string }) => {
      if (isDemoRef.current) {
        onAuthPrompt?.('chat');
        return;
      }
      onTalkToAI(context);
    },
    [onAuthPrompt, onTalkToAI]
  );

  // 🔧 C8 拆分: receipt actions 提取到 useReceiptActions hook
  const { handleReceiptsIgnore, handleReceiptsRefund, handleMarkRefunded } = useReceiptActions({
    emailReceiptsRef,
    setEmailReceipts,
    pendingIgnoresRef,
    setToast,
    isDemoRef,
    isDemoModeRef,
    onAuthPrompt,
  });

  // Existing demo notification logic
  // Bug #5 修复：移除 events 依赖，改用 eventsRef.current 避免闭包陈旧导致 interval 重启
  const addNotification = useCallback(() => {
    const notif = addDemoNotification();

    const result = calculateImpulseScore(
      {
        platform: notif.platform,
        item: notif.item,
        amount: notif.amount,
        timestamp: notif.timestamp,
        category: notif.category,
        isLivestream: notif.isLivestream,
        isFlashSale: notif.isFlashSale,
      },
      eventsRef.current,
      20,
    );

    const newEvent: ImpulseEvent = {
      id: notif.id,
      platform: notif.platform,
      item: notif.item,
      amount: notif.amount,
      timestamp: notif.timestamp,
      category: notif.category,
      isLivestream: notif.isLivestream,
      isFlashSale: notif.isFlashSale,
      impulseScore: result.score,
      reasons: result.reasons,
    };

    // BUG-151 fix: 限制 events 数组最大长度，防止内存无限增长
    setEvents((prevEvents) => [newEvent, ...prevEvents].slice(0, 50));

    setLatestScore(result.score);
    // 🔧 PM-NEW-81 fix: Monitor 的内部 Demo Mode 不应触发真实 alert
    //    之前: onImpulseAlert 无条件调用 → appStatus='alert' → "Manipulation Alert!" 残留
    //    现在: isDemoMode (Monitor 内部 toggle) 为 true 时跳过
    if (!isDemoModeRef.current) {
      onImpulseAlert(result.score);
    }
  }, [addDemoNotification, onImpulseAlert]);

  useEffect(() => {
    if (!isDemoMode) return;
    const interval = setInterval(() => {
      addNotification();
    }, 6000);
    return () => clearInterval(interval);
  }, [isDemoMode, addNotification]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = 0;
    }
  }, [notifications.length]);

  // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional omission (stable ref/callback)
  const currentEvent = hasActiveEmail && emailReceipts.length > 0
    ? {
        id: emailReceipts[0].id,
        platform: emailReceipts[0].platform,
        item: emailReceipts[0].item_name || emailReceipts[0].subject || t('monitor.unknownItem'),
        amount: emailReceipts[0].amount || 0,
        timestamp: new Date(emailReceipts[0].received_at),
        category: emailReceipts[0].platform,
        isLivestream: false,
        isFlashSale: false,
        impulseScore: emailReceipts[0].impulse_score,
        reasons: [`Email receipt from ${formatPlatformName(emailReceipts[0].platform)}`],
      }
    : events[0];

  // BUG-115 fix: Ref for currentEvent to avoid inline arrow functions in Alert Actions
  const currentEventRef = useRef(currentEvent);
  useEffect(() => { currentEventRef.current = currentEvent; }, [currentEvent]);

  // Stable callbacks for Alert Action buttons (Talk to AI / Refund)
  // BUG-190 fix: 添加 demo guard，与 handleReceiptsTalkToAI 保持一致
  const handleAlertTalkToAI = useCallback(() => {
    if (isDemoRef.current) {
      onAuthPrompt?.('chat');
      return;
    }
    const ev = currentEventRef.current;
    if (!ev) return;
    onTalkToAI({
      platform: ev.platform,
      amount: ev.amount,
      reasons: ev.reasons,
      time: ev.timestamp.toLocaleTimeString(),
    });
  }, [onTalkToAI, onAuthPrompt]);

  const handleAlertRefund = useCallback(() => {
    // 🔧 N15/N16 fix: Also check isDemoModeRef — authenticated users who toggled
    // the internal "Demo Mode ON" see demo notifications, but those notification IDs
    // don't exist in emailReceiptsRef → "No matching receipt found" error.
    // 🔧 Bug G fix: Demo Mode 下显示 toast 而非静默失败
    if (isDemoRef.current || isDemoModeRef.current) {
      if (isDemoRef.current) {
        // 未登录 → 触发 Auth Prompt
        onAuthPrompt?.('refund');
      } else {
        // 已登录但在 Demo Mode → 显示 toast 提示
        setToast({ message: t('monitor.toast.demoRefundDisabled'), type: 'info' });
      }
      return;
    }
    const ev = currentEventRef.current;
    if (ev) {
      // 找到对应的收据触发 refund
      const receipt = emailReceiptsRef.current.find((r) => r.id === ev.id);
      if (receipt) {
        // BUG-3 FIX: Keep the receipt visible as "Refund Pending" instead of removing it
        const originalStatus = receipt.status;
        const platformName = formatPlatformName(receipt.platform);
        setEmailReceipts((prev) =>
          prev.map((r) => r.id === receipt.id ? { ...r, status: 'refunding' as const } : r)
        );
        setToast({ message: t('monitor.toast.refundMarkedManual', { platform: platformName }), type: 'info' });
        // 🔧 ARCH fix (Round 26 R25-7 — 注释撒谎说改了 apiFetchVoid 实际仍用 raw fetch):
        //    旧代码用 raw fetch: 不发 credentials, 不处理 401, 无超时, catch 吞错无日志。
        //    根因修复: 用 apiFetchVoid (统一错误处理 + credentials:include + 30s 超时 + 401 自动 signOut)。
        apiFetchVoid(`/api/email/receipts?id=${receipt.id}`, {
          method: 'PATCH',
          body: { status: 'refunding' },
        }).then(() => {
          // 成功 — optimistic update 已设 'refunding', 无需额外操作
        }).catch(() => {
          setEmailReceipts((prev) =>
            prev.map((r) => r.id === receipt.id ? { ...r, status: originalStatus } : r)
          );
          setToast({ message: t('monitor.toast.refundFailed'), type: 'info' });
        });
      } else {
        setToast({ message: t('monitor.toast.noMatchingReceipt'), type: 'info' });
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional omission (stable ref/callback)
  }, [onAuthPrompt, t]);  // 🔧 H6 fix: 加 t 到 deps

  // 🔧 C8 拆分: handleMarkRefunded 已提取到 useReceiptActions hook (上面已调用)

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-4 pt-6 pb-4">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-lg font-bold text-text-primary">{t('monitor.liveMonitor')}</h2>
            <p className="text-xs text-text-tertiary">
              {hasActiveEmail
                ? autoSyncEnabled
                  ? nextSyncIn > 0
                    ? t('monitor.autoSyncNext', { n: formatCountdown(nextSyncIn, t) })
                    : t('monitor.autoSyncingNow')
                  : t('monitor.emailConnectedPaused')
                : t('monitor.connectEmailToMonitor')}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Activity className={cn('w-4 h-4', hasActiveEmail || isDemoMode ? 'text-green-400 animate-pulse' : 'text-icon-muted')} />
            <span className="text-xs text-text-tertiary">
              {hasActiveEmail ? t('monitor.statusLabels.emailActive') : isDemoMode ? t('monitor.statusLabels.demoMode') : t('monitor.statusLabels.paused')}
            </span>
          </div>
        </div>

        {/* Email Connection Card — Demo 模式显示注册引导 */}
        {isDemo ? (
          <div className="bg-gradient-to-r from-cyan-500/10 to-purple-500/10 border border-cyan-500/20 rounded-2xl p-4 mb-4">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 rounded-xl bg-cyan-500/20 flex items-center justify-center">
                <Mail className="w-5 h-5 text-cyan-400" />
              </div>
              <div className="flex-1">
                <p className="text-sm font-medium text-text-primary">{t('monitor.emailMonitor')}</p>
                <p className="text-xs text-text-secondary">{t('monitor.emailMonitorDesc')}</p>
              </div>
            </div>
            <button
              onClick={() => onAuthPrompt?.('connect_email')}
              className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-gradient-to-r from-cyan-500 to-purple-500 text-white text-sm font-bold hover:from-cyan-400 hover:to-purple-400 transition-all active:scale-95 btn-shimmer"
            >
              {t('monitor.signUpToConnect')}
            </button>
            <p className="text-[10px] text-text-tertiary text-center mt-2">
              {t('monitor.privacyNote')}
            </p>
          </div>
        ) : (
          <EmailConnectionCard
            connections={emailConnections}
            isConnecting={isConnecting}
            isLoadingEmail={isLoadingEmail}
            onConnectGmail={handleConnectGmail}
            onConnectIMAP={handleConnectIMAP}
            onDisconnect={handleDisconnectGmail}
            onScan={handleScanEmails}
            isScanning={isScanning}
            scanResult={scanResult}
            actionableCount={emailReceipts.length}
            autoSyncEnabled={autoSyncEnabled}
            nextSyncIn={nextSyncIn}
            onToggleAutoSync={handleToggleAutoSync}
          />
        )}

        {/* Live Score */}
        {currentEvent && (
          <div className="bg-glass-fill rounded-2xl p-4 border border-glass-border mb-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs text-text-secondary font-medium">{t('monitor.latestImpulseScore')}</span>
              <TrendingUp className="w-4 h-4 text-icon-muted" />
            </div>
            <div className="flex items-center gap-4">
              <div
                className="text-4xl font-bold transition-colors duration-500"
                style={{ color: getScoreColor(latestScore) }}
              >
                {latestScore}
              </div>
              <div className="flex-1">
                <div className="h-2 bg-glass-fill-strong rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-700"
                    style={{
                      width: `${latestScore}%`,
                      backgroundColor: getScoreColor(latestScore),
                    }}
                  />
                </div>
                <div className="flex justify-between mt-1">
                  <span className="text-[10px] text-green-500">{t('monitor.scoreLevels.low')}</span>
                  <span className="text-[10px] text-yellow-500">{t('monitor.scoreLevels.medium')}</span>
                  <span className="text-[10px] text-amber-600 dark:text-amber-400">{t('monitor.scoreLevels.high')}</span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Alert Actions */}
        {latestScore > 60 && currentEvent && (
          <div className="flex gap-2 mb-4 animate-in slide-in-from-top duration-300">
            <button
              type="button"
              onClick={handleAlertTalkToAI}
              className="flex-1 flex items-center justify-center gap-2 px-3 py-3 rounded-xl bg-green-600 dark:bg-green-500 text-white text-sm font-medium hover:bg-green-700 dark:hover:bg-green-600 transition-colors active:scale-95 cursor-pointer select-none"
            >
              <MessageCircle className="w-4 h-4" />
              {t('monitor.talkToAI')}
            </button>
            {/* Bug #19 修复：Refund 按钮绑定 onClick */}
            {/* 🔧 BUG-54 fix: Demo 模式下 Refund 触发 Auth Prompt */}
            <button
              type="button"
              onClick={handleAlertRefund}
              className="flex-1 flex items-center justify-center gap-2 px-3 py-3 rounded-xl bg-red-600 dark:bg-red-500 text-white text-sm font-medium hover:bg-red-700 dark:hover:bg-red-600 transition-colors active:scale-95 cursor-pointer select-none"
            >
              <RotateCcw className="w-4 h-4" />
              {t('monitor.refund')}
            </button>
          </div>
        )}

        {/* View Mode Toggle */}
        {/* 🔧 BUG-46 fix: Demo 模式也显示 View Mode Toggle，让用户可以看到 Notifications */}
        {(hasActiveEmail || isDemoMode) && (
          <div className="flex gap-1 mb-4 bg-glass-fill rounded-xl p-1">
            <button
              onClick={() => setViewMode('receipts')}
              className={cn(
                'flex-1 py-1.5 rounded-lg text-xs font-medium transition-colors relative',
                viewMode === 'receipts' ? 'bg-glass-fill-strong text-text-primary' : 'text-text-tertiary hover:text-text-secondary',
              )}
            >
              <Mail className="w-3 h-3 inline mr-1" />
              {t('monitor.receipts')}
              {emailReceipts.length > 0 && (
                <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-red-500 text-[9px] text-white flex items-center justify-center">
                  {emailReceipts.length}
                </span>
              )}
            </button>
            <button
              onClick={() => setViewMode('notifications')}
              className={cn(
                'flex-1 py-1.5 rounded-lg text-xs font-medium transition-colors',
                viewMode === 'notifications' ? 'bg-glass-fill-strong text-text-primary' : 'text-text-tertiary hover:text-text-secondary',
              )}
            >
              <Bell className="w-3 h-3 inline mr-1" />
              {t('monitor.notifications')}
            </button>
          </div>
        )}

        {/* Demo Toggle (only when no email connected and NOT in page-level demo mode) */}
        {!hasActiveEmail && !isDemo && (
          <button
            onClick={() => setIsDemoMode(!isDemoMode)}
            className={cn(
              'w-full py-2 rounded-xl text-sm font-medium transition-colors border',
              isDemoMode
                ? 'bg-green-500/10 border-green-500/30 text-green-400'
                : 'bg-glass-fill border-glass-border text-text-secondary',
            )}
          >
            <Bell className="w-3.5 h-3.5 inline mr-1.5" />
            {isDemoMode ? t('monitor.demoModeOn') : t('monitor.demoModeOff')}
          </button>
        )}
      </div>

      {/* Toast Notification */}
      {toast && <ToastNotification toast={toast} onDismiss={dismissToast} />}

      {/* Content Area */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 pb-4 space-y-2.5 custom-scrollbar">
        {viewMode === 'receipts' ? (
          <EmailReceiptsList
            receipts={emailReceipts}
            onTalkToAI={handleReceiptsTalkToAI}
            onIgnore={handleReceiptsIgnore}
            onRefund={handleReceiptsRefund}
            onMarkRefunded={handleMarkRefunded}
            isDemoMode={isDemoMode}
          />
        ) : (
          <>
            {notifications.length === 0 ? (
              // Bug #5 fix: improved empty state for Notifications view
              <div className="flex flex-col items-center justify-center py-20 text-center">
                <div className="w-20 h-20 rounded-full bg-glass-fill flex items-center justify-center mb-5 ring-1 ring-glass-border">
                  <Bell className="w-10 h-10 text-icon-muted" />
                </div>
                <p className="text-text-secondary text-sm font-medium mb-1.5">
                  {hasActiveEmail ? t('monitor.allClearTitle', { n: emailReceipts.length }) : t('monitor.noNotificationsTitle')}
                </p>
                <p className="text-text-tertiary text-xs max-w-[220px] leading-relaxed">
                  {hasActiveEmail
                    ? t('monitor.notificationsDesc')
                    : t('monitor.demoNotificationsDesc')}
                </p>
                {!hasActiveEmail && !isDemoMode && (
                  <button
                    onClick={() => setIsDemoMode(true)}
                    className="mt-4 px-4 py-2 rounded-xl bg-glass-fill border border-glass-border text-text-secondary text-xs font-medium hover:bg-glass-fill-strong transition-colors"
                  >
                    <Bell className="w-3 h-3 inline mr-1.5" />
                    {t('monitor.startDemoMode')}
                  </button>
                )}
              </div>
            ) : (
              notifications.map((notif, index) => {
                const event = events.find((e) => e.id === notif.id);
                return (
                  <NotificationCard
                    key={notif.id}
                    notification={notif}
                    impulseScore={event?.impulseScore ?? 0}
                    isNew={index === 0}
                  />
                );
              })
            )}
          </>
        )}
      </div>
    </div>
  );
}
