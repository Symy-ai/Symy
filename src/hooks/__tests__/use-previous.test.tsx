/**
 * Tests for use-previous.ts — usePrevious hook
 *
 * 🔧 ARCH fix (Round 66 ARCH-DEEP-66): 测试覆盖率 — usePrevious 0 tests → 3 tests
 *
 * Uses @testing-library/react renderHook + happy-dom environment.
 * Verifies the contract: returns undefined on first render, then the value
 * from the previous render on subsequent renders.
 */

// @vitest-environment happy-dom

import { describe, it, expect } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { usePrevious } from '../use-previous';

describe('usePrevious', () => {
  it('returns undefined on first render', () => {
    const { result } = renderHook(({ value }) => usePrevious(value), {
      initialProps: { value: 'first' },
    });
    // First render: ref.current is still undefined (useEffect hasn't fired yet)
    expect(result.current).toBeUndefined();
  });

  it('returns previous value after re-render with new value', () => {
    const { result, rerender } = renderHook(({ value }) => usePrevious(value), {
      initialProps: { value: 'first' },
    });
    expect(result.current).toBeUndefined();

    // After first effect flush, ref.current = 'first'. Re-render with new value.
    rerender({ value: 'second' });
    // useEffect for new value hasn't run yet on this render — returns 'first'.
    expect(result.current).toBe('first');
  });

  it('tracks successive values across many renders', () => {
    const { result, rerender } = renderHook(({ value }) => usePrevious(value), {
      initialProps: { value: 1 },
    });
    expect(result.current).toBeUndefined();

    rerender({ value: 2 });
    expect(result.current).toBe(1);

    rerender({ value: 3 });
    expect(result.current).toBe(2);

    rerender({ value: 4 });
    expect(result.current).toBe(3);
  });

  it('keeps previous value when re-rendered with same value', () => {
    const { result, rerender } = renderHook(({ value }) => usePrevious(value), {
      initialProps: { value: 'x' },
    });
    rerender({ value: 'y' });
    expect(result.current).toBe('x');

    // Same value: useEffect dependency unchanged, ref.current stays 'y'.
    rerender({ value: 'y' });
    expect(result.current).toBe('y');
  });

  it('handles object values by reference (no deep comparison)', () => {
    const obj1 = { a: 1 };
    const obj2 = { a: 2 };
    const { result, rerender } = renderHook(
      ({ value }) => usePrevious(value),
      { initialProps: { value: obj1 } },
    );
    rerender({ value: obj2 });
    expect(result.current).toBe(obj1);
  });

  it('no-op act() wrapper to confirm @testing-library/react import works', () => {
    let count = 0;
    act(() => {
      count++;
    });
    expect(count).toBe(1);
  });
});
