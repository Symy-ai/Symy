'use client';

import { useEffect, useState } from 'react';
import { useTheme } from 'next-themes';
import { Sun, Moon } from 'lucide-react';

/**
 * ThemeToggle — 右上角显眼的主题切换按钮
 *
 * - 深色模式显示 ☀️（点击切到浅色），浅色模式显示 🌙（点击切到深色）
 * - 绿色发光 (neon-glow-green) + 玻璃拟态，与绿色环保主题一致
 * - 用 mounted 门控避免 hydration mismatch：SSR 与首帧都按 dark 渲染
 */
export function ThemeToggle({ className = '' }: { className?: string }) {
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const isDark = mounted ? resolvedTheme !== 'light' : true;

  const toggle = () => setTheme(isDark ? 'light' : 'dark');

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={isDark ? 'Switch to light theme' : 'Switch to dark theme'}
      title={isDark ? 'Switch to light theme' : 'Switch to dark theme'}
      className={`w-11 h-11 rounded-full flex items-center justify-center backdrop-blur-xl border transition-all duration-200 cursor-pointer bg-glass-fill-strong border-glass-border text-text-primary shadow-lg hover:scale-110 active:scale-95 neon-glow-green ${className}`}
    >
      {isDark ? (
        <Sun className="w-5 h-5 text-amber-400" />
      ) : (
        <Moon className="w-5 h-5 text-emerald-500" />
      )}
    </button>
  );
}
