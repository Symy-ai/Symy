'use client';

import type { CommunityStats } from '../hooks/use-community-stats';
import type { useI18n } from '@/i18n/provider';
import { useHourlyRate } from '@/hooks/use-hourly-rate';
import { DEFAULT_HOURLY_RATE, moneyToFreedomLabel } from '@/lib/freedom-time';

interface Props {
  stats: CommunityStats;
  isLoading: boolean;
  userTotalSaved?: number;
  userDefenderNumber?: number | null;
  t: ReturnType<typeof useI18n>['t'];
  locale: string;
}

export function DefenseHeroStats({ stats, isLoading, userTotalSaved, userDefenderNumber, t, locale }: Props) {
  const { hourlyRate } = useHourlyRate();
  const showStats = !isLoading && stats.hasData;
  const showContribution = Boolean(userTotalSaved);

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
    </section>
  );
}
