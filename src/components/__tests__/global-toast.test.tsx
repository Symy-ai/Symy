// @vitest-environment happy-dom

import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { showToast } from '@/lib/toast';
import { GlobalToast } from '../global-toast';

/**
 * global-toast.tsx (34行) — 全局 toast 渲染层 (Round 101 拆件)。
 *
 * 锁定:
 * - 无 toast → null
 * - 三态配色 (success 绿/error 红/info 灰)
 * - z-[500] (P1 修复锚: 盖过一切 modal/portal)
 * - showToast 触发渲染 (store 联动)
 */
describe('GlobalToast 全局提示', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
    cleanup();
  });

  it('无 toast → null; showToast → 渲染', () => {
    const { container } = render(<GlobalToast />);
    expect(container.innerHTML).toBe('');
    act(() => {
      showToast('已保存', 'success');
    });
    const el = screen.getByText('已保存');
    expect(el.getAttribute('data-symy-toast')).toBe('true');
  });

  it('三态配色 (每态独立挂载)', () => {
    render(<GlobalToast />);
    act(() => {
      showToast('成功', 'success');
    });
    expect(screen.getByText('成功').className).toContain('bg-green-500/90');
    cleanup(); // 段间隔离 + 计时器推进在 act 内
    act(() => {
      vi.advanceTimersByTime(5000);
    });
    act(() => {
      showToast('失败', 'error');
    });
    const r2 = render(<GlobalToast />);
    expect(r2.getByText('失败').className).toContain('bg-red-500/90');
    r2.unmount();
    act(() => {
      vi.advanceTimersByTime(5000);
    });
    act(() => {
      showToast('提示', 'info');
    });
    const r3 = render(<GlobalToast />);
    expect(r3.getByText('提示').className).toContain('bg-gray-800/90');
  });

  it('z-[500] 层级锚 (P1: 盖过 modal/portal)', () => {
    act(() => {
      showToast('顶层', 'info');
    });
    const r = render(<GlobalToast />); // showToast 在挂载前 — 新挂载读快照即渲染
    expect(r.getByText('顶层').className).toContain('z-[500]');
  });
});

