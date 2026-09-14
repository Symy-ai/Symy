/**
 * not-found — 自定义 404 页面
 *
 * 🔧 P2-8 fix (2026-07-11): 旧代码用 Next.js 默认 404 页面, 只显示 "404 - This page could not be found."
 *   无返回首页按钮, 用户只能手动改 URL。
 *   根因修复: 自定义 404 页面, 显示 Symy logo + 友好错误信息 + 返回首页按钮。
 *
 * 注意: not-found.tsx 是 Server Component (不能用 hooks/useI18n), 保持英文 + 简单 HTML。
 * (ErrorBoundary 是 Class 组件也不用 hooks, 一致风格)
 */

import Link from 'next/link';
import Image from 'next/image';
import { getTranslations } from 'next-intl/server';

export default async function NotFound() {
  const t = await getTranslations();
  return (
    <div className="auth-bg min-h-screen flex items-center justify-center p-4">
      <div className="w-full max-w-sm relative z-10 text-center">
        {/* Logo */}
        <div className="w-24 h-auto mx-auto mb-6 flex items-center justify-center">
          <Image
            src="/symy-elephant-dark.png"
            alt="Symy — Buy less. Live more."
            width={280}
            height={186}
            priority
            className="w-full h-auto [filter:drop-shadow(0_0_4px_rgba(255,255,255,0.9))_drop-shadow(0_0_8px_rgba(255,255,255,0.6))_drop-shadow(0_0_16px_rgba(255,255,255,0.3))]"
          />
        </div>

        {/* 404 */}
        <h1 className="font-mono font-bold text-6xl gradient-text mb-4">404</h1>

        {/* Friendly message */}
        <h2 className="text-lg font-bold text-text-primary mb-2">
          {t('notFound.title')}
        </h2>
        <p className="text-sm text-text-secondary mb-8 leading-relaxed">
          {t('notFound.message')}
        </p>

        {/* Back to home button */}
        <Link
          href="/"
          className="inline-flex items-center justify-center gap-2 w-full py-3.5 px-6 bg-gradient-to-r from-emerald-500 to-green-600 text-white font-semibold rounded-xl hover:from-emerald-400 hover:to-green-500 transition-all active:scale-[0.98] btn-shimmer"
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
          </svg>
          {t('notFound.backHome')}
        </Link>

        {/* Secondary link */}
        <p className="text-xs text-text-tertiary mt-6">
          <Link href="/" className="text-emerald-400 hover:text-emerald-300 transition-colors">
            symy.ai
          </Link>
          {' · '}
          You already know.
        </p>
      </div>
    </div>
  );
}
