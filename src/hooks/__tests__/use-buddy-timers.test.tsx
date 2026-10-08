// @vitest-environment happy-dom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createElement } from 'react';
import { act, cleanup, render } from '@testing-library/react';
import { apiFetch } from '@/lib/api-client';
import { BUDDY_STATE_KEY } from '../../hooks/buddy-state-key';
import { useBuddyTimers } from '../../hooks/use-buddy-timers';
import type { BuddyState } from '@/types/buddy-state';

vi.mock('@/lib/api-client', () => ({
  apiFetch: vi.fn(),
  ApiError: class ApiError extends Error {
    constructor(public status: number) { super(`HTTP ${status}`); }
  },
}));
vi.mock('@/lib/logger', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));

const FIXED_NOW = new Date('2026-10-08T12:00:00.000Z').getTime();
const DRAIN_INTERVAL = 30 * 60 * 1000;

function buddyState(overrides: Partial<BuddyState> = {}): BuddyState {
  return {
    vitality: 80,
    tokens: 20,
    health: 'healthy',
    level: 2,
    xp: 90,
    xpToNext: 100,
    streak: 3,
    totalSaved: 0,
    challengesCompleted: 0,
    badges: [],
    invitedCount: 0,
    dreamFunds: [],
    lastHealingKitAt: null,
    version: 7,
    growthStage: 'young',
    personality: 'unknown',
    intimacy: 0,
    dailyNeeds: { clarity: 50, connection: 50 },
    proactiveMessages: [],
    personalityAwakenedAt: null,
    lastActiveAt: null,
    ...overrides,
  };
}

function renderTimers(queryClient: QueryClient, isLoaded = true, userId = 'u-1') {
  function Consumer() {
    useBuddyTimers({ isLoaded, userId });
    return <span />;
  }
  return render(
    createElement(QueryClientProvider, { client: queryClient }, createElement(Consumer)),
  );
}

