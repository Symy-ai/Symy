'use client';

import Image from 'next/image';
import { useI18n } from '@/i18n/provider';
import { FeaturePreviewSection } from '../feature-preview-section';

/**
 * ====== Demo 模式：注册引导 CTA ======
 * 🔧 U-1 fix: 配合外层 !user guard，防止已登录用户因 isDemo 竞态看到注册引导
 * (原为 profile-tab.tsx 内联 JSX — File Split Wave 1 纯搬运, 行为零变化)
 */
export function DemoSignupPrompt() {
  const { t } = useI18n();
  return (
    <div className="h-full overflow-y-auto px-4 py-6 space-y-6 custom-scrollbar">
      {/* Demo Profile Header */}
      <div className="flex flex-col items-center pt-4">
        <div className="relative w-20 h-20 mb-3">
          <div className="absolute inset-0 rounded-full bg-gradient-to-r from-cyan-400/20 to-purple-400/20 blur-md animate-pulse" />
          <div className="relative w-20 h-20 rounded-full bg-gradient-to-br from-cyan-500/30 to-purple-500/30 flex items-center justify-center ring-2 ring-dashed ring-cyan-500/30">
            { }
            <Image src="/symy-elephant-avatar.png" alt="Symy" width={48} height={48} className="w-12 h-12 rounded-full object-cover" />
          </div>
        </div>
        <h2 className="text-lg font-bold text-text-primary">{t('profile.welcomeToSymy')}</h2>
        <p className="text-xs text-text-tertiary mt-1">{t('profile.signUpToUnlock')}</p>
      </div>

      {/* CTA Card */}
      <div className="glass-card-strong rounded-2xl p-5 relative overflow-hidden">
        <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-cyan-400 via-purple-500 to-pink-500" />
        <h3 className="text-base font-bold text-text-primary mb-3">{t('profile.createFreeAccount')}</h3>
        <div className="space-y-2.5 mb-4">
          {[
            { icon: '🛡️', text: t('profile.features.impulseProtection') },
            { icon: '💬', text: t('profile.features.personalCompanion') },
            { icon: '📊', text: t('profile.features.realInsights') },
            { icon: '💰', text: t('profile.features.smartRefund') },
            { icon: '🐾', text: t('profile.features.companionHealth') },
          ].map((item, i) => (
            <div key={i} className="flex items-center gap-2.5 px-2 py-1.5">
              <span className="text-base">{item.icon}</span>
              <span className="text-sm text-text-secondary">{item.text}</span>
            </div>
          ))}
        </div>
        <button
          onClick={() => window.location.href = '/auth/signup'}
          className="w-full flex items-center justify-center gap-2 px-5 py-3 rounded-xl bg-gradient-to-r from-cyan-500 to-purple-600 text-white text-sm font-bold hover:from-cyan-400 hover:to-purple-500 transition-all active:scale-95 btn-shimmer shadow-lg shadow-cyan-500/20"
        >
          {t('profile.signUpFreeBtn')}
        </button>
        <button
          onClick={() => window.location.href = '/auth/login'}
          className="w-full flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-glass-fill border border-glass-border text-text-secondary text-sm font-medium hover:bg-glass-hover hover:text-text-primary transition-all active:scale-95 mt-2"
        >
          {t('profile.alreadyHaveAccount')}
        </button>
        <p className="text-[10px] text-text-tertiary text-center mt-3">
          {t('profile.freeForever')}
        </p>
      </div>

      {/* Feature Preview Cards — 🔧 ARCH fix (2026-07-17): extracted to FeaturePreviewSection */}
      <FeaturePreviewSection />
    </div>
  );
}
