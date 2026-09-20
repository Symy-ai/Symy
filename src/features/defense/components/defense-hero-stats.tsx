'use client';

import type { CommunityStats } from '../hooks/use-community-stats';
import { useCollectiveDefenseStats } from '../hooks/use-collective-defense-stats';
import type { useI18n } from '@/i18n/provider';
import { useHourlyRate } from '@/hooks/use-hourly-rate';
import { DEFAULT_HOURLY_RATE, formatFreedomTime, moneyToFreedomLabel } from '@/lib/freedom-time';
import { getGuardRank, getNextGuardRankProgress, type GuardRankChannel, type GuardRankStats } from '@/lib/guard-rank';

/** 差距文案键 — 平静陈述 (再…成为…), 禁焦虑句式, 守卫见 rank-calm-copy-guard */
const GAP_KEY_BY_CHANNEL: Record<GuardRankChannel, 'defense.rank.gapIntercepts' | 'defense.rank.gapDays' | 'defense.rank.gapBadges'> = {
  intercepts: 'defense.rank.gapIntercepts',
  streakDays: 'defense.rank.gapDays',
  badges: 'defense.rank.gapBadges',
};

interface Props {
  stats: CommunityStats;
  isLoading: boolean;
  isDemo?: boolean;
  userTotalSaved?: number;
  userDefenderNumber?: number | null;
  guardRankStats?: GuardRankStats | null;
  t: ReturnType<typeof useI18n>['t'];
  locale: string;
}

export function DefenseHeroStats({ stats, isLoading, isDemo = false, userTotalSaved, userDefenderNumber, guardRankStats, t, locale }: Props) {
  const { hourlyRate } = useHourlyRate();
  const { collectiveStats, isLoading: collectiveLoading } = useCollectiveDefenseStats(isDemo);
  const showStats = !isLoading && stats.hasData;
  const showContribution = Boolean(userTotalSaved);
  const showCollectiveStats = !collectiveLoading && collectiveStats !== null;
  const rank = guardRankStats ? getGuardRank(guardRankStats) : null;
  const nextProgress = rank && guardRankStats ? getNextGuardRankProgress(rank, guardRankStats) : null;

  return (
    <section className="px-4 mt-3" aria-label={t('defense.heroStats')}>
      <div className="grid grid-cols-2 gap-2">
        <div className="rounded-2xl bg-glass-fill/50 border border-glass-border p-3">
          {showStats ? (
            <>
              <p className="text-lg font-bold text-text-primary">{stats.activeUsers}</p>
              <p className="text-[10px] text-text-tertiary mt-0.5">{t('defense.defenders')}</p>
            </>
          ) : (
            <p className="text-xs text-text-secondary leading-snug">{t('defense.notEnoughData')}</p>
          )}
        </div>
        <div className="rounded-2xl bg-glass-fill/50 border border-glass-border p-3">
          {showStats ? (
            <>
              <p className="text-lg font-bold text-text-primary">{moneyToFreedomLabel(stats.totalSaved, locale, DEFAULT_HOURLY_RATE)}</p>
              <p className="text-[10px] text-text-tertiary mt-0.5">{t('defense.hoursTogether', { hours: moneyToFreedomLabel(stats.totalSaved, locale, DEFAULT_HOURLY_RATE) })}</p>
            </>
          ) : (
            <p className="text-xs text-text-secondary leading-snug">{t('defense.notEnoughDataDesc')}</p>
          )}
        </div>
        {showContribution && (
          <div className="rounded-2xl bg-glass-fill/50 border border-glass-border p-3 col-span-2">
            <p className="text-lg font-bold text-text-primary">{moneyToFreedomLabel(userTotalSaved!, locale, hourlyRate)}</p>
            <p className="text-[10px] text-text-tertiary mt-0.5">{t('defense.yourContribution')}</p>
          </div>
        )}
      </div>
      {userDefenderNumber != null && (
        <p className="text-center text-xs font-medium text-text-secondary mt-2">
          {t('defense.founderLine', { number: userDefenderNumber })}
        </p>
      )}
      {/* 段位徽标行 — Guard #N 之下; 无 rank 数据时整行不出 (诚实降级), 零金额 */}
      {rank && (
        <p className="text-center text-xs text-text-secondary mt-1" data-testid="defense-rank-line">
          <span aria-hidden="true">{rank.emoji}</span>{' '}
          <span className="font-medium">{t(`profile.guardRank.${rank.id}`)}</span>
          {nextProgress ? (
            <span className="text-text-tertiary">
              {' · '}
              {t(GAP_KEY_BY_CHANNEL[nextProgress.channel], {
                count: nextProgress.remainingCount,
                title: t(`profile.guardRank.${nextProgress.next.id}`),
              })}
            </span>
          ) : (
            <span className="text-text-tertiary"> · {t('defense.rank.topLine')}</span>
          )}
        </p>
      )}
      {showCollectiveStats && (
        <p
          className="text-center text-sm font-bold gradient-text mt-2"
          data-testid="defense-collective-line"
        >
          {t('defense.collectiveWonBack', {
            hours: formatFreedomTime(collectiveStats.hours, locale),
            guards: new Intl.NumberFormat(locale === 'zh' ? 'zh-CN' : 'en-US').format(collectiveStats.guards),
          })}
        </p>
      )}
    </section>
  );
}
