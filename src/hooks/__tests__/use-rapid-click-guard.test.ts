/**
 * Test: F1 fix pattern — in-flight ref prevents rapid-click race conditions
 *
 * 🔧 Round 101: This test verifies the pattern used in buddy-tab.tsx to prevent
 *    the Pet Symy race condition (F1). The pattern uses a useRef as a synchronous
 *    in-flight guard, because React state updates are async and 5 synchronous
 *    clicks would all see isPending=false.
 *
 *    The test simulates 5 rapid clicks and verifies only 1 API call is made.
 *
 * @vitest-environment happy-dom
 */
/* eslint-disable require-await -- test mocks use async for API consistency */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useRef, useState, useCallback } from 'react';

// Simulate the F1 fix pattern from buddy-tab.tsx
function useRapidClickGuard(onAction: () => Promise<string>) {
  const inFlightRef = useRef(false);
  const [isPending, setIsPending] = useState(false);

  const handleClick = useCallback(() => {
    // Guard: check ref synchronously (state would be async → race condition)
    if (inFlightRef.current) return 'blocked';

    inFlightRef.current = true; // synchronous — blocks immediate re-clicks
    setIsPending(true); // for UI (async, but that's OK)

    // The .catch() swallows the rejection — the caller handles results via the return value
    // or separate state. This matches the buddy-tab pattern where onUseHealingKit has its
    // own .then/.catch/.finally chain.
    onAction()
      .catch(() => { /* caller handles error via result string */ })
      .finally(() => {
        inFlightRef.current = false;
        setIsPending(false);
      });

    return 'started';
  }, [onAction]);

  return { handleClick, isPending };
}

describe('F1 fix: in-flight ref prevents rapid-click race conditions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should only fire 1 API call when clicked 5 times rapidly', async () => {
    const mockAction = vi.fn().mockImplementation(
      () => new Promise<string>((resolve) => setTimeout(() => resolve('success'), 50))
    );

    const { result } = renderHook(() => useRapidClickGuard(mockAction));

    // Simulate 5 rapid synchronous clicks
    const results: string[] = [];
    act(() => {
      for (let i = 0; i < 5; i++) {
        results.push(result.current.handleClick());
      }
    });

    // First click starts, clicks 2-5 are blocked
    expect(results).toEqual(['started', 'blocked', 'blocked', 'blocked', 'blocked']);
    expect(mockAction).toHaveBeenCalledTimes(1);

    // Settle the pending 50ms promise before teardown — setIsPending after
    // happy-dom window destruction throws "window is not defined" (unhandled rejection)
    await act(async () => {
      await new Promise((r) => setTimeout(r, 60));
    });
  });

  it('should allow another click after the first completes', async () => {
    const mockAction = vi.fn().mockImplementation(
      () => new Promise<string>((resolve) => setTimeout(() => resolve('success'), 10))
    );

    const { result } = renderHook(() => useRapidClickGuard(mockAction));

    // First click
    act(() => { result.current.handleClick(); });
    expect(mockAction).toHaveBeenCalledTimes(1);

    // Wait for it to complete
    await act(async () => {
      await new Promise((r) => setTimeout(r, 20));
    });

    // Second click should now succeed
    act(() => { result.current.handleClick(); });
    expect(mockAction).toHaveBeenCalledTimes(2);

    await act(async () => {
      await new Promise((r) => setTimeout(r, 20));
    });
  });

  it('should clear the ref even if the action fails', async () => {
    const mockAction = vi.fn().mockImplementation(
      () => new Promise<string>((_, reject) => setTimeout(() => reject(new Error('fail')), 10))
    );

    const { result } = renderHook(() => useRapidClickGuard(mockAction));

    // First click (will fail) — catch the unhandled rejection
    act(() => {
      result.current.handleClick();
    });
    expect(mockAction).toHaveBeenCalledTimes(1);

    // Wait for it to fail — suppress unhandled rejection
    await act(async () => {
      try {
        await new Promise((r) => setTimeout(r, 20));
      } catch {
        // expected — the mock rejects
      }
    });

    // Second click should succeed (ref was cleared in finally)
    act(() => { result.current.handleClick(); });
    expect(mockAction).toHaveBeenCalledTimes(2);

    await act(async () => {
      await new Promise((r) => setTimeout(r, 20));
    });
  });
});
