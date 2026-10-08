// @vitest-environment happy-dom
import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { apiFetch } from '@/lib/api-client';
import { useGreenAltAdoption } from '@/hooks/use-green-alt-adoption';

vi.mock('@/lib/api-client', () => ({ apiFetch: vi.fn() }));
vi.mock('@/lib/logger', () => ({ logger: { warn: vi.fn() } }));

async function settle() {
  await act(async () => {});
}

describe('useGreenAltAdoption', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('loads a finite count', async () => {
    vi.mocked(apiFetch).mockResolvedValue({ total: 3 });
    const { result } = renderHook(() => useGreenAltAdoption());
    await settle();

    expect(vi.mocked(apiFetch)).toHaveBeenCalledWith('/api/green-alt/adoption');
    expect(result.current.total).toBe(3);
  });

  it('keeps zero for an empty response', async () => {
    vi.mocked(apiFetch).mockResolvedValue({});
    const { result } = renderHook(() => useGreenAltAdoption());
    await settle();

    expect(result.current.total).toBe(0);
  });

  it('floors positive fractional counts', async () => {
    vi.mocked(apiFetch).mockResolvedValue({ total: 3.9 });
    const { result } = renderHook(() => useGreenAltAdoption());
    await settle();

    expect(result.current.total).toBe(3);
  });

  it('rejects negative and non-finite counts', async () => {
    vi.mocked(apiFetch)
      .mockResolvedValueOnce({ total: -1 })
      .mockResolvedValueOnce({ total: Number.NaN });
    const first = renderHook(() => useGreenAltAdoption());
    await settle();
    const second = renderHook(() => useGreenAltAdoption());
    await settle();

    expect(first.result.current.total).toBe(0);
    expect(second.result.current.total).toBe(0);
  });

  it('degrades to zero and logs on fetch failure', async () => {
    vi.mocked(apiFetch).mockRejectedValue(new Error('network down'));
    const { result } = renderHook(() => useGreenAltAdoption());
    await settle();

    expect(result.current.total).toBe(0);
  });
});
