'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { useAuth } from '@/components/auth/auth-provider';
import { useI18n } from '@/i18n/provider';
import { apiFetch, apiFetchVoid } from '@/lib/api-client';
import { logger } from '@/lib/logger';
import type { EmailConnection, EmailReceipt } from '@/lib/supabase';

interface UseProfileDataArgs {
  showPremiumToastMsg: (msg: string) => void;
}

/**
 * 用户 profile 数据: plan (VIP 内测) + 邮箱接入 connections/receipts + 断连处理
 * (原为 profile-tab.tsx 内联逻辑 — File Split Wave 1 纯搬运, 行为零变化)
 */
export function useProfileData({ showPremiumToastMsg }: UseProfileDataArgs) {
  const { t } = useI18n();
  const { user } = useAuth();
  const [profile, setProfile] = useState({
    plan: 'free' as 'free' | 'premium',
    notificationEnabled: false,
    rpaStatus: 'inactive' as const,
  });
  // 🔧 VIP 内测: 邮箱接入功能仅对 premium 用户开放
  //   普通用户看到"VIP 内测功能，加入候补名单"
  //   premium 用户才能直接连接邮箱
  const isEmailMonitorEnabled = profile.plan === 'premium';
  const [emailConnections, setEmailConnections] = useState<EmailConnection[]>([]);
  const [emailReceipts, setEmailReceipts] = useState<EmailReceipt[]>([]);

  // 🔧 S-07 fix: 添加取消标志防止 unmount 后 setState
  useEffect(() => {
    if (!user?.id) return;
    let cancelled = false;
    // 🔧 架构还债: 用 apiFetch 替代内联 fetch
  // eslint-disable-next-line symy/no-raw-fetch-in-use-effect
    apiFetch<{ connections?: EmailConnection[] }>('/api/email/status')
      .then((data) => {
        if (!cancelled && data.connections) setEmailConnections(data.connections);
      })
      .catch((err) => {
        // 🔧 ARCH fix (Round 5 AUDIT-1 L-3): 旧代码 silent catch → 用户看不到 fetch 失败与空 connections 的区别
        //    根因修复: 至少记录 warning, 开发模式下可在 console 看到
        logger.warn('[ProfileTab] Failed to load email connections:', err instanceof Error ? err.message : String(err));
      });
    // 🔧 VIP 内测: 获取用户 plan (判断邮箱接入权限)
  // eslint-disable-next-line symy/no-raw-fetch-in-use-effect
    apiFetch<{ isPremium?: boolean }>('/api/challenge/limit')
      .then((data) => {
        if (!cancelled && data.isPremium) {
          setProfile(prev => ({ ...prev, plan: 'premium' as const }));
        }
      })
      .catch((err) => {
        logger.warn('[ProfileTab] Failed to fetch plan:', err instanceof Error ? err.message : String(err));
      });
    return () => { cancelled = true; };
  }, [user?.id]);

  useEffect(() => {
    if (!user?.id) return;
    let cancelled = false;
    // 🔧 ARCH fix (Round 22 Frontend H4 — Promise.all fails on partial fetch failure):
    //    旧代码用 Promise.all — 任一 fetch 失败则全部丢弃, 用户看到 $0 saved。
    //    根因修复: 用 Promise.allSettled, 部分成功仍显示数据。
    Promise.allSettled([
  // eslint-disable-next-line symy/no-raw-fetch-in-use-effect
      apiFetch<{ receipts?: EmailReceipt[] }>('/api/email/receipts?status=actionable&limit=50'),
  // eslint-disable-next-line symy/no-raw-fetch-in-use-effect
      apiFetch<{ receipts?: EmailReceipt[] }>('/api/email/receipts?status=refunded&limit=50'),
    ]).then(([actionableResult, refundedResult]) => {
      if (cancelled) return;
      const actionable = actionableResult.status === 'fulfilled' ? (actionableResult.value.receipts || []) as EmailReceipt[] : [];
      const refunded = refundedResult.status === 'fulfilled' ? (refundedResult.value.receipts || []) as EmailReceipt[] : [];
      setEmailReceipts([...actionable, ...refunded]);
    });
    return () => { cancelled = true; };
  }, [user?.id]);

  const uniqueReceipts = useMemo(() => Array.from(new Map(emailReceipts.map((r) => [r.id, r])).values()), [emailReceipts]);

  const handleEmailDisconnect = useCallback(async (connectionId: string) => {
    if (!user?.id) return;
    try {
      await apiFetchVoid(`/api/email/disconnect?connectionId=${encodeURIComponent(connectionId)}`, { method: 'DELETE' });
      setEmailConnections((prev) => prev.filter((c) => c.id !== connectionId));
      setEmailReceipts((prev) => prev.filter((r) => r.connection_id !== connectionId));
      showPremiumToastMsg(t('profile.emailDisconnectSuccess', { defaultValue: 'Email connection removed' }));
    } catch (err) {
      logger.warn('[ProfileTab] Email disconnect failed:', err instanceof Error ? err.message : String(err));
      showPremiumToastMsg(t('profile.emailDisconnectFailed', { defaultValue: 'Failed to disconnect — please try again' }));
    }
  }, [user?.id, t, showPremiumToastMsg]);

  return { profile, isEmailMonitorEnabled, emailConnections, uniqueReceipts, handleEmailDisconnect };
}
