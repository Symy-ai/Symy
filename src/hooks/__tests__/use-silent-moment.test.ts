/**
 * @vitest-environment happy-dom
 *
 * Tests for useSilentMoment hook
 *
 * 🔧 ARCH fix Round 76 (Finding 14): Zero tests for use-silent-moment hook.
 * The hook had a regression (lastSawRef never reset, commit 02171323) that
 * shipped without a test guard. These tests prevent recurrence.
 *
 * Critical paths:
 *   - triggerSaw sets silentMoment state
 *   - triggerSaw dedupes same challengeId (within one cycle)
 *   - triggerSaw allows different challengeId after completeSilentMoment
 *   - triggerBought dedupes same amount within 2s
 *   - triggerBought allows same amount after 2s
 *   - attachPendingAhaMoment stores pendingAhaMoment
 *   - completeSilentMoment clears state + resets dedup refs
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

// Mock useHourlyRate (used by useSilentMoment for hoursOfLife calculation)
vi.mock('@/hooks/use-hourly-rate', () => ({
  useHourlyRate: vi.fn(() => ({ hourlyRate: 20, setHourlyRate: vi.fn(), refresh: vi.fn() })),
}));

import { useSilentMoment } from '../use-silent-moment';

describe('useSilentMoment', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('triggerSaw', () => {
    it('sets silentMoment state with saw outcome', () => {
      const { result } = renderHook(() => useSilentMoment(false));

      act(() => {
        result.current.triggerSaw('chal-1', 100, 'Nike');
      });

      expect(result.current.silentMoment).not.toBeNull();
      expect(result.current.silentMoment?.outcome).toBe('saw');
      expect(result.current.silentMoment?.amount).toBe(100);
      expect(result.current.silentMoment?.itemName).toBe('Nike');
      expect(result.current.silentMoment?.hoursOfLife).toBe(5); // 100 / 20
      expect(result.current.silentMoment?.pendingDeposit).toEqual({
        challengeId: 'chal-1',
        savedAmount: 100,
      });
    });

    it('dedupes same challengeId within one cycle', () => {
      const { result } = renderHook(() => useSilentMoment(false));

      act(() => {
        result.current.triggerSaw('chal-1', 100, 'Nike');
      });
      expect(result.current.silentMoment?.amount).toBe(100);

      // Same challengeId → should NOT update (deduped)
      act(() => {
        result.current.triggerSaw('chal-1', 200, 'Different');
      });
      expect(result.current.silentMoment?.amount).toBe(100); // unchanged
    });

    it('allows different challengeId after completeSilentMoment (regression test for 02171323)', () => {
      const { result } = renderHook(() => useSilentMoment(false));

      // First challenge
      act(() => {
        result.current.triggerSaw('chal-1', 100, 'Nike');
      });
      expect(result.current.silentMoment).not.toBeNull();

      // Complete the first silent moment
      act(() => {
        result.current.completeSilentMoment();
      });
      expect(result.current.silentMoment).toBeNull();

      // Second challenge (different ID) — should work after reset
      act(() => {
        result.current.triggerSaw('chal-2', 200, 'Adidas');
      });
      expect(result.current.silentMoment).not.toBeNull();
      expect(result.current.silentMoment?.amount).toBe(200);
      expect(result.current.silentMoment?.pendingDeposit?.challengeId).toBe('chal-2');
    });
  });

  describe('triggerBought', () => {
    it('sets silentMoment state with bought outcome', () => {
      const { result } = renderHook(() => useSilentMoment(false));

      act(() => {
        result.current.triggerBought(100, 'Nike');
      });

      expect(result.current.silentMoment).not.toBeNull();
      expect(result.current.silentMoment?.outcome).toBe('bought');
      expect(result.current.silentMoment?.amount).toBe(100);
      expect(result.current.silentMoment?.pendingDeposit).toBeUndefined();
    });

    it('dedupes same amount within 2 seconds', () => {
      const { result } = renderHook(() => useSilentMoment(false));

      act(() => {
        result.current.triggerBought(100, 'Nike');
      });
      expect(result.current.silentMoment?.amount).toBe(100);

      // Same amount within 2s → should NOT update
      act(() => {
        vi.advanceTimersByTime(1000); // 1s later
        result.current.triggerBought(100, 'Different');
      });
      expect(result.current.silentMoment?.amount).toBe(100); // unchanged
      expect(result.current.silentMoment?.itemName).toBe('Nike'); // unchanged
    });

    it('allows same amount after 2 seconds', () => {
      const { result } = renderHook(() => useSilentMoment(false));

      act(() => {
        result.current.triggerBought(100, 'Nike');
      });

      // Advance past 2s dedup window
      act(() => {
        vi.advanceTimersByTime(2100);
        result.current.triggerBought(100, 'Adidas');
      });

      expect(result.current.silentMoment?.itemName).toBe('Adidas'); // updated
    });
  });

  describe('attachPendingAhaMoment', () => {
    it('stores pendingAhaMoment on current silentMoment', () => {
      const { result } = renderHook(() => useSilentMoment(false));

      act(() => {
        result.current.triggerSaw('chal-1', 100, 'Nike');
      });

      act(() => {
        result.current.attachPendingAhaMoment({
          challengeId: 'chal-1',
          itemName: 'Nike',
          amount: 100,
        });
      });

      expect(result.current.silentMoment?.pendingAhaMoment).toEqual({
        challengeId: 'chal-1',
        itemName: 'Nike',
        amount: 100,
      });
    });

    it('does nothing when silentMoment is null', () => {
      const { result } = renderHook(() => useSilentMoment(false));

      // No silent moment active — attachPendingAhaMoment should be a no-op
      act(() => {
        result.current.attachPendingAhaMoment({
          challengeId: 'chal-1',
          itemName: 'Nike',
          amount: 100,
        });
      });

      expect(result.current.silentMoment).toBeNull();
    });
  });

  describe('completeSilentMoment', () => {
    it('clears silentMoment state', () => {
      const { result } = renderHook(() => useSilentMoment(false));

      act(() => {
        result.current.triggerSaw('chal-1', 100, 'Nike');
      });
      expect(result.current.silentMoment).not.toBeNull();

      act(() => {
        result.current.completeSilentMoment();
      });
      expect(result.current.silentMoment).toBeNull();
    });

    it('resets lastSawRef allowing future triggerSaw with same challengeId (regression test)', () => {
      const { result } = renderHook(() => useSilentMoment(false));

      // First cycle
      act(() => {
        result.current.triggerSaw('chal-1', 100, 'Nike');
      });
      act(() => {
        result.current.completeSilentMoment();
      });

      // Same challengeId after reset — should work (was broken before 02171323 fix)
      act(() => {
        result.current.triggerSaw('chal-1', 100, 'Nike');
      });
      expect(result.current.silentMoment).not.toBeNull();
      expect(result.current.silentMoment?.amount).toBe(100);
    });
  });
});
