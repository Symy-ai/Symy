/**
 * InducementStrategies — 高发诱导策略 Top 10
 * 🔧 Round 117 (P1-K-2): 从 Top 3 扩展到 Top 10, 新增 7 个债务诱导策略
 * 🔧 P1-1 fix (2026-07-17): isDemo prop 控制 Sample data 标注显示
 *   - Demo 模式 (未登录): 显示 "Sample data — yours will be real" (柔和, 不暴露规模)
 * 🔧 batch81-b: 接真数据 — source='sample' (服务端样本量 <20 或 API 失败走 mock)
 *   时, 登录用户也亮 Sample 角标 (诚实原则: 不装真数据), 替代旧"登录即不标注"口径。
 */

'use client';

import { useI18n } from '@/i18n/provider';
import type { InducementStrategy } from '../hooks/use-community-stats';

interface Props {
  strategies: InducementStrategy[];
  isLoading: boolean;
  t: ReturnType<typeof useI18n>['t'];
  isDemo?: boolean;
  /** 数据源标记 — real: 服务端真实聚合; sample: 样本/降级 (亮角标) */
  source?: 'real' | 'sample';
}

const STRATEGY_ICONS: Record<string, string> = {
  // 营销诱导
  limited_time: '⏰',
  scarcity: '📦',
  social_proof: '👥',
  fear_of_missing_out: '😰',
  bundle_deal: '🎁',
  influencer_endorsement: '📣',
  price_anchoring: '💰',
  emotional_manipulation: '😢',
  // 债务诱导 (Round 117)
  bnpl: '💳',
  minimum_payment: '🪤',
  credit_limit_increase: '📈',
  zero_apr_intro: '🎭',
  cash_advance: '💵',
  payday_loan: '🦈',
  subprime_credit_card: '🕳️',
  other: '❓',
};

const MEDALS = ['🥇', '🥈', '🥉'];

export function InducementStrategies({ strategies, isLoading, t, isDemo = false, source = 'real' }: Props) {
  if (isLoading || !strategies.length) return null;

  return (
    <div className="px-4 mt-6">
      <h3 className="text-sm font-bold text-text-primary mb-3">
        {t('inward.topStrategies', { defaultValue: 'Common Spending Traps' })}
      </h3>
      <p className="text-[10px] text-text-tertiary mb-3">
        {t('defense.topStrategiesDesc', { defaultValue: 'Most common spending traps Symy users faced this week' })}
      </p>
      {/* 数据源标注: Demo 模式显示引导文案; 登录用户在样本/降级数据时亮 Sample 角标
          (batch81-b 诚实原则: 不装真数据) */}
      {isDemo ? (
        <p className="text-[9px] text-amber-400/60 mb-2">
          {t('defense.sampleDataDemo', { defaultValue: 'Sample data — yours will be real when you sign up' })}
        </p>
      ) : (
        source === 'sample' && (
          <p className="text-[9px] text-amber-400/60 mb-2">
            {t('defense.sampleDataBadge', { defaultValue: '📋 Sample data' })}
          </p>
        )
      )}
      <div className="space-y-2">
        {/* 🔧 Round 117: 从 slice(0, 3) 改为 slice(0, 10), 显示全部 Top 10 */}
        {strategies.slice(0, 10).map((s, i) => (
          <div key={s.strategy} className={`flex items-center gap-3 p-3 rounded-xl border ${
            i < 3
              ? 'bg-glass-fill/50 border-glass-border'
              : 'bg-red-500/5 border-red-500/20'
          }`}>
            <span className="text-base flex-shrink-0 w-5 text-center">
              {MEDALS[i] || <span className="text-[10px] text-text-tertiary font-bold">{i + 1}</span>}
            </span>
            <span className="text-sm flex-shrink-0">{STRATEGY_ICONS[s.strategy] || '🔹'}</span>
            <span className="flex-1 text-xs text-text-primary truncate">
              {t(s.labelKey, { defaultValue: s.defaultLabel })}
            </span>
            <span className={`text-xs font-bold flex-shrink-0 ${
              i < 3 ? 'text-amber-400' : 'text-red-400'
            }`}>{s.percentage}%</span>
          </div>
        ))}
      </div>
    </div>
  );
}
