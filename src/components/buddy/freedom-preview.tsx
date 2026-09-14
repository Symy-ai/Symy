'use client';

/**
 * FreedomPreview — 挑战弹窗内的实时"自由预览"
 *
 * 🔧 需求五: 金额输入实时触发 Freedom 预览
 *
 * 用户在 ChallengeModal 输入金额后, 不需等 AI 回复, 立刻看到:
 *   1. 生命时间: amount / 时薪 = 小时数
 *   2. 未来值:   amount × (1.07)^years = 未来金额
 *   3. 基金进度: amount / 第一个未达成基金剩余额度 = 1/X
 *
 * 镜子哲学: 不评判, 只守护。底部 closing question 让用户自己回答。
 *
 * 数据来源:
 *   - 时薪: useHourlyRate hook (Profile → Freedom Settings, 默认 $25/h)
 *   - 退休年数: 暂用固定 30 年 (未来可从 Profile 读 retirement_age - current_age)
 *   - 基金: buddyState.dreamFunds (第一个 current < target 的基金)
 */

import { useMemo, useState } from 'react';
import { useI18n } from '@/i18n/provider';
import { useHourlyRate } from '@/hooks/use-hourly-rate';
import { DEFAULT_HOURLY_RATE } from '@/lib/freedom-time';
import type { DreamFund } from '@/types/buddy-state';

// 🔧 年化收益率 7%, 年数 20 (与 share-card-modal.tsx 一致)
const ANNUAL_RETURN_RATE = 0.07;
const DEFAULT_YEARS = 20;

export interface FreedomPreviewProps {
  /** 用户输入的金额 (已校验 >= 10) */
  amount: number;
  /** 用户输入的物品名 (用于 closing question) */
  itemName?: string;
  /** Dream Funds (从父组件传入, 用于第 3 维度; 空数组则跳过) */
  dreamFunds?: DreamFund[];
  /** 是否 demo 模式 (不 fetch 时薪) */
  isDemo?: boolean;
}

/**
 * 格式化小时数 — <1h 显示分钟, 否则显示 1 位小数小时
 */
function formatHours(hours: number, locale: string): string {
  // 🔧 2026-07-15 (ARCH-6 #5): Simplified — use locale only for unit selection
  if (hours < 1) {
    const minutes = Math.max(1, Math.round(hours * 60));
    return locale === 'zh' ? `${minutes} 分钟` : `${minutes} min`;
  }
  // <10h 显示 1 位小数, 否则取整
  const display = hours < 10 ? hours.toFixed(1) : Math.round(hours).toString();
  return locale === 'zh' ? `${display} 小时` : `${display} hours`;
}
// Note: This is a pure formatting function, not a component — can't use t() hook.
// locale param is passed from the component. This is acceptable (structural, not i18n key).

/**
 * 格式化金额 — 大额用 k/M
 */
