// @vitest-environment happy-dom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, renderHook } from '@testing-library/react';
import { getImpulseLevel } from '@/lib/impulse-detector';
import { useImpulseAlert } from '../../hooks/use-impulse-alert';

vi.mock('@/lib/impulse-detector', () => ({ getImpulseLevel: vi.fn() }));

describe('useImpulseAlert', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.mocked(getImpulseLevel).mockReset();
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it('starts stable without shaking', () => {
    const { result } = renderHook(() => useImpulseAlert({ current: false }));
    expect(result.current.appStatus).toBe('stable');
    expect(result.current.shaking).toBe(false);
  });

  it('skips alerts while demo mode is active', () => {
    vi.mocked(getImpulseLevel).mockReturnValue('alert');
    const { result } = renderHook(() => useImpulseAlert({ current: true }));
    act(() => result.current.handleImpulseAlert(95));
    expect(getImpulseLevel).not.toHaveBeenCalled();
    expect(result.current.appStatus).toBe('stable');
    expect(result.current.shaking).toBe(false);
  });

  it('enters alert and stops shaking exactly after three seconds', () => {
    vi.mocked(getImpulseLevel).mockReturnValue('alert');
    const { result } = renderHook(() => useImpulseAlert({ current: false }));
    act(() => result.current.handleImpulseAlert(61));
    expect(result.current.appStatus).toBe('alert');
    expect(result.current.shaking).toBe(true);
    act(() => { vi.advanceTimersByTime(2999); });
    expect(result.current.shaking).toBe(true);
    act(() => { vi.advanceTimersByTime(1); });
    expect(result.current.shaking).toBe(false);
    expect(result.current.appStatus).toBe('alert');
  });

  it('enters success and resets to stable exactly after three seconds', () => {
    vi.mocked(getImpulseLevel).mockReturnValue('success');
    const { result } = renderHook(() => useImpulseAlert({ current: false }));
    act(() => result.current.handleImpulseAlert(29));
    expect(result.current.appStatus).toBe('success');
    act(() => { vi.advanceTimersByTime(2999); });
    expect(result.current.appStatus).toBe('success');
    act(() => { vi.advanceTimersByTime(1); });
    expect(result.current.appStatus).toBe('stable');
  });

  it('restores stable state on neutral scores while preserving the old shake timer', () => {
    vi.mocked(getImpulseLevel).mockReturnValueOnce('alert').mockReturnValueOnce('stable');
    const { result } = renderHook(() => useImpulseAlert({ current: false }));
    act(() => result.current.handleImpulseAlert(90));
    act(() => result.current.handleImpulseAlert(45));
    expect(result.current.appStatus).toBe('stable');
    expect(result.current.shaking).toBe(true);
    act(() => { vi.advanceTimersByTime(3000); });
    expect(result.current.shaking).toBe(false);
  });

  it('allows manual reset and clears timers on unmount', () => {
    vi.mocked(getImpulseLevel).mockReturnValue('success');
    const { result, unmount } = renderHook(() => useImpulseAlert({ current: false }));
    act(() => result.current.handleImpulseAlert(10));
    act(() => result.current.setAppStatus('stable'));
    expect(result.current.appStatus).toBe('stable');
    unmount();
    act(() => { vi.advanceTimersByTime(3000); });
  });
});
