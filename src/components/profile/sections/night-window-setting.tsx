'use client';

/**
 * NightWindowSetting — 设置页「我的深夜时段」四档区块 (batch49-a)
 *
 * 早睡型 21–24 / 标准型 22–05 / 夜猫型 0–5 / 关闭 单选, 选中即保存
 * (localStorage 持久化, 零 DDL)。档位语义见 src/lib/night-window.ts。
 * 「这是我设定的守护」荣誉叙事: 用户自己承认的脆弱时段才出 banner;
 * 选关闭只关 banner, 统计卡照常 (数据透明, 无道德审判)。
 */

import { MoonStar } from 'lucide-react';
import { useI18n } from '@/i18n/provider';
import { useNightWindow } from '@/hooks/use-night-window';
import { NIGHT_WINDOW_PRESETS, NIGHT_WINDOW_OPTIONS, type NightWindowPreset } from '@/lib/night-window';

const LABEL_KEY: Record<NightWindowPreset, string> = {
  early: 'profile.nightWindowEarly',
  standard: 'profile.nightWindowStandard',
  nightOwl: 'profile.nightWindowNightOwl',
  off: 'profile.nightWindowOff',
};

const DESC_KEY: Record<NightWindowPreset, string> = {
  early: 'profile.nightWindowEarlyDesc',
  standard: 'profile.nightWindowStandardDesc',
  nightOwl: 'profile.nightWindowNightOwlDesc',
  off: 'profile.nightWindowOffDesc',
};

export function NightWindowSetting() {
  const { t } = useI18n();
  const { nightWindow, setNightWindow } = useNightWindow();

  return (
    <div className="flex items-start gap-3 p-3 rounded-xl border border-glass-border bg-glass-fill">
      <div className="flex-shrink-0 w-9 h-9 rounded-lg bg-glass-fill flex items-center justify-center text-icon-muted">
        <MoonStar className="w-4 h-4" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-text-primary">{t('profile.nightWindowTitle')}</p>
        <p className="text-xs text-text-tertiary mb-2">{t('profile.nightWindowDesc')}</p>
        <div className="space-y-1" role="radiogroup" aria-label={t('profile.nightWindowTitle')} data-testid="night-window-options">
          {NIGHT_WINDOW_PRESETS.map((preset) => (
            <button
              key={preset}
              role="radio"
              aria-checked={nightWindow === preset}
              onClick={() => setNightWindow(preset)}
              className={`w-full flex items-baseline gap-2 px-2.5 py-1.5 text-left rounded-lg border transition-colors cursor-pointer ${nightWindow === preset ? 'border-cyan-500/60 bg-cyan-500/10' : 'border-glass-border bg-glass-fill hover:bg-glass-hover'}`}
              data-testid={`night-window-${preset}`}
            >
              <span className={`text-xs font-medium ${nightWindow === preset ? 'text-text-primary' : 'text-text-secondary'}`}>
                {t(LABEL_KEY[preset])}
              </span>
              <span className="text-[11px] text-text-tertiary">
                {NIGHT_WINDOW_OPTIONS[preset].rangeLabel ? `${NIGHT_WINDOW_OPTIONS[preset].rangeLabel} · ` : ''}
                {t(DESC_KEY[preset])}
              </span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
