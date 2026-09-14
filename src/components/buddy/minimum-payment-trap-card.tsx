'use client';

/**
 * MinimumPaymentTrapCard — 最低还款陷阱警示卡
 *
 * 🔧 P0-K-3: 斩杀线用户最致命的认知盲区 — 最低还款陷阱
 * 展示在 Buddy 主页, 让用户意识到只还最低还款 = 22 年才能还清
 *
 * 数据来源: 从 buddyState.dreamFunds 中找 Credit Card 类 fund
 * 设计决策 (非临时方案): 用户创建 "Credit Card Payoff" 类型的 Dream Fund 时,
 *   系统自动展示最低还款陷阱警示。这是当前版本的正确数据源。
 * 未来增强: Plaid 接入后可从真实信用卡账户获取余额, 但当前版本不依赖 Plaid。
 */

import { useState, useEffect } from 'react';
import { useI18n } from '@/i18n/provider';
import type { DreamFund } from '@/types/buddy-state';

interface MinimumPaymentTrapCardProps {
  dreamFunds: DreamFund[];
  hourlyRate?: number;
  isDemo?: boolean;
}

/** APR 假设 29.99% (美国信用卡平均) */
const DEFAULT_APR = 29.99;

export function MinimumPaymentTrapCard({ dreamFunds, hourlyRate, isDemo = false }: MinimumPaymentTrapCardProps) {
  const { t } = useI18n();

  // 找到 Credit Card Payoff 类型的 fund
  // 🔧 Round 122: 扩大匹配范围 — "capital one" / "visa" / "mastercard" / "amex" / "discover" / "card"
  const ccFund = dreamFunds.find(f => {
    const name = f.name?.toLowerCase() || '';
    return name.includes('credit card') ||
      name.includes('信用卡') ||
      name.includes('debt') ||
      name.includes('capital one') ||
      name.includes('visa') ||
      name.includes('mastercard') ||
      name.includes('amex') ||
      name.includes('discover') ||
      name.includes('card payoff');
  });

  // Round 122 Issue 1 fix: dismiss 持久化到 localStorage (按 fund name 分key)
  //   旧代码: useState(false) → 刷新页面卡片重新出现
  //   新代码: 从 localStorage 读取, dismiss 时写入
  const storageKey = ccFund ? `symy-trap-dismissed:${ccFund.id}` : '';
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (!storageKey) return;
    try {
      if (localStorage.getItem(storageKey) === '1') {
        setDismissed(true);
      }
    } catch { /* localStorage 不可用 */ }
  }, [storageKey]);

  const handleDismiss = () => {
    setDismissed(true);
    if (storageKey) {
      try { localStorage.setItem(storageKey, '1'); } catch { /* */ }
    }
  };

  // 🔧 PM-#22 fix: dismiss 可恢复 — 用户 dismiss 后看到折叠条, 点击可重新展开
  const handleRestore = () => {
    setDismissed(false);
    if (storageKey) {
      try { localStorage.removeItem(storageKey); } catch { /* */ }
    }
  };

  if (!ccFund) return null;

  const balance = ccFund.target - ccFund.current; // 剩余债务
  if (balance <= 0) return null; // 已还清

  // 🔧 Bug 4 fix: 防止 balance 过小导致计算异常
  if (balance < 100) return null; // 太小的余额不值得展示陷阱卡

  const apr = DEFAULT_APR;
  const monthlyRate = apr / 100 / 12;
  const minPaymentPercent = 0.04; // 最低还款通常为余额的 4%
  const minPayment = Math.max(25, Math.round(balance * minPaymentPercent));

  // 计算只还最低还款的还清时间 (月)
  // 公式: N = -log(1 - r*B/P) / log(1+r), B=balance, P=payment, r=monthlyRate
  const monthsMinOnly = monthlyRate > 0 && minPayment > balance * monthlyRate
    ? Math.ceil(-Math.log(1 - monthlyRate * balance / minPayment) / Math.log(1 + monthlyRate))
    : 0; // 0 = 计算失败 (最低还款不够覆盖利息)
  const totalInterestMinOnly = monthsMinOnly > 0
    ? Math.round(minPayment * monthsMinOnly - balance)
    : Math.round(balance * 1.5); // fallback: 估算利息 ≈ 1.5x 余额

  // 加 $200/月
  const paymentPlus200 = minPayment + 200;
  const monthsPlus200 = monthlyRate > 0 && paymentPlus200 > balance * monthlyRate
    ? Math.ceil(-Math.log(1 - monthlyRate * balance / paymentPlus200) / Math.log(1 + monthlyRate))
    : 0;
  const totalInterestPlus200 = monthsPlus200 > 0
    ? Math.round(paymentPlus200 * monthsPlus200 - balance)
    : 0;
  const saved200 = Math.max(0, totalInterestMinOnly - totalInterestPlus200);

  // 加 $500/月
  const paymentPlus500 = minPayment + 500;
  const monthsPlus500 = monthlyRate > 0 && paymentPlus500 > balance * monthlyRate
    ? Math.ceil(-Math.log(1 - monthlyRate * balance / paymentPlus500) / Math.log(1 + monthlyRate))
    : 0;
  const totalInterestPlus500 = monthsPlus500 > 0
    ? Math.round(paymentPlus500 * monthsPlus500 - balance)
    : 0;
  const saved500 = Math.max(0, totalInterestMinOnly - totalInterestPlus500);

  const formatMonths = (m: number) => {
    if (m <= 0) return '∞';
    if (m >= 12) return t('buddy.durationYearsMonths', { years: Math.floor(m / 12), months: m % 12, defaultValue: `{years}yr {months}mo` });
    return t('buddy.durationMonths', { months: m, defaultValue: `{months}mo` });
  };

  const formatMoney = (n: number) => `$${n.toLocaleString('en-US')}`;

  // 🔧 PM-#22 fix: dismiss 后显示折叠条 (可点击恢复), 而非完全消失
  if (dismissed) {
    return (
      <div className="relative z-10 px-4 py-2">
        <button
          onClick={handleRestore}
          className="w-full rounded-xl p-2.5 bg-glass-fill border border-glass-border hover:border-red-500/30 transition-colors text-left cursor-pointer"
          aria-label={t('buddy.minPaymentRestore', { defaultValue: 'Show Minimum Payment Trap' })}
        >
          <div className="flex items-center gap-2">
            <span className="text-xs">⚠️</span>
            <span className="text-[11px] text-text-secondary flex-1 truncate">
              {t('buddy.minPaymentTrapCollapsed', {
                defaultValue: 'Minimum Payment Trap — {amount} at risk',
                amount: formatMoney(totalInterestMinOnly),
              })}
            </span>
            <span className="text-[10px] text-text-tertiary">{t('common.show', { defaultValue: 'Show' })}</span>
          </div>
        </button>
      </div>
    );
  }

  return (
    <div className="relative z-10 px-4 py-2">
      <div className="rounded-2xl p-4 bg-gradient-to-br from-red-500/10 to-orange-500/5 border border-red-500/20 dark:from-red-500/15 dark:to-orange-500/8">
        {/* 标题行 */}
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-1.5">
            <h3 className="text-xs font-semibold text-red-400 uppercase tracking-wider flex items-center gap-1.5">
              <span>⚠️</span>
              {t('buddy.minPaymentTrap', { defaultValue: 'Minimum Payment Trap' })}
            </h3>
            {isDemo && (
              <span className="text-[9px] font-semibold text-amber-600 dark:text-amber-400 bg-amber-500/15 dark:bg-amber-500/20 border border-amber-500/30 px-1.5 py-0.5 rounded">
                {t('ahaMoment.sampleDataLabel', { defaultValue: '📊 示例' })}
              </span>
            )}
          </div>
          <button
            onClick={handleDismiss}
            className="text-[10px] text-text-tertiary hover:text-text-primary transition-colors"
            aria-label={t('common.dismiss', { defaultValue: 'Dismiss' })}
          >
            ✕
          </button>
        </div>

        {/* 🔧 PM-#22 fix: 顶部一句话引导 — 让用户立刻知道为什么这很重要 */}
        <p className="text-[11px] text-red-400/90 font-medium mb-3 leading-relaxed">
          {t('buddy.minPaymentWhyItMatters', {
            defaultValue: 'Why this matters: Paying only the minimum costs you {amount} more in interest.',
            amount: formatMoney(totalInterestMinOnly),
          })}
        </p>

        {/* 信用卡信息 */}
        <div className="mb-3 px-3 py-2 rounded-xl bg-glass-fill/50 border border-glass-border">
          <p className="text-sm font-medium text-text-primary">{ccFund.name}</p>
          <p className="text-xs text-text-tertiary mt-0.5">
            {t('buddy.balance', { defaultValue: 'Balance' })}: {formatMoney(balance)} @ {apr}% {t('buddy.apr', { defaultValue: 'APR' })}
          </p>
        </div>

        {/* 三种还款方案对比 */}
        <div className="space-y-2">
          {/* 只还最低还款 */}
          <div className="px-3 py-2 rounded-xl bg-red-500/5 border border-red-500/15">
            <div className="flex items-center justify-between text-[11px] mb-1">
              <span className="text-red-400 font-medium">
                {t('buddy.minPaymentOnly', { defaultValue: 'Minimum only' })}
              </span>
              <span className="text-text-tertiary">{formatMoney(minPayment)}/{t('buddy.month', { defaultValue: 'mo' })}</span>
            </div>
            <div className="flex items-center justify-between text-[10px]">
              <span className="text-text-secondary">
                {formatMonths(monthsMinOnly)} → {t('buddy.payoff', { defaultValue: 'payoff' })}
              </span>
              <span className="text-red-400 font-mono">
                +{formatMoney(totalInterestMinOnly)} {t('buddy.interest', { defaultValue: 'interest' })}
              </span>
            </div>
          </div>

          {/* +$200/月 */}
          <div className="px-3 py-2 rounded-xl bg-amber-500/5 border border-amber-500/15">
            <div className="flex items-center justify-between text-[11px] mb-1">
              <span className="text-amber-400 font-medium">
                {t('buddy.addPerMonth', { defaultValue: 'Add' })} $200/{t('buddy.month', { defaultValue: 'mo' })}
              </span>
              <span className="text-text-tertiary">{formatMoney(paymentPlus200)}/{t('buddy.month', { defaultValue: 'mo' })}</span>
            </div>
            <div className="flex items-center justify-between text-[10px]">
              <span className="text-text-secondary">
                {formatMonths(monthsPlus200)} → {t('buddy.payoff', { defaultValue: 'payoff' })}
              </span>
              <span className="text-amber-400 font-mono">
                {t('buddy.save', { defaultValue: 'Save' })} {formatMoney(saved200)}
              </span>
            </div>
          </div>

          {/* +$500/月 */}
          <div className="px-3 py-2 rounded-xl bg-green-500/5 border border-green-500/15">
            <div className="flex items-center justify-between text-[11px] mb-1">
              <span className="text-green-400 font-medium">
                {t('buddy.addPerMonth', { defaultValue: 'Add' })} $500/{t('buddy.month', { defaultValue: 'mo' })}
              </span>
              <span className="text-text-tertiary">{formatMoney(paymentPlus500)}/{t('buddy.month', { defaultValue: 'mo' })}</span>
            </div>
            <div className="flex items-center justify-between text-[10px]">
              <span className="text-text-secondary">
                {formatMonths(monthsPlus500)} → {t('buddy.payoff', { defaultValue: 'payoff' })}
              </span>
              <span className="text-green-400 font-mono">
                {t('buddy.save', { defaultValue: 'Save' })} {formatMoney(saved500)}
              </span>
            </div>
          </div>
        </div>

        {/* 生命时间换算 */}
        {hourlyRate && hourlyRate > 0 && saved500 > 0 && (
          <p className="text-[10px] text-text-tertiary text-center mt-2 leading-relaxed">
            {t('buddy.minPaymentLifeHint', {
              defaultValue: 'Adding $500/mo = {hours} fewer hours of your life working for interest.',
              hours: Math.round(saved500 / hourlyRate).toLocaleString(),
            })}
          </p>
        )}

        {/* 🔧 v4 fix: 数据来源说明 — 避免用户误以为是真实银行债务 */}
        {/* 🔧 PM-#22 fix: "Connect your bank" 是死链, 改为 "Bank connection coming soon" 避免误导 */}
        <p className="text-[9px] text-text-tertiary/70 text-center mt-1.5 leading-relaxed">
          {t('buddy.minPaymentDataSource', {
            defaultValue: 'Based on your "{fundName}" goal. Bank connection coming soon.',
            fundName: ccFund.name,
          })}
        </p>
      </div>
    </div>
  );
}
