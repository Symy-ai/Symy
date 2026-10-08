// @vitest-environment happy-dom

import { cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { apiFetch } from '@/lib/api-client';
import { logger } from '@/lib/logger';
import { useActiveGuards } from '@/hooks/use-active-guards';
import type { ActiveGuardsEventInput } from '@/lib/active-guards';

const state = vi.hoisted(() => ({ user: { id: 'u-1' } as { id: string } | null }));

vi.mock('@/components/auth/auth-provider', () => ({ useAuth: () => ({ user: state.user }) }));
vi.mock('@/lib/api-client', () => ({ apiFetch: vi.fn() }));
vi.mock('@/lib/logger', () => ({ logger: { warn: vi.fn() } }));

type Event = ActiveGuardsEventInput;

const event = (id: string, eventType: string, createdAt: string, metadata: Record<string, unknown> | null = null): Event => ({
  id,
  eventType,
  triggerId: id,
  metadata,
  createdAt,
});

function mockApi(challenge: { challenge?: { id: string; itemName: string; amount: number | null; createdAt: string } | null }, events: Event[]) {
    vi.mocked(apiFetch).mockImplementation(async (url: string) => {
    await Promise.resolve();
    if (url === '/api/challenge/active') return challenge;
    const eventType = new URL(url).searchParams.get('event_type');
    return { events: events.filter((item) => item.eventType === eventType) };
  });
}

describe('useActiveGuards', () => {
  beforeEach(() => {
    cleanup();
    state.user = { id: 'u-1' };
    vi.mocked(apiFetch).mockReset();
    vi.mocked(logger.warn).mockClear();
    vi.setSystemTime(new Date(2026, 9, 8, 12, 0, 0));
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it('loads active challenge, commitment, and cooldown guards', async () => {
    mockApi(
      { challenge: { id: 'c-1', itemName: 'Camera', amount: 180, createdAt: '2026-10-08T04:00:00' } },
      [
        event('a-1', 'manual_adjustment', '2026-10-08T09:00:00', { source: 'green_commitment', start_key: '2026-10-08', end_key: '2026-10-10', subject: 'Coffee', savedAmount: 20 }),
        event('done-1', 'challenge_completed', '2026-10-07T11:00:00', { itemName: 'Camera' }),
      ],
    );
    const { result } = renderHook(() => useActiveGuards({
      cooldown: { subject: 'Headphones', askedAt: Date.now() - 20 * 3600 * 1000, dueAt: Date.now() + 4 * 3600 * 1000, amount: 99 },
    }));

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.summary).toMatchObject({
      status: 'ok',
      totalCount: 3,
      challenges: [{ kind: 'challenge', id: 'c-1', itemName: 'Camera' }],
      commitments: [{ kind: 'commitment', id: '2026-10-08#2026-10-10' }],
      cooldowns: [{ kind: 'cooldown', subject: 'Headphones', hoursLeft: 4 }],
    });
  });

  it('returns an empty summary when all sources are empty', async () => {
    mockApi({ challenge: null }, []);
    const { result } = renderHook(() => useActiveGuards());

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.summary).toMatchObject({ status: 'empty', totalCount: 0 });
    expect(vi.mocked(apiFetch)).toHaveBeenCalledTimes(3);
  });

  it('silently degrades to null on fetch failure', async () => {
    vi.mocked(apiFetch).mockRejectedValue(new Error('offline'));
    const { result } = renderHook(() => useActiveGuards());

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.summary).toBeNull();
    expect(logger.warn).toHaveBeenCalledTimes(1);
  });

  it('does not fetch when disabled or signed out', () => {
    state.user = null;
    const { result } = renderHook(() => useActiveGuards({ enabled: true }));

    expect(result.current).toEqual({ summary: null, isLoading: false });
    expect(apiFetch).not.toHaveBeenCalled();
  });
});
