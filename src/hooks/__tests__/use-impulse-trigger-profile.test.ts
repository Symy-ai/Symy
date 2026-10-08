// @vitest-environment happy-dom

import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { apiFetch } from '@/lib/api-client';
import { logger } from '@/lib/logger';
import { useImpulseTriggerProfile } from '@/hooks/use-impulse-trigger-profile';
import type { ImpulseTriggerProfile } from '@/lib/impulse-trigger-profile';

vi.mock('@/lib/api-client', () => ({ apiFetch: vi.fn() }));
vi.mock('@/lib/logger', () => ({ logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn() } }));

const aggregateMock = vi.hoisted(() => vi.fn());
vi.mock('@/lib/impulse-trigger-profile', () => ({
  aggregateImpulseTriggerProfile: aggregateMock,
}));

function page(events: Array<Record<string, unknown>>) {
  return { events };
}

async function settle() {
  await act(async () => {});
}

describe('useImpulseTriggerProfile', () => {
  beforeEach(() => {
    vi.mocked(apiFetch).mockReset();
    vi.clearAllMocks();
  });
  afterEach(cleanup);

  it('fetches challenge_completed events only and aggregates them', async () => {
    aggregateMock.mockReturnValue({ status: 'insufficient' } as ImpulseTriggerProfile);
    vi.mocked(apiFetch).mockResolvedValue(page([
      { metadata: { savedAmount: 30 }, createdAt: '2026-10-01T10:00:00' },
    ]));

    const { result } = renderHook(() => useImpulseTriggerProfile());
    await settle();

    expect(vi.mocked(apiFetch)).toHaveBeenCalledTimes(1);
    expect(String(vi.mocked(apiFetch).mock.calls[0][0])).toContain('event_type=challenge_completed');
    expect(aggregateMock).toHaveBeenCalledTimes(1);
    expect(result.current.isLoading).toBe(false);
  });

  it('propagates the aggregate result into profile state', async () => {
    const fake: ImpulseTriggerProfile = { status: 'ok' } as unknown as ImpulseTriggerProfile;
    aggregateMock.mockReturnValue(fake);
    vi.mocked(apiFetch).mockResolvedValue(page([
      { metadata: { trigger: 'sale' }, createdAt: '2026-10-01T10:00:00' },
      { metadata: { trigger: 'fatigue' }, createdAt: '2026-10-02T10:00:00' },
    ]));

    const { result } = renderHook(() => useImpulseTriggerProfile());
    await waitFor(() => expect(result.current.profile).toBe(fake));
    expect(result.current.isLoading).toBe(false);
  });

  it('stops paging on a short page without a cursor param', async () => {
    aggregateMock.mockReturnValue({ status: 'insufficient' } as ImpulseTriggerProfile);
    vi.mocked(apiFetch).mockResolvedValue(page([
      { metadata: null, createdAt: '2026-10-01T10:00:00' },
    ]));

    renderHook(() => useImpulseTriggerProfile());
    await settle();

    expect(vi.mocked(apiFetch)).toHaveBeenCalledTimes(1);
    expect(String(vi.mocked(apiFetch).mock.calls[0][0])).not.toContain('before=');
  });

  it('caps pagination at MAX_EVENTS=500 (5 full pages) before the 20-page loop cap', async () => {
    // 数学事实锚定: 100/页 × 5 = MAX_EVENTS(500) — 事件上限先于循环页数上限触发
    aggregateMock.mockReturnValue({ status: 'insufficient' } as ImpulseTriggerProfile);
    let call = 0;
    vi.mocked(apiFetch).mockImplementation(async () => {
      await Promise.resolve();
      call += 1;
      // 每页最早事件严格早于上一页 — cursor 恒前进, 只有 MAX_PAGES 能停
      return page(Array.from({ length: 100 }, (_, i) => ({
        metadata: null,
        createdAt: `2026-${String(9 - call).padStart(2, '0')}-01T${String(i % 24).padStart(2, '0')}:${String(i % 60).padStart(2, '0')}:00`,
      })));
    });

    renderHook(() => useImpulseTriggerProfile());
    await waitFor(() => expect(vi.mocked(apiFetch).mock.calls.length).toBe(5), { timeout: 4000 });
  });

  it('silently degrades to null profile on failure', async () => {
    vi.mocked(apiFetch).mockRejectedValue(new TypeError('network dropped'));

    const { result } = renderHook(() => useImpulseTriggerProfile());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.profile).toBeNull();
    expect(logger.warn).toHaveBeenCalled();
  });
});
