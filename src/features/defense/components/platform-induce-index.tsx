/**
 * PlatformInduceIndex — 平台诱导指数 (进度条)
 *
 * 显示各平台的诱导指数 (0-100, 越高越危险)
 * 颜色: <40 绿色, 40-70 橙色, >70 红色
 * 🔧 P1-1 fix (2026-07-17): isDemo prop 控制 Sample data 标注显示
 */

'use client';

import type { PlatformIndexItem } from '../hooks/use-community-stats';
import type { useI18n } from '@/i18n/provider';

interface Props {
  platforms: PlatformIndexItem[];
  isLoading: boolean;
  t: ReturnType<typeof useI18n>['t'];
  isDemo?: boolean;
}

function getIndexColor(index: number): string {
  if (index >= 70) return 'bg-red-500';
  if (index >= 40) return 'bg-orange-500';
  return 'bg-green-500';
}

function getIndexTextColor(index: number): string {
  if (index >= 70) return 'text-red-400';
  if (index >= 40) return 'text-orange-400';
  return 'text-green-400';
}

export function PlatformInduceIndex({ platforms, isLoading, t, isDemo = false }: Props) {
  if (isLoading) {
    return (
      <div className="px-4 mt-6">
        <h3 className="text-sm font-bold text-text-primary mb-3">
          {t('inward.platformIndex', { defaultValue: 'Spending Triggers by Platform' })}
        </h3>
        <div className="space-y-2 animate-pulse">
          {[1, 2, 3].map(i => (
            <div key={i} className="h-10 rounded-xl bg-glass-fill/50 border border-glass-border" />
          ))}
        </div>
      </div>
    );
  }

  if (!platforms.length) {
    return (
      <div className="px-4 mt-6">
        <h3 className="text-sm font-bold text-text-primary mb-3">
          {t('inward.platformIndex', { defaultValue: 'Spending Triggers by Platform' })}
        </h3>
        <div className="rounded-2xl bg-glass-fill/30 border border-glass-border p-4 text-center">
          <p className="text-xs text-text-tertiary">
            {t('defense.platformIndexEmpty', { defaultValue: 'Not enough community data yet — check back soon.' })}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="px-4 mt-6">
      <h3 className="text-sm font-bold text-text-primary mb-1">
        {t('inward.platformIndex', { defaultValue: 'Spending Triggers by Platform' })}
      </h3>
      <p className="text-[10px] text-text-tertiary mb-2">
        {t('defense.platformIndexDesc', { defaultValue: 'Index = failed challenges / total challenges (this week)' })}
      </p>
      {/* 🔧 P1-1 fix (2026-07-17): 只在 Demo 模式显示 Sample data 标注
          登录用户即使数据是 mock, 也不暴露 "我们没人" — 反向社交证明伤害信任 */}
      {isDemo && (
        <p className="text-[9px] text-text-tertiary/60 mb-3">
          {t('defense.sampleDataDemo', { defaultValue: 'Sample data — yours will be real when you sign up' })}
        </p>
      )}
      <div className="space-y-2">
        {platforms.map(p => (
          <div key={p.platform} className="flex items-center gap-3 p-3 rounded-xl bg-glass-fill/50 border border-glass-border">
            <span className="text-lg flex-shrink-0">{p.icon}</span>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-medium text-text-primary truncate">{p.label}</span>
                <span className={`text-xs font-bold ${getIndexTextColor(p.index)}`}>{p.index}%</span>
              </div>
              <div className="h-1.5 rounded-full bg-glass-fill overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-500 ${getIndexColor(p.index)}`}
                  style={{ width: `${Math.min(100, p.index)}%` }}
                />
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
