'use client';

import { X } from 'lucide-react';
import { useI18n } from '@/i18n/provider';
import type { RedeemType } from '../hooks/use-redeem-dialog';

interface RedeemDialogProps {
  redeemType: RedeemType;
  /** 🔧 P1-3 fix: Token 数字滚动动画 (hook 在壳上持续运行, 保证打开时数值已是当前值) */
  animatedTokens: number;
  tokens: number;
  redeeming: boolean;
  onRedeem: () => void;
  onClose: () => void;
}

/**
 * 🔧 代币兑换对话框 — 次数用完时显示
 * (原为 buddy-tab.tsx 内联 JSX — File Split Wave 1 纯搬运, 行为零变化)
 * 由父组件条件渲染: {showRedeemDialog && <RedeemDialog .../>}
 */
export function RedeemDialog({ redeemType, animatedTokens, tokens, redeeming, onRedeem, onClose }: RedeemDialogProps) {
  const { t } = useI18n();
  return (
    <div className="fixed inset-0 z-[200] flex items-end justify-center bg-black/40 backdrop-blur-sm" onClick={onClose}>
      <div className="w-full max-w-md bg-surface-1 rounded-t-3xl flex flex-col animate-in slide-in-from-bottom duration-300" onClick={e => e.stopPropagation()}>
        <div className="flex-shrink-0 pt-2 pb-1 flex justify-center">
          <div className="w-10 h-1 rounded-full bg-glass-border" />
        </div>
        <div className="flex-shrink-0 flex items-center justify-between px-4 py-3 border-b border-glass-border">
          <h2 className="text-base font-bold text-text-primary">
            {redeemType === 'see_it' ? t('buddy.challengeLimitReached', { defaultValue: "You've reached today's limit" }) : t('butterfly.gachaLimitReached', { defaultValue: 'Daily limit reached' })}
          </h2>
          <button onClick={onClose} className="text-text-secondary hover:text-text-primary transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="flex-1 px-4 py-4 space-y-3">
          <p className="text-sm text-text-secondary text-center">
            {t('buddy.redeemPrompt', { defaultValue: 'Use tokens to get one more?' })}
          </p>
          <div className="flex items-center justify-center gap-2 p-3 rounded-xl bg-glass-fill">
            <span className="text-2xl">🪙</span>
            <span className="text-lg font-bold text-text-primary">{animatedTokens}</span>
            <span className="text-xs text-text-tertiary">{t('buddy.tokensLeft', { n: animatedTokens })}</span>
          </div>
          <button
            onClick={onRedeem}
            disabled={redeeming || tokens < (redeemType === 'see_it' ? 20 : 50)}
            className="w-full py-3 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 text-white font-bold text-sm hover:from-amber-400 hover:to-orange-400 transition-all active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
          >
            {redeeming ? '...' : t('buddy.redeemButton', {
              defaultValue: `Redeem +1 ${redeemType === 'see_it' ? 'See it' : 'What If'} (${redeemType === 'see_it' ? 20 : 50} tokens)`,
              type: redeemType === 'see_it' ? t('buddy.seeIt', { defaultValue: 'See it' }) : t('buddy.gacha', { defaultValue: 'What If' }),
              cost: redeemType === 'see_it' ? 20 : 50,
            })}
          </button>
          {tokens < (redeemType === 'see_it' ? 20 : 50) && (
            <p className="text-[10px] text-amber-400 text-center">
              {t('buddy.redeemNotEnough', { defaultValue: 'Not enough tokens. Complete more challenges to earn tokens.' })}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
