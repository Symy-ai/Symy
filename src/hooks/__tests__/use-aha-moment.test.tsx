// @vitest-environment happy-dom

import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { apiFetch, apiFetchVoid } from '@/lib/api-client';
import { logger } from '@/lib/logger';
import { useAhaMoment } from '@/hooks/use-aha-moment';
import type { ChallengeContext } from '@/types/challenge-context';

vi.mock('@/lib/api-client', () => ({ apiFetch: vi.fn(), apiFetchVoid: vi.fn() }));
vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn(), warn: vi.fn() } }));

const setChatContextMessage = vi.fn();
const setChallengeContext = vi.fn();
const setActiveTab = vi.fn();
const context: ChallengeContext = { itemName: 'Headphones', amount: 99 };

function options(isDemo: boolean, loading = false, user: { id: string } | null = { id: 'u-1' }) {
  return {
    isDemoRef: { current: isDemo },
    loading,
    user,
    t: (key: string) => key,
    setChatContextMessage,
    setChallengeContext,
    setActiveTab,
  };
}

function settle() {
  act(() => undefined);
}

describe('useAhaMoment', () => {
  beforeEach(() => {
    cleanup();
    localStorage.clear();
    vi.mocked(apiFetch).mockReset();
    vi.mocked(apiFetchVoid).mockReset();
    vi.mocked(logger.error).mockClear();
    vi.mocked(logger.warn).mockClear();
    setChatContextMessage.mockClear();
    setChallengeContext.mockClear();
    setActiveTab.mockClear();
    vi.useFakeTimers();
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it('shows demo guidance after a delay when first seen', async () => {
    const { result } = renderHook(() => useAhaMoment(options(true)));
    expect(result.current.showAhaMoment).toBe(false);
    await act(async () => { await vi.advanceTimersByTimeAsync(799); });
    expect(result.current.showAhaMoment).toBe(false);
    await act(async () => { await vi.advanceTimersByTimeAsync(1); });
    expect(result.current.showAhaMoment).toBe(true);
  });

  it('does not show demo guidance after completion persists seen state', async () => {
    localStorage.setItem('symy-aha-moment-seen', 'true');
    const { result } = renderHook(() => useAhaMoment(options(true)));
    await act(async () => { await vi.advanceTimersByTimeAsync(1000); });
    expect(result.current.showAhaMoment).toBe(false);
  });

  it('checks server onboarding and syncs completion for signed-in users', async () => {
    vi.mocked(apiFetch).mockResolvedValue({ onboarding_completed: false });
    vi.mocked(apiFetchVoid).mockResolvedValue();
    const { result } = renderHook(() => useAhaMoment(options(false)));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(apiFetch).toHaveBeenCalledWith('/api/user/onboarding');
    await act(async () => { await vi.advanceTimersByTimeAsync(800); });
    expect(result.current.showAhaMoment).toBe(true);

    act(() => result.current.handleAhaComplete());
    expect(result.current.showAhaMoment).toBe(false);
    expect(apiFetchVoid).toHaveBeenCalledWith('/api/user/onboarding', {
      method: 'PUT',
      body: { onboarding_completed: true },
    });
  });

  it('does not show guidance for a completed signed-in user', async () => {
    vi.mocked(apiFetch).mockResolvedValue({ onboarding_completed: true });
    const { result } = renderHook(() => useAhaMoment(options(false)));
    await settle();
    await act(async () => { await vi.advanceTimersByTimeAsync(1000); });
    expect(result.current.showAhaMoment).toBe(false);
  });

  it('navigates to the challenge context and closes guidance', async () => {
    const { result } = renderHook(() => useAhaMoment(options(true)));
    await act(async () => { await vi.advanceTimersByTimeAsync(800); });
    act(() => result.current.handleAhaNavigateToChallenge(context));

    expect(result.current.showAhaMoment).toBe(false);
    expect(result.current.ahaChallengeContext).toEqual(context);
    expect(setChatContextMessage).toHaveBeenCalledWith('navigation.challengePurchase');
    expect(setChallengeContext).toHaveBeenCalledWith(context);
    expect(setActiveTab).toHaveBeenCalledWith('chat');
  });

  it('persists skip state in demo mode and clears context', async () => {
    const { result } = renderHook(() => useAhaMoment(options(true)));
    await act(async () => { await vi.advanceTimersByTimeAsync(800); });
    result.current.setAhaChallengeContext(context);
    act(() => result.current.handleAhaSkip());

    expect(result.current.ahaChallengeContext).toBeNull();
    expect(localStorage.getItem('symy-aha-moment-seen')).toBe('true');
  });
});
