'use client';

import { ThemeProvider as NextThemesProvider } from 'next-themes';
import type { ReactNode } from 'react';

/**
 * Symy Theme Provider
 *
 * 包装 next-themes 的 ThemeProvider，提供：
 * - 系统偏好检测
 * - localStorage 持久化（key: "symy-theme"）
 * - SSR 安全（suppressHydrationWarning）
 * - 无闪烁切换（class 策略）
 *
 * 默认主题: dark（夜间模式）
 * 可选主题: light / dark / system
 */
export function ThemeProvider({ children }: { children: ReactNode }) {
  return (
    <NextThemesProvider
      attribute="class"
      defaultTheme="dark"
      enableSystem={true}
      storageKey="symy-theme"
      // 🔧 BUG-237 fix: 禁用主题切换时的 CSS transition 动画，防止闪烁（FOUC）
      disableTransitionOnChange={true}
    >
      {children}
    </NextThemesProvider>
  );
}
