'use client';

import { Shield } from 'lucide-react';
import { useI18n } from '@/i18n/provider';
import type { ChallengeLimitData } from '@/hooks/use-challenge-limit';

interface QuickActionsProps {
  isDemo: boolean;
  isCheckingChallenge: boolean;
  challengePulse: boolean;
  challengeLimitData: ChallengeLimitData | null;
  /** "See it" 点击处理 (逻辑在 use-challenge-flow 的 handleSeeItClick) */
  onSeeItClick: () => void;
  /** Round 105: Pet Symy moved to companion detail modal. This button is now Gacha entry. */
  onGacha?: () => void;
}

/**
 * ====== Quick Actions — moved up for accessibility ======
 * (原为 buddy-tab.tsx 内联 JSX — File Split Wave 1 纯搬运, 行为零变化)
 */
export function QuickActions({ isDemo, isCheckingChallenge, challengePulse, challengeLimitData, onSeeItClick, onGacha }: QuickActionsProps) {
  const { t } = useI18n();
  return (
    <div className="relative z-10 px-4 py-3">
      <div className="grid grid-cols-2 gap-2.5">
        <button
          type="button"
          data-onboarding="see-it-button"
          disabled={isCheckingChallenge || (!!(!isDemo && challengeLimitData && !challengeLimitData.degraded && !challengeLimitData.isPremium && challengeLimitData.remaining === 0))}
          title={!isDemo && challengeLimitData && !challengeLimitData.degraded && !challengeLimitData.isPremium && challengeLimitData.remaining === 0
            ? t('buddy.challengeLimitReached', { defaultValue: "You've seen 5 times today. Come back tomorrow — or Premium for unlimited." })
            : undefined}
          aria-label={t('buddy.seeItAriaLabel', { defaultValue: 'See it — help me see the real cost' })}
          onClick={onSeeItClick}
          className={`flex items-center gap-2 p-3 rounded-xl transition-all select-none min-h-[44px] ${
            !isDemo && challengeLimitData && !challengeLimitData.degraded && !challengeLimitData.isPremium && challengeLimitData.remaining === 0
              ? 'bg-glass-fill border border-glass-border opacity-50 cursor-not-allowed'
              : `bg-gradient-to-r from-cyan-500/10 to-blue-500/10 border border-cyan-500/15 hover:from-cyan-500/20 hover:to-blue-500/20 hover:shadow-lg hover:shadow-cyan-500/20 hover:-translate-y-0.5 active:scale-95 neon-border cursor-pointer ${challengePulse ? 'ring-2 ring-cyan-400/60 scale-[0.97]' : ''}`
          }`}
        >
          {isCheckingChallenge ? (
            <svg className="animate-spin w-4 h-4 text-cyan-400 flex-shrink-0" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
            </svg>
          ) : (
            <Shield className={`w-4 h-4 text-cyan-400 transition-transform flex-shrink-0 ${challengePulse ? 'scale-125' : ''}`} />
          )}
          {/* 🔧 P1-10 fix: 文字区块 flex-1 + min-w-0, 防止移动端文字挤压 badge */}
          <div className="text-left flex-1 min-w-0">
            <p className="text-xs font-semibold text-text-primary leading-tight">{t('buddy.challenge')}</p>
            <p className="text-[9px] text-text-tertiary truncate">{t('buddy.convinceMeToBuy')}</p>
          </div>
          {/* 🔧 需求六: 显示剩余挑战次数 (免费版 3/天) */}
          {/* 🔧 P1-10 fix: badge flex-shrink-0 保证不被挤压 */}
          {!isDemo && challengeLimitData && !challengeLimitData.degraded && !challengeLimitData.isPremium && (
            <span className={`flex-shrink-0 text-[9px] px-1.5 py-0.5 rounded-full whitespace-nowrap ${challengeLimitData.remaining > 0 ? 'text-cyan-400/70 bg-cyan-500/10' : 'text-amber-500 bg-amber-500/10'}`}>
              {challengeLimitData.remaining > 0
                ? t('buddy.challengeRemaining', { n: challengeLimitData.remaining, defaultValue: `{n} left` })
                : t('buddy.challengeLimitBadge', { defaultValue: 'Limit' })}
            </span>
          )}
        </button>
        {/* Round 105: Pet Symy moved to companion detail modal. This button is now Gacha entry. */}
        <button
          type="button"
          onClick={() => onGacha?.()}
          aria-label={t('buddy.gacha', { defaultValue: 'Gacha' })}
          className="relative flex items-center gap-2 p-3 rounded-xl bg-gradient-to-r from-purple-500/10 to-pink-500/10 border border-purple-500/15 hover:from-purple-500/20 hover:to-pink-500/20 hover:shadow-lg hover:shadow-purple-500/20 hover:-translate-y-0.5 active:scale-95 neon-border-purple cursor-pointer transition-all select-none"
        >
          <span className="text-base">🎁</span>
          <div className="text-left">
            <p className="text-xs font-semibold text-text-primary">{t('buddy.gacha', { defaultValue: 'Gacha' })}</p>
            <p className="text-[9px] text-text-tertiary">{t('buddy.gachaDesc', { defaultValue: 'See your reclaimed life' })}</p>
          </div>
        </button>
      </div>
    </div>
  );
}
