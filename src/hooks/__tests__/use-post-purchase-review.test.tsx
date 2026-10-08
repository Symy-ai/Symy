// @vitest-environment happy-dom

import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { apiFetch } from '@/lib/api-client';
import { logger } from '@/lib/logger';
import { usePostPurchaseReview } from '@/hooks/use-post-purchase-review';
import type { PostPurchaseEventInput } from '@/lib/post-purchase-review';

vi.mock('@/lib/api-client', () => ({ apiFetch: vi.fn() }));
vi.mock('@/lib/logger', () => ({ logger: { warn: vi.fn() } }));

type Event = PostPurchaseEventInput;

const failed = (id: string, createdAt: string, itemName = 'Headphones'): Event => ({
  id,
  eventType: 'challenge_failed',
  triggerSource: null,
  triggerId: id,
  metadata: { itemName },
  createdAt,
});

const review = (id: string, key: string, rating: string): Event => ({
  id,
  eventType: 'manual_adjustment',
  triggerSource: null,
  triggerId: id,
  metadata: { source: 'post_purchase_review', review_key: key, rating },
  createdAt: '2026-10-08T10:00:00Z',
});

function mockEvents(events: Event[]) {
  vi.mocked(apiFetch).mockImplementation(async (url: string) => {
    await Promise.resolve();
    return { events: events.filter((item) => item.eventType === new URL(url).searchParams.get('event_type')) };
  });
}

function settle() {
  return act(async () => {
    await Promise.resolve();
  });
}

describe('usePostPurchaseReview', () => {
  beforeEach(() => {
    cleanup();
    vi.mocked(apiFetch).mockReset();
    vi.mocked(logger.warn).mockClear();
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 9, 8, 12, 0, 0));
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it('derives one review due within the one-to-seven-day window', async () => {
    mockEvents([
      failed('too-new', '2026-10-08T10:00:00Z', 'Book'),
      failed('too-old', '2026-09-20T10:00:00Z', 'Bike'),
      failed('due', '2026-10-06T10:00:00Z', 'Headphones'),
    ]);
    const { result } = renderHook(() => usePostPurchaseReview({ isDemo: false, historyReady: true }));
    await settle();

    expect(result.current.dueReview).toEqual({
      key: 'due',
      itemName: 'Headphones',
      failedAt: '2026-10-06T10:00:00Z',
    });
    expect(result.current.reviewSummary).toEqual({ worth: 0, ok: 0, regret: 0, total: 0 });
    expect(apiFetch).toHaveBeenCalledTimes(2);
  });

  it('suppresses reviewed purchases and derives their summary', async () => {
    mockEvents([
      failed('reviewed', '2026-10-06T10:00:00Z'),
      review('r-1', 'reviewed', 'worth'),
      review('r-1', 'reviewed', 'worth'),
      review('r-2', 'other', 'regret'),
    ]);
    const { result } = renderHook(() => usePostPurchaseReview({ isDemo: false, historyReady: true }));
    await settle();

    expect(result.current.dueReview).toBeNull();
    expect(result.current.reviewSummary).toEqual({ worth: 1, ok: 0, regret: 1, total: 2 });
  });

  it('waits for history and derives only once', async () => {
    const { result, rerender } = renderHook(
      props => usePostPurchaseReview({ isDemo: false, historyReady: props.historyReady }),
      { initialProps: { historyReady: false } },
    );
    expect(apiFetch).not.toHaveBeenCalled();

    rerender({ historyReady: true });
    await Promise.resolve();
    act(() => undefined);
    act(() => undefined);
    expect(apiFetch).toHaveBeenCalledTimes(2);
    rerender({ historyReady: false });
    expect(apiFetch).toHaveBeenCalledTimes(2);
    expect(result.current.dueReview).toBeNull();
  });

  it('does not fetch in demo mode', () => {
    renderHook(() => usePostPurchaseReview({ isDemo: true, historyReady: true }));
    expect(apiFetch).not.toHaveBeenCalled();
  });

  it('silently degrades when loading fails', async () => {
    vi.mocked(apiFetch).mockRejectedValue(new Error('offline'));
    const { result } = renderHook(() => usePostPurchaseReview({ isDemo: false, historyReady: true }));
    await settle();

    expect(result.current.dueReview).toBeNull();
    expect(result.current.reviewSummary).toEqual({ worth: 0, ok: 0, regret: 0, total: 0 });
    expect(logger.warn).toHaveBeenCalledTimes(1);
  });

  it('records a rating locally and closes the review card', async () => {
    mockEvents([failed('due', '2026-10-06T10:00:00Z')]);
    const { result } = renderHook(() => usePostPurchaseReview({ isDemo: false, historyReady: true }));
    await settle();

    act(() => result.current.recordReview('worth'));
    expect(result.current.dueReview).toBeNull();
    expect(result.current.reviewSummary).toEqual({ worth: 1, ok: 0, regret: 0, total: 1 });
  });
});
