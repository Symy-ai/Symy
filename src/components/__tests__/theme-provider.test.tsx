// @vitest-environment happy-dom

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const providerCalls: Array<Record<string, unknown>> = [];
vi.mock('next-themes', () => ({
  ThemeProvider: vi.fn((props: { children?: unknown } & Record<string, unknown>) => {
    providerCalls.push(props);
    return <div data-testid="ntp">{props.children as never}</div>;
  }),
}));

import { ThemeProvider } from '../theme-provider';

/**
 * theme-provider.tsx (31行) — next-themes 封装。
 *
 * 锁定 (BUG-237 锚):
 * - attribute=class / defaultTheme=dark / enableSystem
 * - storageKey=symy-theme
 * - disableTransitionOnChange=true (FOUC 防御)
 * - children 透传
 */
describe('ThemeProvider next-themes 封装', () => {
  afterEach(() => {
    cleanup();
    providerCalls.length = 0;
  });

  it('五配置锚 (class/dark/system/symy-theme/禁 transition)', () => {
    render(
      <ThemeProvider>
        <p>内容</p>
      </ThemeProvider>,
    );
    const props = providerCalls[0];
    expect(props.attribute).toBe('class');
    expect(props.defaultTheme).toBe('dark');
    expect(props.enableSystem).toBe(true);
    expect(props.storageKey).toBe('symy-theme');
    expect(props.disableTransitionOnChange).toBe(true); // BUG-237 FOUC 防御
  });

  it('children 透传', () => {
    render(
      <ThemeProvider>
        <p>透传内容</p>
      </ThemeProvider>,
    );
    expect(screen.getByText('透传内容')).toBeTruthy();
  });
});
