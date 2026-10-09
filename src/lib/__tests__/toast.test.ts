// @vitest-environment happy-dom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { getToast, showToast, subscribeToast } from '../toast';

/**
 * toast.ts (27行) — useSyncExternalStore toast store。
 *
 * 锁定:
 * - showToast: 立即生效+通知订阅者; 4s 默认后自动清+再通知
 * - 新 toast 覆盖旧 (清旧计时器 — 只在最后一条到点时清)
 * - subscribe 返回退订; getToast 快照
 */
describe('toast store', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('showToast 立即生效+通知; 默认 4s 自动清+再通知', () => {
    const l = vi.fn();
    const unsub = subscribeToast(l);
    expect(getToast()).toBeNull();
    showToast('已保存', 'success');
    expect(getToast()).toEqual({ message: '已保存', type: 'success' });
    expect(l).toHaveBeenCalledTimes(1); // 立即通知
    vi.advanceTimersByTime(3999);
    expect(getToast()).not.toBeNull();
    vi.advanceTimersByTime(1);
    expect(getToast()).toBeNull();
    expect(l).toHaveBeenCalledTimes(2); // 清除再通知
    unsub();
  });

  it('新 toast 覆盖旧 (旧计时器作废)', () => {
    showToast('第一条', 'info');
    vi.advanceTimersByTime(2000);
    showToast('第二条', 'error'); // 覆盖
    vi.advanceTimersByTime(2000); // 第一条的 4s 已过
    expect(getToast()).toEqual({ message: '第二条', type: 'error' }); // 未被旧计时器清掉
    vi.advanceTimersByTime(2000);
    expect(getToast()).toBeNull();
  });

  it('自定义时长 + 退订后不通知', () => {
    const l = vi.fn();
    const unsub = subscribeToast(l);
    showToast('短', 'info', 1000);
    unsub();
    vi.advanceTimersByTime(1000);
    expect(l).toHaveBeenCalledTimes(1); // 仅立即通知那次, 清除不通知
    expect(getToast()).toBeNull(); // 但 store 本身仍正常清
  });
});
