'use client';

/**
 * Global Error Boundary — Next.js App Router
 *
 * 捕获根 layout 级别的未处理错误，显示友好的错误页而非白屏。
 * 用户可以点击"重试"重新加载页面, 或"返回首页"回到 / 路径。
 *
 * 🔧 ARCH fix (Round 12 REACT-14):
 *    旧代码硬编码英文 + 强制 dark (#0a0e1a) + 无 home 链接 + <html lang="en"> 硬编码。
 *    根因修复: 用 cookie 推断 locale + color-scheme 适配 + 加 home 链接 + lang 跟随 locale。
 *    (global-error.tsx 不继承 layout 的 provider, 需自包含 — 用 cookie 推断最安全)
 */

import { useEffect } from 'react';
import { logger } from '@/lib/logger';

// 从 localStorage + cookie 推断 locale
// 🔧 ARCH fix (Round 15 audit H1 — 同 error.tsx, NEXT_LOCALE cookie 不存在)
function getLocaleFromCookie(): 'zh' | 'en' {
  if (typeof document === 'undefined') return 'en'; // SSR default = en
  try {
    const stored = localStorage.getItem('symy-locale');
    if (stored === 'en' || stored === 'zh') return stored;
  } catch {
    // localStorage 不可用, fall through
  }
  const match = document.cookie.match(/(?:^|;\s*)NEXT_LOCALE=([^;]+)/);
  const val = match?.[1];
  if (val === 'en' || val === 'zh') return val;
  return 'en';
}

const MESSAGES = {
  zh: {
    title: '出错了',
    message: '发生意外错误, 请重试。',
    errorId: '错误 ID',
    retry: '重试',
    home: '返回首页',
  },
  en: {
    title: 'Something went wrong',
    message: 'An unexpected error occurred. Please try again.',
    errorId: 'Error ID',
    retry: 'Try Again',
    home: 'Back to Home',
  },
} as const;

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // 记录到错误监控 (生产环境可接 Sentry)
    logger.error('[GlobalError]', error);
  }, [error]);

  const locale = getLocaleFromCookie();
  const t = MESSAGES[locale];

  return (
    <html lang={locale}>
      <body
        style={{
          margin: 0,
          padding: 0,
          fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
          // 🔧 ARCH fix (Round 12 REACT-14): 用 color-scheme 适配 light/dark, 不强制 dark
          backgroundColor: 'light-dark(#f8fafc, #0a0e1a)',
          color: 'light-dark(#1e293b, #e2e8f0)',
          colorScheme: 'light dark',
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <div style={{ textAlign: 'center', maxWidth: '400px', padding: '2rem' }}>
          <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>😵</div>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 700, marginBottom: '0.5rem' }}>
            {t.title}
          </h1>
          <p style={{ fontSize: '0.875rem', opacity: 0.7, marginBottom: '1.5rem' }}>
            {t.message}
          </p>
          {error.digest && (
            <p style={{ fontSize: '0.75rem', opacity: 0.5, marginBottom: '1.5rem' }}>
              {t.errorId}: {error.digest}
            </p>
          )}
          <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'center' }}>
            <button
              onClick={() => reset()}
              style={{
                padding: '0.75rem 2rem',
                borderRadius: '0.75rem',
                border: 'none',
                background: 'linear-gradient(to right, #06b6d4, #8b5cf6)',
                color: 'white',
                fontWeight: 600,
                fontSize: '0.875rem',
                cursor: 'pointer',
                transition: 'opacity 0.2s',
              }}
            >
              {t.retry}
            </button>
            {/* 🔧 ARCH fix (Round 12 REACT-14): 加回首页链接 */}
            <a
              href="/"
              style={{
                padding: '0.75rem 2rem',
                borderRadius: '0.75rem',
                border: '1px solid currentColor',
                background: 'transparent',
                color: 'inherit',
                fontWeight: 600,
                fontSize: '0.875rem',
                textDecoration: 'none',
                display: 'inline-flex',
                alignItems: 'center',
              }}
            >
              {t.home}
            </a>
          </div>
        </div>
      </body>
    </html>
  );
}
