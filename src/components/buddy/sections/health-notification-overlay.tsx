'use client';

import { TrendingDown, TrendingUp } from 'lucide-react';
import { useI18n } from '@/i18n/provider';
import type { HealthNotification } from '../hooks/use-health-notification';

/**
 * Health Change Notification Overlay
 * (原为 buddy-tab.tsx 内联 JSX — File Split Wave 1 纯搬运, 行为零变化)
 * 由父组件条件渲染: {healthNotification && <HealthNotificationOverlay .../>}
 */
export function HealthNotificationOverlay({ notification }: { notification: HealthNotification }) {
  const { t } = useI18n();
  return (
    <div className={`absolute top-4 left-4 right-4 z-50 animate-in slide-in-from-top-4 duration-300`}>
      <div className={`px-4 py-3 rounded-xl backdrop-blur-xl border text-center ${
        notification.type === 'damage'
          ? 'bg-red-500/20 border-red-500/30 text-red-300'
          : notification.type === 'recovery'
          ? 'bg-green-500/20 border-green-500/30 text-green-300'
          : 'bg-amber-500/20 border-amber-500/30 text-amber-300'
      }`}>
        <div className="flex items-center justify-center gap-2">
          {notification.type === 'damage' ? (
            <TrendingDown className="w-4 h-4" />
          ) : (
            <TrendingUp className="w-4 h-4" />
          )}
          <span className="text-sm font-semibold">{notification.message}</span>
        </div>
        <div className={`text-2xl font-bold mt-1 ${
          notification.type === 'damage' ? 'text-red-400' : 'text-green-400'
        }`}>
          {notification.vitalityChange > 0 ? '+' : ''}{notification.vitalityChange}
        </div>
        <p className="text-[10px] text-text-secondary mt-0.5">
          {notification.type === 'damage'
            ? t('buddy.spendingAffectsCompanion')
            : t('buddy.goodChoicesHelp')}
        </p>
      </div>
    </div>
  );
}
