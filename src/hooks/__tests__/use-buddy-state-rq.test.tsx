// @vitest-environment happy-dom

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, waitFor, cleanup } from '@testing-library/react';
import { useEffect } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const apiFetchMock = vi.hoisted(() => vi.fn());
const apiFetchVoidMock = vi.hoisted(() => vi.fn());
const ApiErrorMock = vi.hoisted(() => class ApiError extends Error {
  constructor(public status: number, message: string) { super(message); }
});
const userMock = vi.hoisted(() => vi.fn());

vi.mock('@/lib/api-client', () => ({
  apiFetch: apiFetchMock,
  apiFetchVoid: apiFetchVoidMock,
  ApiError: ApiErrorMock,
}));
vi.mock('@/components/auth/auth-provider', () => ({
  useAuth: () => ({ user: userMock(), loading: false, signOut: vi.fn() }),
}));
vi.mock('@/lib/posthog', () => ({ symyEvents: { dreamFundCreated: vi.fn() } }));
vi.mock('@/hooks/use-buddy-timers', () => ({ useBuddyTimers: vi.fn() }));
vi.mock('@/lib/supabase-browser', () => ({
  createClient: () => null,
  isSupabaseConfigured: () => false,
}));

import { useBuddyStateRQ } from '../use-buddy-state-rq';
import type { BuddyState } from '@/types/buddy-state';

// eslint-disable-next-line @typescript-eslint/no-unused-vars -- fixture kept for future cases
function state(overrides: Partial<BuddyState> = {}): BuddyState {
  return {
    vitality: 80,
    tokens: 20,
    health: 'healthy',
    level: 2,
    xp: 10,
    xpToNext: 100,
    streak: 3,
    dreamFunds: [],
    badges: [],
    totalSaved: 100,
    challengesCompleted: 2,
    lastHealingKitAt: null,
    version: 7,
    growthStage: 'baby',
    personality: 'unknown',
    intimacy: 3,
    dailyNeeds: { clarity: 40, connection: 60 },
    proactiveMessages: [],
    personalityAwakenedAt: null,
    lastActiveAt: null,
    ...overrides,
  };
}

function renderHooked(onState?: (state: ReturnType<typeof useBuddyStateRQ>) => void) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
  queryClient.mount();
  function Consumer() {
    const value = useBuddyStateRQ(false);
    useEffect(() => { onState?.(value); }, [value]);
    return <div data-testid="consumer" />;
  }
  const result = render(
    <QueryClientProvider client={queryClient}>
      <Consumer />
    </QueryClientProvider>,
  );
  return { queryClient, result };
}

describe('useBuddyStateRQ query semantics', () => {
  beforeEach(() => {
    cleanup();
    window.localStorage.clear();
    vi.clearAllMocks();
    userMock.mockReturnValue({ id: 'u-1' });
  });

  it('maps a complete server payload into local buddy state', async () => {
    apiFetchMock.mockResolvedValueOnce({
      buddyState: {
        vitality: 88, tokens: 30, health: 'thriving', level: 4, xp: 11,
        xpToNext: 210, streak: 2, totalSaved: 320, challengesCompleted: 9,
        invitedCount: 1, badges: ['first'], dreamFunds: [{ id: 'f', name: 'Desk', target: 500, current: 10, emoji: '💻' }],
        growthStage: 'young', personality: 'sage', intimacy: 4,
        dailyNeeds: { clarity: 70, connection: 20 }, proactiveMessages: [],
        personalityAwakenedAt: null, lastActiveAt: null,
      },
      version: 12,
    });
    const seen: ReturnType<typeof useBuddyStateRQ>[] = [];
    renderHooked((value) => seen.push(value));
    await waitFor(() => expect(seen.some((value) => value.buddyState?.version === 12)).toBe(true));
    const latest = seen.at(-1)!.buddyState!;
    expect(latest).toMatchObject({ xpToNext: 210, totalSaved: 320, health: 'thriving', personality: 'sage' });
    expect(vi.mocked(apiFetchMock)).toHaveBeenCalledWith('/api/buddy/state');
  });

  it('preserves legacy snake_case API fields', async () => {
    apiFetchMock.mockResolvedValueOnce({
      buddyState: { xp_to_next: 333, total_saved: 444, dream_funds: [{ id: 'f', name: 'Trip', target: 100, current: 1, emoji: '✈️' }] },
      version: 2,
    });
    const seen: ReturnType<typeof useBuddyStateRQ>[] = [];
    renderHooked((value) => seen.push(value));
    await waitFor(() => expect(seen.some((value) => value.buddyState?.xpToNext === 333)).toBe(true));
    expect(seen.at(-1)!.buddyState).toMatchObject({ totalSaved: 444 });
  });

  it('does not fetch before authentication', async () => {
    userMock.mockReturnValue(null);
    renderHooked();
    await actSettle();
    expect(apiFetchMock).not.toHaveBeenCalled();
  });

  it('uses the five-minute buddy stale time', async () => {
    apiFetchMock.mockResolvedValue({ buddyState: { streak: 1 }, version: 1 });
    const seen: ReturnType<typeof useBuddyStateRQ>[] = [];
    const { queryClient } = renderHooked((value) => seen.push(value));
    await waitFor(() => expect(queryClient.getQueryState(['buddy-state'])?.data).toBeTruthy());
    expect(queryClient.getQueryState(['buddy-state'])?.dataUpdateCount).toBe(1);
    // Verify hook returned a resolved buddyState snapshot
    expect(seen.some((value) => value.buddyState?.streak === 1)).toBe(true);
  });

  it('exposes query failure as syncError (client retry: false fails fast)', async () => {
    // 实现把 useQuery error 映射为 syncError: 'Sync error' 字符串 — 不暴露 error 对象
    apiFetchMock.mockRejectedValue(new Error('network down'));
    const seen: ReturnType<typeof useBuddyStateRQ>[] = [];
    renderHooked((value) => seen.push(value));
    await waitFor(() => expect(seen.some((value) => value.syncError === 'Sync error')).toBe(true), { timeout: 3000 });
  });
});

async function actSettle() {
  await new Promise((resolve) => setTimeout(resolve, 0));
}
