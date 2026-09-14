/**
 * Tests for use-timeout.ts — useTimeout hook (set, clear, isPending, cleanup)
 *
 * 🔧 ARCH fix (Round 68 ARCH-DEEP-68): 测试覆盖率 — useTimeout 0 tests → 6 tests
 *
 * Uses @testing-library/react renderHook + happy-dom environment + fake timers
 * to deterministically test setTimeout behavior.
 *
 * Scenarios:
 * - set() schedules a callback that fires after delay
 * - clear() cancels the pending timeout
 * - isPending() reflects the current state
 * - set() replaces the previous timeout (only one active at a time)
 * - invalid delayMs falls back to 0 (immediate) + warns
 * - cleanup on unmount clears the pending timeout (no setState after unmount)
 */

// @vitest-environment happy-dom

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useTimeout } from '../use-timeout';

describe('useTimeout', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('set() schedules callback that fires after delay', () => {
    const callback = vi.fn();
    const { result } = renderHook(() => useTimeout());

    act(() => {
      result.current.set(callback, 1000);
    });

    expect(callback).not.toHaveBeenCalled();
    expect(result.current.isPending()).toBe(true);

    act(() => {
      vi.advanceTimersByTime(1000);
    });

    expect(callback).toHaveBeenCalledTimes(1);
    expect(result.current.isPending()).toBe(false);
  });

  it('clear() cancels the pending timeout', () => {
    const callback = vi.fn();
    const { result } = renderHook(() => useTimeout());

    act(() => {
      result.current.set(callback, 1000);
    });
    expect(result.current.isPending()).toBe(true);

    act(() => {
      result.current.clear();
    });
    expect(result.current.isPending()).toBe(false);

    act(() => {
      vi.advanceTimersByTime(2000);
    });
    expect(callback).not.toHaveBeenCalled();
  });

  it('isPending() reflects whether a timeout is active', () => {
    const { result } = renderHook(() => useTimeout());

    expect(result.current.isPending()).toBe(false);

    act(() => {
      result.current.set(vi.fn(), 500);
    });
    expect(result.current.isPending()).toBe(true);

    act(() => {
      vi.advanceTimersByTime(500);
    });
    expect(result.current.isPending()).toBe(false);
  });

  it('set() replaces previous timeout (only one active at a time)', () => {
    const first = vi.fn();
    const second = vi.fn();
    const { result } = renderHook(() => useTimeout());

    act(() => {
      result.current.set(first, 1000);
    });

    act(() => {
      result.current.set(second, 500);
    });

    // Advance past both delays — only the second callback should fire
    act(() => {
      vi.advanceTimersByTime(1000);
    });

    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
  });

  it('invalid delayMs (negative/NaN/Infinity) falls back to 0 and warns', () => {
    const callback = vi.fn();
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { result } = renderHook(() => useTimeout());

    act(() => {
      result.current.set(callback, -100);
    });
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('Invalid delayMs'),
    );

    // Callback fires immediately (delay=0 → next tick)
    act(() => {
      vi.advanceTimersByTime(0);
    });
    expect(callback).toHaveBeenCalledTimes(1);

    warnSpy.mockRestore();
  });

  it('clears pending timeout on unmount (no setState after unmount)', () => {
    const callback = vi.fn();
    const { result, unmount } = renderHook(() => useTimeout());

    act(() => {
      result.current.set(callback, 5000);
    });
    expect(result.current.isPending()).toBe(true);

    unmount();

    // Advance timers past the delay — callback should NOT fire (cleaned up)
    act(() => {
      vi.advanceTimersByTime(10000);
    });
    expect(callback).not.toHaveBeenCalled();
  });
});
