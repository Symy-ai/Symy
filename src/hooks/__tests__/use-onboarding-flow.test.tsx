// @vitest-environment happy-dom

import { act, cleanup, render } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { User } from '@supabase/supabase-js';

const apiFetchMock = vi.hoisted(() => vi.fn());
const apiFetchVoidMock = vi.hoisted(() => vi.fn());
vi.mock('@/lib/api-client', () => ({ apiFetch: apiFetchMock, apiFetchVoid: apiFetchVoidMock }));

import { useOnboardingFlow } from '../use-onboarding-flow';

const user = { id: 'u-1' } as User;

function renderHooked(props: { user?: User | null; loading?: boolean; isDemo?: boolean } = {}) {
  const args = { user: props.user ?? user, loading: props.loading ?? false, isDemo: props.isDemo ?? false };
  const seen: ReturnType<typeof useOnboardingFlow>[] = [];
  function Consumer() {
    seen.push(useOnboardingFlow(args));
    return <div data-testid="consumer" />;
  }
  return { ...render(<Consumer />), seen };
}

describe('useOnboardingFlow', () => {
  beforeEach(() => {
    cleanup();
    window.localStorage.clear();
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-08T12:00:00.000Z'));
  });

  it('opens onboarding after the real-user API reports incomplete', async () => {
    apiFetchMock.mockResolvedValue({ onboarding_completed: false });
    const view = renderHooked();
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    act(() => { vi.advanceTimersByTime(800); });
    expect(view.seen.at(-1)?.showOnboarding).toBe(true);
  });

  it('does not open completed onboarding', async () => {
    apiFetchMock.mockResolvedValue({ onboarding_completed: true });
    const view = renderHooked();
    await act(async () => { await vi.advanceTimersByTimeAsync(900); });
    expect(view.seen.at(-1)?.showOnboarding).toBe(false);
  });

  it('does not check while auth loading', async () => {
    const view = renderHooked({ loading: true });
    await act(async () => { await vi.advanceTimersByTimeAsync(900); });
    expect(apiFetchMock).not.toHaveBeenCalled();
    expect(view.seen.at(-1)?.showOnboarding).toBe(false);
  });

  it('opens demo onboarding only when local seen flag is absent', async () => {
    const view = renderHooked({ isDemo: true, user: null });
    await act(async () => { await vi.advanceTimersByTimeAsync(900); });
    expect(view.seen.at(-1)?.showOnboarding).toBe(true);
  });

  it('does not reopen demo onboarding after completion persisted locally', async () => {
    const view = renderHooked({ isDemo: true, user: null });
    await act(async () => { await vi.advanceTimersByTimeAsync(900); });
    act(() => view.seen.at(-1)!.handleOnboardingComplete());
    expect(view.seen.at(-1)?.showOnboarding).toBe(false);
    expect(window.localStorage.getItem('symy-onboarding-seen')).toBe('true');
    view.unmount();
    const reopened = renderHooked({ isDemo: true, user: null });
    await act(async () => { await vi.advanceTimersByTimeAsync(900); });
    expect(reopened.seen.at(-1)?.showOnboarding).toBe(false);
  });

  it('syncs skip completion for a real user and closes without storage side effects', async () => {
    apiFetchMock.mockResolvedValue({ onboarding_completed: false });
    apiFetchVoidMock.mockResolvedValue(undefined);
    const view = renderHooked();
    await act(async () => { await vi.advanceTimersByTimeAsync(900); });
    act(() => view.seen.at(-1)!.handleOnboardingSkip());
    await act(async () => { await Promise.resolve(); });
    expect(vi.mocked(apiFetchVoidMock)).toHaveBeenCalledWith('/api/user/onboarding', {
      method: 'PUT', body: { onboarding_completed: true },
    });
    expect(window.localStorage.getItem('symy-onboarding-seen')).toBeNull();
    expect(view.seen.at(-1)?.showOnboarding).toBe(false);
  });
});
