'use client';

/**
 * GuardianStyleContractCard — 守护契约卡 (batch61-a)
 *
 * in-app 荣誉面: 只含身份句 + 时段/次数/品类计数类承诺, 结构性不含金额与
 * 百分比 — 红线由 guardian-style-i18n-guard 对两本字典逐 key 锁死。
 * 数据全部来自 GuardianStylePlan (既有渠道值), 零新持久化。
 */

import { GUARD_SCOPE_CATEGORIES, isCategoryExempt, isCategoryStrict } from '@/lib/guard-scope';
import type { GuardianStylePlan } from '@/lib/guardian-style';
import { CONTRACT_IDENTITY_KEY, CONTRACT_NIGHT_KEY, CONTRACT_PUSH_KEY } from './guardian-style-copy';
import { NIGHT_WINDOW_OPTIONS } from '@/lib/night-window';
import type { useI18n } from '@/i18n/provider';

type TFunc = ReturnType<typeof useI18n>['t'];

export function GuardianStyleContractCard({ plan, t }: { plan: GuardianStylePlan; t: TFunc }) {
  const strictCount = GUARD_SCOPE_CATEGORIES.filter((c) => isCategoryStrict(plan.guardScope, c)).length;
  const exemptCount = GUARD_SCOPE_CATEGORIES.filter((c) => isCategoryExempt(plan.guardScope, c)).length;
  const scopeLine =
    strictCount > 0
      ? t('profile.guardianStyleContractScopeStrict', { count: strictCount })
      : exemptCount > 0
        ? t('profile.guardianStyleContractScopeExempt', { count: exemptCount })
        : t('profile.guardianStyleContractScopeAllGuard');
  const nightRange = NIGHT_WINDOW_OPTIONS[plan.nightWindow].rangeLabel;

  return (
    <div
      className="rounded-2xl border border-cyan-500/30 bg-gradient-to-b from-cyan-500/10 to-purple-500/5 p-4"
      data-testid="guardian-style-contract-card"
    >
      <p className="text-sm font-bold text-text-primary">{t('profile.guardianStyleContractCardTitle')}</p>
      <ul className="mt-2 space-y-1.5 text-xs text-text-secondary">
        <li data-testid="guardian-style-contract-identity">{t(CONTRACT_IDENTITY_KEY[plan.guardIntensity])}</li>
        <li data-testid="guardian-style-contract-night">
          {t(CONTRACT_NIGHT_KEY[plan.nightWindow], { range: nightRange })}
        </li>
        <li data-testid="guardian-style-contract-push">{t(CONTRACT_PUSH_KEY[plan.pushFrequency])}</li>
        <li data-testid="guardian-style-contract-scope">{scopeLine}</li>
      </ul>
      <p className="mt-3 text-right text-[11px] text-text-tertiary italic">
        {t('profile.guardianStyleContractSign')}
      </p>
    </div>
  );
}
