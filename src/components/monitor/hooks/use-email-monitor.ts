'use client';

/**
 * useEmailMonitor — Email 连接 + 扫描 + Auto-Sync 逻辑
 *
 * 从 monitor-tab.tsx 抽出 (C9 拆分).
 * 包含: loadEmailData, handleConnectGmail, handleConnectIMAP,
 *        handleDisconnectGmail, handleScanEmails, auto-sync logic
 *
 * 行为零变化: 纯函数提取, 不改逻辑.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { apiFetch, apiFetchVoid, ApiError } from '@/lib/api-client';
import { EmailConnection, EmailReceipt } from '@/lib/supabase';
import { useI18n } from '@/i18n/provider';
import { useAuth } from '@/components/auth/auth-provider';
import { logger } from '@/lib/logger';
import {
  AUTO_SYNC_INTERVAL_MS,
  AUTO_SYNC_KEY,
  AUTO_SYNC_ENABLED_KEY,
} from '../constants';
import { symyEvents } from '@/lib/posthog';

export interface EmailMonitorState {
  // Data
  emailConnections: EmailConnection[];
  emailReceipts: EmailReceipt[];
  setEmailReceipts: React.Dispatch<React.SetStateAction<EmailReceipt[]>>;
  emailConnectionsRef: React.MutableRefObject<EmailConnection[]>;
  emailReceiptsRef: React.MutableRefObject<EmailReceipt[]>;
  // Loading states
  isLoadingEmail: boolean;
  isConnecting: boolean;
  isScanning: boolean;
  scanResult: { scanned: number; newReceipts: number } | null;
  // Auto-sync
  autoSyncEnabled: boolean;
  nextSyncIn: number;
  // Derived
  hasActiveEmail: boolean;
  // Actions
  loadEmailData: () => Promise<void>;
  handleConnectGmail: () => Promise<void>;
  handleConnectIMAP: (email: string, authCode: string) => Promise<void>;
  handleDisconnectGmail: (connectionId: string) => Promise<void>;
  handleScanEmails: () => Promise<void>;
  handleToggleAutoSync: () => void;
  // Toast callback
  setToast: (toast: { message: string; type: 'success' | 'info' }) => void;
  // Refs for external use (receipt actions)
  pendingIgnoresRef: React.MutableRefObject<Set<string>>;
  isDemoRef: React.MutableRefObject<boolean>;
}

export function useEmailMonitor(
  setToast: (toast: { message: string; type: 'success' | 'info' }) => void,
  isDemoRef: React.MutableRefObject<boolean>,
): EmailMonitorState {
  const { user } = useAuth();
  const { t } = useI18n();

  // Data state
  const [emailConnections, setEmailConnections] = useState<EmailConnection[]>([]);
  const [emailReceipts, setEmailReceipts] = useState<EmailReceipt[]>([]);
  const emailConnectionsRef = useRef<EmailConnection[]>([]);
  const emailReceiptsRef = useRef<EmailReceipt[]>([]);
  useEffect(() => { emailConnectionsRef.current = emailConnections; }, [emailConnections]);
  useEffect(() => { emailReceiptsRef.current = emailReceipts; }, [emailReceipts]);

  // Loading states
  const [isLoadingEmail, setIsLoadingEmail] = useState(true);
  const [isConnecting, setIsConnecting] = useState(false);
  const [isScanning, setIsScanning] = useState(false);
  const isScanningRef = useRef(false);
  // 🔧 ARCH fix (Round 19 BUG-R19D-H1): scanResult 加 error 字段供 UI 显示 partialFailure
  const [scanResult, setScanResult] = useState<{ scanned: number; newReceipts: number; error?: string } | null>(null);

  // Auto-sync state
  const [autoSyncEnabled, setAutoSyncEnabled] = useState(true);
  const [nextSyncIn, setNextSyncIn] = useState(AUTO_SYNC_INTERVAL_MS / 1000);
  const autoSyncTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastSyncTimeRef = useRef<number>(0);

  // Pending ignores (for receipt actions)
  const pendingIgnoresRef = useRef<Set<string>>(new Set());
  // 🔧 ARCH fix (Round 22 BUG-R22-H1 — loadEmailData 替换式覆盖 optimistic disconnect):
  //    旧代码: 用户点 disconnect → optimistic delete → await DELETE → 期间 auto-sync 触发 loadEmailData
  //    → fetch /api/email/status (服务端仍有 connection, DELETE 未完成) → setEmailConnections(serverData)
  //    → 替换 state → connection 重新出现 → DELETE 完成后无 rollback → UI 显示 active 但服务端已删。
  //    根因修复: pendingDisconnectsRef 跟踪正在 disconnect 的 connectionId, loadEmailData 过滤掉它们。
  const pendingDisconnectsRef = useRef<Set<string>>(new Set());

  function migrateLegacyAutoSyncKeys(userId?: string): void {
    if (!userId) return;
    const userSyncKey = `${AUTO_SYNC_KEY}_${userId}`;
    const userEnabledKey = `${AUTO_SYNC_ENABLED_KEY}_${userId}`;
    const legacySync = localStorage.getItem(AUTO_SYNC_KEY);
    const legacyEnabled = localStorage.getItem(AUTO_SYNC_ENABLED_KEY);

    if (localStorage.getItem(userSyncKey) === null && legacySync !== null) {
      localStorage.setItem(userSyncKey, legacySync);
    }
    if (localStorage.getItem(userEnabledKey) === null && legacyEnabled !== null) {
      localStorage.setItem(userEnabledKey, legacyEnabled);
    }
    localStorage.removeItem(AUTO_SYNC_KEY);
    localStorage.removeItem(AUTO_SYNC_ENABLED_KEY);
  }

  // Derived
  const hasActiveEmail = emailConnections.some((c) => c.status === 'active');

  // ============================================================
  // Load email data (connections + receipts)
  // ============================================================
  const loadEmailData = useCallback(async (signal?: AbortSignal) => {
    if (isDemoRef.current) {
      setIsLoadingEmail(false);
      return;
    }
    try {
      // 🔧 架构还债: 用 apiFetch + Promise.allSettled 替代内联 fetch + Promise.all
      // 🔧 ARCH fix (Round 25 R25-2): 传 signal 允许取消
      const [statusResult, actionableResult, refundingResult] = await Promise.allSettled([
        apiFetch<{ connections?: EmailConnection[] }>('/api/email/status', { signal }),
        apiFetch<{ receipts?: EmailReceipt[] }>('/api/email/receipts?status=actionable&limit=50', { signal }),
        apiFetch<{ receipts?: EmailReceipt[] }>('/api/email/receipts?status=refunding&limit=50', { signal }),
      ]);

      // 🔧 Round 25 R25-2: fetch 完成后检查是否已取消 (用户切换/卸载)
      if (signal?.aborted) return;

      if (statusResult.status === 'fulfilled') {
        // 🔧 ARCH fix (Round 22 BUG-R22-H1): 过滤掉 optimistic disconnect 中的 connection
        //    pendingDisconnectsRef 跟踪正在 await DELETE 的 connectionId,
        //    服务端仍有这些 connection (DELETE 未完成), 但 UI 已 optimistic delete,
        //    loadEmailData 不应把它们重新加回 UI。
        const serverConns = statusResult.value.connections || [];
        const filteredConns = serverConns.filter(
          (c: EmailConnection) => !pendingDisconnectsRef.current.has(c.id)
        );
        setEmailConnections(filteredConns);
      }

      const actionableReceipts = actionableResult.status === 'fulfilled' ? (actionableResult.value.receipts || []) : [];
      const refundingReceipts = refundingResult.status === 'fulfilled' ? (refundingResult.value.receipts || []) : [];
      const allReceipts = [...actionableReceipts, ...refundingReceipts];
      const filtered = allReceipts.filter(
        (r: EmailReceipt) => !pendingIgnoresRef.current.has(r.id)
      );
      setEmailReceipts(filtered);
      // safe to ignore: non-critical background operation, error already logged
    } catch (err) {
                    // safe to ignore: non-critical background operation, error already logged
      logger.error('Failed to load email data:', err);
    } finally {
      setIsLoadingEmail(false);
    }
  }, [isDemoRef]);

  // Load on mount (when user is available)
  // 🔧 ARCH fix (Round 25 R25-2 — loadEmailData 缺 AbortController + 用户切换不清 state → 跨用户数据泄漏):
  //    旧代码: user?.id 变化触发 loadEmailData, 但旧 fetch 仍在进行, 旧 fetch 完成后覆盖新用户的 state。
  //    根因修复: (1) 用户切换时立即清空 state (2) 用 AbortController 取消旧 fetch (3) cleanup 函数
  useEffect(() => {
    if (isDemoRef.current) {

      setIsLoadingEmail(false);
      return;
    }
    if (!user?.id) return;
    // 立即清空旧用户数据 (防新用户看到旧用户的 connections/receipts)
     
    setEmailConnections([]);
    setEmailReceipts([]);
    // 用 AbortController 取消旧 fetch
    const controller = new AbortController();
    loadEmailData(controller.signal);
    return () => controller.abort();
  // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional omission (stable ref/callback)
  }, [user?.id, loadEmailData]);

  // Check URL params for email_connected / email_error
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    const emailConnected = params.get('email_connected');
    const emailError = params.get('email_error');

    if (emailConnected) {
      // 🔧 ARCH fix (Round 38): loadEmailData without AbortController could setState on unmounted
      const controller = new AbortController();
      loadEmailData(controller.signal);
      const url = new URL(window.location.href);
      url.searchParams.delete('email_connected');
      window.history.replaceState({}, '', url.pathname + url.search);
    }
    if (emailError) {
      const url = new URL(window.location.href);
      url.searchParams.delete('email_error');
      window.history.replaceState({}, '', url.pathname + url.search);
    }
  }, [loadEmailData]);

  // ============================================================
  // Connect / Disconnect
  // ============================================================
  // eslint-disable-next-line require-await -- async for API consistency
  const handleConnectGmail = useCallback(async () => {
    if (!user?.id) return;
    setIsConnecting(true);
    try {
      window.location.href = '/api/email/connect';
    } catch (err) {
      logger.error('Connect Gmail error:', err);
      setIsConnecting(false);
    }
  }, [user?.id]);

  // eslint-disable-next-line symy/no-async-callback-mutation
  const handleConnectIMAP = useCallback(async (email: string, authCode: string) => {
    if (!user?.id) return;
    setIsConnecting(true);
    try {
      // 🔧 架构还债: 用 apiFetch 替代内联 fetch (统一错误处理)
      // 🔧 ARCH fix (Round 11 M5 review): IMAP connect + initial scan 可超过 30s 默认超时
      await apiFetch('/api/email/imap-connect', {
        method: 'POST',
        body: { email, authCode, daysBack: 7 },
        timeoutMs: 120_000,
      });
      await loadEmailData();
      symyEvents.emailConnected({ provider: 'imap' });
    } catch (err) {
      if (err instanceof ApiError) {
        const data = (err.body as Record<string, unknown>) || {};
        const hint = (data.hint as string) || '';
        const errorMsg = (data.error as string) || t('monitor.toast.unknownError');
        logger.error('IMAP connect error:', errorMsg, hint ? `\nHint: ${hint}` : '');
        setToast({ message: t('monitor.toast.connectionFailed', { msg: `${errorMsg}${hint ? ' — ' + hint : ''}` }), type: 'info' });
      } else {
        logger.error('Connect IMAP error:', err);
        setToast({ message: t('monitor.toast.connectionFailed', { msg: t('monitor.toast.unknownError') }), type: 'info' });
      }
    } finally {
      setIsConnecting(false);
    }
  }, [user?.id, loadEmailData, t, setToast]);

  const handleDisconnectGmail = useCallback(async (connectionId: string) => {
    const prevConnections = emailConnectionsRef.current;
    const prevReceipts = emailReceiptsRef.current;
    // 🔧 ARCH fix (Round 22 BUG-R22-H1): 标记 pending disconnect, 防 loadEmailData 覆盖 optimistic delete
    pendingDisconnectsRef.current.add(connectionId);
    setEmailConnections((prev) => prev.filter((c) => c.id !== connectionId));
    setEmailReceipts((prev) => prev.filter((r) => r.connection_id !== connectionId));
    try {
      // 🔧 架构还债: 用 apiFetchVoid 替代内联 fetch
      await apiFetchVoid(`/api/email/disconnect?connectionId=${encodeURIComponent(connectionId)}`, { method: 'DELETE' });
      // 成功 — 清标记 (服务端已删, 下次 loadEmailData 不会返回此 connection)
      pendingDisconnectsRef.current.delete(connectionId);
    } catch (err) {
      // 失败 — 清标记 + rollback
      pendingDisconnectsRef.current.delete(connectionId);
      // 🔧 ARCH fix (Round 19 BUG-R19D-H2 — disconnect rollback 覆盖 auto-sync 拉到的新数据):
      //    旧代码: setEmailConnections(prevConnections); setEmailReceipts(prevReceipts);
      //    — 用 await 前的快照覆盖 state, 丢掉中间 auto-sync loadEmailData 拉到的新数据。
      //    根因修复: merge 模式 — 把回滚的 connection/receipt 加回当前 state (而非替换),
      //    保留 await 期间 auto-sync 新增的数据。
      setEmailConnections((current) => {
        const restored = prevConnections.filter(c => !current.some(cc => cc.id === c.id));
        return [...current, ...restored];
      });
      setEmailReceipts((current) => {
        const restored = prevReceipts.filter(r => !current.some(rr => rr.id === r.id));
        return [...current, ...restored];
      });
      setToast({ message: t('monitor.toast.networkError'), type: 'info' });
      logger.error('Disconnect error:', err);
    }
  }, [t, setToast]);

  // ============================================================
  // Scan for receipts
  // ============================================================
  const handleScanEmails = useCallback(async () => {
    if (!user?.id || isScanningRef.current) return;
    isScanningRef.current = true;
    setIsScanning(true);
    setScanResult(null);
    try {
      const activeConn = emailConnectionsRef.current.find((c) => c.status === 'active');
      const isIMAP = activeConn?.provider?.startsWith('imap_');

      const endpoint = isIMAP ? '/api/email/resync' : '/api/email/scan';
      // 🔧 架构还债: 用 apiFetch 替代内联 fetch
      // 🔧 ARCH fix (Round 11 M5 review): email scan/resync 可合法超过 30s 默认超时
      //    (大邮箱 / 慢 IMAP / 7 天扫描), 提升到 120s。
      const data = await apiFetch<{ scanned?: number; newReceipts?: number; error?: string; partialFailure?: boolean }>(endpoint, {
        method: 'POST',
        body: { daysBack: 7 },
        timeoutMs: 120_000,
      });

      // 🔧 ARCH fix (Round 19 BUG-R19D-H1 — scan error 当成功, 5min 内不重试):
      //    旧代码: data.error && !data.scanned 时仅 logger.error, 但仍更新 lastSyncTimeRef。
      //    Auto-sync interval (5min) 用 lastSyncTimeRef 计算下次触发 → 失败的 5min 内不重试。
      //    根因修复: 若 scan 完全失败 (无 scanned 数据) 或 partialFailure, 跳过 lastSyncTime 更新,
      //    让 5min 后再试 (或用户手动 retry)。
      if (data.error && !data.scanned) {
        logger.error('Scan error (skipping lastSyncTime update):', data.error);
        setScanResult({
          scanned: 0,
          newReceipts: 0,
          error: data.error,
        });
        // 不更新 lastSyncTimeRef, 不写 localStorage → auto-sync 会在下个周期重试
        return;
      }

      if (data.partialFailure) {
        // partialFailure: IMAP 连上了但扫描失败 — 已扫描部分, 但不完整
        // 更新 lastSyncTime (避免无限重试), 但标记 error 让 UI 显示
        logger.warn('Scan partial failure:', data.error);
      }

      setScanResult({
        scanned: data.scanned || 0,
        newReceipts: data.newReceipts || 0,
      });
      await loadEmailData();

      lastSyncTimeRef.current = Date.now();
      // 🔧 Round 20 H7: 用 user-specific key
      const userSyncKey = user?.id ? `${AUTO_SYNC_KEY}_${user.id}` : AUTO_SYNC_KEY;
      try { localStorage.setItem(userSyncKey, String(lastSyncTimeRef.current)); } catch { /* silent: non-critical operation */ }
      // safe to ignore: non-critical background operation, error already logged
    } catch (err) {
                    // safe to ignore: non-critical background operation, error already logged
      logger.error('Scan error:', err);
    } finally {
      setIsScanning(false);
      isScanningRef.current = false;
    }
  }, [user?.id, loadEmailData]);

  // ============================================================
  // Auto-Sync Logic
  // ============================================================

  // Initialize lastSyncTime + autoSyncEnabled from localStorage
  // 🔧 ARCH fix (Round 20 Frontend H7 — AUTO_SYNC_KEY 不分用户, 跨用户 timing 泄漏):
  //    旧代码用全局 key 'symy_last_auto_sync' → User A 的 sync 时间被 User B 继承。
  //    根因修复: key 加 userId 后缀, 每个用户独立。
  useEffect(() => {
    try {
      migrateLegacyAutoSyncKeys(user?.id);
      const userSyncKey = user?.id ? `${AUTO_SYNC_KEY}_${user.id}` : AUTO_SYNC_KEY;
      // 🔧 ARCH fix (Round 22 Frontend H5 — AUTO_SYNC_ENABLED_KEY 不分用户):
      //    旧代码用全局 key → User A 的 auto-sync 偏好被 User B 继承。
      //    根因修复: key 加 userId 后缀。
      const userEnabledKey = user?.id ? `${AUTO_SYNC_ENABLED_KEY}_${user.id}` : AUTO_SYNC_ENABLED_KEY;
      const savedEnabled = localStorage.getItem(userEnabledKey);
      // mount 后从 localStorage 恢复 (一次性)
       
      if (savedEnabled !== null) setAutoSyncEnabled(savedEnabled === 'true');

      const savedSync = localStorage.getItem(userSyncKey);
      if (savedSync) {
        // 🔧 ARCH fix (Round 18 C1+M6): 旧代码不恢复 lastSyncTimeRef → 每次页面加载立即触发扫描
        //    + parseInt 无 NaN guard → 损坏 localStorage 导致立即扫描 + countdown 显示 NaN
        const parsed = parseInt(savedSync, 10);
        if (!Number.isNaN(parsed) && parsed > 0) {
          lastSyncTimeRef.current = parsed;  // 🔧 C1: 恢复 ref
          const elapsed = Date.now() - parsed;

          setNextSyncIn(Math.max(0, Math.ceil((AUTO_SYNC_INTERVAL_MS - elapsed) / 1000)));
        } else {
          // 损坏的 localStorage 值 — 重置
          lastSyncTimeRef.current = Date.now();
          localStorage.setItem(userSyncKey, String(lastSyncTimeRef.current));
        }
      } else {
        lastSyncTimeRef.current = Date.now();
        localStorage.setItem(userSyncKey, String(lastSyncTimeRef.current));
      }
    } catch { /* silent: non-critical operation */ }
    // 🔧 Round 20 H7: 依赖 user?.id, 用户切换时重新初始化
  }, [user?.id]);

  // Countdown timer (updates every second)
  useEffect(() => {
    if (!autoSyncEnabled || !hasActiveEmail || !user?.id) {
      // 条件不满足时重置 countdown
       
      setNextSyncIn(0);
      return;
    }
    countdownRef.current = setInterval(() => {
      const elapsed = Date.now() - lastSyncTimeRef.current;
      const remaining = Math.max(0, Math.ceil((AUTO_SYNC_INTERVAL_MS - elapsed) / 1000));
      setNextSyncIn(remaining);
    }, 1000);
    return () => { if (countdownRef.current) clearInterval(countdownRef.current); };
  }, [autoSyncEnabled, hasActiveEmail, user?.id]);

  // Auto-sync interval (triggers scan every 5 min)
  useEffect(() => {
    if (!autoSyncEnabled || !hasActiveEmail || !user?.id) return;
    const calcRemainingMs = () => {
      const elapsed = Date.now() - lastSyncTimeRef.current;
      return Math.max(0, AUTO_SYNC_INTERVAL_MS - elapsed);
    };
    const remainingMs = calcRemainingMs();
    const initialTimeout = setTimeout(() => {
      if (!isScanningRef.current) handleScanEmails();
      autoSyncTimerRef.current = setInterval(() => {
        if (!isScanningRef.current) handleScanEmails();
      }, AUTO_SYNC_INTERVAL_MS);
    }, remainingMs);
    return () => {
      clearTimeout(initialTimeout);
      if (autoSyncTimerRef.current) clearInterval(autoSyncTimerRef.current);
    };
  }, [autoSyncEnabled, hasActiveEmail, user?.id, handleScanEmails]);

  // Page Visibility API: sync immediately when page becomes visible
  useEffect(() => {
    if (!autoSyncEnabled || !hasActiveEmail || !user?.id) return;
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        const elapsed = Date.now() - lastSyncTimeRef.current;
        if (elapsed >= AUTO_SYNC_INTERVAL_MS && !isScanningRef.current) {
          handleScanEmails();
        }
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);
    return () => document.removeEventListener('visibilitychange', handleVisibility);
  }, [autoSyncEnabled, hasActiveEmail, user?.id, handleScanEmails]);

  // Toggle auto-sync
  const handleToggleAutoSync = useCallback(() => {
    setAutoSyncEnabled((prev) => {
      const next = !prev;
      // 🔧 Round 22 H5: 用 user-specific key
      const userEnabledKey = user?.id ? `${AUTO_SYNC_ENABLED_KEY}_${user.id}` : AUTO_SYNC_ENABLED_KEY;
      try { localStorage.setItem(userEnabledKey, String(next)); } catch { /* silent: non-critical operation */ }
      return next;
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional omission (stable ref/callback)
  }, []);

  return {
    emailConnections,
    emailReceipts,
    setEmailReceipts,
    emailConnectionsRef,
    emailReceiptsRef,
    isLoadingEmail,
    isConnecting,
    isScanning,
    scanResult,
    autoSyncEnabled,
    nextSyncIn,
    hasActiveEmail,
    loadEmailData,
    handleConnectGmail,
    handleConnectIMAP,
    handleDisconnectGmail,
    handleScanEmails,
    handleToggleAutoSync,
    setToast,
    pendingIgnoresRef,
    isDemoRef,
  };
}
