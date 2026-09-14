'use client';

import { useI18n } from '@/i18n/provider';
import type { PatternAlertData } from '../hooks/use-pattern-alert';

/**
 * P1-2: Pattern Alert Banner — 7 天内 ≥ 2 次失败时提示
 * (原为 buddy-tab.tsx 内联 JSX — File Split Wave 1 纯搬运, 行为零变化)
 * 条件渲染保留在父组件 (patternAlertData?.alert && failedCount >= 2), 避免 React 19 Compiler 缓存问题
 */
export function PatternAlertBanner({ data }: { data: PatternAlertData }) {
  const { t } = useI18n();
  return (
    <div className="mx-4 mb-2 px-3 py-2.5 rounded-2xl bg-gradient-to-r from-amber-500/15 to-orange-500/15 border border-amber-500/30 shadow-lg">
      <div className="flex items-start gap-2">
        <div className="flex-shrink-0 w-7 h-7 rounded-full bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-xs">
          🔍
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[11px] text-text-primary leading-relaxed">
            {t('buddy.patternAlertTitle', { defaultValue: 'Noticed a pattern?' })}{' '}
            <span className="text-amber-400 font-medium">
              {t('buddy.patternAlertCount', {
                defaultValue: '{count} times this week you saw the cost and still bought.',
                count: data.failedCount,
              })}
            </span>
          </p>
          {data.recentFailures[0] && (
            <p className="text-[10px] text-text-tertiary mt-0.5">
              {t('buddy.patternAlertLast', {
                defaultValue: 'Last: {itemName} (${amount})',
                itemName: data.recentFailures[0].itemName,
                amount: data.recentFailures[0].amount,
              })}
            </p>
          )}
          <p className="text-[10px] text-amber-400/70 mt-0.5 italic">
            {t('buddy.patternAlertHint', { defaultValue: 'Seeing the pattern is the first step to changing it.' })}
          </p>
        </div>
      </div>
    </div>
  );
}
