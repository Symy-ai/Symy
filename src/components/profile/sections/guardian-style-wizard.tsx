'use client';

/**
 * GuardianStyleWizard — 设置页「我的守护风格」向导 (batch61-a)
 *
 * 四步: 现状汇总 → 生活型预设 → 微调 → 守护契约。
 * 草稿式一次生效: 所有选择只存在向导本地 state, 点「完成」才经
 * applyGuardianStylePlan 逐项写回既有渠道 (guard-intensity / night-window /
 * push 节奏 / guard-scope); 中途退出零写入 (测试锁死), 文案明示该策略。
 * 每一步对当前草稿值展示「会看到 / 不会看到」, 避免误以为关提醒会关账单同步。
 */

import { useEffect, useState, type ReactNode } from 'react';
import { ChevronLeft } from 'lucide-react';
import { useI18n } from '@/i18n/provider';
import { useGuardIntensity } from '@/hooks/use-guard-intensity';
import { useNightWindow } from '@/hooks/use-night-window';
import { useGuardScope } from '@/hooks/use-guard-scope';
import { usePushPreferences } from '@/lib/push/use-push-preferences';
import { useHourlyRate } from '@/hooks/use-hourly-rate';
import { applyGuardianStylePlan, type GuardianStyleApplyOutcome } from '@/hooks/guardian-style-apply';
import { diffGuardPolicy, type GuardPolicyChange, type GuardPolicySnapshot } from '@/lib/guard-policy-diff';
import { restoreGuardPolicySnapshot } from '@/lib/guard-policy-restore';
import { GuardPolicyReceiptCard, type GuardPolicyReceiptStatus } from './guard-policy-receipt-card';
import {
  GUARDIAN_STYLE_PRESETS,
  applyGuardianStylePlanPatch,
  buildGuardianStylePlan,
  type GuardianStylePlan,
  type GuardianStylePlanPatch,
  type GuardianStylePreset,
} from '@/lib/guardian-style';
import { GUARD_INTENSITIES } from '@/lib/guard-intensity';
import { NIGHT_WINDOW_OPTIONS, NIGHT_WINDOW_PRESETS } from '@/lib/night-window';
import { PUSH_FREQUENCIES } from '@/lib/push/preferences';
import { GUARD_SCOPE_CATEGORIES, guardScopeSummary, type GuardScopeMode } from '@/lib/guard-scope';
import {
  CATEGORY_LABEL_KEY,
  INTENSITY_LABEL_KEY,
  INTENSITY_SEE_KEY,
  INTENSITY_WONT_KEY,
  NIGHT_LABEL_KEY,
  NIGHT_SEE_KEY,
  NIGHT_WONT_KEY,
  PRESET_DESC_KEY,
  PRESET_LABEL_KEY,
  PRESET_SEE_KEY,
  PRESET_WONT_KEY,
  PUSH_LABEL_KEY,
  PUSH_SEE_KEY,
  PUSH_WONT_KEY,
  SCOPE_MODE_LABEL_KEY,
} from './guardian-style-copy';
import { GuardianStyleContractCard } from './guardian-style-contract-card';

type WizardStep = 'overview' | 'style' | 'adjust' | 'contract';

const STEPS: readonly WizardStep[] = ['overview', 'style', 'adjust', 'contract'];

const STEP_LABEL_KEY: Record<WizardStep, string> = {
  overview: 'profile.guardianStyleStepOverview',
  style: 'profile.guardianStyleStepStyle',
  adjust: 'profile.guardianStyleStepAdjust',
  contract: 'profile.guardianStyleStepContract',
};

const SCOPE_MODES: readonly GuardScopeMode[] = ['guard', 'exempt', 'strict'];

function SummaryRow({ label, value, testid, valueName }: { label: string; value: string; testid: string; valueName?: string }) {
  return (
    <div
      className="flex items-center justify-between gap-3 px-3 py-2 rounded-xl border border-glass-border bg-glass-fill"
      data-testid={testid}
      data-value={valueName}
    >
      <span className="text-xs text-text-tertiary flex-shrink-0">{label}</span>
      <span className="text-xs font-medium text-text-primary text-right truncate">{value}</span>
    </div>
  );
}

