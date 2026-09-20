'use client';

/**
 * GuardPolicyPreviewSetting — save-free policy preview.
 * Candidate chips only run the pure simulator; Save calls the existing hooks.
 */

import { useEffect, useMemo, useState } from 'react';
import { FlaskConical } from 'lucide-react';
import { useI18n } from '@/i18n/provider';
import { useCopyToClipboard } from '@/hooks/use-copy-to-clipboard';
import { useGuardIntensity } from '@/hooks/use-guard-intensity';
import { useGuardScope } from '@/hooks/use-guard-scope';
import { useNightWindow } from '@/hooks/use-night-window';
import { useHourlyRate } from '@/hooks/use-hourly-rate';
import { diffGuardPolicy, type GuardPolicyChange, type GuardPolicySnapshot } from '@/lib/guard-policy-diff';
import { restoreGuardPolicySnapshot } from '@/lib/guard-policy-restore';
import { usePushPreferences } from '@/lib/push/use-push-preferences';
import { GUARD_SCOPE_CATEGORIES } from '@/lib/guard-scope';
import { GuardPolicyReceiptCard, type GuardPolicyReceiptStatus } from './guard-policy-receipt-card';
import {
  GUARD_POLICY_INTENSITIES,
  GUARD_POLICY_SCOPE_MODES,
  simulateGuardPolicyCandidate,
  type GuardPolicyCandidate,
} from '@/lib/simulate-guard-policy';

const INTENSITY_KEY = {
  gentle: 'profile.guardIntensityGentle',
  balanced: 'profile.guardIntensityBalanced',
  strict: 'profile.guardIntensityStrict',
} as const;

const SCOPE_KEY = {
  current: 'profile.guardPolicyScopeCurrent',
  all: 'profile.guardPolicyScopeAll',
  nightStrict: 'profile.guardPolicyScopeNightStrict',
} as const;

const RESPONSE_KEY = {
  gentle: 'profile.guardPolicyResponseGentle',
  balanced: 'profile.guardPolicyResponseBalanced',
  strict: 'profile.guardPolicyResponseStrict',
} as const;

interface GuardPolicyPreviewEvent {
  eventType?: string | null;
  triggerId?: string | null;
  metadata?: Record<string, unknown> | null;
  createdAt?: string | Date | null;
}

async function fetchGuardStyleEvents() {
  const url = new URL('/api/buddy/health-events', window.location.origin);
  url.searchParams.set('event_type', 'challenge_completed');
  url.searchParams.set('limit', '100');
  const response = await fetch(url.toString());
  if (!response.ok) throw new Error('guard-policy-preview-load-failed');
  return (await response.json()) as { events?: GuardPolicyPreviewEvent[] };
}

function formatHours(hours: number): string {
  const rounded = Math.round(hours * 10) / 10;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
}

