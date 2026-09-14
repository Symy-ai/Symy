'use client';

/**
 * PremiumCard — Premium 价值矩阵卡片 (需求六)
 *
 * 🔧 需求六: 重新设计免费版 vs Premium 差异
 *    核心差异: 免费版是"你主动找小象把关", Premium 是"小象先一步找你"
 *
 * 🔧 BUG-2 fix: 候补名单表单提取为 WaitlistForm 组件, 与 EmailConnectionSetting 复用
 *
 * 🐘 batch7-c: 守护口径 — Premium 是"更尽职的守护伙伴":
 *    主动拦截提醒 / 深度守护报告 / 无限如果(守护预案) / 退款协助。
 *    定价 $9.90/月 原样保留; 生命时长换算话术已移除 (旧哲学话术清零, 不再新增任何人生小时数换算)。
 *    Coming Soon 徽章与 WaitlistForm 挂载结构不动 (BUG-2 复用关系保持)。
 *
 * 卡片内容:
 *   - "更尽职的守护伙伴" 标题
 *   - 免费版 vs Premium 一句话对比
 *   - 4 个 Premium 功能行: 主动拦截提醒 / 深度守护报告 / 无限守护预案 / 退款协助
 *   - $9.90/月 · 7 天免费试用
 *   - "加入候补名单 →" 按钮 (收集邮箱) — 通过 WaitlistForm(mode='button')
 *   - "Coming Soon" 徽章
 *
 * 荣誉框架: Premium 卖的是"被守护得更好", 不卖焦虑、不换算生命。
 */

import { Crown, Sparkles, BookOpen, Infinity as InfinityIcon, Wallet } from 'lucide-react';
import { useI18n } from '@/i18n/provider';
import { WaitlistForm } from './waitlist-form';

export interface PremiumCardProps {
  /** 当前 locale (用于动态价格文案) */
  locale: string;
}

