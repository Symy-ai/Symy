'use client';

/**
 * 守护季横幅 — 纯叙事, 无按钮, 无倒计时, 无 scarcity 话术。
 *
 * 反 FOMO 铁律: 全文案禁止 倒计时 / 仅剩 / 最后 / 错过 / don't miss / countdown / last chance。
 * 季挑战 CTA 由正下方 WeeklyChallengeCard 承担。
 */

import { useI18n } from '@/i18n/provider';
import type { GuardSeasonDef } from '@/lib/guard-season';

interface GuardSeasonBannerProps {
  /** 活跃季定义 (getActiveGuardSeason 结果) */
  season: GuardSeasonDef;
  /** demo 态: 渲染 demo 叙事文案 */
  isDemo?: boolean;
}

export function GuardSeasonBanner({ season, isDemo = false }: GuardSeasonBannerProps) {
  const { t } = useI18n();

  if (!season) return null;

  if (isDemo) {
    return (
      <div
        className="glass-card rounded-xl p-4 border border-emerald-500/20"
        data-testid="guard-season-banner"
      >
        <p className="text-sm text-text-primary font-medium">
          {t('home.guardSeason.demoTitle', { defaultValue: season.id.replace(/_/g, ' ') })}
        </p>
        <p className="text-xs text-text-tertiary leading-relaxed mt-1">
          {t('home.guardSeason.demoDesc', { defaultValue: "Symy is here with you, quietly." })}
        </p>
      </div>
    );
  }

  const titleKey = `home.guardSeason.${season.id}.title`;
  const descKey = `home.guardSeason.${season.id}.desc`;

  return (
    <div
      className="glass-card rounded-xl p-4 border border-emerald-500/20"
      data-testid="guard-season-banner"
    >
      <p className="text-sm text-text-primary font-medium">
        {t(titleKey, { defaultValue: season.id.replace(/_/g, ' ') })}
      </p>
      <p className="text-xs text-text-tertiary leading-relaxed mt-1">
        {t(descKey, { defaultValue: '' })}
      </p>
    </div>
  );
}
