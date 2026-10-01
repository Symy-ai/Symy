// @vitest-environment happy-dom

/**
 * useAnimatedNumber hook 测试 — 动画进度、cleanup、ease-out 边界
 *
 * 断言对齐现状: requestAnimationFrame 驱动、Math.round 中间帧、
 * 结束帧强制精确 target；target 不变时不调度动画。
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useAnimatedNumber } from '../use-animated-number';

describe('useAnimatedNumber', () => {
  const rafCallbacks = new Map<number, FrameRequestCallback>();
  let rafId = 0;
  let cancelSpy: ReturnType<typeof vi.fn>;
  let now = 0;

  beforeEach(() => {
    now = 0;
    rafCallbacks.clear();
    rafId = 0;
    cancelSpy = vi.fn((id: number) => rafCallbacks.delete(id));
    const requestFrame = (callback: FrameRequestCallback) => {
      const id = ++rafId;
      rafCallbacks.set(id, callback);
      return id;
    };
    vi.stubGlobal('performance', { now: vi.fn(() => now) });
    vi.stubGlobal('requestAnimationFrame', requestFrame);
    vi.stubGlobal('cancelAnimationFrame', cancelSpy);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const flush = (frameTime: number) => {
    const callbacks = [...rafCallbacks.entries()];
    let lastId = 0;
    rafCallbacks.clear();
    for (const [id, callback] of callbacks) {
      lastId = id;
      callback(frameTime);
    }
    return lastId;
  };

  it('初始渲染直接返回 target', () => {
    const { result } = renderHook(() => useAnimatedNumber(42));
    expect(result.current).toBe(42);
  });

  it('target 不变时不调度动画', () => {
    const { rerender } = renderHook(({ value }) => useAnimatedNumber(value), {
      initialProps: { value: 10 },
    });
    rerender({ value: 10 });
    expect(rafCallbacks).toHaveLength(0);
  });

  it('中间帧按 ease-out 取整，终点帧精确落 target', () => {
    const { result, rerender } = renderHook(
      ({ value }) => useAnimatedNumber(value, 100),
      { initialProps: { value: 0 } },
    );
    rerender({ value: 100 });

    now = 50;
    act(() => flush(now));
    expect(result.current).toBe(88); // 1-(0.5)^3=.875

    now = 100;
    act(() => flush(now));
    expect(result.current).toBe(100);
  });

  it('duration 小于 elapsed 时立即收敛到终点', () => {
    const { result, rerender } = renderHook(
      ({ value }) => useAnimatedNumber(value, 100),
      { initialProps: { value: 10 } },
    );
    rerender({ value: 20 });
    now = 150;
    act(() => flush(now));
    expect(result.current).toBe(20);
    expect(rafCallbacks).toHaveLength(0);
  });

  it('target 回退时向负 diff 滚动', () => {
    const { result, rerender } = renderHook(
      ({ value }) => useAnimatedNumber(value, 100),
      { initialProps: { value: 100 } },
    );
    rerender({ value: 0 });
    now = 50;
    act(() => flush(now));
    expect(result.current).toBe(13); // 100 - round(100*.875)
  });

  it('动画完成后再次变化仍可继续动画', () => {
    const { result, rerender } = renderHook(
      ({ value }) => useAnimatedNumber(value, 100),
      { initialProps: { value: 0 } },
    );
    rerender({ value: 10 });
    now = 100;
    act(() => flush(now));
    expect(result.current).toBe(10);

    rerender({ value: 20 });
    now = 150; // 第二段动画跨过自身终点
    act(() => flush(now));
    expect(result.current).toBe(19); // 中间帧取整后仍在动画中
  });

  it('卸载时取消 pending frame，不再 setState', () => {
    const { rerender, unmount } = renderHook(
      ({ value }) => useAnimatedNumber(value, 100),
      { initialProps: { value: 0 } },
    );
    rerender({ value: 100 });
    now = 50;
    const pendingId = flush(now);
    unmount();
    expect(cancelSpy).toHaveBeenCalledWith(pendingId + 1);
  });

  it('duration 变化时按新时长计算', () => {
    const { result, rerender } = renderHook(
      ({ value, duration }) => useAnimatedNumber(value, duration),
      { initialProps: { value: 0, duration: 200 } },
    );
    rerender({ value: 100, duration: 50 });
    now = 50; // duration=50 的完整终点
    act(() => flush(now));
    expect(result.current).toBe(100);
  });
});
