// @vitest-environment happy-dom
import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { apiFetch } from '@/lib/api-client';
import { useGreenImpact } from '@/hooks/use-green-impact';
import { useHourlyRate } from '@/hooks/use-hourly-rate';

vi.mock('@/lib/api-client', () => ({ apiFetch: vi.fn() }));
vi.mock('@/lib/logger', () => ({ logger: { warn: vi.fn() } }));
vi.mock('@/hooks/use-hourly-rate', () => ({ useHourlyRate: vi.fn(() => ({ hourlyRate: 20, rateIsDefault: false, setHourlyRate: async () => { await Promise.resolve(); }, isLoading: false })) }));

async function settle() {
  await act(async () => {});
}

describe('useGreenImpact', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('loads and aggregates impact with the real hourly rate', async () => {
    vi.mocked(apiFetch).mockResolvedValue({ challengesCompleted: 4, totalSaved: 100, streak: 6.9 });
    const { result } = renderHook(() => useGreenImpact());
    await settle();

    expect(result.current).toEqual({ data: { itemsSaved: 4, hoursReclaimed: 5, currentStreak: 6 }, isLoading: false, error: null });
  });

  it('uses the fallback rate when hourly rate is invalid', async () => {
    vi.mocked(apiFetch).mockResolvedValue({ challengesCompleted: 1, totalSaved: 50, streak: 2 });
    vi.mocked(useHourlyRate).mockImplementation(() => ({ hourlyRate: 0, rateIsDefault: false, setHourlyRate: async () => { await Promise.resolve(); }, isLoading: false }));
    const { result } = renderHook(() => useGreenImpact());
    await settle();

    expect(result.current.data?.hoursReclaimed).toBe(2);
  });

  it('normalizes invalid totals and streak values', async () => {
    vi.mocked(apiFetch).mockResolvedValue({ challengesCompleted: 2, totalSaved: -10, streak: Number.NaN });
    const { result } = renderHook(() => useGreenImpact());
    await settle();

    expect(result.current.data).toEqual({ itemsSaved: 2, hoursReclaimed: 0, currentStreak: 0 });
  });

  it('keeps zero impact from an empty state', async () => {
    vi.mocked(apiFetch).mockResolvedValue({});
    const { result } = renderHook(() => useGreenImpact());
    await settle();

    expect(result.current.data).toEqual({ itemsSaved: 0, hoursReclaimed: 0, currentStreak: 0 });
  });

  it('exposes an error and clears data on failure', async () => {
    vi.mocked(apiFetch).mockRejectedValue(new Error('network down'));
    const { result } = renderHook(() => useGreenImpact());
    await settle();

    expect(result.current).toEqual({ data: null, isLoading: false, error: 'network down' });
  });
});
