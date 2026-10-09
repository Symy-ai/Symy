// @vitest-environment happy-dom

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const themeState = { resolved: 'dark', setCalls: [] as string[] };
vi.mock('next-themes', () => ({
  useTheme: () => ({
    resolvedTheme: themeState.resolved,
    setTheme: (t: string) => themeState.setCalls.push(t),
  }),
}));

import { ThemeToggle } from '../theme-toggle';

/**
 * theme-toggle.tsx (41行) — 主题切换按钮。
 *
 * 锁定:
 * - mounted 门控: SSR/首帧一律按 dark 渲染 (hydration mismatch 防御锚)
 * - dark → Sun+切浅 label; light → Moon+切深 label
 * - 点击 → setTheme 反向
 */
describe('ThemeToggle 主题切换', () => {
  beforeEach(() => {
    themeState.resolved = 'dark';
    themeState.setCalls = [];
    vi.clearAllMocks();
  });
  afterEach(() => cleanup());

  it('dark 态: aria-label 切浅 + Sun 图标', () => {
    render(<ThemeToggle />);
    const btn = screen.getByRole('button');
    expect(btn.getAttribute('aria-label')).toBe('Switch to light theme');
    expect(btn.querySelector('svg')).toBeTruthy(); // Sun 渲染
  });

  it('light 态: Moon + 切深 label', () => {
    themeState.resolved = 'light';
    render(<ThemeToggle />);
    expect(screen.getByRole('button').getAttribute('aria-label')).toBe('Switch to dark theme');
  });

  it('system/undefined → 按 dark (兜底)', () => {
    themeState.resolved = 'system';
    render(<ThemeToggle />);
    expect(screen.getByRole('button').getAttribute('aria-label')).toBe('Switch to light theme');
  });

  it('点击 → setTheme 反向', () => {
    render(<ThemeToggle />);
    fireEvent.click(screen.getByRole('button'));
    expect(themeState.setCalls).toEqual(['light']);
    themeState.resolved = 'light';
    cleanup();
    render(<ThemeToggle />);
    fireEvent.click(screen.getByRole('button'));
    expect(themeState.setCalls).toEqual(['light', 'dark']);
  });
});
