'use client';

import { useEffect, useState } from 'react';
import { Gauge } from 'lucide-react';
import { useI18n } from '@/i18n/provider';
import { useSpendingCapForm, useSpendingCap, toCapCents, type SpendingCapResponse } from '@/lib/hooks/use-spending-cap';
import { apiFetch } from '@/lib/api-client';
import type { SpendingCapState } from '@/lib/spending-cap-tracker';

const WARNINGS = [80, 85, 90, 95];

function stateColor(status: SpendingCapState['status']) {
  if (status === 'exceeded') return 'bg-red-500';
  if (status === 'warning') return 'bg-orange-500';
  return 'bg-blue-500';
}

function amountText(cents: number, locale: string) {
  return new Intl.NumberFormat(locale === 'zh' ? 'zh-CN' : 'en-US', { style: 'currency', currency: 'USD' }).format(cents / 100);
}

function Progress({ state, locale }: { state: SpendingCapState; locale: string }) {
  return (
    <div className="mt-3" data-testid="spending-cap-progress">
      <div className="h-2 rounded-full bg-white/10 overflow-hidden">
        <div className={`h-full rounded-full transition-all ${stateColor(state.status)}`} style={{ width: `${Math.min(100, state.pctUsed)}%` }} />
      </div>
      <p className="mt-1 text-xs text-text-secondary">
        {amountText(state.usedCents, locale)} / {amountText(state.capCents, locale)} · {state.pctUsed}%
      </p>
    </div>
  );
}

export function SpendingCapSetting({ isDemo = false }: { isDemo?: boolean }) {
  const { t, locale } = useI18n();
  const { data, refetch } = useSpendingCap();
  const { draft, setAmount } = useSpendingCapForm();
  const [warningPct, setWarningPct] = useState(80);
  const [saving, setSaving] = useState(false);
  const enabled = (data?.setting.capCents ?? 0) > 0;

  useEffect(() => {
    setWarningPct(data?.setting.warningPct ?? 80);
    if (data?.setting.capCents) setAmount(String(data.setting.capCents / 100));
  }, [data?.setting.capCents, data?.setting.warningPct, setAmount]);

  async function save(nextEnabled = true, resetPeriod = false) {
    if (isDemo) return;
    setSaving(true);
    try {
      await apiFetch<SpendingCapResponse>('/api/buddy/spending-cap', {
        method: 'PUT',
        body: { capCents: nextEnabled ? toCapCents(draft) : 0, warningPct, resetPeriod },
      });
      await refetch();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex items-start gap-3 p-3 rounded-xl border border-glass-border bg-glass-fill" data-testid="spending-cap-setting">
      <div className="flex-shrink-0 w-9 h-9 rounded-lg bg-glass-fill flex items-center justify-center text-icon-muted">
        <Gauge className="w-4 h-4" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm font-medium text-text-primary">{t('profile.spendingCapTitle')}</p>
          <button
            type="button"
            onClick={() => save(!enabled)}
            disabled={saving || (enabled && !draft)}
            className={`relative h-5 w-9 rounded-full transition-colors ${enabled ? 'bg-cyan-500' : 'bg-white/20'}`}
            aria-label={t('profile.spendingCapToggle')}
          >
            <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition-all ${enabled ? 'left-4' : 'left-0.5'}`} />
          </button>
        </div>
        <p className="text-xs text-text-tertiary">{t('profile.spendingCapDesc')}</p>

        {enabled && (
          <>
            <label className="block mt-3 text-[11px] font-medium text-text-secondary" htmlFor="spending-cap-amount">
              {t('profile.spendingCapAmount')}
            </label>
            <input
              id="spending-cap-amount"
              inputMode="decimal"
              min="0"
              value={draft}
              onChange={(event) => setAmount(event.target.value)}
              className="mt-1 w-full rounded-lg border border-glass-border bg-glass-fill px-2.5 py-1.5 text-sm text-text-primary"
            />

            <div className="mt-3 flex gap-1.5" role="radiogroup" aria-label={t('profile.spendingCapWarning')}>
              {WARNINGS.map((pct) => (
                <button
                  key={pct}
                  type="button"
                  role="radio"
                  aria-checked={warningPct === pct}
                  onClick={() => setWarningPct(pct)}
                  className={`px-2.5 py-1 text-[11px] rounded-lg border ${warningPct === pct ? 'border-cyan-500/60 bg-cyan-500/10 text-text-primary' : 'border-glass-border text-text-secondary'}`}
                >
                  {pct}%
                </button>
              ))}
            </div>

            {data?.state && <Progress state={data.state} locale={locale} />}

            <div className="mt-3 flex gap-2">
              <button type="button" onClick={() => save()} disabled={saving || !draft} className="px-2.5 py-1 text-xs rounded-lg border border-cyan-500/60 bg-cyan-500/10 text-text-primary">
                {t('profile.spendingCapSave')}
              </button>
              <button type="button" onClick={() => save(true, true)} disabled={saving || !draft} className="px-2.5 py-1 text-xs rounded-lg border border-glass-border text-text-secondary">
                {t('profile.spendingCapReset')}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
