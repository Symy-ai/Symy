/**
 * LandingPage — 营销落地页
 *
 * 🔧 2026-07-22 (A1): 新用户首次访问时展示价值主张
 *   - Hero Section: 核心价值主张 + CTA
 *   - Social Proof: 用户数据
 *   - How It Works: 3 步图解
 *   - Feature Highlights: 核心功能
 *   - Final CTA
 *
 * 🔧 BUG-2 fix (i18n): 全面接入 i18n, 所有文案通过 t() 翻译
 * 🔧 BUG-1 fix (i18n): 加入 LanguageSwitcher, 访客可切换语言
 *
 * 已登录用户自动跳转到主应用
 */

'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import Link from 'next/link';
import { useAuth } from '@/components/auth/auth-provider';
import { useI18n } from '@/i18n/provider';
import { LanguageSwitcher } from '@/components/language-switcher';
import { LandingHeroImage } from '@/components/landing-hero-image';
import { LandingRefHero } from '@/components/landing-ref-hero';

interface Testimonial {
  name: string;
  emoji: string;
  text: string;
  stat: string;
}

export function LandingPage({ forceShow = false }: { forceShow?: boolean }) {
  const locale = useLocale();
  const { user, loading } = useAuth();
  const router = useRouter();
  const { t } = useI18n();
  const tr = useTranslations();
  const testimonials = (tr.raw('landing.testimonials') as Testimonial[] | undefined) ?? [];
  const [dismissed, setDismissed] = useState(false);

  // 已登录用户跳转到主应用
  useEffect(() => {
    if (user && !loading) {
      router.replace('/');
    }
  }, [user, loading, router]);

  // 检查是否应该跳过 LandingPage:
  //   1. symy-landing-seen: 用户在 LandingPage 上点过关闭按钮 (永久 dismiss)
  //   2. ?guest=true URL 参数: 用户从 login/signup 的"以访客身份浏览"进来 (仅本次跳过)
  useEffect(() => {
    try {
      const seen = localStorage.getItem('symy-landing-seen');
      if (seen === 'true') {
        setDismissed(true);
        return;
      }
    } catch {
      // localStorage 不可用（隐私模式），继续检查 guest 参数
    }
    // 访客路由跳过: 从 login/signup 点"以访客身份浏览" → URL 带 ?guest=true
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      if (params.get('guest') === 'true') {
        setDismissed(true);
      }
    }
  }, []);

  const handleSignUp = () => {
    router.push('/auth/signup');
  };

  const handleExploreDemo = () => {
    // 🔧 BUG-A fix: 与 login/signup 的"以访客身份浏览"一致，用 /?guest=true 临时跳过 LandingPage。
    //   旧代码: localStorage.setItem('symy-landing-seen','true') → 永久关闭 → 再也回不到营销页
    //   新代码: router.push(`/${locale}?guest=true`) → 仅本次跳过，刷新/重新进入仍可看到 LandingPage。
    //   带上 locale 前缀，避免 middleware 307 重定向到默认 locale（/zh 用户被甩到 /en）
    router.push(`/${locale}?guest=true`);
  };

  // 加载中或已登录或已关闭（且非 forceShow）→ 不显示
  if (loading || user || (dismissed && !forceShow)) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-[500] bg-surface-1 overflow-y-auto">
      {/* 🔧 BUG-1: Language switcher + theme toggle — top-right corner */}
      <div className="absolute top-4 right-4 z-10 flex items-center gap-2">
        <LanguageSwitcher className="bg-glass-fill/60 border border-glass-border" />
      </div>

      <div className="min-h-full flex flex-col items-center justify-center px-6 py-12 max-w-md mx-auto">
        <LandingRefHero isAuthenticated={!!user} />
        {/* Hero Section */}
        <div className="text-center mb-12">
          {/* Logo */}
          <div className="w-24 h-24 mx-auto mb-6 relative flex items-center justify-center">
            <LandingHeroImage />
          </div>

          <h1 className="text-3xl font-bold gradient-text mb-3">
            {t('landing.heroTitle')}
          </h1>
          <p className="text-base text-text-secondary leading-relaxed mb-6">
            {tr.rich('landing.heroSubtitle', {
              highlight: (chunks) => (
                <span className="text-emerald-600 dark:text-emerald-400 font-semibold">{chunks}</span>
              ),
            })}
          </p>

          {/* CTA Buttons */}
          <div className="space-y-3">
            <button
              onClick={handleSignUp}
              className="w-full py-3.5 px-6 bg-gradient-to-r from-emerald-500 to-green-600 text-white font-semibold rounded-xl hover:from-emerald-400 hover:to-green-500 transition-all active:scale-[0.98] btn-shimmer"
            >
              {t('landing.ctaStartFree')}
            </button>
            <button
              onClick={handleExploreDemo}
              className="w-full py-3 px-6 text-text-secondary text-sm font-medium hover:text-text-primary transition-colors"
            >
              {t('landing.ctaExplore')}
            </button>
          </div>
        </div>

        {/* Social Proof */}
        <div className="w-full mb-12">
          <h2 className="text-lg font-bold text-text-primary mb-6 text-center">{t('landing.socialProofTitle')}</h2>
          <div className="grid grid-cols-3 gap-3">
            <div className="rounded-xl p-4 text-center bg-glass-fill/50 border border-glass-border">
              <div className="text-2xl font-bold gradient-text mb-1">{t('landing.socialProofStat1')}</div>
              <div className="text-xs leading-tight text-text-secondary">{t('landing.socialProofStat1Label')}</div>
              <div className="text-[9px] leading-tight text-text-tertiary mt-1">{t('landing.socialProofStat1Source')}</div>
            </div>
            <div className="rounded-xl p-4 text-center bg-glass-fill/50 border border-glass-border">
              <div className="text-2xl font-bold gradient-text mb-1">{t('landing.socialProofStat2')}</div>
              <div className="text-xs leading-tight text-text-secondary">{t('landing.socialProofStat2Label')}</div>
              <div className="text-[9px] leading-tight text-text-tertiary mt-1">{t('landing.socialProofStat2Source')}</div>
            </div>
            <div className="rounded-xl p-4 text-center bg-glass-fill/50 border border-glass-border">
              <div className="text-2xl font-bold gradient-text mb-1">{t('landing.socialProofStat3')}</div>
              <div className="text-xs leading-tight text-text-secondary">{t('landing.socialProofStat3Label')}</div>
              <div className="text-[9px] leading-tight text-text-tertiary mt-1">{t('landing.socialProofStat3Source')}</div>
            </div>
          </div>
        </div>

        {/* How It Works */}
        <div className="w-full mb-12">
          <h2 className="text-lg font-bold text-text-primary mb-6 text-center">{t('landing.howItWorks')}</h2>
          <div className="space-y-6">
            {/* Step 1 — 绿色优先 */}
            <div className="flex items-start gap-4">
              <div className="flex-shrink-0 w-12 h-12 rounded-xl bg-emerald-500/20 flex items-center justify-center text-2xl">
                🌿
              </div>
              <div className="flex-1">
                <h3 className="text-sm font-bold text-text-primary mb-1">{t('landing.step1Title')}</h3>
                <p className="text-xs text-text-secondary leading-relaxed">
                  {t('landing.step1Desc')}
                </p>
              </div>
            </div>
            {/* Step 2 — 非绿替代 */}
            <div className="flex items-start gap-4">
              <div className="flex-shrink-0 w-12 h-12 rounded-xl bg-teal-500/20 flex items-center justify-center text-2xl">
                ♻️
              </div>
              <div className="flex-1">
                <h3 className="text-sm font-bold text-text-primary mb-1">{t('landing.step2Title')}</h3>
                <p className="text-xs text-text-secondary leading-relaxed">
                  {t('landing.step2Desc')}
                </p>
              </div>
            </div>
            {/* Step 3 — 复用优先 */}
            <div className="flex items-start gap-4">
              <div className="flex-shrink-0 w-12 h-12 rounded-xl bg-green-500/20 flex items-center justify-center text-2xl">
                🔄
              </div>
              <div className="flex-1">
                <h3 className="text-sm font-bold text-text-primary mb-1">{t('landing.step3Title')}</h3>
                <p className="text-xs text-text-secondary leading-relaxed">
                  {t('landing.step3Desc')}
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Testimonials */}
        <div className="w-full mb-12">
          <h2 className="text-lg font-bold text-text-primary mb-6 text-center">
            {t('landing.testimonialsTitle')}
          </h2>
          <div className="space-y-3">
            {testimonials.map((item: Testimonial) => (
              <div
                key={`${item.name}-${item.emoji}`}
                className="p-3 rounded-xl bg-glass-fill/50 border border-glass-border"
              >
                <div className="flex items-start gap-3">
                  <span className="text-2xl leading-none">{item.emoji}</span>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-semibold text-text-primary mb-1">
                      {item.name}
                    </div>
                    <p className="text-xs text-text-secondary leading-relaxed">
                      {item.text}
                    </p>
                    {item.stat ? (
                      <div className="text-[11px] text-emerald-400 font-medium mt-1.5">
                        {item.stat}
                      </div>
                    ) : null}
                  </div>
                </div>
              </div>
            ))}
          </div>
          <p className="text-xs text-text-tertiary text-center mt-3">
            {t('landing.testimonialsDisclaimer')}
          </p>
        </div>

        {/* Feature Highlights */}
        <div className="w-full mb-12">
          <h2 className="text-lg font-bold text-text-primary mb-4 text-center">{t('landing.whySymy')}</h2>
          <div className="space-y-3">
            <div className="flex items-center gap-3 p-3 rounded-xl bg-glass-fill/50">
              <span className="text-xl">🌿</span>
              <p className="text-xs text-text-secondary flex-1">
                <span className="font-semibold text-text-primary">{t('landing.feature1Label')}</span> — {t('landing.feature1Desc')}
              </p>
            </div>
            <div className="flex items-center gap-3 p-3 rounded-xl bg-glass-fill/50">
              <span className="text-xl">🏅</span>
              <p className="text-xs text-text-secondary flex-1">
                <span className="font-semibold text-text-primary">{t('landing.feature2Label')}</span> — {t('landing.feature2Desc')}
              </p>
            </div>
            <div className="flex items-center gap-3 p-3 rounded-xl bg-glass-fill/50">
              <span className="text-xl">🐘</span>
              <p className="text-xs text-text-secondary flex-1">
                <span className="font-semibold text-text-primary">{t('landing.feature3Label')}</span> — {t('landing.feature3Desc')}
              </p>
            </div>
            <div className="flex items-center gap-3 p-3 rounded-xl bg-glass-fill/50">
              <span className="text-xl">🔥</span>
              <p className="text-xs text-text-secondary flex-1">
                <span className="font-semibold text-text-primary">{t('landing.feature4Label')}</span> — {t('landing.feature4Desc')}
              </p>
            </div>
          </div>
        </div>

        {/* 🔧 P0P1-B fix (B3): 移除 Waitlist Capture 区域 (产品已可注册, waitlist 造成混乱)。
            WaitlistCapture 组件定义保留 (其他地方可能引用), 仅从此处移除调用。 */}

        {/* 🔧 P0P1-B fix (B3): 移除底部 "Start defending yourself — free" Final CTA 按钮
            (与 Hero 主 CTA "Start Free →" 重复竞争)。
            保留 finalNote 文字 (无 CTA 竞争)。 */}
        <div className="w-full text-center">
          <p className="text-[10px] text-text-tertiary">
            {t('landing.finalNote')}
          </p>
        </div>

        {/* Footer */}
        <div className="mt-12 text-center space-y-3">
          <div className="flex items-center justify-center gap-4">
            <Link
              href={`/${locale}/blog`}
              className="inline-flex items-center justify-center text-xs font-medium text-text-tertiary transition-colors hover:text-text-primary"
            >
              Blog — Algorithm Decode
            </Link>
            <Link
              href={`/${locale}/trust`}
              className="inline-flex items-center justify-center text-xs font-medium text-text-tertiary transition-colors hover:text-text-primary"
            >
              {t('landing.footerTrust')}
            </Link>
            <Link
              href={`/${locale}/legal/privacy`}
              className="inline-flex items-center justify-center text-xs font-medium text-text-tertiary transition-colors hover:text-text-primary"
            >
              Privacy
            </Link>
            <Link
              href={`/${locale}/legal/terms`}
              className="inline-flex items-center justify-center text-xs font-medium text-text-tertiary transition-colors hover:text-text-primary"
            >
              Terms
            </Link>
          </div>
          <p className="text-[10px] text-text-tertiary">
            {t('landing.footer')}
          </p>
        </div>

        {/* 🔧 P0-3: SEO footer moved from global layout to landing-only view.
            Original SEO content is now served by page/layout metadata/jsonLd. */}
        {/* 🔧 P0 pre-existing cleanup: removed duplicate client-side sr-only SEO
            block to prevent source-level keyword leakage into demo/landing view. */}
      </div>
    </div>
  );
}
