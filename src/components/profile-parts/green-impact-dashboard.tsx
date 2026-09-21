'use client';

import { Leaf, Recycle } from 'lucide-react';
import { useI18n } from '@/i18n/provider';
import { useGreenImpact, type UseGreenImpactResult } from '@/hooks/use-green-impact';
import { useGreenAltAdoption } from '@/hooks/use-green-alt-adoption';
import { GuardCategoryCard } from '@/components/profile-parts/guard-category-card';
import { ImpulseTriggerCard } from '@/components/profile-parts/impulse-trigger-card';
import { GreenAltAdoptionInsightCard } from '@/components/profile-parts/green-alt-adoption-insight-card';
import { GuardStyleCard } from '@/components/profile-parts/guard-style-card';
import { ImpulseWindowCard } from '@/components/profile-parts/impulse-window-card';
import { GuardWinRateCard } from '@/components/profile-parts/guard-win-rate-card';
import { GuardConsistencyCard } from '@/components/profile-parts/guard-consistency-card';
import { WeeklyGuardCompareCard } from '@/components/profile-parts/weekly-guard-compare-card';
import { MonthlyGuardStatementCard } from '@/components/profile-parts/monthly-guard-statement-card';
import { GuardYearReviewCard } from '@/components/profile-parts/guard-year-review-card';
import { formatFreedomTime } from '@/lib/freedom-time';

function ImpactCard({
  icon,
  value,
  suffix,
  label,
  dataTestId,
}: {
  icon: React.ReactNode;
  value: number | string;
  suffix?: React.ReactNode;
  label: string;
  dataTestId: string;
}) {
  return (
    <div className="rounded-xl border border-glass-border bg-glass-fill p-3" data-testid={dataTestId}>
      <div className="flex items-center gap-1.5 text-icon-muted">{icon}</div>
      <p className="mt-1.5 text-2xl font-black leading-none text-text-primary">
        {value}
        {suffix && <span className="ml-1 text-sm font-bold">{suffix}</span>}
      </p>
      <p className="mt-1 text-[11px] text-text-tertiary">{label}</p>
    </div>
  );
}

export function GreenImpactDashboard() {
  const { t, locale } = useI18n();
  const { data, isLoading, error } = useGreenImpact() as UseGreenImpactResult;
  // 第 4 张卡: 本季绿色替代采纳次数 (仅次数, 零金额; 失败静默为 0)
  const { total: adoptionTotal } = useGreenAltAdoption();

  const renderSkeleton = () => (
    <div className="animate-pulse">
      <div className="h-5 w-36 rounded bg-white/10 mb-3" />
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
        <div className="h-20 rounded-xl bg-white/10" />
        <div className="h-20 rounded-xl bg-white/10" />
        <div className="h-20 rounded-xl bg-white/10" />
        <div className="h-20 rounded-xl bg-white/10" />
      </div>
    </div>
  );

  if (isLoading) {
    return (
      <div className="flex items-start gap-3 p-3 rounded-xl border border-glass-border bg-glass-fill" data-testid="green-impact-dashboard">
        <div className="flex-shrink-0 w-9 h-9 rounded-lg bg-glass-fill flex items-center justify-center text-icon-muted">
          <Leaf className="w-4 h-4" />
        </div>
        <div className="flex-1 min-w-0">{renderSkeleton()}</div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="flex items-start gap-3 p-3 rounded-xl border border-glass-border bg-glass-fill" data-testid="green-impact-dashboard">
        <div className="flex-shrink-0 w-9 h-9 rounded-lg bg-glass-fill flex items-center justify-center text-icon-muted">
          <Leaf className="w-4 h-4" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-text-primary">
            {t('profile.greenImpactTitle')}
          </p>
          <div className="mt-2 text-2xl font-black text-text-tertiary" aria-label={t('profile.greenImpactLoadError')}>—</div>
        </div>
      </div>
    );
  }

  const hours = data.hoursReclaimed;
  const hoursLabel = formatFreedomTime(hours, locale === 'zh' ? 'zh' : 'en');

  return (
    <>
    <div className="flex items-start gap-3 p-3 rounded-xl border border-glass-border bg-glass-fill" data-testid="green-impact-dashboard">
      <div className="flex-shrink-0 w-9 h-9 rounded-lg bg-glass-fill flex items-center justify-center text-icon-muted">
        <Leaf className="w-4 h-4" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-text-primary">
          {t('profile.greenImpactTitle')}
        </p>
        <p className="text-xs text-text-tertiary mb-2">
          {t('profile.greenImpactDesc')}
        </p>
        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
          <ImpactCard
            dataTestId="green-impact-items-saved"
            icon={<Leaf className="h-3.5 w-3.5" />}
            value={data.itemsSaved}
            label={t('profile.greenImpactItemsSaved', { count: data.itemsSaved })}
          />
          <ImpactCard
            dataTestId="green-impact-hours-reclaimed"
            icon={<Leaf className="h-3.5 w-3.5" />}
            value={hoursLabel}
            label={t('profile.greenImpactHoursReclaimed', { hours: hoursLabel })}
          />
          <ImpactCard
            dataTestId="green-impact-current-streak"
            icon={<Leaf className="h-3.5 w-3.5" />}
            value={data.currentStreak}
            suffix={t('common.days')}
            label={t('profile.greenImpactCurrentStreak', { count: data.currentStreak })}
          />
          <ImpactCard
            dataTestId="green-impact-green-alt-adoptions"
            icon={<Recycle className="h-3.5 w-3.5" />}
            value={adoptionTotal}
            label={t('profile.greenImpactGreenAltAdoptions', { count: adoptionTotal })}
          />
        </div>
      </div>
    </div>
    <GuardCategoryCard />
    <GreenAltAdoptionInsightCard />
    <GuardStyleCard />
    <ImpulseTriggerCard />
    <ImpulseWindowCard />
    <GuardWinRateCard />
    <GuardConsistencyCard />
    <WeeklyGuardCompareCard />
    <MonthlyGuardStatementCard />
    <GuardYearReviewCard />
    </>
  );
}
