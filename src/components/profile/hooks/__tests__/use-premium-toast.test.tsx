// @vitest-environment happy-dom

import { act, cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { usePremiumToast } from '../use-premium-toast';

type Ret = ReturnType<typeof usePremiumToast>;
const box: { current: Ret | null } = { current: null };
function Probe() {
  box.current = usePremiumToast();
  return null;
}

/**
 * use-premium-toast.ts (31行) — Premium toast (N40+R44-A-2)。
 *
 * 锁定:
 * - 初始 null
 * - showPremiumToastMsg: 立即设置; 3s 自动清
 * - 连续调用: 旧计时器作废 (新消息完整显示 3s)
 * - 卸载清计时器
 */
describe('usePremiumToast', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    box.current = null;
  });
  afterEach(() => {
    vi.useRealTimers();
    cleanup();
  });

  it('初始 null; show 即设+3s 自动清', () => {
    render(<Probe />);
    const r = () => box.current as Ret;
    expect(r().premiumToast).toBeNull();
    act(() => r().showPremiumToastMsg('已升级'));
    expect(r().premiumToast).toBe('已升级');
    act(() => { vi.advanceTimersByTime(2999); });
    expect(r().premiumToast).toBe('已升级');
    act(() => { vi.advanceTimersByTime(1); });
    expect(r().premiumToast).toBeNull();
  });

  it('连续调用: 旧计时器作废', () => {
    render(<Probe />);
    const r = () => box.current as Ret;
    act(() => r().showPremiumToastMsg('第一条'));
    act(() => { vi.advanceTimersByTime(2000); });
    act(() => r().showPremiumToastMsg('第二条'));
    act(() => { vi.advanceTimersByTime(2000); }); // 第一条 3s 已过
    expect(r().premiumToast).toBe('第二条'); // 未被旧计时器清
    act(() => { vi.advanceTimersByTime(1000); });
    expect(r().premiumToast).toBeNull();
  });

  it('setPremiumToast 直设 (手动路径也可用)', () => {
    render(<Probe />);
    const r = () => box.current as Ret;
    act(() => r().setPremiumToast('手动'));
    expect(r().premiumToast).toBe('手动');
    act(() => r().setPremiumToast(null));
    expect(r().premiumToast).toBeNull();
  });
});

