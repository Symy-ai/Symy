// @vitest-environment happy-dom

import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useGachaQuota } from '../use-gacha-quota';

vi.mock('@/lib/logger', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));

// api-client 是动态 import('@/lib/api-client') — vi.mock 拦截动态导入同样生效
const apiFetchMock = vi.hoisted(() => vi.fn());
vi.mock('@/lib/api-client', () => ({ apiFetch: apiFetchMock }));

async function settle() {
  await act(async () => {});
}

describe('useGachaQuota', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.localStorage.clear();
  });
  afterEach(cleanup);

  it('demo mode reads localStorage-backed daily count (1/day)', async () => {
    const { result } = renderHook(() => useGachaQuota(true));
    await settle();
    expect(result.current.gachaUsedToday).toBe(0);
    expect(result.current.gachaRemaining).toBe(1);
    expect(apiFetchMock).not.toHaveBeenCalled();
  });

  it('logged-in mode loads count and premium flag from the API', async () => {
    apiFetchMock.mockResolvedValue({ count: 2, remaining: 1, isPremium: false });
    const { result } = renderHook(() => useGachaQuota(false));
    await waitFor(() => expect(result.current.gachaUsedToday).toBe(2));
    expect(result.current.gachaRemaining).toBe(1);
    expect(result.current.isGachaPremium).toBe(false);
  });

  it('premium grants unlimited remaining', async () => {
    apiFetchMock.mockResolvedValue({ count: 99, isPremium: true });
    const { result } = renderHook(() => useGachaQuota(false));
    await waitFor(() => expect(result.current.isGachaPremium).toBe(true));
    expect(result.current.gachaRemaining).toBe(Infinity);
  });

  it('fails closed when the limit API is unreachable', async () => {
    apiFetchMock.mockRejectedValue(new TypeError('offline'));
    const { result } = renderHook(() => useGachaQuota(false));
    await waitFor(() => expect(result.current.gachaUsedToday).toBe(3));
    expect(result.current.gachaRemaining).toBe(0);
  });

  it('demo increment persists and prompts auth at the limit', async () => {
    vi.useFakeTimers();
    try {
      const onAuthPrompt = vi.fn();
      const { result } = renderHook(() => useGachaQuota(true, onAuthPrompt));
      await settle();
      await act(async () => { await result.current.incrementGachaCount(); });
      expect(result.current.gachaUsedToday).toBe(1);
      expect(result.current.gachaRemaining).toBe(0);
      await act(async () => { await vi.advanceTimersByTimeAsync(1600); });
      expect(onAuthPrompt).toHaveBeenCalledWith('gacha');
    } finally {
      vi.useRealTimers();
    }
  });

  it('increment prefers the server-reported count', async () => {
    apiFetchMock.mockResolvedValue({ count: 7 });
    const { result } = renderHook(() => useGachaQuota(false));
    await waitFor(() => expect(result.current.gachaUsedToday).toBe(7));
    apiFetchMock.mockResolvedValue({ count: 8, success: true });
    await act(async () => { await result.current.incrementGachaCount(); });
    expect(result.current.gachaUsedToday).toBe(8);
  });
});
