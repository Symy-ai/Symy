'use client';

/**
 * useReceiptActions — 邮件收据操作 handlers
 *
 * 从 monitor-tab.tsx 抽出 (C8 拆分).
 * 包含: handleReceiptsIgnore, handleReceiptsRefund, handleMarkRefunded
 * 所有 handler 都用乐观更新 + 回滚机制.
 *
 * 行为零变化: 纯函数提取, 不改逻辑.
 */

import { useCallback, useEffect, useRef } from 'react';
import { apiFetchVoid, apiFetch } from '@/lib/api-client';
import { formatPlatformName } from '@/lib/utils';
import type { EmailReceipt } from '@/lib/supabase';
import { useI18n } from '@/i18n/provider';

export interface ReceiptActionsArgs {
  emailReceiptsRef: React.MutableRefObject<EmailReceipt[]>;
  setEmailReceipts: React.Dispatch<React.SetStateAction<EmailReceipt[]>>;
  pendingIgnoresRef: React.MutableRefObject<Set<string>>;
  setToast: (toast: { message: string; type: 'success' | 'info' }) => void;
  isDemoRef: React.MutableRefObject<boolean>;
  isDemoModeRef: React.MutableRefObject<boolean>;
  onAuthPrompt?: (feature: string) => void;
}

export function useReceiptActions({
  emailReceiptsRef,
  setEmailReceipts,
  pendingIgnoresRef,
  setToast,
  isDemoRef,
  isDemoModeRef,
  onAuthPrompt,
}: ReceiptActionsArgs) {
  const { t } = useI18n();
  // 🔧 ARCH fix (Round 44 R44-A-3 — delayed secondary toast setTimeout 未追踪, 卸载泄漏):
  //    旧代码: 2 处 setTimeout(() => setToast(...), 2500) 不保存 ref, 卸载后 setState。
  //    根因修复: 用 ref 追踪 + 卸载时 clearTimeout。
  const secondaryToastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    return () => {
      if (secondaryToastTimerRef.current) clearTimeout(secondaryToastTimerRef.current);
    };
  }, []);

  const showDelayedToast = useCallback((toast: { message: string; type: 'success' | 'info' }, delayMs = 2500) => {
    if (secondaryToastTimerRef.current) clearTimeout(secondaryToastTimerRef.current);
    secondaryToastTimerRef.current = setTimeout(() => {
      setToast(toast);
      secondaryToastTimerRef.current = null;
    }, delayMs);
  }, [setToast]);

  /** 忽略收据 (PATCH status=ignored, 乐观删除 + 回滚) */
  const handleReceiptsIgnore = useCallback(
    async (receiptId: string) => {
      if (isDemoRef.current || isDemoModeRef.current) {
        if (isDemoRef.current) {
          onAuthPrompt?.('monitor');
        } else {
          setToast({ message: t('monitor.toast.demoIgnoreDisabled', { defaultValue: 'Demo mode — ignoring disabled' }), type: 'info' });
        }
        return;
      }
      if (pendingIgnoresRef.current.has(receiptId)) return;
      pendingIgnoresRef.current.add(receiptId);

      const receiptToIgnore = emailReceiptsRef.current.find((r) => r.id === receiptId);
      setEmailReceipts((prev) => prev.filter((r) => r.id !== receiptId));
      setToast({ message: t('monitor.toast.receiptIgnored'), type: 'info' });
      try {
        // 🔧 ARCH fix (Round 42 REVIEW-4): 用 apiFetch 替代 apiFetchVoid 以读 healthImpactApplied flag
        //    旧代码 (Round 41): handleReceiptsIgnore 用 apiFetchVoid, 但 handleMarkRefunded 用 apiFetch,
        //    不对称。ignore 也会触发 mindful_recovery (impulseScore >= 60), 失败时用户无感知。
        //    根因修复: 统一用 apiFetch + 检查 healthImpactApplied, 失败时显示次要 toast。
        const result = await apiFetch<{ healthImpactApplied?: boolean }>(`/api/email/receipts?id=${receiptId}`, {
          method: 'PATCH',
          body: { status: 'ignored' },
        });
        pendingIgnoresRef.current.delete(receiptId);
        if (result?.healthImpactApplied === false) {
          showDelayedToast({
            message: t('monitor.toast.healthImpactDelayed', { defaultValue: 'Receipt ignored, but companion boost delayed — will apply on next sync.' }),
            type: 'info',
          });
        }
      } catch {
        pendingIgnoresRef.current.delete(receiptId);
        if (receiptToIgnore) {
          // 🔧 ARCH fix (Round 19 BUG-R19D-L2 — 回滚追加到末尾, 丢失原排序):
          //    旧代码: [...prev, receiptToIgnore] 追加到末尾 → 破坏 received_at desc 排序。
          //    根因修复: 重新 sort 按 received_at desc。
          setEmailReceipts((prev) => {
            const restored = [...prev, receiptToIgnore];
            return restored.sort((a, b) => new Date(b.received_at).getTime() - new Date(a.received_at).getTime());
          });
        }
        setToast({ message: t('monitor.toast.networkError'), type: 'info' });
      }
    },
    [onAuthPrompt, setEmailReceipts, setToast, t, emailReceiptsRef, pendingIgnoresRef, isDemoRef, isDemoModeRef, showDelayedToast]
  );

  /** 标记退款 (PATCH status=refunding, 乐观更新 + 回滚) */
  const handleReceiptsRefund = useCallback(
  // eslint-disable-next-line symy/no-async-callback-mutation
    async (receiptId: string) => {
      if (isDemoRef.current || isDemoModeRef.current) {
        if (isDemoRef.current) {
          onAuthPrompt?.('refund');
        } else {
          setToast({ message: t('monitor.toast.demoRefundDisabled'), type: 'info' });
        }
        return;
      }
      const receiptToRefund = emailReceiptsRef.current.find((r) => r.id === receiptId);
      if (!receiptToRefund) return;

      const platformName = formatPlatformName(receiptToRefund.platform);
      setEmailReceipts((prev) =>
        prev.map((r) => r.id === receiptId ? { ...r, status: 'refunding' as const } : r)
      );
      setToast({ message: t('monitor.toast.refundMarkedManual', { platform: platformName }), type: 'info' });
      try {
        await apiFetchVoid(`/api/email/receipts?id=${receiptId}`, {
          method: 'PATCH',
          body: { status: 'refunding' },
        });
      } catch {
        setEmailReceipts((prev) =>
          prev.map((r) => r.id === receiptId ? { ...r, status: receiptToRefund.status } : r)
        );
        setToast({ message: t('monitor.toast.networkError'), type: 'info' });
      }
    },
    [onAuthPrompt, setEmailReceipts, setToast, t, emailReceiptsRef, isDemoRef, isDemoModeRef]
  );

  /** 确认已退款 (PATCH status=refunded, 乐观删除 + 回滚) */
  const handleMarkRefunded = useCallback(
    async (receiptId: string) => {
      // 🔧 ARCH fix (Round 18 H1): 旧代码缺 demo guard → demo 模式下真实 API 调用
      if (isDemoRef.current || isDemoModeRef.current) {
        if (isDemoRef.current) {
          onAuthPrompt?.('monitor');
        } else {
          setToast({ message: t('monitor.toast.demoRefundDisabled'), type: 'info' });
        }
        return;
      }
      const receipt = emailReceiptsRef.current.find((r) => r.id === receiptId);
      if (!receipt) return;
      const originalStatus = receipt.status;

      setEmailReceipts((prev) => prev.filter((r) => r.id !== receiptId));
      setToast({ message: t('monitor.toast.refundConfirmed'), type: 'success' });

      try {
        // 🔧 ARCH fix (Round 41 MEDIUM-2): 用 apiFetch 替代 apiFetchVoid 以读 healthImpactApplied flag
        //    旧代码: apiFetchVoid — 丢弃 response body, 不知道 health impact 是否成功。
        //    根因修复: apiFetch + 检查 healthImpactApplied, 失败时显示次要 toast 提示用户。
        const result = await apiFetch<{ healthImpactApplied?: boolean }>(`/api/email/receipts?id=${receiptId}`, {
          method: 'PATCH',
          body: { status: 'refunded' },
        });
        if (result?.healthImpactApplied === false) {
          // Health impact (vitality boost) 失败 — 显示次要 toast, 不覆盖成功 toast
          showDelayedToast({
            message: t('monitor.toast.healthImpactDelayed', { defaultValue: 'Refund recorded, but companion boost delayed — will apply on next sync.' }),
            type: 'info',
          });
        }
      } catch {
        // 🔧 ARCH fix (Round 19 BUG-R19D-L2 — 回滚追加到末尾, 丢失原排序):
        //    旧代码: [...prev, receipt] 追加到末尾 → 破坏 received_at desc 排序。
        //    根因修复: 重新 sort 按 received_at desc。
        setEmailReceipts((prev) => {
          const restored = [...prev, { ...receipt, status: originalStatus }];
          return restored.sort((a, b) => new Date(b.received_at).getTime() - new Date(a.received_at).getTime());
        });
        setToast({ message: t('monitor.toast.networkError'), type: 'info' });
      }
    },
    [setEmailReceipts, setToast, t, emailReceiptsRef, isDemoRef, isDemoModeRef, onAuthPrompt, showDelayedToast]
  );

  return { handleReceiptsIgnore, handleReceiptsRefund, handleMarkRefunded };
}
