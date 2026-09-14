'use client';

import { MoonStar } from 'lucide-react';
import { useI18n } from '@/i18n/provider';

/**
 * Dormant state: Revival prompt
 * (原为 buddy-tab.tsx 内联 JSX — File Split Wave 1 纯搬运, 行为零变化)
 * 由父组件条件渲染: {buddyState.health === 'dormant' && <DormantRevivalPrompt .../>}
 */
export function DormantRevivalPrompt({ onRevive }: { onRevive: () => void }) {
  const { t } = useI18n();
  return (
    <div className="relative z-10 px-4 py-3">
      <div className="bg-gradient-to-br from-emerald-500/15 to-amber-500/10 border border-emerald-500/30 rounded-xl p-4 text-center shadow-lg">
        <div className="mx-auto mb-2 flex h-10 w-10 items-center justify-center rounded-full border border-emerald-500/40 bg-emerald-500/20">
          <MoonStar className="h-5 w-5 text-emerald-400" aria-hidden="true" />
        </div>
        <p className="text-sm font-bold text-emerald-400">{t('buddy.companionLostPower')}</p>
        <p className="text-xs text-text-tertiary mt-1 mb-3">
          {t('buddy.depositToReviveDesc')}
        </p>
        <button
          onClick={onRevive}
          className="px-4 py-2 bg-gradient-to-r from-emerald-500 to-amber-500 text-[#0c2017] text-sm font-bold rounded-xl hover:from-emerald-400 hover:to-amber-400 active:scale-95 transition-all btn-shimmer"
        >
          {t('buddy.reviveCompanion')}
        </button>
      </div>
    </div>
  );
}
