'use client';

import { GUARDIAN_CHALLENGES, type GuardianChallenge } from '@/components/buddy/challenge-definitions';
import { useI18n } from '@/i18n/provider';

const PERIOD_PRIORITY = {
  daily: 0,
  weekly: 1,
  all_time: 2,
} as const;

export const FIRST_GATE_CHALLENGES: GuardianChallenge[] = GUARDIAN_CHALLENGES
  .filter((challenge) => challenge.tier === 'starter')
  .sort((a, b) => PERIOD_PRIORITY[a.period] - PERIOD_PRIORITY[b.period])
  .slice(0, 3);

export function FirstGateList() {
  const { t } = useI18n();

  return (
    <section className="mt-5 w-full text-left" aria-label={t('onboarding.firstGateTitle')}>
      <div className="flex items-baseline justify-between gap-2">
        <h3 className="text-sm font-semibold text-emerald-200">{t('onboarding.firstGateTitle')}</h3>
        <span className="text-[11px] text-text-tertiary">{t('onboarding.firstGateHint')}</span>
      </div>
      <ul className="mt-2 space-y-2">
        {FIRST_GATE_CHALLENGES.map((challenge) => (
          <li
            key={challenge.id}
            className="rounded-xl border border-emerald-400/15 bg-emerald-400/10 p-3"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-text-primary">
                  {t(challenge.titleKey)}
                </p>
                <p className="mt-0.5 line-clamp-1 text-xs text-text-secondary">
                  {t(challenge.descKey)}
                </p>
              </div>
              <span className="shrink-0 rounded-full bg-emerald-400/15 px-2 py-0.5 text-[11px] font-medium text-emerald-200">
                {t('onboarding.firstGateItemGoal', { n: challenge.target })}
              </span>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
