'use client';

/**
 * ChatBanners — Chat tab 中的 3 个状态 banner
 *
 * 从 chat-tab.tsx 抽出 (C6 拆分).
 * 1. ActiveChallengeBanner: 当前活跃挑战 + I'll pass 按钮
 * 2. ImpulseBanner: 冲动消费提醒
 * 3. ExpiredChallengeBanner: 过期挑战 + Resume/Dismiss 按钮
 *
 * 纯展示 + 回调组件, 无 state.
 */

import { useState } from 'react';
import { useI18n } from '@/i18n/provider';
import { formatPlatformName } from '@/lib/utils';
// 🔧 ARCH fix (Round 57 REVIEW-A-3): 用共享 getChallengeTypeI18nKey 替代内联阈值
import { getChallengeTypeI18nKey } from '@/lib/challenge-rules';
import type { ActiveChallenge, ExpiredChallenge } from '../hooks/use-challenge-actions';

export interface ChatBannersProps {
  activeChallenge?: ActiveChallenge;
  expiredChallenge: ExpiredChallenge | null;
  impulseContext?: {
    platform: string;
    amount: number;
    reasons: string[];
    time: string;
  };
  // 🔧 ARCH fix (Round 12 ADV-R11-10): chat/history GET 500 时显示错误 + 重试按钮
  historyLoadError?: string | null;
  onRetryLoadHistory?: () => void;
  onGiveUp: (challenge: ActiveChallenge) => void;
  /** 🔧 P0 fix (mirror philosophy): "I choose to buy" — 用户决定买, 镜子尊重 */
  onChooseToBuy?: (challenge: ActiveChallenge) => void;
  onResume: (expired: ExpiredChallenge) => void;
  onDismiss: (expired: ExpiredChallenge) => void;
  /** 🔧 V4-6 fix: AI 回复中禁用按钮, 防止重复触发 complete_challenge */
  isLoading?: boolean;
}

