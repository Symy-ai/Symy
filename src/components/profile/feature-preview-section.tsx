'use client';

/**
 * FeaturePreviewSection — the "What you get" preview cards section.
 *
 * 🔧 ARCH fix (2026-07-17): extracted from profile-tab.tsx to bring it under
 *    the 800-line architecture-debt limit (was 805, target ≤800).
 *
 * This section is rendered inside the "Free forever" upgrade card and shows
 * 3 feature previews: impulse protection, companion health, smart refunds.
 *
 * Behavior preservation:
 *   - 3 FeaturePreviewCard components in the same order
 *   - Same icons (Shield cyan / Crown purple / CreditCard green)
 *   - Same i18n keys (profile.featurePreviews.*)
 *   - "What you get" heading uses Sentence case (PM-#23 fix preserved)
 */

import { Shield, Crown, CreditCard } from 'lucide-react';
import { useI18n } from '@/i18n/provider';
import { FeaturePreviewCard } from './profile-parts';

export function FeaturePreviewSection() {
  const { t } = useI18n();
  return (
    <div className="space-y-3">
      {/* 🔧 PM-#23 fix: 移除 uppercase (非警示类用 Sentence case) */}
      <h3 className="text-xs text-text-tertiary font-medium tracking-wider">{t('profile.whatYouGet')}</h3>
      <FeaturePreviewCard
        icon={<Shield className="w-5 h-5 text-cyan-400" />}
        title={t('profile.featurePreviews.impulseProtection.title')}
        description={t('profile.featurePreviews.impulseProtection.description')}
      />
      <FeaturePreviewCard
        icon={<Crown className="w-5 h-5 text-purple-400" />}
        title={t('profile.featurePreviews.companionHealth.title')}
        description={t('profile.featurePreviews.companionHealth.description')}
      />
      <FeaturePreviewCard
        icon={<CreditCard className="w-5 h-5 text-green-400" />}
        title={t('profile.featurePreviews.smartRefunds.title')}
        description={t('profile.featurePreviews.smartRefunds.description')}
      />
    </div>
  );
}