describe('useBuddyTimers', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.spyOn(Date, 'now').mockReturnValue(FIXED_NOW);
    window.localStorage.clear();
    vi.mocked(apiFetch).mockReset().mockResolvedValue({ version: 8 });
  });

  afterEach(async () => {
    cleanup();
    await act(async () => {});
    vi.useRealTimers();
  });

  it('does not schedule timers before buddy state or user is loaded', async () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { gcTime: Infinity } } });
    queryClient.setQueryData(BUDDY_STATE_KEY, buddyState());
    renderTimers(queryClient, false, undefined);
    await act(async () => { await vi.advanceTimersByTimeAsync(DRAIN_INTERVAL + 60 * 60 * 1000); });
    expect(apiFetch).not.toHaveBeenCalled();
    expect(window.localStorage.length).toBe(0);
  });

  it('initializes a missing drain timestamp without draining tokens', async () => {
    const queryClient = new QueryClient();
    queryClient.setQueryData(BUDDY_STATE_KEY, buddyState());
    renderTimers(queryClient);
    await act(async () => {});
    expect(window.localStorage.getItem('symy-buddy-last-drain-u-1')).toBeNull();
  });

  it('drains exactly one interval at the inclusive boundary and anchors the next timestamp', async () => {
    window.localStorage.setItem('symy-buddy-last-streak-day-u-1', new Date(FIXED_NOW).toISOString().slice(0, 10));
    window.localStorage.setItem('symy-buddy-last-drain-u-1', String(FIXED_NOW - DRAIN_INTERVAL));
    const queryClient = new QueryClient();
    queryClient.setQueryData(BUDDY_STATE_KEY, buddyState({ vitality: 50 }));
    renderTimers(queryClient);
    await act(async () => {});
    const state = queryClient.getQueryData<BuddyState>(BUDDY_STATE_KEY);
    expect(state?.tokens).toBe(19);
    expect(state?.vitality).toBe(49.5);
    expect(state?.health).toBe('healthy');
    expect(window.localStorage.getItem('symy-buddy-last-drain-u-1')).toBe(String(FIXED_NOW));
  });

  it('caps long absence drift at forty-eight missed intervals', async () => {
    window.localStorage.setItem('symy-buddy-last-streak-day-u-1', new Date(FIXED_NOW).toISOString().slice(0, 10));
    window.localStorage.setItem('symy-buddy-last-drain-u-1', String(FIXED_NOW - 100 * DRAIN_INTERVAL));
    const queryClient = new QueryClient();
    queryClient.setQueryData(BUDDY_STATE_KEY, buddyState({ tokens: 100, vitality: 100 }));
    renderTimers(queryClient);
    await act(async () => {});
    expect(queryClient.getQueryData<BuddyState>(BUDDY_STATE_KEY)?.tokens).toBe(52);
    expect(queryClient.getQueryData<BuddyState>(BUDDY_STATE_KEY)?.vitality).toBe(76);
    expect(window.localStorage.getItem('symy-buddy-last-drain-u-1'))
      .toBe(String(FIXED_NOW - 52 * DRAIN_INTERVAL));
  });

  it('does not drain before thirty minutes, including minute ticks', async () => {
    window.localStorage.setItem('symy-buddy-last-streak-day-u-1', new Date(FIXED_NOW).toISOString().slice(0, 10));
    window.localStorage.setItem('symy-buddy-last-drain-u-1', String(FIXED_NOW - DRAIN_INTERVAL + 1));
    const queryClient = new QueryClient();
    queryClient.setQueryData(BUDDY_STATE_KEY, buddyState());
    renderTimers(queryClient);
    await act(async () => { await vi.advanceTimersByTimeAsync(59 * 1000); });
    expect(queryClient.getQueryData<BuddyState>(BUDDY_STATE_KEY)?.tokens).toBe(20);
    expect(apiFetch).not.toHaveBeenCalled();
  });

  it('extends a consecutive daily streak and applies bounded gains', async () => {
    const today = new Date(FIXED_NOW).toISOString().slice(0, 10);
    const yesterday = new Date(FIXED_NOW - 86400000).toISOString().slice(0, 10);
    window.localStorage.setItem('symy-buddy-last-streak-day-u-1', yesterday);
    const queryClient = new QueryClient();
    queryClient.setQueryData(BUDDY_STATE_KEY, buddyState({ vitality: 98, xp: 98 }));
    renderTimers(queryClient);
    await act(async () => {});
    const state = queryClient.getQueryData<BuddyState>(BUDDY_STATE_KEY);
    expect(state?.streak).toBe(4);
    expect(state?.vitality).toBe(100);
    expect(state?.xp).toBe(0);
    expect(state?.level).toBe(3);
    expect(state?.health).toBe('thriving');
    expect(window.localStorage.getItem('symy-buddy-last-streak-day-u-1')).toBe(today);
  });

  it('resets a broken streak and preserves the previous value', async () => {
    const today = new Date(FIXED_NOW).toISOString().slice(0, 10);
    window.localStorage.setItem('symy-buddy-last-streak-day-u-1', '2026-10-05');
    const queryClient = new QueryClient();
    queryClient.setQueryData(BUDDY_STATE_KEY, buddyState());
    renderTimers(queryClient);
    await act(async () => {});
    expect(queryClient.getQueryData<BuddyState>(BUDDY_STATE_KEY)?.streak).toBe(1);
    expect(window.localStorage.getItem('symy-buddy-prev-streak-u-1')).toBe('3');
    expect(window.localStorage.getItem('symy-buddy-last-streak-day-u-1')).toBe(today);
  });

  it('clears scheduled drain checks on unmount', async () => {
    window.localStorage.setItem('symy-buddy-last-drain-u-1', String(FIXED_NOW));
    window.localStorage.setItem('symy-buddy-last-streak-day-u-1', new Date(FIXED_NOW).toISOString().slice(0, 10));
    const queryClient = new QueryClient();
    queryClient.setQueryData(BUDDY_STATE_KEY, buddyState());
    const view = renderTimers(queryClient);
    await act(async () => {});
    act(() => view.unmount());
    await act(async () => { await vi.advanceTimersByTimeAsync(DRAIN_INTERVAL); });
    expect(vi.mocked(apiFetch).mock.calls.some(([url]: unknown[]) => url === '/api/buddy/state')).toBe(false);
  });
});
