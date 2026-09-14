/**
 * i18n Configuration — Symy AI
 *
 * Supports: en (English), zh (中文)
 * Default: detected from browser navigator.language, fallback to 'en'
 * Persisted: localStorage key 'symy-locale'
 */

export type Locale = 'en' | 'zh';

export const LOCALES: { code: Locale; label: string; nativeLabel: string }[] = [
  { code: 'en', label: 'English', nativeLabel: 'English' },
  { code: 'zh', label: 'Chinese', nativeLabel: '中文' },
];

export const DEFAULT_LOCALE: Locale = 'en';

export const LOCALE_STORAGE_KEY = 'symy-locale';

/**
 * Detect user's preferred locale from browser settings.
 * Falls back to DEFAULT_LOCALE if no match.
 */
export function detectBrowserLocale(): Locale {
  if (typeof window === 'undefined') return DEFAULT_LOCALE;

  const browserLangs = navigator.languages || [navigator.language];
  for (const lang of browserLangs) {
    const code = lang.toLowerCase().split('-')[0];
    if (code === 'zh') return 'zh';
    if (code === 'en') return 'en';
  }
  return DEFAULT_LOCALE;
}

/**
 * Get saved locale from localStorage, or detect from browser.
 */
export function getInitialLocale(): Locale {
  if (typeof window === 'undefined') return DEFAULT_LOCALE;

  try {
    const saved = localStorage.getItem(LOCALE_STORAGE_KEY);
    if (saved === 'zh' || saved === 'en') return saved;
  } catch { /* silent: non-critical operation */ }

  return detectBrowserLocale();
}

/**
 * Save locale preference to localStorage.
 */
export function saveLocale(locale: Locale): void {
  try {
    localStorage.setItem(LOCALE_STORAGE_KEY, locale);
  } catch { /* silent: non-critical operation */ }
}
