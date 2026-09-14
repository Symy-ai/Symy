'use client';

import { useI18n } from '@/i18n/provider';
import { LOCALES } from '@/i18n/config';
import { Globe } from 'lucide-react';

/**
 * LanguageSwitcher — Compact language toggle button
 *
 * Shows a globe icon + current language code.
 * Clicking cycles through available locales.
 */
export function LanguageSwitcher({ className = '' }: { className?: string }) {
  const { locale, setLocale } = useI18n();

  const handleToggle = () => {
    const currentIndex = LOCALES.findIndex((l) => l.code === locale);
    const nextIndex = (currentIndex + 1) % LOCALES.length;
    setLocale(LOCALES[nextIndex].code);
  };

  const currentLocale = LOCALES.find((l) => l.code === locale) || LOCALES[0];

  return (
    <button
      onClick={handleToggle}
      className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg hover:bg-glass-hover transition-colors text-text-secondary hover:text-text-primary cursor-pointer select-none active:scale-95 ${className}`}
      title={currentLocale.nativeLabel}
    >
      <Globe className="w-3.5 h-3.5" />
      <span className="text-[10px] font-medium">{currentLocale.nativeLabel}</span>
    </button>
  );
}

