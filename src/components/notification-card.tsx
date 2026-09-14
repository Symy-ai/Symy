'use client';

import { cn } from '@/lib/utils';
import { GuardianStoryNotification, TikTokShopNotification } from '@/lib/demo-data';
import { formatFreedomTime } from '@/lib/freedom-time';
import { getScoreColor, getScoreLabel } from '@/lib/impulse-detector';
import { Clock, Zap, Radio, Leaf } from 'lucide-react';
import { useI18n } from '@/i18n/provider';

interface NotificationCardProps {
  notification: TikTokShopNotification;
  impulseScore: number;
  isNew?: boolean;
}

export function NotificationCard({ notification, impulseScore, isNew }: NotificationCardProps) {
  const { t, locale } = useI18n();
  const guardianStory = notification.type === 'guardian-story' ? notification as GuardianStoryNotification : null;
  const scoreColor = getScoreColor(impulseScore);
  const scoreLabel = getScoreLabel(impulseScore, t);
  const timeStr = notification.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  return (
    <div
      className={cn(
        'bg-glass-fill border rounded-xl p-3.5 transition-all duration-500',
        impulseScore > 60
          ? 'border-amber-600/40 bg-amber-500/5'
          : impulseScore > 30
          ? 'border-yellow-500/20 bg-yellow-500/5'
          : 'border-glass-border',
        isNew && 'animate-in slide-in-from-right duration-500'
      )}
    >
      <div className="flex items-start gap-3">
        {/* Thumbnail */}
        <div className="flex-shrink-0 w-10 h-10 rounded-lg bg-glass-fill flex items-center justify-center text-lg">
          {notification.thumbnail}
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs font-medium text-text-secondary">{t('notification.tiktokShop')}</span>
            {notification.isLivestream && (
              <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full bg-red-500/20 text-red-400 text-[10px] font-medium">
                <Radio className="w-2.5 h-2.5" />
                {t('notification.live')}
              </span>
            )}
            {notification.isFlashSale && (
              <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full bg-yellow-500/20 text-yellow-400 text-[10px] font-medium">
                <Zap className="w-2.5 h-2.5" />
                {t('notification.flash')}
              </span>
            )}
          </div>
          <p className="text-sm font-medium text-text-primary truncate">{notification.item}</p>
          {notification.isGreenPick && (
            <span className="mt-1 inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-medium text-emerald-600 dark:text-emerald-400">
              <Leaf className="w-3 h-3" aria-hidden />
              {t('notification.greenPick.badge')}
            </span>
          )}
          {guardianStory && (
            <p className="mt-1 text-xs font-medium text-emerald-600 dark:text-emerald-400">
              🐘 {t('notification.guardianStory.title', {
                item: notification.item,
                amount: notification.amount.toFixed(2),
                hours: formatFreedomTime(guardianStory.savedHours, locale),
              })}
            </p>
          )}
          {guardianStory?.altSuggestion && (
            <p className="mt-1 text-xs text-text-secondary">{t('notification.guardianStory.altSuggestion')}: {guardianStory.altSuggestion}</p>
          )}
          <div className="flex items-center gap-2 mt-1">
            {/* 🔧 ARCH fix (Round 12 M18): Number() 防 string .toFixed 报错 */}
            <span className="text-sm font-bold text-text-primary">${Number(notification.amount ?? 0).toFixed(2)}</span>
            <span className="text-xs text-text-tertiary">•</span>
            <span className="text-xs text-text-tertiary flex items-center gap-1">
              <Clock className="w-2.5 h-2.5" />
              {timeStr}
            </span>
          </div>
        </div>

        {/* Score */}
        <div className="flex-shrink-0 text-right">
          <div
            className="inline-flex items-center justify-center w-10 h-10 rounded-full border-2 font-semibold text-xs"
            style={{
              borderColor: scoreColor,
              color: scoreColor,
              backgroundColor: `${scoreColor}15`,
            }}
          >
            {impulseScore}
          </div>
          <p className="text-[10px] mt-1 font-medium" style={{ color: scoreColor }}>
            {scoreLabel}
          </p>
          {impulseScore > 60 && (
            <p className="text-[10px] mt-1 text-text-tertiary">
              {t('impulseDetector.guardMomentHint')}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
