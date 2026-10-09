// @vitest-environment happy-dom

import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ToastNotification } from '../toast-notification';

/**
 * toast-notification.tsx (38行) — monitor 顶部 toast (Round 13 BUG-2 修复件)。
 *
 * 锁定:
 * - success 绿+CheckCircle; info 玻璃+AlertTriangle
 * - 4s 自动 onDismiss
 * - onDismiss 稳定引用 → effect 不重跑 (BUG-2 修复锚)
 */
describe('ToastNotification monitor toast', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
    cleanup();
  });

  it('success: 绿底+CheckCircle+消息', () => {
    render(<ToastNotification toast={{ message: '已连接邮箱', type: 'success' }} onDismiss={vi.fn()} />);
    const el = screen.getByText('已连接邮箱');
    expect(el.className).toContain('bg-green-500/90');
    expect(el.querySelectorAll('svg')).toHaveLength(1); // CheckCircle
  });

  it('info: 玻璃底+AlertTriangle', () => {
    render(<ToastNotification toast={{ message: '扫描中', type: 'info' }} onDismiss={vi.fn()} />);
    const el = screen.getByText('扫描中');
    expect(el.className).toContain('bg-glass-fill-strong');
    expect(el.querySelectorAll('svg')).toHaveLength(1);
  });

  it('4s 自动 onDismiss; 卸载清计时器', () => {
    const onDismiss = vi.fn();
    const { unmount } = render(<ToastNotification toast={{ message: 'X', type: 'success' }} onDismiss={onDismiss} />);
    act(() => { vi.advanceTimersByTime(3999); });
    expect(onDismiss).not.toHaveBeenCalled();
    act(() => { vi.advanceTimersByTime(1); });
    expect(onDismiss).toHaveBeenCalledTimes(1);
    // 二次挂载后立即卸载 → 无泄漏
    const { unmount: u2 } = render(<ToastNotification toast={{ message: 'Y', type: 'success' }} onDismiss={onDismiss} />);
    u2();
    act(() => { vi.advanceTimersByTime(10000); });
    expect(onDismiss).toHaveBeenCalledTimes(1); // 未增
    unmount();
  });
});
