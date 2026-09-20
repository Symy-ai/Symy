'use client';

/**
 * GreenPreferencesSection — 绿色偏好冻结态区块 (batch43-a, batch95-a 收敛)
 *
 * 99-d 定案: 强度只有一套系统 — GuardIntensitySetting 三档 (gentle/balanced/strict,
 * 见 guard-intensity-setting.tsx)。本区块原有的独立四档强度选择已删除
 * (green-prefs.intensity 除设置页写入外零行为消费; 历史 firm/lockdown 由
 * green-intensity-migration.ts 一次性映射到 strict)。只保留话术 / 推送主题两组。
 */

import { useState } from 'react';
import { Wind } from 'lucide-react';
import { useGreenPrefs, type Wording, type PushTheme } from '@/hooks/use-green-prefs';

const WORDING_OPTIONS: { value: Wording; labelEn: string; labelZh: string }[] = [
  { value: 'cheerful', labelEn: 'Cheerful', labelZh: '轻松鼓励' },
  { value: 'neutral', labelEn: 'Neutral', labelZh: '中性说明' },
  { value: 'direct', labelEn: 'Direct', labelZh: '直接提醒' },
];

const PUSH_OPTIONS: { value: PushTheme; labelEn: string; labelZh: string }[] = [
  { value: 'none', labelEn: 'Standard', labelZh: '标准' },
  { value: 'seasonal', labelEn: 'Seasonal', labelZh: '季节主题' },
  { value: 'guardian', labelEn: 'Guardian', labelZh: '守护季' },
];

export function GreenPreferencesSection({ t, locale }: { t: (key: string, opts?: { defaultValue?: string }) => string; locale: string }) {
  const { prefs, setGreenPrefField, resetGreenPrefs } = useGreenPrefs();
  const [saving, setSaving] = useState(false);
  const [resetConfirmOpen, setResetConfirmOpen] = useState(false);
  const [locked, setLocked] = useState(false);

  const isZh = locale === 'zh';

  const save = async () => {
    setSaving(true);
    await new Promise((r) => setTimeout(r, 220));
    setSaving(false);
  };

  return (
    <div className="flex items-start gap-3 p-3 rounded-xl border border-glass-border bg-glass-fill">
      <div className="flex-shrink-0 w-9 h-9 rounded-lg bg-glass-fill flex items-center justify-center text-icon-muted">
        <Wind className="w-4 h-4" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-text-primary">{t('profile.greenPrefsTitle', { defaultValue: 'Green Preferences' })}</p>
        <p className="text-xs text-text-tertiary mb-2">{t('profile.greenPrefsDesc', { defaultValue: 'Lock your preferred green level, wording, and push theme — Symy and your buddy will use the same setup everywhere.' })}</p>

        <div className="space-y-2">
          <div>
            <label className="text-[11px] font-medium text-text-secondary">{t('profile.greenPrefsWordingLabel', { defaultValue: 'Alternative wording' })}</label>
            <div className="mt-1 flex flex-wrap gap-1.5">
              {WORDING_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => setGreenPrefField('wording', opt.value)}
                  className={`px-2.5 py-1 text-[11px] rounded-lg border transition-colors cursor-pointer ${prefs.wording === opt.value ? 'border-cyan-500/60 bg-cyan-500/10 text-text-primary' : 'border-glass-border bg-glass-fill text-text-secondary hover:bg-glass-hover'}`}
                >
                  {isZh ? opt.labelZh : opt.labelEn}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="text-[11px] font-medium text-text-secondary">{t('profile.greenPrefsPushLabel', { defaultValue: 'Push green theme' })}</label>
            <div className="mt-1 flex flex-wrap gap-1.5">
              {PUSH_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => setGreenPrefField('pushTheme', opt.value)}
                  className={`px-2.5 py-1 text-[11px] rounded-lg border transition-colors cursor-pointer ${prefs.pushTheme === opt.value ? 'border-cyan-500/60 bg-cyan-500/10 text-text-primary' : 'border-glass-border bg-glass-fill text-text-secondary hover:bg-glass-hover'}`}
                >
                  {isZh ? opt.labelZh : opt.labelEn}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="mt-2.5 flex items-center gap-2">
          <button
            onClick={save}
            disabled={saving}
            className="px-3 py-1.5 text-xs rounded-lg bg-gradient-to-r from-cyan-500 to-purple-500 text-white font-medium hover:from-cyan-400 hover:to-purple-400 transition-all disabled:opacity-50 cursor-pointer"
          >
            {saving ? '...' : t('profile.greenPrefsSave', { defaultValue: 'Save' })}
          </button>
          <button
            onClick={() => setLocked(!locked)}
            className={`px-3 py-1.5 text-xs rounded-lg border transition-colors cursor-pointer ${locked ? 'border-cyan-500/60 bg-cyan-500/10 text-text-primary' : 'border-glass-border bg-glass-fill text-text-secondary hover:bg-glass-hover'}`}
          >
            {locked ? t('profile.greenPrefsLocked', { defaultValue: 'Locked' }) : t('profile.greenPrefsUnlock', { defaultValue: 'Unlock' })}
          </button>
          <button
            onClick={() => setResetConfirmOpen(true)}
            className="px-3 py-1.5 text-xs rounded-lg border border-red-500/20 bg-red-500/5 text-red-300 hover:bg-red-500/10 transition-colors cursor-pointer"
          >
            {t('profile.greenPrefsResetLabel', { defaultValue: 'Reset green preferences' })}
          </button>
        </div>

        {resetConfirmOpen && (
          <div className="mt-3 rounded-xl border border-red-500/20 bg-red-500/5 p-3">
            <p className="text-xs font-medium text-text-primary">{t('profile.greenPrefsResetConfirm', { defaultValue: 'Reset all green preferences?' })}</p>
            <p className="text-[11px] text-text-tertiary mt-1">{t('profile.greenPrefsResetConfirmDesc', { defaultValue: 'We will clear your saved green preferences, cache, and demo data. Your account, orders, and honors are not affected.' })}</p>
            <div className="mt-2 flex gap-2">
              <button
                onClick={() => {
                  resetGreenPrefs();
                  setResetConfirmOpen(false);
                }}
                className="px-3 py-1.5 text-xs rounded-lg bg-red-500/20 text-red-200 font-medium hover:bg-red-500/30 transition-colors cursor-pointer"
              >
                {t('profile.greenPrefsResetConfirmButton', { defaultValue: 'Yes, reset' })}
              </button>
              <button
                onClick={() => setResetConfirmOpen(false)}
                className="px-3 py-1.5 text-xs rounded-lg border border-glass-border bg-glass-fill text-text-secondary hover:bg-glass-hover transition-colors cursor-pointer"
              >
                {t('common.cancel', { defaultValue: 'Cancel' })}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
