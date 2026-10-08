// @vitest-environment happy-dom

import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useButterflyLoadingStages } from '../use-butterfly-loading-stages';

describe('useButterflyLoadingStages', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00.000Z'));
  });

  afterEach(() => {
    act(() => vi.runOnlyPendingTimers());
    vi.useRealTimers();
  });

  it('加载中每 8 秒循环切换五个阶段', async () => {
    const { result } = renderHook(() => useButterflyLoadingStages(true));

    for (const expected of [1, 2, 3, 4, 0]) {
      await act(async () => {
        await vi.advanceTimersByTimeAsync(8_000);
      });
      expect(result.current.stageIndex).toBe(expected);
    }
  });

  it('加载中每秒计算真实流逝秒数', async () => {
    const { result } = renderHook(() => useButterflyLoadingStages(true));

    await act(async () => {
      await vi.advanceTimersByTimeAsync(2_500);
    });
    expect(result.current.elapsedSec).toBe(2);
  });

  it('开始加载时重置既有阶段和计时', async () => {
    const { result, rerender } = renderHook(({ isLoading }) => useButterflyLoadingStages(isLoading), {
      initialProps: { isLoading: false },
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10_000);
    });

    rerender({ isLoading: true });
    expect(result.current).toEqual({ stageIndex: 0, elapsedSec: 0 });
  });

  it('停止加载时立即重置并清理计时器', async () => {
    const { result, rerender } = renderHook(({ isLoading }) => useButterflyLoadingStages(isLoading), {
      initialProps: { isLoading: true },
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(9_000);
    });

    rerender({ isLoading: false });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10_000);
    });
    expect(result.current).toEqual({ stageIndex: 0, elapsedSec: 0 });
  });

  it('重新加载按新起点计时', async () => {
    const { result, rerender } = renderHook(({ isLoading }) => useButterflyLoadingStages(isLoading), {
      initialProps: { isLoading: true },
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(8_000);
    });
    rerender({ isLoading: false });
    rerender({ isLoading: true });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1_000);
    });

    expect(result.current).toEqual({ stageIndex: 0, elapsedSec: 1 });
  });
});
