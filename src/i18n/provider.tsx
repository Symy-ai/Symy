/**
 * I18n Provider — Wraps next-intl for Symy AI
 *
 * Features:
 * - Auto-detects browser language on first visit
 * - Persists language choice in localStorage
 * - Provides `useI18n` hook with t() function
 * - Updates <html lang=""> attribute
 */

'use client';

import React, { createContext, useContext, useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { IntlProvider, useTranslations, type AbstractIntlMessages } from 'next-intl';
import { Locale, DEFAULT_LOCALE, saveLocale } from './config';
import { logger } from '@/lib/logger';
import { apiFetchVoid } from '@/lib/api-client';

// Dynamic locale loading — only the active locale's messages are bundled per route.
// Each loader becomes its own chunk, so a user on /zh/ never downloads en.json (and vice versa).
const messagesLoaders: Record<Locale, () => Promise<{ default: AbstractIntlMessages }>> = {
  en: () => import('./messages/en.json') as unknown as Promise<{ default: AbstractIntlMessages }>,
  zh: () => import('./messages/zh.json') as unknown as Promise<{ default: AbstractIntlMessages }>,
};

// ====== Context for locale switching ======

interface I18nContextValue {
  locale: Locale;
  setLocale: (locale: Locale) => void;
}

const I18nContext = createContext<I18nContextValue>({
  locale: DEFAULT_LOCALE,
  setLocale: () => {},
});

export function useLocaleContext() {
  return useContext(I18nContext);
}

// ====== Enhanced hook: t() with interpolation ======

export function useI18n() {
  const translate = useTranslations();
  const { locale, setLocale } = useLocaleContext();

  const t = useCallback(
    (key: string, values?: Record<string, string | number> & { defaultValue?: string }) => {
      // 🔧 fix: 支持 defaultValue 参数, 缺失 key 时用 defaultValue 而非 raw key
      const { defaultValue, ...rest } = values || {};
      const hasInterpolation = Object.keys(rest).length > 0;
      try {
        const result = hasInterpolation ? translate(key, rest) : translate(key);
        // 🔧 BUG-6 fix (Round 38): translate() 在 key 缺失时返回 raw key 而非 throw,
        //   导致 defaultValue 永远不被使用, 用户看到 "buddy.dreamFundOrderHint" 等原始 key。
        //   根因修复: 检查返回值是否等于 key (说明翻译缺失), 若是则 fallback 到 defaultValue。
        // 🔧 Round 126 fix: 也检查空字符串 — 翻译值为 "" 时不显示空字符串, fallback 到 defaultValue
        if ((result === key || result === '') && defaultValue) {
          return defaultValue;
        }
        return result;
      } catch {
        // 🔧 架构改进: 开发环境打印 warning, 帮助发现缺失的 i18n key
        if (process.env.NODE_ENV === 'development') {
          logger.warn(`[i18n] Missing key: "${key}"`);
        }
        // Fallback: 优先用 defaultValue, 否则返回 key 本身
        return defaultValue || key;
      }
    },
    [translate]
  );

  return { t, locale, setLocale };
}

// ====== Provider Component ======

interface I18nProviderProps {
  children: React.ReactNode;
  /**
   * 🔧 第三阶段 §5.5: SSR-safe 初始 locale
   * 服务端从 Accept-Language header 推断, 传给 Provider 作为初始值
   * 客户端 mount 后用 localStorage 覆盖 (如果不同会 re-render, 可接受)
   * 不传则用 DEFAULT_LOCALE
   */
  initialLocale?: Locale;
  initialMessages?: AbstractIntlMessages;
}

export function I18nProviderWrapper({ children, initialLocale, initialMessages }: I18nProviderProps) {
  // 🔧 i18n fix: locale 始终从 URL 前缀获取（initialLocale prop 来自 layout.tsx 的 params.locale）
  // 不再读 localStorage/browser detection，确保 /en/ 显示英文、/zh/ 显示中文
  const [locale, setLocaleState] = useState<Locale>(initialLocale || DEFAULT_LOCALE);
  // Seed with server-provided messages so SSR + first client render have real
  // translations (no raw keys flashed). The dynamic loader below still runs on the
  // client to keep locale-switching chunked.
  const [messages, setMessages] = useState<AbstractIntlMessages>(initialMessages || {});

  useEffect(() => {
    let cancelled = false;
    messagesLoaders[locale]()
      .then((mod) => {
        if (!cancelled) setMessages(mod.default);
      })
      .catch((err) => {
        logger.warn('[i18n] Failed to load messages for locale:', locale, err instanceof Error ? err.message : String(err));
      });
    return () => {
      cancelled = true;
    };
  }, [locale]);

  // Update <html lang=""> when locale changes
  // 🔧 FIX-React19: 不再用 mounted gate — 直接在 effect 内 setAttribute (SSR 不执行 effect, 客户端 mount 后立即生效)
  // 🔧 BUG-6 fix (i18n): 同时更新 document.title 和 meta description, 让客户端 locale 切换即时反映
  useEffect(() => {
    document.documentElement.lang = locale;
    // Update document title + meta description based on locale
    if (locale === 'zh') {
      document.title = 'Symy — 少买，多活';
      const metaDesc = document.querySelector('meta[name="description"]');
      if (metaDesc) metaDesc.setAttribute('content', '你的 AI 伙伴，让你看清每一次购买的真实代价 —— 以你的生命小时计算。看见算法的操纵，找回你的消费自主权。');
    } else {
      document.title = 'Symy — Buy less, live more';
      const metaDesc = document.querySelector('meta[name="description"]');
      if (metaDesc) metaDesc.setAttribute('content', 'Your AI companion that shows you the real cost of every purchase — in hours of your life. See the manipulation, reclaim your spending agency.');
    }
  }, [locale]);

  // 🔧 ARCH fix (Round 26 R25-21 — 并发 locale 切换无 AbortController → out-of-order 响应):
  //    旧代码快速切换 locale (双击 toggle), 多个 fetch 并发, 后到的覆盖先到的 → server locale 与 client 不一致。
  //    根因修复: AbortController 取消前一个 fetch, 只保留最后一个。
  const localeFetchControllerRef = useRef<AbortController | null>(null);
  const setLocale = useCallback((newLocale: Locale) => {
    setLocaleState(newLocale);
    saveLocale(newLocale);
    document.documentElement.lang = newLocale;
      // owner 09-06 bugfix: locale lives in the URL — sync it on switch, else hard
      // refresh re-renders from the OLD url prefix (language 'resets' to browser lang).
      // replaceState keeps history clean; NEXT_LOCALE cookie covers root-path redirects.
      if (typeof window !== 'undefined') {
        const path = window.location.pathname;
        const newPath = path.replace(/^\/(en|zh)(?=\/|$)/, '/' + newLocale);
        if (newPath !== path) window.history.replaceState(null, '', newPath);
        document.cookie = 'NEXT_LOCALE=' + newLocale + ';path=/;max-age=31536000;SameSite=Lax';
      }
    // N73 fix: 异步写入 profiles.locale，让后端 MCP handler 能读用户语言
    // 🔧 Round 26 R25-21: 取消前一个 fetch, 只保留最后一个
    if (localeFetchControllerRef.current) {
      localeFetchControllerRef.current.abort();
    }
    const controller = new AbortController();
    localeFetchControllerRef.current = controller;
    // 🔧 ARCH fix (Round 5 AUDIT-1 M-4): 用 apiFetchVoid 替代裸 fetch — 获得 30s timeout + credentials + 统一错误处理
    apiFetchVoid('/api/user/locale', {
      method: 'POST',
      body: { locale: newLocale },
      signal: controller.signal,
    }).catch((err) => {
      // 🔧 ARCH fix (Round 40): Log locale sync failure (was completely silent)
      // AbortError is expected (rapid locale switching), other errors indicate server issues
      if (err instanceof Error && err.name === 'AbortError') return;
      logger.warn('[i18n] Failed to sync locale to server:', err instanceof Error ? err.message : String(err));
    });
  }, []);

  // 🔧 第三阶段 §5.5: 移除 `if (!mounted) return null`
  // SSR 现在用 initialLocale 渲染非空 HTML, 提升首次内容绘制 (FCP)
  // 客户端 hydration 时如果 locale 不同会 re-render (可接受的闪烁)

  // 🔧 ARCH fix (Round 4 React H-5): useMemo context value 防止每次 render 新建对象
  //    旧代码 value={{ locale, setLocale }} → 每次 render 新对象 → 所有 useLocaleContext() 消费者重渲染
  const contextValue = useMemo(() => ({ locale, setLocale }), [locale, setLocale]);

  return (
    <I18nContext.Provider value={contextValue}>
      <IntlProvider locale={locale} messages={messages} timeZone="UTC">
        {children}
      </IntlProvider>
    </I18nContext.Provider>
  );
}

