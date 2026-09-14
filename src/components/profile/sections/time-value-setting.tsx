'use client';

/**
 * TimeValueSetting — 设置页「我的时间价值」区块 (batch51-b)
 *
 * 三个预设档 ($15/$25/$40) + 自定义数字输入 (钳制 1–500, Enter 提交)。
 * 保存走 useHourlyRate 共享通道 (与 48-a 强度 / 49-a 深夜时段同模式的设置项),
 * 改完所有自由小时展示点 (insight 卡/周对比/热力图 tooltip) 即时反映新值。
 * 文案中性温暖: 只讲换算用途, 不做档位比较。
 */

import { useState } from 'react';
import { Clock } from 'lucide-react';
import { useI18n } from '@/i18n/provider';
import { useHourlyRate } from '@/hooks/use-hourly-rate';
import { clampHourlyRate } from '@/lib/freedom-time';

const PRESET_RATES = [15, 25, 40] as const;

export function TimeValueSetting({ isDemo = false }: { isDemo?: boolean }) {
  const { t } = useI18n();
  const { hourlyRate, setHourlyRate } = useHourlyRate(isDemo);
  const [customOpen, setCustomOpen] = useState(false);
  const [input, setInput] = useState(String(hourlyRate));
  const [invalid, setInvalid] = useState(false);
  const [saveFailed, setSaveFailed] = useState(false);

  const selectPreset = (rate: number) => {
    setCustomOpen(false);
    setInvalid(false);
    setSaveFailed(false);
    void setHourlyRate(rate).catch(() => setSaveFailed(true));
  };

  const submitCustom = () => {
    const parsed = parseFloat(input);
    if (!Number.isFinite(parsed)) {
      setInvalid(true);
      return;
    }
    setInvalid(false);
    const clamped = clampHourlyRate(parsed);
    setInput(String(clamped));
    void setHourlyRate(clamped)
      .then(() => setCustomOpen(false))
      .catch(() => setSaveFailed(true));
  };

  const isPreset = (PRESET_RATES as readonly number[]).includes(hourlyRate);

  return (
    <div className="flex items-start gap-3 p-3 rounded-xl border border-glass-border bg-glass-fill">
      <div className="flex-shrink-0 w-9 h-9 rounded-lg bg-glass-fill flex items-center justify-center text-icon-muted">
        <Clock className="w-4 h-4" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-text-primary">{t('profile.timeValueTitle')}</p>
        <p className="text-xs text-text-tertiary mb-2">{t('profile.timeValueDesc')}</p>
        <div className="flex flex-wrap items-center gap-1.5" data-testid="time-value-options">
          {PRESET_RATES.map((rate) => (
            <button
              key={rate}
              onClick={() => selectPreset(rate)}
              aria-pressed={!customOpen && hourlyRate === rate}
              className={`px-2.5 py-1 text-[11px] rounded-lg border transition-colors cursor-pointer ${
                !customOpen && hourlyRate === rate
                  ? 'border-cyan-500/60 bg-cyan-500/10 text-text-primary'
                  : 'border-glass-border bg-glass-fill text-text-secondary hover:bg-glass-hover'
              }`}
              data-testid={`time-value-preset-${rate}`}
            >
              ${rate}/hr
            </button>
          ))}
          <button
            onClick={() => {
              setCustomOpen(true);
              setInvalid(false);
              setInput(String(hourlyRate));
            }}
            aria-pressed={customOpen || !isPreset}
            className={`px-2.5 py-1 text-[11px] rounded-lg border transition-colors cursor-pointer ${
              customOpen || !isPreset
                ? 'border-cyan-500/60 bg-cyan-500/10 text-text-primary'
                : 'border-glass-border bg-glass-fill text-text-secondary hover:bg-glass-hover'
            }`}
            data-testid="time-value-custom"
          >
            {t('profile.timeValueCustom')}
          </button>
        </div>
        {customOpen && (
          <div className="mt-2 flex flex-col gap-1">
            <div className="flex items-center gap-1.5">
              <span className="text-sm text-text-tertiary">$</span>
              <input
                type="text"
                inputMode="decimal"
                aria-label={t('profile.timeValueCustom')}
                value={input}
                onChange={(e) => {
                  const val = e.target.value.replace(/[^0-9.]/g, '');
                  const parts = val.split('.');
                  setInput(parts.length > 2 ? parts[0] + '.' + parts.slice(1).join('') : val);
                }}
                onFocus={(e) => e.target.select()}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') submitCustom();
                  if (e.key === 'Escape') setCustomOpen(false);
                }}
                className="w-16 px-2 py-1 text-sm text-text-primary bg-glass-fill border border-glass-border rounded-lg text-center focus:outline-none focus:border-cyan-500/50"
                placeholder="25"
                autoFocus
                data-testid="time-value-input"
              />
              <span className="text-xs text-text-tertiary">/hr</span>
              <button
                onClick={submitCustom}
                className="px-2 py-1 text-xs rounded-lg bg-gradient-to-r from-cyan-500 to-purple-500 text-white font-medium hover:from-cyan-400 hover:to-purple-400 transition-all cursor-pointer"
                data-testid="time-value-save"
              >
                {t('common.save')}
              </button>
            </div>
            <p className="text-[10px] text-text-tertiary/70">
              {t('profile.timeValueCustomHint')}
            </p>
            {invalid && (
              <p className="text-[11px] text-red-300" data-testid="time-value-invalid">
                {t('profile.timeValueInvalid')}
              </p>
            )}
            {saveFailed && (
              <p className="text-[11px] text-red-300" data-testid="time-value-error">
                {t('profile.timeValueSaveFailed')}
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