function Chip({ selected, onClick, testid, children }: { selected: boolean; onClick: () => void; testid: string; children: ReactNode }) {
  return (
    <button
      role="radio"
      aria-checked={selected}
      onClick={onClick}
      data-testid={testid}
      className={`px-2.5 py-1 text-[11px] rounded-lg border transition-colors cursor-pointer ${selected ? 'border-cyan-500/60 bg-cyan-500/10 text-text-primary' : 'border-glass-border bg-glass-fill text-text-secondary hover:bg-glass-hover'}`}
    >
      {children}
    </button>
  );
}

function EffectLine({ t, see, wont }: { t: ReturnType<typeof useI18n>['t']; see: string; wont: string }) {
  return (
    <p className="mt-1.5 text-[11px] leading-relaxed text-text-tertiary">
      <span className="text-cyan-300/90 font-medium">{t('profile.guardianStyleSeeTitle')}</span> {see}
      <span className="mx-1.5">·</span>
      <span className="text-purple-300/90 font-medium">{t('profile.guardianStyleWontSeeTitle')}</span> {wont}
    </p>
  );
}

function AdjustBlock({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="px-3 py-2.5 rounded-xl border border-glass-border bg-glass-fill">
      <p className="text-[11px] font-medium text-text-secondary mb-1.5">{label}</p>
      {children}
    </div>
  );
}

