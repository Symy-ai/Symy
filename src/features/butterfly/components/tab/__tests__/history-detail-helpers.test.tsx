// @vitest-environment happy-dom

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const stableT = (key: string, opts?: { defaultValue?: string }) => (key === 'common.back' ? '返回' : (opts?.defaultValue ?? key));
vi.mock('@/i18n/provider', () => ({
  useI18n: () => ({ locale: 'zh', t: stableT }),
}));

import { DetailHeader, StatBox } from '../history-detail-helpers';

/**
 * history-detail-helpers.tsx (57行) — Round 103 拆分件 (StatBox+DetailHeader)。
 *
 * 锁定:
 * - StatBox: icon+label+value 三件; isLight 双主题 class
 * - DetailHeader: 返回按钮 aria-label=i18n + onBack; title 渲染
 */
describe('StatBox 统计格', () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(() => cleanup());

  it('icon+label+value 渲染', () => {
    render(<StatBox icon="⏱️" label="用时" value="12:34" isLight={false} />);
    expect(screen.getByText('⏱️')).toBeTruthy();
    expect(screen.getByText('用时')).toBeTruthy();
    expect(screen.getByText('12:34')).toBeTruthy();
  });

  it('isLight 双主题 class 切换', () => {
    const { unmount } = render(<StatBox icon="I" label="L" value="V" isLight />);
    expect(document.querySelector('.bg-gray-50')).toBeTruthy();
    unmount();
    render(<StatBox icon="I" label="L" value="V" isLight={false} />);
    expect(document.querySelector('.bg-glass-fill-strong')).toBeTruthy();
  });
});

describe('DetailHeader 详情头', () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(() => cleanup());

  it('返回按钮: aria-label=i18n + onBack; title 渲染', () => {
    const onBack = vi.fn();
    render(<DetailHeader isLight={false} onBack={onBack} title="第 3 章详情" />);
    const btn = screen.getByRole('button', { name: '返回' });
    expect(btn.textContent).toContain('第 3 章详情');
    fireEvent.click(btn);
    expect(onBack).toHaveBeenCalledTimes(1);
  });
});
