// @vitest-environment happy-dom

import { act, cleanup, render, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const apiFetchMock = vi.hoisted(() => vi.fn());
const rawFetchMock = vi.hoisted(() => vi.fn());

vi.mock('@/lib/api-client', () => ({ apiFetch: apiFetchMock }));
vi.stubGlobal('fetch', rawFetchMock);

import { useCompanionEffects } from '../use-companion-effects';
import type { BuddyState } from '@/types/buddy-state';

const buddyState: BuddyState = {
  vitality: 80, tokens: 20, health: 'healthy', level: 1, xp: 0, xpToNext: 100,
  streak: 0, dreamFunds: [], badges: [], totalSaved: 0, challengesCompleted: 0,
  lastHealingKitAt: null, version: 1, growthStage: 'baby', personality: 'unknown',
  intimacy: 0, dailyNeeds: { clarity: 50, connection: 50 }, proactiveMessages: [],
  personalityAwakenedAt: null, lastActiveAt: null,
};

interface Options {
  isDemo?: boolean;
  loaded?: boolean;
  userId?: string;
  challenges?: number;
  personality?: BuddyState['personality'];
}

function renderHooked(options: Options = {}) {
  const props = {
    isDemo: options.isDemo ?? false,
    buddyIsLoaded: options.loaded ?? true,
    userId: options.userId ?? 'u-1',
    realBuddyState: { ...buddyState, personality: options.personality ?? 'unknown' },
    buddyChallengesCompleted: options.challenges ?? 0,
  };
  const seen: ReturnType<typeof useCompanionEffects>[] = [];
  function Consumer() {
    seen.push(useCompanionEffects(props));
    return <div data-testid="consumer" />;
  }
  return { ...render(<Consumer />), seen };
}

describe('useCompanionEffects side-effect gates', () => {
  beforeEach(() => {
    cleanup();
    window.localStorage.clear();
    vi.clearAllMocks();
    rawFetchMock.mockResolvedValue({ ok: true, json: () => Promise.resolve({ success: false }) });
    apiFetchMock.mockResolvedValue({ totalSaw: 1, totalPassed: 1, totalFailed: 0 });
  });
  afterEach(() => cleanup());

  it('fires each daily companion request once and records today keys', async () => {
    renderHooked();
    await waitFor(() => expect(rawFetchMock).toHaveBeenCalledTimes(2));
    expect(vi.mocked(rawFetchMock).mock.calls.map(([url]) => url)).toEqual([
      '/api/buddy/proactive-messages/generate',
      '/api/buddy/personality',
    ]);
    expect(window.localStorage.getItem(`symy-proactive-checked-${'u-1'}`)).toBe(new Date().toISOString().slice(0, 10));
    expect(window.localStorage.getItem(`symy-last-open-${'u-1'}`)).toBeTruthy();
    expect(window.localStorage.getItem(`symy-personality-checked-${'u-1'}`)).toBeTruthy();
  });

  it('skips every request in demo mode', async () => {
    renderHooked({ isDemo: true });
    await act(async () => { await Promise.resolve(); });
    expect(rawFetchMock).not.toHaveBeenCalled();
    expect(apiFetchMock).not.toHaveBeenCalled();
  });

  it('skips buddy effects while buddy state is not loaded', async () => {
    renderHooked({ loaded: false });
    await act(async () => { await Promise.resolve(); });
    expect(rawFetchMock).not.toHaveBeenCalledWith('/api/buddy/proactive-messages/generate', expect.anything());
    expect(window.localStorage.getItem(`symy-proactive-checked-${'u-1'}`)).toBeNull();
  });

  it('skips awakening when personality is already known', async () => {
    renderHooked({ personality: 'sage' });
    await waitFor(() => expect(rawFetchMock).toHaveBeenCalledTimes(1));
    expect(vi.mocked(rawFetchMock).mock.calls[0][0]).toBe('/api/buddy/proactive-messages/generate');
    expect(window.localStorage.getItem(`symy-personality-checked-${'u-1'}`)).toBeNull();
  });

  it('persists awakened personality and reloads stats after challenge completion changes', async () => {
    rawFetchMock.mockResolvedValue({ ok: true, json: () => Promise.resolve({ success: true, personality: 'guardian' }) });
    const first = renderHooked({ challenges: 1 });
    await waitFor(() => expect(first.seen.at(-1)?.challengeStats?.totalSaw).toBe(1));
    expect(window.localStorage.getItem(`symy-personality-checked-${'u-1'}`)).toBeTruthy();
    first.unmount();
    vi.clearAllMocks();
    rawFetchMock.mockResolvedValue({ ok: true, json: () => Promise.resolve({ success: false }) });
    apiFetchMock.mockResolvedValue({ totalSaw: 2, totalPassed: 1, totalFailed: 1 });
    const second = renderHooked({ challenges: 2 });
    await waitFor(() => expect(second.seen.at(-1)?.challengeStats?.totalSaw).toBe(2));
    expect(vi.mocked(apiFetchMock)).toHaveBeenCalledTimes(1);
  });
});
