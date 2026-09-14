'use client';

import { useState, useCallback } from 'react';
import { useI18n } from '@/i18n/provider';

export type RedeemType = 'see_it' | 'gacha';

interface UseRedeemDialogArgs {
  isDemo: boolean;
  onToast?: (message: string, type?: 'success' | 'info') => void;
}

/**
 * 🔧 代币兑换对话框 — 次数用完时用 token 换额外次数
 * (原为 buddy-tab.tsx 内联逻辑 — File Split Wave 1 纯搬运, 行为零变化)
 */
export function useRedeemDialog({ isDemo, onToast }: UseRedeemDialogArgs) {
  const { t } = useI18n();
  const [showRedeemDialog, setShowRedeemDialog] = useState(false);
  const [redeemType, setRedeemType] = useState<RedeemType>('see_it');
  const [redeeming, setRedeeming] = useState(false);

  /** 次数用完 → 打开兑换对话框 (调用方: use-challenge-flow 的 handleSeeItClick) */
  const openRedeemDialog = useCallback((type: RedeemType) => {
    setRedeemType(type);
    setShowRedeemDialog(true);
  }, []);

  const handleRedeem = useCallback(async () => {
    if (isDemo || redeeming) return;
    setRedeeming(true);
    try {
      const { apiFetch } = await import('@/lib/api-client');
      const result = await apiFetch<{ success: boolean; tokens: number; cost: number; error?: string }>('/api/buddy/redeem', {
        method: 'POST',
        body: { type: redeemType },
      });
      if (result.success) {
        onToast?.(t('buddy.redeemSuccess', { defaultValue: `✓ Redeemed! {cost} tokens used`, cost: result.cost }), 'success');
        setShowRedeemDialog(false);
        window.dispatchEvent(new CustomEvent('symy:challenge-completed'));
        setTimeout(() => window.location.reload(), 1000);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed';
      if (msg.includes('Insufficient')) {
        onToast?.(t('buddy.redeemInsufficient', { defaultValue: 'Not enough tokens' }), 'info');
      } else {
        onToast?.(t('buddy.redeemFailed', { defaultValue: 'Redeem failed. Try again.' }), 'info');
      }
    } finally {
      setRedeeming(false);
    }
  }, [isDemo, redeeming, redeemType, onToast, t]);

  return { showRedeemDialog, setShowRedeemDialog, redeemType, redeeming, openRedeemDialog, handleRedeem };
}