function formatMoney(value: number): string {
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 10_000) return `$${(value / 1000).toFixed(0)}k`;
  return `$${value.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
}

export function FreedomPreview({ amount, itemName, dreamFunds, isDemo }: FreedomPreviewProps) {
  const { t, locale } = useI18n();
  const { hourlyRate } = useHourlyRate(isDemo);
  const effectiveRate = hourlyRate || DEFAULT_HOURLY_RATE;
  // 🔧 P2-10 fix: 复利假设说明展开状态
  const [showCompoundInfo, setShowCompoundInfo] = useState(false);

  // 实时计算 3 个维度 (memoized, amount/rate/funds 变化时重算)
  const dimensions = useMemo(() => {
    // 1. 生命时间
    const hours = amount / effectiveRate;

    // 2. 未来值 (复利)
    const futureValue = amount * Math.pow(1 + ANNUAL_RETURN_RATE, DEFAULT_YEARS);

    // 3. 基金进度 — 第一个未达成基金 (current < target)
    const firstUnfunded = dreamFunds?.find(f => (f.current || 0) < (f.target || 0));
    let fundFraction: { name: string; emoji: string; numerator: number; denominator: number } | null = null;
    if (firstUnfunded && firstUnfunded.target > 0) {
      const remaining = (firstUnfunded.target || 0) - (firstUnfunded.current || 0);
      if (remaining > 0) {
        fundFraction = {
          name: firstUnfunded.name,
          emoji: firstUnfunded.emoji || '🎯',
          numerator: 1,
          denominator: Math.max(1, Math.ceil(remaining / amount)),
        };
      }
    }

    return { hours, futureValue, fundFraction };
  }, [amount, effectiveRate, dreamFunds]);

  // closing question — 基于生命时间动态生成
  const closingQuestion = useMemo(() => {
    const hoursLabel = formatHours(dimensions.hours, locale);
    const item = itemName?.trim() || (locale === 'zh' ? '它' : 'it');
    return locale === 'zh'
      ? `你愿意用 ${hoursLabel} 换${item}吗？`
      : `Would you trade ${hoursLabel} of your life for ${item}?`;
  }, [dimensions.hours, itemName, locale]);

  return (
    <div
      className="mt-3 rounded-xl border border-cyan-500/20 bg-gradient-to-br from-cyan-500/8 to-purple-500/5 dark:from-cyan-500/12 dark:to-purple-500/8 p-3.5 animate-in slide-in-from-bottom-4 fade-in duration-300"
      role="status"
      aria-live="polite"
    >
      {/* 标题行 */}
      {/* 🔧 PM-#23 fix: 移除 uppercase (非警示类用 Sentence case) */}
      {/* 🔧 V3-1 fix: 传 $金额 而非纯数字, 避免 "The real cost of this 50" 缺 $ */}
      <p className="text-[10px] tracking-wider font-medium text-cyan-400/80 mb-2.5 flex items-center gap-1.5">
        <span className="text-sm">⏰</span>
        {t('buddy.freedomPreviewTitle', {
          amount: `$${amount.toFixed(0)}`,
          defaultValue: `The real cost of this $${amount.toFixed(0)}`,
        })}
      </p>

      {/* 三个维度 */}
      <div className="space-y-2">
        {/* 维度 1: 生命时间 (始终显示) */}
        <div className="flex items-start gap-2 text-sm">
          <span className="text-base leading-tight">🕐</span>
          <span className="text-text-primary font-medium leading-snug">
            {formatHours(dimensions.hours, locale)}
            <span className="text-text-tertiary font-normal">
              {' '}{t('buddy.freedomOfLife', { defaultValue: 'of your life' })}
            </span>
          </span>
        </div>

        {/* 维度 2: 未来值 (始终显示) */}
        <div className="flex items-start gap-2 text-sm">
          <span className="text-base leading-tight">📈</span>
          <span className="text-text-primary font-medium leading-snug">
            {t('buddy.freedomFutureValue', {
              years: DEFAULT_YEARS,
              defaultValue: `In {years} years, becomes `,
            })}
            <span className="gradient-text font-bold">{formatMoney(dimensions.futureValue)}</span>
            {/* 🔧 P2-16 fix (2026-07-20): 显示复利假设, 让数字透明可信 */}
            {/* 🔧 P2-10 fix (2026-07-20): 加 ℹ️ 图标, 点击展开详细假设说明 */}
            <button
              onClick={() => setShowCompoundInfo(!showCompoundInfo)}
              className="inline-flex items-center justify-center w-3.5 h-3.5 rounded-full bg-text-tertiary/20 text-text-tertiary hover:bg-text-tertiary/30 hover:text-text-secondary transition-colors text-[9px] font-bold align-middle ml-0.5"
              aria-label={t('buddy.freedomCompoundInfoLabel', { defaultValue: 'Compound interest assumptions' })}
            >
              i
            </button>
          </span>
        </div>
        {/* 🔧 P2-10 fix: 复利假设展开说明 */}
        {showCompoundInfo && (
          <div className="ml-6 mb-1 p-2 rounded-lg bg-glass-fill border border-glass-border text-[10px] text-text-tertiary leading-relaxed">
            {t('buddy.freedomCompoundInfo', {
              rate: '7%',
              years: DEFAULT_YEARS,
              defaultValue: `Based on ${'7%'} annual return (S&P 500 long-term average), not adjusted for inflation. Actual returns vary.`,
            })}
          </div>
        )}

        {/* 维度 3: 基金进度 (有未达成基金时才显示) */}
        {dimensions.fundFraction && (
          <div className="flex items-start gap-2 text-sm">
            <span className="text-base leading-tight">🎯</span>
            <span className="text-text-primary font-medium leading-snug">
              {dimensions.fundFraction.emoji} {dimensions.fundFraction.name}
              <span className="text-text-tertiary font-normal">
                {' '}{t('buddy.freedomFundFraction', { defaultValue: '· ' })}
              </span>
              <span className="text-cyan-400 font-bold">
                1/{dimensions.fundFraction.denominator}
              </span>
            </span>
          </div>
        )}
      </div>

      {/* Closing question — 基于生命时间动态生成 */}
      <div className="mt-3 pt-2.5 border-t border-cyan-500/15">
        <p className="text-xs text-text-secondary italic leading-relaxed">
          {closingQuestion}
        </p>
      </div>
    </div>
  );
}
