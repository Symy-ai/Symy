'use client';

/**
 * Error Boundary — Next.js App Router
 *
 * 捕获页面级错误（非根 layout 错误），显示错误页 + 重试按钮 + 回首页链接。
 * 与 global-error.tsx 的区别: 这个保留 layout (header/footer), global-error 不保留。
 *
 * 🔧 ARCH fix (Round 12 REACT-14):
 *    旧代码硬编码英文 + 强制 dark (#0a0e1a) + 无 home 链接。
 *    根因修复: 用 cookie 推断 locale 显示中英文, color-scheme 适配 light/dark, 加 home 链接。
 *    (error.tsx 是 client component, 但不能依赖 I18nProvider — 它可能也挂了, 用 cookie 推断更安全)
 */

import { useEffect } from 'react';
import { logger } from '@/lib/logger';

// 从 localStorage + cookie 推断 locale
// 🔧 ARCH fix (Round 15 audit H1 — NEXT_LOCALE cookie 不存在, 所有英文用户看到中文错误页):
//    旧代码只读 NEXT_LOCALE cookie, 但 app 用 localStorage key 'symy-locale' 持久化 locale (i18n/config.ts)。
//    NEXT_LOCALE 从未被设置 → 默认 'zh' → 英文用户看到中文错误页。
//    根因修复: 优先读 localStorage 'symy-locale', fallback NEXT_LOCALE cookie (future-proof), fallback 'en' (DEFAULT_LOCALE)。
function getLocaleFromCookie(): 'zh' | 'en' {
  if (typeof document === 'undefined') return 'en'; // SSR default = en (与 i18n/config.ts DEFAULT_LOCALE 一致)
  // 1. localStorage 'symy-locale' (app 实际使用的存储)
  try {
    const stored = localStorage.getItem('symy-locale');
    if (stored === 'en' || stored === 'zh') return stored;
  } catch {
    // localStorage 不可用 (隐私模式), fall through
  }
  // 2. NEXT_LOCALE cookie (future-proof, 万一未来加 middleware)
  const match = document.cookie.match(/(?:^|;\s*)NEXT_LOCALE=([^;]+)/);
  const val = match?.[1];
  if (val === 'en' || val === 'zh') return val;
  // 3. 默认 en (与 i18n/config.ts DEFAULT_LOCALE 一致, 旧代码错误地默认 zh)
  return 'en';
}

const MESSAGES = {
  zh: {
    title: '页面出错了',
    message: '小象发现这页打不开了。深呼吸，我们一起刷新试试。',
    errorId: '错误 ID',
    retry: '重试',
    home: '返回首页',
  },
  en: {
    title: 'Page Error',
    message: 'Symy the elephant found this page in a tangle. Take a breath and try again.',
    errorId: 'Error ID',
    retry: 'Try Again',
    home: 'Back to Home',
  },
} as const;

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    logger.error('[ErrorBoundary]', error);
  }, [error]);

  const locale = getLocaleFromCookie();
  const t = MESSAGES[locale];

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        // 🔧 ARCH fix (Round 12 REACT-14): 用 color-scheme 适配 light/dark, 不强制 dark
        backgroundColor: 'light-dark(#f8fafc, #0a0e1a)',
        color: 'light-dark(#1e293b, #e2e8f0)',
        colorScheme: 'light dark',
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
        padding: '2rem',
      }}
    >
      <div style={{ textAlign: 'center', maxWidth: '400px' }}>
        <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>⚠️</div>
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
              background: 'linear-gradient(to right, #10b981, #16a34a)',
              color: 'white',
              fontWeight: 600,
              fontSize: '0.875rem',
              cursor: 'pointer',
            }}
          >
            {t.retry}
          </button>
          {/* 🔧 ARCH fix (Round 12 REACT-14): 加回首页链接 (用 <a> 不用 next/link, layout 可能也挂) */}
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
    </div>
  );
}
