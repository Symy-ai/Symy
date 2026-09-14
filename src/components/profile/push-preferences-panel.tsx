'use client';

/**
 * PushPreferencesPanel — 推送偏好面板 (batch60-b)
 *
 * 展示层组件: 频率三档 (daily/weekly/off) + 四个类型开关, 文案讲清各自
 * 触发时机与关闭后果。读写分离 — 数据与保存归调用方 (hook + 父组件组合),
 * 本组件只负责渲染与 onChange 上抛。
 *
 * 文案红线: 非羞辱非催促; "off" 明确说明只是停止例行提醒、守护记录不丢;
 * 零金额字符。
 */

import { Bell } from 'lucide-react';
import type { useI18n } from '@/i18n/provider';
import {
  PUSH_FREQUENCIES,
  type NormalizedPushPreferences,
  type PushFrequency,
} from '@/lib/push/preferences';

type TFunc = ReturnType<typeof useI18n>['t'];

interface PushPreferencesPanelProps {
  t: TFunc;
  preferences: NormalizedPushPreferences;
  onChange: (patch: Partial<NormalizedPushPreferences>) => void;
  disabled?: boolean;
  /** 一次成功保存后的轻反馈 ("已更新"), 下一次改动前保持 */
  justSaved?: boolean;
  isSaving?: boolean;
}

const TYPE_TOGGLES: Array<{
  key: keyof Omit<NormalizedPushPreferences, 'frequency'>;
  labelKey: string;
  descKey: string;
}> = [
  { key: 'missYou', labelKey: 'profile.pushPrefsMissYouLabel', descKey: 'profile.pushPrefsMissYouDesc' },
  { key: 'dreamFund', labelKey: 'profile.pushPrefsDreamFundLabel', descKey: 'profile.pushPrefsDreamFundDesc' },
  { key: 'challenge', labelKey: 'profile.pushPrefsChallengeLabel', descKey: 'profile.pushPrefsChallengeDesc' },
  { key: 'weeklyGuardian', labelKey: 'profile.pushPrefsWeeklyGuardianLabel', descKey: 'profile.pushPrefsWeeklyGuardianDesc' },
];

const FREQUENCY_LABEL_KEY: Record<PushFrequency, string> = {
  daily: 'profile.pushPrefsFrequencyDaily',
  weekly: 'profile.pushPrefsFrequencyWeekly',
  off: 'profile.pushPrefsFrequencyOff',
};

const FREQUENCY_DESC_KEY: Record<PushFrequency, string> = {
  daily: 'profile.pushPrefsFrequencyDailyDesc',
  weekly: 'profile.pushPrefsFrequencyWeeklyDesc',
  off: 'profile.pushPrefsFrequencyOffDesc',
};

export function PushPreferencesPanel({ t, preferences, onChange, disabled = false, justSaved = false, isSaving = false }: PushPreferencesPanelProps) {
  return (
    <div
      className={`pl-[60px] pr-3 pb-1 space-y-2 transition-opacity ${disabled ? 'opacity-50 pointer-events-none' : ''}`}
      data-testid="push-preferences-panel"
      aria-disabled={disabled}
    >
      <div className="flex items-center gap-2">
        <Bell className="w-3.5 h-3.5 text-text-tertiary" />
        <p className="text-[11px] font-medium text-text-secondary">{t('profile.pushPrefsTitle')}</p>
        {justSaved && !isSaving && (
          <span className="text-[10px] text-emerald-400" data-testid="push-prefs-saved">{t('profile.pushPrefsSaved')}</span>
        )}
      </div>

      <div>
        <label className="text-[11px] font-medium text-text-secondary">{t('profile.pushPrefsFrequencyLabel')}</label>
        <div className="mt-1 flex flex-wrap gap-1.5" role="radiogroup" aria-label={t('profile.pushPrefsFrequencyLabel')} data-testid="push-prefs-frequency">
          {PUSH_FREQUENCIES.map((frequency) => (
            <button
              key={frequency}
              role="radio"
              aria-checked={preferences.frequency === frequency}
              disabled={disabled}
              onClick={() => onChange({ frequency })}
              data-testid={`push-prefs-frequency-${frequency}`}
              className={`px-2.5 py-1 text-[11px] rounded-lg border transition-colors cursor-pointer ${preferences.frequency === frequency ? 'border-cyan-500/60 bg-cyan-500/10 text-text-primary' : 'border-glass-border bg-glass-fill text-text-secondary hover:bg-glass-hover'}`}
            >
              {t(FREQUENCY_LABEL_KEY[frequency])}
            </button>
          ))}
        </div>
        <p className="mt-1 text-[11px] text-text-tertiary">{t(FREQUENCY_DESC_KEY[preferences.frequency])}</p>
        {preferences.frequency === 'off' && (
          <p className="mt-1 text-[11px] text-text-tertiary italic" data-testid="push-prefs-off-note">
            {t('profile.pushPrefsOffNote')}
          </p>
        )}
      </div>

      <div className="space-y-1" data-testid="push-prefs-toggles">
        {TYPE_TOGGLES.map(({ key, labelKey, descKey }) => (
          <button
            key={key}
            role="switch"
            aria-checked={preferences[key]}
            disabled={disabled}
            onClick={() => onChange({ [key]: !preferences[key] })}
            data-testid={`push-prefs-toggle-${key}`}
            className={`w-full flex items-center gap-2 px-2.5 py-1.5 text-left rounded-lg border transition-colors cursor-pointer ${preferences[key] ? 'border-cyan-500/60 bg-cyan-500/10' : 'border-glass-border bg-glass-fill hover:bg-glass-hover'}`}
          >
            <span className={`text-xs font-medium flex-1 ${preferences[key] ? 'text-text-primary' : 'text-text-secondary'}`}>
              {t(labelKey)}
            </span>
            <span className="text-[11px] text-text-tertiary flex-1">{t(descKey)}</span>
            <span className={`text-[10px] flex-shrink-0 ${preferences[key] ? 'text-cyan-400' : 'text-text-tertiary'}`}>
              {preferences[key] ? '✓' : '—'}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
