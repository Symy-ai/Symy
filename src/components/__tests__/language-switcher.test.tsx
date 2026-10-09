// @vitest-environment happy-dom

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const state = { locale: 'zh', calls: [] as string[] };
vi.mock('@/i18n/provider', () => ({
  useI18n: () => ({
    locale: state.locale,
    setLocale: (l: string) => state.calls.push(l),
  }),
}));
vi.mock('@/i18n/config', () => ({
  LOCALES: [
    { code: 'zh', nativeLabel: '中文' },
    { code: 'en', nativeLabel: 'English' },
  ],
}));

import { LanguageSwitcher } from '../language-switcher';

/**
 * language-switcher.tsx (35行) — 语言循环切换。
 *
 * 锁定:
 * - Globe 图标 + 当前语言 nativeLabel
 * - 点击循环 (zh→en→zh)
 * - 未知 locale → 兜底显示第一档
 */
describe('LanguageSwitcher 循环切换', () => {
  beforeEach(() => {
    state.locale = 'zh';
    state.calls = [];
    vi.clearAllMocks();
  });
  afterEach(() => cleanup());

  it('Globe+当前 nativeLabel; title 提示', () => {
    render(<LanguageSwitcher />);
    expect(screen.getByText('中文')).toBeTruthy();
    expect(screen.getByRole('button').getAttribute('title')).toBe('中文');
    expect(document.querySelector('svg')).toBeTruthy();
  });

  it('点击循环 zh→en→zh (rerender 承接新 locale)', () => {
    const { rerender } = render(<LanguageSwitcher />);
    fireEvent.click(screen.getByRole('button'));
    expect(state.calls).toEqual(['en']);
    state.locale = 'en';
    rerender(<LanguageSwitcher />); // 组件重读 mock state
    fireEvent.click(screen.getByRole('button'));
    expect(state.calls).toEqual(['en', 'zh']); // 回绕
  });

  it('未知 locale → 兜底第一档显示+点击仍循环', () => {
    state.locale = 'fr';
    const { rerender } = render(<LanguageSwitcher />);
    expect(screen.getByText('中文')).toBeTruthy(); // LOCALES[0] 兜底
    fireEvent.click(screen.getByRole('button'));
    expect(state.calls).toEqual(['zh']); // findIndex=-1 → (-1+1)%2=0 → 第一档 (行为定案)
    state.locale = 'en';
    rerender(<LanguageSwitcher />);
  });
});
