'use client';

/**
 * GuardScopeSetting — 设置页「守护范围」区块 (batch53-b)
 *
 * 按守护品类逐项三态 (守护/豁免/加严), 点击即保存 (localStorage 持久化, 零 DDL)。
 * 语义见 src/lib/guard-scope.ts。尾部带"专属守护地图"小结 (N 守护 / M 豁免),
 * 传递"我的守护我做主"的身份感。
 *
 * 话术红线: 豁免不是"放弃守护", 是"这是我的必需品"; 统计口径提示写明
 * 豁免品类不计入拦截分母 (自由小时统计口径随之变化)。
 */

import { Map } from 'lucide-react';
import { useI18n } from '@/i18n/provider';
import { useGuardScope } from '@/hooks/use-guard-scope';
import {
  GUARD_SCOPE_CATEGORIES,
  guardScopeSummary,
  type GuardScopeCategory,
  type GuardScopeMode,
} from '@/lib/guard-scope';

const CATEGORY_LABEL_KEY: Record<GuardScopeCategory, string> = {
  electronics: 'profile.guardScopeCatElectronics',
  clothing: 'profile.guardScopeCatClothing',
  beauty: 'profile.guardScopeCatBeauty',
  home: 'profile.guardScopeCatHome',
  food: 'profile.guardScopeCatFood',
};

const MODE_LABEL_KEY: Record<GuardScopeMode, string> = {
  guard: 'profile.guardScopeModeGuard',
  exempt: 'profile.guardScopeModeExempt',
  strict: 'profile.guardScopeModeStrict',
};

const MODES: readonly GuardScopeMode[] = ['guard', 'exempt', 'strict'];

const MODE_ACTIVE_CLASS: Record<GuardScopeMode, string> = {
  guard: 'border-emerald-500/60 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
  exempt: 'border-glass-border bg-glass-fill text-text-secondary',
  strict: 'border-cyan-500/60 bg-cyan-500/10 text-cyan-600 dark:text-cyan-400',
};

export function GuardScopeSetting() {
  const { t } = useI18n();
  const { guardScope, setGuardScopeMode } = useGuardScope();
  const summary = guardScopeSummary(guardScope);

  return (
    <div className="flex items-start gap-3 p-3 rounded-xl border border-glass-border bg-glass-fill">
      <div className="flex-shrink-0 w-9 h-9 rounded-lg bg-glass-fill flex items-center justify-center text-icon-muted">
        <Map className="w-4 h-4" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-text-primary">{t('profile.guardScopeTitle')}</p>
        <p className="text-xs text-text-tertiary mb-2">{t('profile.guardScopeDesc')}</p>
        <div className="space-y-1.5" data-testid="guard-scope-categories">
          {GUARD_SCOPE_CATEGORIES.map((category) => (
            <div
              key={category}
              className="flex items-center justify-between gap-2"
              data-testid={`guard-scope-row-${category}`}
            >
              <span className="text-xs font-medium text-text-secondary">{t(CATEGORY_LABEL_KEY[category])}</span>
              <div className="flex items-center gap-1" role="radiogroup" aria-label={t(CATEGORY_LABEL_KEY[category])}>
                {MODES.map((mode) => (
                  <button
                    key={mode}
                    role="radio"
                    aria-checked={guardScope[category] === mode}
                    onClick={() => setGuardScopeMode(category, mode)}
                    className={`px-2 py-0.5 rounded-md border text-[11px] font-medium transition-colors cursor-pointer ${
                      guardScope[category] === mode ? MODE_ACTIVE_CLASS[mode] : 'border-glass-border bg-glass-fill text-text-tertiary hover:bg-glass-hover'
                    }`}
                    data-testid={`guard-scope-${category}-${mode}`}
                  >
                    {t(MODE_LABEL_KEY[mode])}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
        <p className="mt-2 text-[11px] text-text-tertiary italic">{t('profile.guardScopeStatsNote')}</p>
        {/* 专属守护地图 — 身份感小结: 我的守护我做主 */}
        <div
          className="mt-2 rounded-lg border border-emerald-500/20 bg-emerald-500/5 px-2.5 py-1.5"
          data-testid="guard-scope-map"
        >
          <p className="text-[11px] font-medium text-emerald-600 dark:text-emerald-400">
            {t('profile.guardScopeMapTitle')}
          </p>
          <p className="text-[11px] text-text-secondary" data-testid="guard-scope-map-summary">
            {t('profile.guardScopeMapSummary', { guarded: summary.guarded, exempt: summary.exempt, strict: summary.strict })}
          </p>
        </div>
      </div>
    </div>
  );
}