export function GuardianStyleWizard({ isDemo, onClose }: { isDemo?: boolean; onClose: () => void }) {
  const { t, locale } = useI18n();
  const { guardIntensity, setGuardIntensity } = useGuardIntensity();
  const { nightWindow, setNightWindow } = useNightWindow();
  const { guardScope, setGuardScopeMode } = useGuardScope();
  const { preferences: pushPreferences, load: loadPushPreferences, save: savePushPreferences } = usePushPreferences();
  const { hourlyRate, setHourlyRate } = useHourlyRate();

  const [step, setStep] = useState<WizardStep>('overview');
  const [preset, setPreset] = useState<GuardianStylePreset | null>(null);
  const [plan, setPlan] = useState<GuardianStylePlan | null>(null);
  const [isApplying, setIsApplying] = useState(false);
  const [outcome, setOutcome] = useState<GuardianStyleApplyOutcome | null>(null);
  const [receipt, setReceipt] = useState<{ before: GuardPolicySnapshot; changes: GuardPolicyChange[]; status: GuardPolicyReceiptStatus } | null>(null);
  const [isRestoring, setIsRestoring] = useState(false);
  const [noChanges, setNoChanges] = useState(false);

  useEffect(() => {
    void loadPushPreferences();
  }, [loadPushPreferences]);

  const choosePreset = (value: GuardianStylePreset) => {
    setPreset(value);
    setPlan(buildGuardianStylePlan(value));
    setOutcome(null);
  };

  const patchPlan = (patch: GuardianStylePlanPatch) => {
    setPlan((prev) => (prev ? applyGuardianStylePlanPatch(prev, patch) : prev));
  };

  const handleApply = async () => {
    if (!plan || isApplying) return;
    if (receipt && receipt.status !== 'incomplete') {
      onClose();
      return;
    }
    if (outcome === 'pushNotSubscribed') {
      onClose();
      return;
    }
    setIsApplying(true);
    const before: GuardPolicySnapshot = receipt?.before ?? {
      intensity: guardIntensity,
      scope: guardScope,
      nightWindow,
      push: pushPreferences,
      hourlyRate,
    };
    const changes = diffGuardPolicy(before, {
      intensity: plan.guardIntensity,
      scope: plan.guardScope,
      nightWindow: plan.nightWindow,
      push: { ...pushPreferences, frequency: plan.pushFrequency },
      hourlyRate,
    });
    if (changes.length === 0) {
      setOutcome(null);
      setNoChanges(true);
      setIsApplying(false);
      return;
    }
    const result = await applyGuardianStylePlan(plan, { isDemo });
    setOutcome(result === 'ok' ? null : result);
    setIsApplying(false);
    if (result === 'ok' || result === 'pushFailed') {
      setReceipt({ before, changes, status: result === 'ok' ? 'saved' : 'incomplete' });
    }
  };

  const handleRestore = async () => {
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

  const currentScopeSummary = guardScopeSummary(guardScope);
  const canGoNext = step !== 'style' || plan !== null;

  return (
    <div className="fixed inset-0 z-[210] bg-surface-1 flex flex-col animate-tab-in max-w-md mx-auto" data-testid="guardian-style-wizard">
      <div className="flex-shrink-0 flex items-center px-4 py-3 border-b border-glass-border">
        <button
          onClick={onClose}
          className="flex items-center gap-1 text-text-secondary hover:text-text-primary transition-colors cursor-pointer"
          data-testid="guardian-style-exit"
          aria-label={t('profile.guardianStylePrev')}
        >
          <ChevronLeft className="w-5 h-5" />
        </button>
        <h2 className="text-base font-bold text-text-primary ml-3">{t('profile.guardianStyleTitle')}</h2>
      </div>

      <div className="flex-shrink-0 flex items-center gap-3 px-4 py-2" role="tablist" aria-label={t('profile.guardianStyleTitle')}>
        {STEPS.map((s) => (
          <div key={s} className="flex items-center gap-1" data-testid={`guardian-style-step-${s}`} aria-current={step === s ? 'step' : undefined}>
            <span className={`w-1.5 h-1.5 rounded-full ${step === s ? 'bg-cyan-400' : 'bg-glass-border'}`} />
            <span className={`text-[10px] ${step === s ? 'text-text-primary font-medium' : 'text-text-tertiary'}`}>
              {t(STEP_LABEL_KEY[s])}
            </span>
          </div>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto px-4 pb-4 space-y-2 custom-scrollbar">
        {step === 'overview' && (
          <div className="space-y-2">
            <p className="text-sm font-medium text-text-primary">{t('profile.guardianStyleOverviewTitle')}</p>
            <p className="text-xs text-text-tertiary">{t('profile.guardianStyleOverviewDesc')}</p>
            <SummaryRow
              label={t('profile.guardIntensityTitle')}
              value={t(INTENSITY_LABEL_KEY[guardIntensity])}
              testid="guardian-style-overview-intensity"
              valueName={guardIntensity}
            />
            <SummaryRow
              label={t('profile.nightWindowTitle')}
              value={t(NIGHT_LABEL_KEY[nightWindow])}
              testid="guardian-style-overview-night"
              valueName={nightWindow}
            />
            <SummaryRow
              label={t('profile.pushPrefsFrequencyLabel')}
              value={t(PUSH_LABEL_KEY[pushPreferences.frequency])}
              testid="guardian-style-overview-push"
              valueName={pushPreferences.frequency}
            />
            <SummaryRow
              label={t('profile.guardScopeTitle')}
              value={t('profile.guardScopeMapSummary', {
                guarded: currentScopeSummary.guarded,
                exempt: currentScopeSummary.exempt,
                strict: currentScopeSummary.strict,
              })}
              testid="guardian-style-overview-scope"
              valueName={`${currentScopeSummary.strict}strict/${currentScopeSummary.exempt}exempt`}
            />
            <p className="text-[11px] text-text-tertiary italic">{t('profile.guardianStyleExitNote')}</p>
          </div>
        )}

        {step === 'style' && (
          <div className="space-y-2">
            <p className="text-sm font-medium text-text-primary">{t('profile.guardianStyleStyleTitle')}</p>
            <p className="text-xs text-text-tertiary">{t('profile.guardianStyleStyleDesc')}</p>
            <div className="space-y-1.5" role="radiogroup" aria-label={t('profile.guardianStyleStyleTitle')}>
              {GUARDIAN_STYLE_PRESETS.map((id) => {
                const selected = preset === id;
                return (
                  <button
                    key={id}
                    role="radio"
                    aria-checked={selected}
                    onClick={() => choosePreset(id)}
                    data-testid={`guardian-style-preset-${id}`}
                    className={`w-full px-3 py-2 text-left rounded-xl border transition-colors cursor-pointer ${selected ? 'border-cyan-500/60 bg-cyan-500/10' : 'border-glass-border bg-glass-fill hover:bg-glass-hover'}`}
                  >
                    <span className={`block text-xs font-medium ${selected ? 'text-text-primary' : 'text-text-secondary'}`}>
                      {t(PRESET_LABEL_KEY[id])}
                    </span>
                    <span className="block text-[11px] text-text-tertiary mt-0.5">{t(PRESET_DESC_KEY[id])}</span>
                    {selected && (
                      <span className="block mt-1.5 text-[11px] leading-relaxed text-text-secondary">
                        <span className="text-cyan-300/90 font-medium">{t('profile.guardianStyleSeeTitle')}</span> {t(PRESET_SEE_KEY[id])}
                        <br />
                        <span className="text-purple-300/90 font-medium">{t('profile.guardianStyleWontSeeTitle')}</span> {t(PRESET_WONT_KEY[id])}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
            <p className="text-[11px] text-text-tertiary italic">{t('profile.guardianStyleAlwaysNote')}</p>
          </div>
        )}

        {step === 'adjust' && plan && (
          <div className="space-y-2">
            <p className="text-sm font-medium text-text-primary">{t('profile.guardianStyleAdjustTitle')}</p>
            <p className="text-xs text-text-tertiary">{t('profile.guardianStyleAdjustDesc')}</p>

            <AdjustBlock label={t('profile.guardIntensityTitle')}>
              <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label={t('profile.guardIntensityTitle')}>
                {GUARD_INTENSITIES.map((level) => (
                  <Chip
                    key={level}
                    selected={plan.guardIntensity === level}
                    onClick={() => patchPlan({ guardIntensity: level })}
                    testid={`guardian-style-adjust-intensity-${level}`}
                  >
                    {t(INTENSITY_LABEL_KEY[level])}
                  </Chip>
                ))}
              </div>
              <EffectLine
                t={t}
                see={t(INTENSITY_SEE_KEY[plan.guardIntensity])}
                wont={t(INTENSITY_WONT_KEY[plan.guardIntensity])}
              />
            </AdjustBlock>

            <AdjustBlock label={t('profile.nightWindowTitle')}>
              <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label={t('profile.nightWindowTitle')}>
                {NIGHT_WINDOW_PRESETS.map((option) => (
                  <Chip
                    key={option}
                    selected={plan.nightWindow === option}
                    onClick={() => patchPlan({ nightWindow: option })}
                    testid={`guardian-style-adjust-night-${option}`}
                  >
                    {t(NIGHT_LABEL_KEY[option])}
                  </Chip>
                ))}
              </div>
              <EffectLine
                t={t}
                see={t(NIGHT_SEE_KEY[plan.nightWindow], { range: NIGHT_WINDOW_OPTIONS[plan.nightWindow].rangeLabel })}
                wont={t(NIGHT_WONT_KEY[plan.nightWindow])}
              />
            </AdjustBlock>

            <AdjustBlock label={t('profile.pushPrefsFrequencyLabel')}>
              <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label={t('profile.pushPrefsFrequencyLabel')}>
                {PUSH_FREQUENCIES.map((frequency) => (
                  <Chip
                    key={frequency}
                    selected={plan.pushFrequency === frequency}
                    onClick={() => patchPlan({ pushFrequency: frequency })}
                    testid={`guardian-style-adjust-push-${frequency}`}
                  >
                    {t(PUSH_LABEL_KEY[frequency])}
                  </Chip>
                ))}
              </div>
              <EffectLine t={t} see={t(PUSH_SEE_KEY[plan.pushFrequency])} wont={t(PUSH_WONT_KEY[plan.pushFrequency])} />
            </AdjustBlock>

            <AdjustBlock label={t('profile.guardScopeTitle')}>
              <div className="space-y-1">
                {GUARD_SCOPE_CATEGORIES.map((category) => (
                  <div key={category} className="flex items-center justify-between gap-2 py-0.5">
                    <span className="text-[11px] text-text-secondary flex-shrink-0">{t(CATEGORY_LABEL_KEY[category])}</span>
                    <div className="flex gap-1" role="radiogroup" aria-label={t(CATEGORY_LABEL_KEY[category])}>
                      {SCOPE_MODES.map((mode) => (
                        <Chip
                          key={mode}
                          selected={plan.guardScope[category] === mode}
                          onClick={() => patchPlan({ guardScope: { ...plan.guardScope, [category]: mode } })}
                          testid={`guardian-style-adjust-scope-${category}-${mode}`}
                        >
                          {t(SCOPE_MODE_LABEL_KEY[mode])}
                        </Chip>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
              <EffectLine t={t} see={t('profile.guardianStyleScopeSee')} wont={t('profile.guardianStyleScopeWontSee')} />
            </AdjustBlock>
          </div>
        )}

        {step === 'contract' && plan && (
          <div className="space-y-2">
            <p className="text-sm font-medium text-text-primary">{t('profile.guardianStyleContractTitle')}</p>
            <p className="text-xs text-text-tertiary">{t('profile.guardianStyleContractDesc')}</p>
            <GuardianStyleContractCard plan={plan} t={t} />
            {receipt && (
              <GuardPolicyReceiptCard
                changes={receipt.changes}
                status={receipt.status}
                isRestoring={isRestoring}
                locale={locale}
                t={t}
                onRestore={handleRestore}
                onClose={onClose}
              />
            )}
            {noChanges && (
              <p className="text-[11px] text-text-secondary" data-testid="guard-policy-no-changes">
                {t('profile.guardPolicyNoChanges')}
              </p>
            )}
            {outcome && (
              <p className="text-[11px] text-amber-300/90 leading-relaxed" data-testid="guardian-style-apply-note">
                {t(outcome === 'pushNotSubscribed' ? 'profile.guardianStylePushNotSubscribedNote' : 'profile.guardianStylePushFailedNote')}
              </p>
            )}
            <p className="text-[11px] text-text-tertiary italic">{t('profile.guardianStyleAlwaysNote')}</p>
          </div>
        )}
      </div>

      <div className="flex-shrink-0 flex items-center justify-end gap-2 px-4 py-3 border-t border-glass-border">
        {step !== 'overview' && (
          <button
            onClick={() => setStep(STEPS[STEPS.indexOf(step) - 1])}
            data-testid="guardian-style-prev"
            className="px-3 py-1.5 text-xs rounded-lg border border-glass-border bg-glass-fill text-text-secondary hover:bg-glass-hover transition-colors cursor-pointer"
          >
            {t('profile.guardianStylePrev')}
          </button>
        )}
        {step !== 'contract' ? (
          <button
            onClick={() => setStep(STEPS[STEPS.indexOf(step) + 1])}
            disabled={!canGoNext}
            data-testid="guardian-style-next"
            className="px-3 py-1.5 text-xs rounded-lg bg-gradient-to-r from-cyan-500 to-purple-500 text-white font-medium hover:from-cyan-400 hover:to-purple-400 transition-all disabled:opacity-50 cursor-pointer disabled:cursor-not-allowed"
          >
            {t('profile.guardianStyleNext')}
          </button>
        ) : (
          <button
            onClick={handleApply}
            disabled={isApplying || !plan}
            data-testid={outcome === 'pushNotSubscribed' ? 'guardian-style-close' : 'guardian-style-apply'}
            className="px-3 py-1.5 text-xs rounded-lg bg-gradient-to-r from-cyan-500 to-purple-500 text-white font-medium hover:from-cyan-400 hover:to-purple-400 transition-all disabled:opacity-50 cursor-pointer disabled:cursor-not-allowed"
          >
            {isApplying ? '...' : outcome === 'pushNotSubscribed' ? t('profile.guardianStyleClose') : t('profile.guardianStyleApply')}
          </button>
        )}
      </div>
    </div>
  );
}
