// @vitest-environment happy-dom

import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { apiFetch } from '@/lib/api-client';
import { logger } from '@/lib/logger';
import { useGuardStyleProfile } from '@/hooks/use-guard-style-profile';
import type { GuardStyleProfile } from '@/lib/guard-style-profile';

vi.mock('@/lib/api-client', () => ({ apiFetch: vi.fn() }));
vi.mock('@/lib/logger', () => ({ logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn() } }));

const aggregateMock = vi.hoisted(() => vi.fn());
vi.mock('@/lib/guard-style-profile', () => ({
  aggregateGuardStyleProfile: aggregateMock,
}));

function page(events: Array<Record<string, unknown>>) {
  return { events };
}

async function settle() {
  await act(async () => {});
}

describe('useGuardStyleProfile', () => {
  beforeEach(() => {
    vi.mocked(apiFetch).mockReset();
    vi.clearAllMocks();
  });
  afterEach(cleanup);

  it('loads both event rails and aggregates them together', async () => {
    aggregateMock.mockReturnValue({ status: 'insufficient' } as GuardStyleProfile);
    vi.mocked(apiFetch).mockResolvedValue(page([
      { eventType: 'challenge_completed', triggerId: null, metadata: { savedAmount: 30 }, createdAt: '2026-10-01T10:00:00' },
    ]));

    const { result } = renderHook(() => useGuardStyleProfile());
    await settle();

    expect(vi.mocked(apiFetch).mock.calls.length).toBe(2);
    const urls = vi.mocked(apiFetch).mock.calls.map((c) => String(c[0]));
    expect(urls.some((u) => u.includes('challenge_completed'))).toBe(true);
    expect(urls.some((u) => u.includes('mindful_recovery'))).toBe(true);
    expect(aggregateMock).toHaveBeenCalledTimes(1);
    expect(result.current.isLoading).toBe(false);
  });

  it('sums private saved estimates from the three rails when status ok', async () => {
    aggregateMock.mockReturnValue({ status: 'ok' } as unknown as GuardStyleProfile);
    vi.mocked(apiFetch).mockImplementation(async (url: unknown) => {
      await Promise.resolve();
      const u = String(url);
      if (u.includes('challenge_completed')) {
        return page([
          { eventType: 'challenge_completed', triggerId: null, metadata: { savedAmount: 30 }, createdAt: '2026-10-01T10:00:00' },
          { eventType: 'challenge_completed', triggerId: null, metadata: { savedAmount: 'bad' }, createdAt: '2026-10-01T11:00:00' },
          { eventType: 'challenge_completed', triggerId: null, metadata: { savedAmount: -5 }, createdAt: '2026-10-01T12:00:00' },
        ]);
      }
      return page([
        { eventType: 'mindful_recovery', triggerId: null, metadata: { kind: 'green_alt_adoption', estSaved: 12 }, createdAt: '2026-10-02T10:00:00' },
        { eventType: 'mindful_recovery', triggerId: null, metadata: { kind: 'reuse_adoption', estSaved: 8 }, createdAt: '2026-10-03T10:00:00' },
      ]);
    });

    const { result } = renderHook(() => useGuardStyleProfile());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    // 非法金额(字符串/负数)不计, 合法才累计
    expect(result.current.savedEstimates).toEqual({ guard: 30, alt: 12, reuse: 8 });
  });

  it('keeps zeroed saved estimates when sample insufficient', async () => {
    aggregateMock.mockReturnValue({ status: 'insufficient' } as GuardStyleProfile);
    vi.mocked(apiFetch).mockResolvedValue(page([]));

    const { result } = renderHook(() => useGuardStyleProfile());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.savedEstimates).toEqual({ guard: 0, alt: 0, reuse: 0 });
  });

  it('silently degrades to null profile on fetch failure', async () => {
    vi.mocked(apiFetch).mockRejectedValue(new TypeError('network dropped'));

    const { result } = renderHook(() => useGuardStyleProfile());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.profile).toBeNull();
    expect(logger.warn).toHaveBeenCalled();
  });

  it('paginates with a before cursor until a short page', async () => {
    aggregateMock.mockReturnValue({ status: 'insufficient' } as GuardStyleProfile);
    vi.mocked(apiFetch)
      .mockResolvedValueOnce(page(
        Array.from({ length: 100 }, (_, i) => ({ eventType: 'challenge_completed', triggerId: null, metadata: null, createdAt: `2026-09-30T10:00:${String(i % 60).padStart(2, '0')}` })),
      ))
      .mockResolvedValueOnce(page([
        { eventType: 'challenge_completed', triggerId: null, metadata: null, createdAt: '2026-09-20T10:00:00' },
      ]))
      .mockResolvedValue(page([]));

    renderHook(() => useGuardStyleProfile());
    // challenge 轨: 满 100 页 -> 带 cursor 续 1 页(短页止); recovery 轨: 1 页
    await waitFor(() => expect(vi.mocked(apiFetch).mock.calls.length).toBe(3));

    const challengeUrls = vi.mocked(apiFetch).mock.calls.map((c) => String(c[0])).filter((u) => u.includes('challenge_completed'));
    expect(challengeUrls.length).toBe(2);
    expect(challengeUrls[1]).toContain('before=');
  });
});
