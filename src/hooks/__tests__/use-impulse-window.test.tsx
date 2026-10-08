// @vitest-environment happy-dom

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, renderHook, waitFor } from '@testing-library/react';
import { apiFetch } from '@/lib/api-client';
import { NIGHT_WINDOW_OPTIONS } from '@/lib/night-window';
import { useImpulseWindow } from '../../hooks/use-impulse-window';

const state = vi.hoisted(() => ({
  user: { id: 'u-1' } as { id: string } | null,
  nightWindow: 'standard' as keyof typeof NIGHT_WINDOW_OPTIONS,
}));

vi.mock('@/components/auth/auth-provider', () => ({ useAuth: () => ({ user: state.user }) }));
vi.mock('@/hooks/use-night-window', () => ({
  useNightWindow: () => ({ nightWindow: state.nightWindow }),
}));
vi.mock('@/lib/api-client', () => ({ apiFetch: vi.fn() }));
vi.mock('@/lib/logger', () => ({ logger: { warn: vi.fn(), info: vi.fn() } }));

describe('useImpulseWindow', () => {
  beforeEach(() => {
    cleanup();
    state.user = { id: 'u-1' };
    state.nightWindow = 'standard';
    vi.mocked(apiFetch).mockReset();
  });

  it('loads a partial page and aggregates it with configured night hours', async () => {
    vi.mocked(apiFetch).mockResolvedValue({ events: [{ createdAt: '2026-10-01T23:00:00' }] });
    const { result } = renderHook(() => useImpulseWindow());
    expect(result.current.isLoading).toBe(true);
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(apiFetch).toHaveBeenCalledWith('http://localhost:3000/api/buddy/health-events?event_type=challenge_reward&limit=100');
    expect(result.current.summary).toEqual({
      status: 'insufficient', topWindow: null, topShare: 0, topCount: 0,
      total: 1, dominant: false, counts: { dawn: 0, daytime: 0, evening: 0, lateNight: 1 },
    });
  });

  it('passes no events when API returns none', async () => {
    vi.mocked(apiFetch).mockResolvedValue({ events: [] });
    const { result } = renderHook(() => useImpulseWindow());
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.summary?.total).toBe(0);
    expect(result.current.isLoading).toBe(false);
  });

  it('stops after a short page without requesting a cursor', async () => {
    vi.mocked(apiFetch).mockResolvedValue({ events: [{ createdAt: '2026-10-01T10:00:00' }] });
    renderHook(() => useImpulseWindow());
    await waitFor(() => expect(apiFetch).toHaveBeenCalledTimes(1));
    expect(vi.mocked(apiFetch).mock.calls[0][0]).not.toContain('before=');
  });

  it('follows oldest-item cursors across full pages', async () => {
    const first = Array.from({ length: 100 }, (_, index) => ({
      createdAt: `2026-10-01T${String(23 - Math.floor(index / 5)).padStart(2, '0')}:00:00`,
    }));
    const second = [{ createdAt: '2026-10-01T09:00:00' }];
    vi.mocked(apiFetch)
      .mockResolvedValueOnce({ events: first })
      .mockResolvedValueOnce({ events: second });
    const { result } = renderHook(() => useImpulseWindow());
    await waitFor(() => expect(apiFetch).toHaveBeenCalledTimes(2));
    expect(vi.mocked(apiFetch).mock.calls[1][0]).toContain('before=2026-10-01T04%3A00%3A00');
    await waitFor(() => expect(result.current.summary?.total).toBe(101));
  });

  it('breaks when a full page repeats the same cursor', async () => {
    const page = Array.from({ length: 100 }, () => ({ createdAt: '2026-10-01T10:00:00' }));
    vi.mocked(apiFetch).mockResolvedValue({ events: page });
    const { result } = renderHook(() => useImpulseWindow());
    await waitFor(() => expect(apiFetch).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(result.current.summary?.total).toBe(200));
  });

  it('caps pagination at twenty pages', async () => {
    let pageNumber = 0;
    vi.mocked(apiFetch).mockImplementation(async () => {
      pageNumber += 1;
      await Promise.resolve();
      return { events: Array.from({ length: 100 }, (_, index) => ({
        createdAt: `2026-09-${String(20 - pageNumber).padStart(2, '0')}T${String(index % 24).padStart(2, '0')}:00:00`,
      })) };
    });
    const { result } = renderHook(() => useImpulseWindow());
    await waitFor(() => expect(apiFetch).toHaveBeenCalledTimes(20));
    await waitFor(() => expect(result.current.summary?.total).toBe(1900));
  });

  it('degrades to an empty summary and loading false on fetch failure', async () => {
    vi.mocked(apiFetch).mockRejectedValue(new Error('offline'));
    const { result } = renderHook(() => useImpulseWindow());
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.summary).toBeNull();
  });

  it('skips loading when disabled or signed out', () => {
    state.user = null;
    const signedOut = renderHook(() => useImpulseWindow());
    expect(signedOut.result.current).toEqual({ summary: null, isLoading: false });
    state.user = { id: 'u-1' };
    const disabled = renderHook(() => useImpulseWindow({ enabled: false }));
    expect(disabled.result.current).toEqual({ summary: null, isLoading: false });
    expect(apiFetch).not.toHaveBeenCalled();
  });
});
