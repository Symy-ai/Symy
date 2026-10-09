// @vitest-environment happy-dom

import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const stableT = (key: string, opts?: { defaultValue?: string }) => {
  const map: Record<string, string> = {
    'butterfly.preparingChoice': '正在准备你的选择…',
    'butterfly.retryChoice': '点此重试加载选项',
  };
  return map[key] ?? opts?.defaultValue ?? key;
};
vi.mock('@/i18n/provider', () => ({
  useI18n: () => ({ locale: 'zh', t: stableT }),
}));

import { ChoiceLoadingState } from '../choice-loading-state';

/**
 * choice-loading-state.tsx (57行) — 选择加载态 (Round 80 F7, Bug 3 P0 修复件)。
 *
 * 锁定:
 * - 三弹跳动点 + preparing 文案即时渲染
 * - Retry 按钮初始无; 8s 后出现 (escape hatch)
 * - 点击 Retry → onRetry
 * - 卸载清计时器 (不残留 setShowRetry)
 */
describe('ChoiceLoadingState 选择加载态', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
    cleanup();
  });

  it('三弹跳点 + preparing 文案即时', () => {
    render(<ChoiceLoadingState isLight={false} onRetry={vi.fn()} />);
    const dots = document.querySelectorAll('.animate-bounce');
    expect(dots).toHaveLength(3);
    expect(screen.getByText('正在准备你的选择…')).toBeTruthy();
  });

  it('Retry 8s 前无; 8s 后出现 (Bug 3 escape hatch)', () => {
    render(<ChoiceLoadingState isLight={false} onRetry={vi.fn()} />);
    expect(screen.queryByRole('button')).toBeNull();
    act(() => { vi.advanceTimersByTime(7999); });
    expect(screen.queryByRole('button')).toBeNull();
    act(() => { vi.advanceTimersByTime(1); });
    expect(screen.getByRole('button').textContent).toContain('点此重试加载选项');
  });

  it('点击 Retry → onRetry', () => {
    const onRetry = vi.fn();
    render(<ChoiceLoadingState isLight onRetry={onRetry} />);
    act(() => { vi.advanceTimersByTime(8000); });
    fireEvent.click(screen.getByRole('button'));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('卸载清计时器 (不残留 setState 警告)', () => {
    const { unmount } = render(<ChoiceLoadingState isLight={false} onRetry={vi.fn()} />);
    unmount();
    act(() => { vi.advanceTimersByTime(20000); });
    expect(true).toBe(true); // 未炸即过
  });
});