export function PremiumCard({ locale: _locale }: PremiumCardProps) {
  const { t } = useI18n();

  // 🔧 ARCH fix Round 75 (Finding 34): Removed descZh field — use t(descKey) unconditionally.
  //    旧代码: locale === 'zh' ? f.descZh : t(f.descKey) — bypassed i18n for zh, causing drift.
  //    根因修复: zh.json 已有所有 descKey 翻译, 直接用 t() 即可.
  const features = [
    {
      icon: Sparkles,
      key: 'activeGuard',
      emoji: '🛡️',
      titleKey: 'profile.premiumFeatureActiveGuardTitle',
      titleDefault: 'Proactive intercepts',
      descKey: 'profile.premiumFeatureActiveGuardDesc',
      descDefault: 'When an impulse is about to land, Symy nudges you first',
    },
    {
      icon: BookOpen,
      key: 'deepGuardReport',
      emoji: '📖',
      titleKey: 'profile.premiumFeatureDeepReportTitle',
      titleDefault: 'Deep guardian report',
      descKey: 'profile.premiumFeatureDeepReportDesc',
      descDefault: 'Full blind-spot map + spending patterns + where your money stays',
    },
    {
      icon: InfinityIcon,
      key: 'infiniteSimulation',
      emoji: '🦋',
      titleKey: 'profile.premiumFeatureInfiniteSimTitle',
      titleDefault: 'Unlimited guard plans',
      descKey: 'profile.premiumFeatureInfiniteSimDesc',
      descDefault: 'Every longing becomes a guard plan — weigh it before it lands',
    },
    {
      icon: Wallet,
      key: 'refundAssist',
      emoji: '💰',
      titleKey: 'profile.premiumFeatureRefundTitle',
      titleDefault: 'Refund Assist',
      descKey: 'profile.premiumFeatureRefundDesc',
      descDefault: 'For the ones that slipped through — Symy helps you get your money back',
    },
  ];

  return (
    <div className="w-full bg-gradient-to-br from-amber-500/8 via-orange-500/5 to-yellow-500/8 dark:from-amber-500/12 dark:via-orange-500/8 dark:to-yellow-500/12 border border-amber-500/20 dark:border-amber-500/30 rounded-2xl p-5 transition-all">
      {/* 标题区 */}
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-amber-500/30 to-orange-500/30 flex items-center justify-center">
            <Crown className="w-5 h-5 text-amber-600 dark:text-amber-400" />
          </div>
          <div>
            <h3 className="text-base font-bold text-amber-700 dark:text-amber-300 leading-tight">
              {t('profile.premiumTitle', { defaultValue: 'A more devoted guardian' })}
            </h3>
            <span className="inline-block text-[9px] font-semibold text-amber-600/80 dark:text-amber-400/80 bg-amber-500/15 px-1.5 py-0.5 rounded-full mt-0.5">
              {t('profile.premiumComingSoon', { defaultValue: 'Coming Soon' })}
            </span>
          </div>
        </div>
      </div>

      {/* 免费版 vs Premium 对比 */}
      <div className="mb-4 p-3 rounded-xl bg-glass-fill/50 dark:bg-glass-fill/30 border border-glass-border/50 space-y-1">
        <p className="text-xs text-text-secondary leading-relaxed">
          <span className="text-text-tertiary font-medium">{t('profile.premiumFreeLabel', { defaultValue: 'Free' })}:</span>{' '}
          {t('profile.premiumFreeDesc', { defaultValue: 'You come to Symy when you want a guard' })}
        </p>
        <p className="text-xs text-amber-700 dark:text-amber-300 leading-relaxed font-medium">
          <span className="text-amber-600/80 dark:text-amber-400/80">{t('profile.premiumLabel', { defaultValue: 'Premium' })}:</span>{' '}
          {t('profile.premiumPremiumDesc', { defaultValue: 'Symy reaches you first, before the impulse does' })}
        </p>
      </div>

      {/* 分割线 */}
      <div className="h-px bg-gradient-to-r from-transparent via-amber-500/20 to-transparent mb-4" />

      {/* 功能列表 */}
      <div className="space-y-3 mb-4">
        {features.map((f) => (
          <div key={f.key} className="flex items-start gap-2.5">
            <span className="text-base leading-tight flex-shrink-0 mt-0.5">{f.emoji}</span>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-text-primary leading-tight">
                {t(f.titleKey, { defaultValue: f.titleDefault })}
              </p>
              <p className="text-[11px] text-text-secondary leading-snug mt-0.5">
                {t(f.descKey, { defaultValue: f.descDefault })}
              </p>
            </div>
          </div>
        ))}
      </div>

      {/* 分割线 */}
      <div className="h-px bg-gradient-to-r from-transparent via-amber-500/20 to-transparent mb-4" />

      {/* 价格 + 候补名单按钮 */}
      {/* 🔧 PM-P1-15 fix: 固定价格文案 + 加 Free vs Premium 对比表 + Start Free Trial CTA */}
      {/* 🔧 BUG-2 fix: 候补名单表单提取为 WaitlistForm 组件 */}
      {/* 🐘 batch7-c: 生命时长换算话术移除 — 定价只说价格本身 */}
      <div className="space-y-3">
        <div className="text-center">
          <p className="text-sm font-bold text-amber-700 dark:text-amber-300">
            {t('premium.priceTrial')}
          </p>
        </div>
        {/* Free vs Premium 对比表 — 🔧 PM decision 3: 扩展到 6 项 */}
        <div className="space-y-1.5 p-3 rounded-xl bg-glass-fill/50 dark:bg-glass-fill/30 border border-glass-border/50">
          <div className="flex items-center justify-between text-xs">
            <span className="text-text-tertiary">{t('profile.premiumFreeLabel', { defaultValue: 'Free' })}</span>
            <span className="text-amber-600 dark:text-amber-400 font-bold">Premium</span>
          </div>
          <div className="flex items-center justify-between text-[10px] text-text-tertiary">
            <span>{t('profile.premiumCompareGacha', { defaultValue: '3 Gacha/day' })}</span>
            <span className="text-amber-600 dark:text-amber-400">∞ {t('profile.premiumCompareUnlimited', { defaultValue: 'unlimited' })}</span>
          </div>
          <div className="flex items-center justify-between text-[10px] text-text-tertiary">
            <span>{t('profile.premiumCompareGuards', { defaultValue: '5 gate guards/day' })}</span>
            <span className="text-amber-600 dark:text-amber-400">∞ {t('profile.premiumCompareUnlimited', { defaultValue: 'unlimited' })}</span>
          </div>
          <div className="flex items-center justify-between text-[10px] text-text-tertiary">
            <span>{t('profile.premiumCompareBasicMap', { defaultValue: 'Basic blind-spot map' })}</span>
            <span className="text-amber-600 dark:text-amber-400">{t('profile.premiumCompareFullMap', { defaultValue: 'Full map' })}</span>
          </div>
          <div className="flex items-center justify-between text-[10px] text-text-tertiary">
            <span>{t('profile.premiumCompareHistory7', { defaultValue: '7-day history' })}</span>
            <span className="text-amber-600 dark:text-amber-400">∞ {t('profile.premiumCompareAllTime', { defaultValue: 'all-time' })}</span>
          </div>
          <div className="flex items-center justify-between text-[10px] text-text-tertiary">
            <span>{t('profile.premiumCompareProactive', { defaultValue: 'Proactive intercepts' })}</span>
            <span className="text-amber-600 dark:text-amber-400">✓</span>
          </div>
          <div className="flex items-center justify-between text-[10px] text-text-tertiary">
            <span>{t('profile.premiumCompareRefund', { defaultValue: 'Refund assist' })}</span>
            <span className="text-amber-600 dark:text-amber-400">✓</span>
          </div>
        </div>
        {/* CTA: 候补名单表单 (button 模式) */}
        <WaitlistForm mode="button" />
      </div>
    </div>
  );
}
