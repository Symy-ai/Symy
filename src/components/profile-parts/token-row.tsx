"use client";

/**
 * TokenRow — 代币行 (owner 09-06 布局指令)
 *
 * 从 buddy 页迁移到「我的 → 总览详情页」, 放在今日绿色守护日报上方。
 * 形式: 代币 n ⓘ / 虚拟货币
 * 点击 ⓘ → 代币详情浮层 (获得/使用说明, 内容与原 buddy 代币详情一致)。
 * 数据: GET /api/buddy/state (tokens), 自包含, 不依赖 buddy 页传参。
 */

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Coins, Info, X } from 'lucide-react';
import { useI18n } from '@/i18n/provider';
import { apiFetch } from '@/lib/api-client';
import { logger } from '@/lib/logger';

export function TokenRow() {
  const { t } = useI18n();
  const [tokens, setTokens] = useState<number | null>(null);
  const [showDetail, setShowDetail] = useState(false);

  useEffect(() => {
    let cancelled = false;
    // eslint-disable-next-line symy/no-raw-fetch-in-use-effect -- one-shot decorative read; buddy state already cached by RQ elsewhere, absence tolerated
    apiFetch<{ buddyState?: { tokens?: number } }>('/api/buddy/state')
      .then((data) => {
        if (!cancelled && typeof data?.buddyState?.tokens === 'number') setTokens(data.buddyState.tokens);
      })
      .catch((err) => {
        // safe to ignore: token row is decorative; absence is acceptable
        logger.warn('[TokenRow] state fetch failed:', err instanceof Error ? err.message : String(err));
      });
    return () => { cancelled = true; };
  }, []);

  return (
    <>
      <div className="flex items-center justify-between rounded-xl border border-glass-border bg-glass-fill px-4 py-3">
        <div className="flex items-center gap-2">
          <Coins className="w-4 h-4 text-amber-400" aria-hidden="true" />
          <span className="text-sm font-medium text-text-primary">{t('buddy.tokens', { defaultValue: 'Tokens' })}</span>
          <span className="text-sm font-bold gradient-text-amber">{tokens ?? '—'}</span>
          <button
            type="button"
            onClick={() => setShowDetail(true)}
            aria-label={t('buddy.tokenDetail', { defaultValue: 'Token details' })}
            className="text-text-tertiary/70 hover:text-cyan-400 transition-colors"
          >
            <Info className="w-3.5 h-3.5" aria-hidden="true" />
          </button>
        </div>
        <span className="text-[10px] text-text-tertiary">{t('buddy.virtualCurrency', { defaultValue: '虚拟货币 / Virtual currency' })}</span>
      </div>

      {showDetail && createPortal(
        <div className="fixed inset-0 z-[200] flex items-end justify-center bg-black/40 backdrop-blur-sm" onClick={() => setShowDetail(false)}>
          <div className="w-full max-w-md bg-surface-1 rounded-t-3xl flex flex-col max-h-[80vh] overflow-y-auto custom-scrollbar animate-in slide-in-from-bottom duration-300" onClick={(e) => e.stopPropagation()}>
            <div className="flex-shrink-0 pt-2 pb-1 flex justify-center">
              <div className="w-10 h-1 rounded-full bg-glass-border" />
            </div>
            <div className="flex-shrink-0 flex items-center justify-between px-4 py-3 border-b border-glass-border">
              <h2 className="text-base font-bold text-text-primary flex items-center gap-2">
                <Coins className="w-4 h-4 text-amber-400" />
                {t('buddy.tokenDetailTitle', { defaultValue: 'Tokens' })}
              </h2>
              <button onClick={() => setShowDetail(false)} className="text-text-secondary hover:text-text-primary transition-colors" aria-label={t('common.close')}>
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="flex-1 px-4 py-4 space-y-4">
              <div className="text-center py-3 rounded-xl bg-glass-fill">
                <p className="text-3xl font-bold gradient-text-amber">{tokens ?? '—'}</p>
                <p className="text-xs text-text-tertiary mt-1">{t('buddy.tokensLeft', { n: tokens ?? 0 })}</p>
              </div>
              <div>
                <h3 className="text-xs font-semibold text-text-secondary mb-2">{t('buddy.tokenHowToEarn', { defaultValue: 'How to earn' })}</h3>
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between p-2 rounded-lg bg-glass-fill/50">
                    <span className="text-xs text-text-primary">✨ {t('buddy.tokenEarnChallenge', { defaultValue: 'Complete a See it challenge' })}</span>
                    <span className="text-xs font-bold text-emerald-400">+5~10</span>
                  </div>
                  <div className="flex items-center justify-between p-2 rounded-lg bg-glass-fill/50">
                    <span className="text-xs text-text-primary">🎁 {t('buddy.tokenEarnGacha', { defaultValue: 'Complete a What If story' })}</span>
                    <span className="text-xs font-bold text-emerald-400">+10~15</span>
                  </div>
                  <div className="flex items-center justify-between p-2 rounded-lg bg-glass-fill/50">
                    <span className="text-xs text-text-primary">🔥 {t('buddy.tokenEarnStreak', { defaultValue: 'Daily streak bonus' })}</span>
                    <span className="text-xs font-bold text-emerald-400">+5</span>
                  </div>
                </div>
              </div>
              <div>
                <h3 className="text-xs font-semibold text-text-secondary mb-2">{t('buddy.tokenHowToSpend', { defaultValue: 'How to spend' })}</h3>
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between p-2 rounded-lg bg-cyan-500/8 border border-cyan-500/15">
                    <span className="text-xs text-text-primary">🔄 +1 {t('buddy.tokenSpendSeeIt', { defaultValue: 'See it (extra challenge)' })}</span>
                    <span className="text-xs font-bold text-cyan-400">20</span>
                  </div>
                  <div className="flex items-center justify-between p-2 rounded-lg bg-purple-500/8 border border-purple-500/15">
                    <span className="text-xs text-text-primary">🔄 +1 {t('buddy.tokenSpendGacha', { defaultValue: 'What If (extra story)' })}</span>
                    <span className="text-xs font-bold text-purple-400">50</span>
                  </div>
                  <div className="flex items-center justify-between p-2 rounded-lg bg-orange-500/8 border border-orange-500/15">
                    <span className="text-xs text-text-primary">🔄 {t('buddy.tokenSpendStreakRestore', { defaultValue: 'Restore broken streak' })}</span>
                    <span className="text-xs font-bold text-orange-400">50</span>
                  </div>
                </div>
              </div>
              <p className="text-[10px] text-text-tertiary text-center leading-relaxed">
                {t('buddy.tokenNote', { defaultValue: 'Tokens are virtual currency within Symy. They have no real-world value.' })}
              </p>
            </div>
          </div>
        </div>,
        document.body
      )}
    </>
  );
}
