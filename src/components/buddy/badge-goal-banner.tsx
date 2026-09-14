'use client';

/**
 * BadgeGoalBanner — 自选勋章达成的一次性庆祝横幅
 *
 * 触发：当前目标勋章已进入 buddyState.badges 且未庆祝过。
 * 动作：展示横幅 + 自动标记 celebrated；「晒一下」调起父组件 ShareModal badge 模板。
 */

import { useEffect, useState } from 'react';
import { Share2, X } from 'lucide-react';
import { useI18n } from '@/i18n/provider';
import { getBadgeGoal, isBadgeGoalCelebrated, markBadgeGoalCelebrated } from '@/lib/badge-goal';
import { ALL_BADGES } from '@/components/buddy/constants';

export interface BadgeGoalBannerProps {
  /** 当前 buddyState，用于判断是否已解锁 */
  buddyState?: { badges: string[] } | null;
  /** 调起父组件晒卡弹层 */
  onShare?: (badge: { badge: { id: string; emoji: string } }) => void;
}

export function BadgeGoalBanner({ buddyState, onShare }: BadgeGoalBannerProps) {
  const { t } = useI18n();
  const [goalBadge, setGoalBadge] = useState<{ id: string; emoji: string; name: string } | null>(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    const badgeId = getBadgeGoal();
    if (!badgeId) {
      setGoalBadge(null);
      return;
    }
    const def = ALL_BADGES.find((b) => b.id === badgeId);
    if (!def) {
      setGoalBadge(null);
      return;
    }
    const unlocked = (buddyState?.badges || []).includes(badgeId);
    if (!unlocked) {
      setGoalBadge(null);
      return;
    }
    if (isBadgeGoalCelebrated(badgeId)) {
      setGoalBadge(null);
      return;
    }
    setGoalBadge({
      id: def.id,
      emoji: def.emoji,
      name: t(`buddy.badgeNames.${def.id}`, { defaultValue: def.id.replace(/_/g, ' ') }),
    });
    markBadgeGoalCelebrated(badgeId);
  }, [buddyState, t]);

  const handleShare = () => {
    if (!goalBadge || !onShare) return;
    onShare({ badge: { id: goalBadge.id, emoji: goalBadge.emoji } });
  };

  if (!goalBadge || dismissed) return null;

  return (
    <div
      className="mx-4 mb-2 px-3 py-2.5 rounded-2xl bg-gradient-to-r from-emerald-500/15 to-green-500/15 border border-emerald-500/30 shadow-lg"
      data-testid="badge-goal-banner"
    >
      <div className="flex items-start gap-2">
        <div className="flex-shrink-0 w-7 h-7 rounded-full bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center">
          <span className="text-base" aria-hidden="true">{goalBadge.emoji}</span>
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[11px] text-text-primary leading-relaxed font-medium">
            {t('buddy.badgeGoal.bannerTitle', { defaultValue: 'You reached your chosen guard goal' })}
          </p>
          <p className="text-[10px] text-text-tertiary mt-0.5">
            {t('buddy.badgeGoal.bannerSub', { defaultValue: '{badge} — you chose it, and you held it.', badge: goalBadge.name })}
          </p>
        </div>
        <button
          onClick={() => setDismissed(true)}
          aria-label={t('common.close', { defaultValue: 'Close' })}
          className="flex-shrink-0 p-1 rounded-lg hover:bg-glass-hover text-text-tertiary transition-colors cursor-pointer"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
      <button
        onClick={handleShare}
        data-testid="badge-goal-share-button"
        className="mt-2 w-full py-2 rounded-xl bg-gradient-to-r from-emerald-500 to-green-500 text-[#0c2017] text-xs font-bold hover:from-emerald-400 hover:to-green-400 active:scale-[0.98] transition-all cursor-pointer select-none flex items-center justify-center gap-1.5"
      >
        <Share2 className="w-3.5 h-3.5" aria-hidden="true" />
        {t('buddy.badgeGoal.bannerShare', { defaultValue: 'Show it off' })}
      </button>
    </div>
  );
}
