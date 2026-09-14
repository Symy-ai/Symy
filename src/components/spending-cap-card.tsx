'use client';

import { useI18n } from '@/i18n/provider';
import { useSpendingCap } from '@/lib/hooks/use-spending-cap';

export function SpendingCapCard() {
  const { t, locale } = useI18n();
  const { data } = useSpendingCap();
  if (!data?.state) return null;
  const { state, daysLeft } = data;
  const money = (cents: number) => new Intl.NumberFormat(locale === 'zh' ? 'zh-CN' : 'en-US', { style: 'currency', currency: 'USD' }).format(cents / 100);
  return (
    <section className="glass-card rounded-xl p-3.5" data-testid="spending-cap-card">
      <p className="text-sm font-semibold text-text-primary">{t('home.spendingCapTitle')}</p>
      <p className="mt-1 text-xs text-text-secondary">
        {t('home.spendingCapUsage', { used: money(state.usedCents), cap: money(state.capCents), days: daysLeft })}
      </p>
      <div className="mt-2 h-2 rounded-full bg-white/10 overflow-hidden">
        <div className={`h-full rounded-full ${state.status === 'exceeded' ? 'bg-red-500' : state.status === 'warning' ? 'bg-orange-500' : 'bg-blue-500'}`} style={{ width: `${Math.min(100, state.pctUsed)}%` }} />
      </div>
    </section>
  );
}