export function GuardPolicyPreviewSetting({ isDemo = false }: { isDemo?: boolean }) {
  const { t, locale } = useI18n();
  const { guardIntensity, setGuardIntensity } = useGuardIntensity();
  const { guardScope, setGuardScopeMode } = useGuardScope();
  const { nightWindow, setNightWindow } = useNightWindow();
  const { hourlyRate, setHourlyRate } = useHourlyRate(isDemo);
  const { preferences: pushPreferences, load: loadPushPreferences, save: savePushPreferences } = usePushPreferences();
  const [events, setEvents] = useState<GuardPolicyPreviewEvent[] | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [candidate, setCandidate] = useState<GuardPolicyCandidate>({ intensity: guardIntensity, scopeMode: 'current' });
  const [receipt, setReceipt] = useState<{ before: GuardPolicySnapshot; changes: GuardPolicyChange[]; status: GuardPolicyReceiptStatus } | null>(null);
  const [isRestoring, setIsRestoring] = useState(false);
  const [noChanges, setNoChanges] = useState(false);
  const copy = useCopyToClipboard();

  useEffect(() => {
    void loadPushPreferences();
  }, [loadPushPreferences]);

  useEffect(() => {
    let cancelled = false;
    fetchGuardStyleEvents()
      .then((data) => {
        if (!cancelled) setEvents(data?.events ?? []);
      })
      .catch(() => {
        if (!cancelled) setLoadFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const result = useMemo(
    () =>
      simulateGuardPolicyCandidate(candidate, {
        rawScope: guardScope,
        rawNightWindow: nightWindow,
        hourlyRate,
        events: loadFailed ? [] : events,
      }),
    [candidate, guardScope, nightWindow, hourlyRate, events, loadFailed],
  );

  const shareText = [
    locale === 'zh' ? '🐘 改了会怎样——守护预演' : '🐘 What would change — guard preview',
    locale === 'zh'
      ? `最近 90 天：会拦到 ${result.coveredEventCount} 次 · ${result.coveredCategoryCount} 个品类`
      : `Last 90 days: would catch ${result.coveredEventCount} moments · ${result.coveredCategoryCount} categories`,
    locale === 'zh'
      ? `帮你守住约 ${formatHours(result.freedomHours)} 小时 · 约 ${result.potentialDisturbanceDays} 天会被多问几句`
      : `About ${formatHours(result.freedomHours)} hours kept for you · ${result.potentialDisturbanceDays} days with an extra question`,
  ].join('\n');

  const save = () => {
    const before: GuardPolicySnapshot = {
      intensity: guardIntensity,
      scope: guardScope,
      nightWindow,
      push: pushPreferences,
      hourlyRate,
    };
    const afterScope = { ...guardScope };
    if (candidate.scopeMode === 'all') {
      for (const category of GUARD_SCOPE_CATEGORIES) afterScope[category] = 'guard';
    }
    if (candidate.scopeMode === 'nightStrict') {
      for (const category of result.coveredCategories) afterScope[category] = 'strict';
    }
    const after: GuardPolicySnapshot = {
      ...before,
      intensity: candidate.intensity,
      scope: afterScope,
      push: pushPreferences,
    };
    const changes = diffGuardPolicy(before, after);
    setNoChanges(changes.length === 0);
    if (changes.length === 0) return;
    setGuardIntensity(candidate.intensity);
    if (candidate.scopeMode === 'all') {
      for (const category of GUARD_SCOPE_CATEGORIES) setGuardScopeMode(category, 'guard');
    }
    if (candidate.scopeMode === 'nightStrict') {
      for (const category of result.coveredCategories) setGuardScopeMode(category, 'strict');
    }
    setReceipt({ before, changes, status: 'saved' });
    setCandidate((current) => ({ ...current, scopeMode: 'current' }));
  };

  const restore = async () => {
    if (!receipt || isRestoring) return;
    setIsRestoring(true);
    const restored = await restoreGuardPolicySnapshot(receipt.before, receipt.changes, {
      setGuardIntensity,
      setGuardScopeMode,
      setNightWindow,
      savePushPreferences,
      setHourlyRate,
    });
    setReceipt((current) => (current ? { ...current, status: restored ? 'restored' : 'restore-failed' } : current));
    setIsRestoring(false);
  };

  return (
    <div data-testid="guard-policy-preview-setting" className="flex items-start gap-3 p-3 rounded-xl border border-glass-border bg-glass-fill">
      <div className="flex-shrink-0 w-9 h-9 rounded-lg bg-glass-fill flex items-center justify-center text-icon-muted">
        <FlaskConical className="w-4 h-4" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-text-primary">{t('profile.guardPolicyTitle')}</p>
        <p className="text-xs text-text-tertiary mb-2">{t('profile.guardPolicyDesc')}</p>

        <div className="flex flex-wrap gap-1.5 mb-2" data-testid="guard-policy-intensity-chips">
          {GUARD_POLICY_INTENSITIES.map((intensity) => (
            <button
              key={intensity}
              type="button"
              onClick={() => setCandidate((current) => ({ ...current, intensity }))}
              aria-pressed={candidate.intensity === intensity}
              className={`px-2 py-0.5 rounded-md border text-[11px] cursor-pointer ${candidate.intensity === intensity ? 'border-cyan-500/60 bg-cyan-500/10 text-text-primary' : 'border-glass-border bg-glass-fill text-text-tertiary hover:bg-glass-hover'}`}
            >
              {t(INTENSITY_KEY[intensity])}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap gap-1.5 mb-2" data-testid="guard-policy-scope-chips">
          {GUARD_POLICY_SCOPE_MODES.map((scopeMode) => (
            <button
              key={scopeMode}
              type="button"
              onClick={() => setCandidate((current) => ({ ...current, scopeMode }))}
              aria-pressed={candidate.scopeMode === scopeMode}
              className={`px-2 py-0.5 rounded-md border text-[11px] cursor-pointer ${candidate.scopeMode === scopeMode ? 'border-purple-500/60 bg-purple-500/10 text-text-primary' : 'border-glass-border bg-glass-fill text-text-tertiary hover:bg-glass-hover'}`}
            >
              {t(SCOPE_KEY[scopeMode])}
            </button>
          ))}
        </div>

        <div className="rounded-lg border border-glass-border bg-glass-fill px-2.5 py-2" data-testid="guard-policy-preview-card" data-status={result.status}>
          {loadFailed && <p className="text-[11px] text-text-tertiary">{t('profile.guardPolicyLoadFailed')}</p>}
          {result.status === 'empty' && <p className="text-[11px] text-text-secondary">{t('profile.guardPolicyEmpty')}</p>}
          {result.status === 'insufficient' && <p className="text-[11px] text-text-secondary">{t('profile.guardPolicyInsufficient')}</p>}
          {result.status === 'ok' && (
            <div className="space-y-1">
              <p className="text-[11px] text-text-secondary" data-testid="guard-policy-metrics">
                {t('profile.guardPolicyMetricEvents', { count: result.coveredEventCount })} · {t('profile.guardPolicyMetricCategories', { count: result.coveredCategoryCount })} · {t('profile.guardPolicyMetricHours', { hours: formatHours(result.freedomHours) })}
              </p>
              <p className="text-[11px] text-text-tertiary" data-testid="guard-policy-disturbance">
                {t('profile.guardPolicyDisturbance', { count: result.potentialDisturbanceDays })}
              </p>
              <p className="text-[10px] text-text-tertiary/80" data-testid="guard-policy-private-value">
                {t('profile.guardPolicyPrivateValue', { amount: Math.round(result.freedomHours * hourlyRate) })}
              </p>
            </div>
          )}
          <div className="mt-1.5 space-y-1" data-testid="guard-policy-responses">
            {(['gentle', 'balanced', 'strict'] as const).map((intensity) => (
              <p key={intensity} className={`text-[11px] leading-relaxed ${candidate.intensity === intensity ? 'text-text-primary' : 'text-text-tertiary/70'}`}>
                {t(RESPONSE_KEY[intensity])}
              </p>
            ))}
          </div>
        </div>

        <div className="mt-2 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={save}
            className="px-3 py-1.5 text-xs rounded-lg bg-gradient-to-r from-cyan-500 to-purple-500 text-white font-medium cursor-pointer"
            data-testid="guard-policy-save"
          >
            {t('profile.guardPolicySave')}
          </button>
          <button
            type="button"
            onClick={() => void copy.copy(shareText)}
            className="px-3 py-1.5 text-xs rounded-lg border border-glass-border bg-glass-fill text-text-secondary hover:bg-glass-hover cursor-pointer"
            data-testid="guard-policy-copy"
          >
            {copy.copied ? t('profile.guardProfileCopied') : t('profile.guardPolicyCopy')}
          </button>
          <button
            type="button"
            onClick={() => setCandidate({ intensity: guardIntensity, scopeMode: 'current' })}
            className="px-3 py-1.5 text-xs rounded-lg border border-glass-border bg-glass-fill text-text-secondary hover:bg-glass-hover cursor-pointer"
            data-testid="guard-policy-cancel"
          >
            {t('profile.guardPolicyCancel')}
          </button>
        </div>
        {noChanges && (
          <p className="mt-2 text-[11px] text-text-secondary" data-testid="guard-policy-no-changes">
            {t('profile.guardPolicyNoChanges')}
          </p>
        )}
        {receipt && (
          <div className="mt-2">
            <GuardPolicyReceiptCard
              changes={receipt.changes}
              status={receipt.status}
              isRestoring={isRestoring}
              locale={locale}
              t={t}
              onRestore={restore}
              onClose={() => setReceipt(null)}
            />
          </div>
        )}
        <p className="mt-1 text-[10px] text-text-tertiary/70">{t('profile.guardPolicyShareNote')}</p>
      </div>
    </div>
  );
}
