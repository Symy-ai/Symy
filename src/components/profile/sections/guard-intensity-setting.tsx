'use client';

/**
 * GuardIntensitySetting — 设置页「守护强度」三档区块 (batch48-a)
 *
 * gentle / balanced / strict 单选, 选中即保存 (localStorage 持久化, 零 DDL,
 * demo 模式同样只写本地不落库)。档位语义见 src/lib/guard-intensity.ts。
 * 文案荣誉框架: strict 是用户主动选择的荣誉姿态, 零「管不住自己」类羞辱表述。
 */

import { Shield } from 'lucide-react';
import { useI18n } from '@/i18n/provider';
import { useGuardIntensity } from '@/hooks/use-guard-intensity';
import { GUARD_INTENSITIES, type GuardIntensity } from '@/lib/guard-intensity';

const LABEL_KEY: Record<GuardIntensity, string> = {
  gentle: 'profile.guardIntensityGentle',
  balanced: 'profile.guardIntensityBalanced',
  strict: 'profile.guardIntensityStrict',
};

const DESC_KEY: Record<GuardIntensity, string> = {
  gentle: 'profile.guardIntensityGentleDesc',
  balanced: 'profile.guardIntensityBalancedDesc',
  strict: 'profile.guardIntensityStrictDesc',
};

export function GuardIntensitySetting() {
  const { t } = useI18n();
  const { guardIntensity, setGuardIntensity } = useGuardIntensity();

  return (
    <div className="flex items-start gap-3 p-3 rounded-xl border border-glass-border bg-glass-fill">
      <div className="flex-shrink-0 w-9 h-9 rounded-lg bg-glass-fill flex items-center justify-center text-icon-muted">
        <Shield className="w-4 h-4" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-text-primary">{t('profile.guardIntensityTitle')}</p>
        <p className="text-xs text-text-tertiary mb-2">{t('profile.guardIntensityDesc')}</p>
        <div className="space-y-1" role="radiogroup" aria-label={t('profile.guardIntensityTitle')} data-testid="guard-intensity-options">
          {GUARD_INTENSITIES.map((level) => (
            <button
              key={level}
              role="radio"
              aria-checked={guardIntensity === level}
              onClick={() => setGuardIntensity(level)}
              className={`w-full flex items-baseline gap-2 px-2.5 py-1.5 text-left rounded-lg border transition-colors cursor-pointer ${guardIntensity === level ? 'border-cyan-500/60 bg-cyan-500/10' : 'border-glass-border bg-glass-fill hover:bg-glass-hover'}`}
              data-testid={`guard-intensity-${level}`}
            >
              <span className={`text-xs font-medium ${guardIntensity === level ? 'text-text-primary' : 'text-text-secondary'}`}>
                {t(LABEL_KEY[level])}
              </span>
              <span className="text-[11px] text-text-tertiary">{t(DESC_KEY[level])}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