export function ChatBanners({
  activeChallenge,
  expiredChallenge,
  impulseContext,
  historyLoadError,
  onRetryLoadHistory,
  onGiveUp,
  onChooseToBuy,
  onResume,
  onDismiss,
  isLoading = false,
}: ChatBannersProps) {
  const { t } = useI18n();
  // 🔧 P4-8 fix (2026-07-20): Bought anyway 确认状态 — 点击后显示"再想想"确认
  const [showBuyConfirm, setShowBuyConfirm] = useState(false);

  return (
    <>
      {/* 🔧 Round 12 ADV-R11-10: History Load Error Banner + Retry */}
      {historyLoadError && (
        <div className="mt-3 p-3 rounded-xl bg-red-500/15 border border-red-500/40 dark:bg-red-500/25 dark:border-red-500/50">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-xs text-red-400 font-medium">
              ⚠️ {t('chat.historyLoadFailed', { defaultValue: 'Failed to load chat history' })}
            </span>
          </div>
          <p className="text-[10px] text-red-400/70 mb-2 break-words">{historyLoadError}</p>
          {onRetryLoadHistory && (
            <button
              onClick={onRetryLoadHistory}
              className="w-full py-1.5 px-3 rounded-lg bg-red-500/20 text-red-300 border border-red-500/40 text-xs font-medium hover:bg-red-500/30 transition-all active:scale-[0.98]"
            >
              🔄 {t('chat.retryLoadHistory', { defaultValue: 'Retry' })}
            </button>
          )}
        </div>
      )}

      {/* Active Challenge Banner */}
      {activeChallenge && (
        <div className="mt-3 p-3 rounded-xl bg-gradient-to-r from-red-500/25 to-rose-500/10 border border-red-500/40 dark:from-red-500/40 dark:to-rose-500/20 dark:border-red-500/60 shadow-sm shadow-red-500/10">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="relative flex h-2 w-2">
                <span className="motion-safe:animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500"></span>
              </span>
              <p className="text-xs text-red-400 font-bold">
                🛡️ {t(`chat.challengeTiers.${getChallengeTypeI18nKey(activeChallenge.amount)}`)}: {activeChallenge.itemName.length > 30 ? activeChallenge.itemName.substring(0, 30) + '...' : activeChallenge.itemName}
              </p>
            </div>
            <span className="text-sm text-red-400 font-bold">${activeChallenge.amount.toFixed(2)}</span>
          </div>
          <div className="grid grid-cols-2 gap-2 mt-2">
            {/* 🔧 P0-1.3 fix (2026-07-21): 方案 A — 4 个细粒度决策按钮替换 2 个粗粒度按钮 */}
            {/*   旧代码: 2 个按钮 (看见了/还是买了) + 4 个快捷回复 = 6 个按钮, 语义重叠 */}
            {/*   新代码: 4 个细粒度按钮, 语义清晰, 无重叠 */}
            <button
              onClick={() => onGiveUp(activeChallenge)}
              disabled={isLoading}
              className="py-1.5 px-2 rounded-lg bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 text-xs font-medium hover:bg-emerald-500/30 transition-all active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed disabled:active:scale-100"
              aria-label={t('demo.quickReplies.resisted', { defaultValue: 'I saw it, didn\'t buy' })}
            >
              ✅ {t('demo.quickReplies.resisted', { defaultValue: 'I saw it, didn\'t buy' })}
            </button>
            <button
              onClick={() => onGiveUp(activeChallenge)}
              disabled={isLoading}
              className="py-1.5 px-2 rounded-lg bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 text-xs font-medium hover:bg-cyan-500/30 transition-all active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed disabled:active:scale-100"
              aria-label={t('demo.quickReplies.dontNeed', { defaultValue: 'I don\'t actually need it' })}
            >
              💡 {t('demo.quickReplies.dontNeed', { defaultValue: 'I don\'t actually need it' })}
            </button>
            <button
              onClick={() => setShowBuyConfirm(true)}
              disabled={isLoading}
              className="py-1.5 px-2 rounded-lg bg-amber-500/20 text-amber-300 border border-amber-500/40 text-xs font-medium hover:bg-amber-500/30 transition-all active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed disabled:active:scale-100"
              aria-label={t('demo.quickReplies.boughtIt', { defaultValue: 'I bought it' })}
            >
              🛒 {t('demo.quickReplies.boughtIt', { defaultValue: 'I bought it' })}
            </button>
            <button
              onClick={() => setShowBuyConfirm(true)}
              disabled={isLoading}
              className="py-1.5 px-2 rounded-lg bg-rose-500/20 text-rose-300 border border-rose-500/40 text-xs font-medium hover:bg-rose-500/30 transition-all active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed disabled:active:scale-100"
              aria-label={t('demo.quickReplies.boughtImpulse', { defaultValue: 'Couldn\'t resist, induced bought' })}
            >
              😔 {t('demo.quickReplies.boughtImpulse', { defaultValue: 'Couldn\'t resist, induced bought' })}
            </button>
          </div>

          {/* 🔧 P4-8 fix (2026-07-20): Bought anyway 确认弹窗 — 点击"我买了/冲动买了"后显示确认 */}
          {showBuyConfirm && onChooseToBuy && (
            <div className="mt-2 flex items-center gap-1.5 py-1.5 px-2 rounded-lg bg-amber-500/10 border border-amber-500/30 text-xs">
              <span className="text-amber-300 text-[10px] flex-1 truncate">
                {t('chat.challengeBuyConfirm', { defaultValue: 'Sure?' })}
              </span>
              <button
                onClick={() => { setShowBuyConfirm(false); onChooseToBuy(activeChallenge); }}
                disabled={isLoading}
                className="px-2 py-1 rounded bg-amber-500/30 text-amber-200 text-[10px] font-medium hover:bg-amber-500/40 transition-colors disabled:opacity-50"
              >
                {t('chat.challengeBuyConfirmYes', { defaultValue: 'Yes' })}
              </button>
              <button
                onClick={() => setShowBuyConfirm(false)}
                className="px-2 py-1 rounded bg-glass-fill text-text-secondary text-[10px] font-medium hover:bg-glass-hover transition-colors"
              >
                {t('chat.challengeBuyConfirmNo', { defaultValue: 'Wait' })}
              </button>
            </div>
          )}

          <p className="text-[10px] text-red-400/60 mt-1.5">
            {t('chat.challengeDesc')}
          </p>
        </div>
      )}

      {/* Impulse Context Banner (隐藏在挑战模式中) */}
      {impulseContext && !activeChallenge && (
        <div className="mt-3 p-2.5 rounded-xl bg-red-500/10 border border-red-500/20">
          <div className="flex items-center justify-between">
            <p className="text-xs text-red-400 font-medium">
              {t(`chat.challengeTypes.${getChallengeTypeI18nKey(impulseContext.amount ?? 0)}`)} — ${(impulseContext.amount ?? 0).toFixed(2)}
            </p>
            <span className="text-[10px] text-red-400/60">{formatPlatformName(impulseContext.platform)}</span>
          </div>
          {impulseContext.reasons.length > 0 && (
            <p className="text-[10px] text-red-400/60 mt-0.5">
              {impulseContext.reasons.join(' · ')}
            </p>
          )}
        </div>
      )}

      {/* Expired Challenge Banner */}
      {expiredChallenge && !activeChallenge && (
        <div className="mt-3 p-3 rounded-xl bg-amber-500/15 border border-amber-500/40 dark:bg-amber-500/25 dark:border-amber-500/50">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-xs text-amber-400 font-medium">
              ⏰ {t('chat.expiredChallengeTitle', { defaultValue: 'Your challenge expired' })}
            </span>
            <span className="text-[10px] text-amber-400/60">
              {expiredChallenge.itemName} (${expiredChallenge.amount.toFixed(2)})
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => onResume(expiredChallenge)}
              className="flex-1 py-1.5 px-3 rounded-lg bg-amber-500/20 text-amber-300 border border-amber-500/40 text-xs font-medium hover:bg-amber-500/30 transition-all active:scale-[0.98]"
            >
              🔄 {t('chat.resumeChallenge', { defaultValue: 'Resume challenge' })}
            </button>
            <button
              onClick={() => onDismiss(expiredChallenge)}
              className="py-1.5 px-3 rounded-lg bg-glass-fill text-text-tertiary border border-glass-border text-xs hover:text-text-secondary transition-all"
            >
              {t('chat.dismissChallenge', { defaultValue: 'Dismiss' })}
            </button>
          </div>
        </div>
      )}
    </>
  );
}
