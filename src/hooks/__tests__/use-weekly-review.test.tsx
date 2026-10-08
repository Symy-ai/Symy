// @vitest-environment happy-dom

import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const apiFetchMock = vi.hoisted(() => vi.fn());
const hourlyRateMock = vi.hoisted(() => vi.fn());
vi.mock('@/lib/api-client', () => ({ apiFetch: apiFetchMock }));
vi.mock('@/hooks/use-hourly-rate', () => ({ useHourlyRate: () => ({ hourlyRate: hourlyRateMock() }) }));

import { useWeeklyReview } from '../use-weekly-review';
import type { WeeklyGuardEventInput } from '@/lib/weekly-guard-compare';

const now = new Date('2026-10-08T12:00:00');

function event(eventType: string, createdAt: Date, metadata: Record<string, unknown> = {}, id = `${eventType}-${createdAt.getTime()}`): WeeklyGuardEventInput {
  return { id, eventType, triggerSource: 'challenge', triggerId: `t-${id}`, metadata, createdAt: createdAt.toISOString() };
}

function renderHooked(props: { isDemo?: boolean; historyReady?: boolean } = {}) {
  const args = { isDemo: props.isDemo ?? false, historyReady: props.historyReady ?? true };
  const seen: ReturnType<typeof useWeeklyReview>[] = [];
  function Consumer() {
    seen.push(useWeeklyReview(args));
    return <div data-testid="consumer" />;
  }
  return { ...render(<Consumer />), seen };
}

describe('useWeeklyReview', () => {
  beforeEach(() => {
    cleanup();
    vi.clearAllMocks();
    vi.setSystemTime(now);
    hourlyRateMock.mockReturnValue(20);
  });

  it('fetches all four event types once and auto-opens a due week', async () => {
    const completion = event('challenge_completed', new Date('2026-10-07T10:00:00'), { itemName: 'Drone', amount: 100 });
    apiFetchMock.mockImplementation(async (url: string) => {
      await Promise.resolve();
      const type = new URL(url).searchParams.get('event_type');
      return type === 'challenge_completed' ? { events: [completion] } : { events: [] };
    });
    const view = renderHooked();
    await waitFor(() => expect(view.seen.at(-1)?.derivation?.status).toBe('due'));
    expect(vi.mocked(apiFetchMock)).toHaveBeenCalledTimes(4);
    expect(vi.mocked(apiFetchMock).mock.calls.map(([url]) => new URL(url).searchParams.get('event_type')).sort()).toEqual([
      'challenge_completed', 'challenge_failed', 'challenge_reward', 'manual_adjustment',
    ]);
    expect(view.seen.at(-1)?.open).toBe(true);
    expect(view.seen.at(-1)?.derivation?.candidates[0]).toMatchObject({ key: 't-challenge_completed-1791367200000', itemName: 'Drone' });
  });

  it('derives an empty week without auto-opening', async () => {
    apiFetchMock.mockResolvedValue({ events: [] });
    const view = renderHooked();
    await waitFor(() => expect(view.seen.at(-1)?.derivation?.status).toBe('noData'));
    expect(view.seen.at(-1)?.open).toBe(false);
  });

  it('keeps review closed after completion is already recorded', async () => {
    const completion = event('challenge_completed', new Date('2026-10-07T10:00:00'), { amount: 20 });
    const review = event('manual_adjustment', new Date('2026-10-07T11:00:00'), {
      source: 'weekly_review', week_key: '2026-10-05', rating: 'okay', proud_key: 'p', proud_item: 'Walk',
    });
    apiFetchMock.mockImplementation(async (url: string) => {
      await Promise.resolve();
      const type = new URL(url).searchParams.get('event_type');
      return type === 'challenge_completed' ? { events: [completion] } : type === 'manual_adjustment' ? { events: [review] } : { events: [] };
    });
    const view = renderHooked();
    await waitFor(() => expect(view.seen.at(-1)?.derivation?.status).toBe('reviewed'));
    expect(view.seen.at(-1)?.open).toBe(false);
    expect(view.seen.at(-1)?.derivation?.completed).toEqual({ rating: 'okay', proudKey: 'p', proudLabel: 'Walk' });
  });

  it('does not fetch in demo or before history is ready', async () => {
    renderHooked({ isDemo: true });
    renderHooked({ historyReady: false });
    await waitFor(() => expect(screen.getAllByTestId('consumer')).toHaveLength(2));
    expect(apiFetchMock).not.toHaveBeenCalled();
  });

  it('silently remains empty when event loading fails', async () => {
    apiFetchMock.mockRejectedValue(new Error('history down'));
    const view = renderHooked();
    await waitFor(() => expect(apiFetchMock).toHaveBeenCalledTimes(4));
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(view.seen.at(-1)).toMatchObject({ derivation: null, open: false });
  });

  it('supports manual open, close, and reviewed transitions', async () => {
    apiFetchMock.mockResolvedValue({ events: [] });
    const view = renderHooked({ historyReady: false });
    await waitFor(() => expect(view.seen.at(-1)?.derivation).toBeNull());
    view.seen.at(-1)!.openReview();
    expect(view.seen.at(-1)?.open).toBe(false);
    const due = event('challenge_completed', new Date('2026-10-07T10:00:00'));
    apiFetchMock.mockResolvedValue({ events: [due] });
    const loaded = renderHooked();
    await waitFor(() => expect(loaded.seen.at(-1)?.derivation?.status).toBe('due'));
    act(() => { loaded.seen.at(-1)!.closeReview(); });
    act(() => { loaded.seen.at(-1)!.openReview(); });
    act(() => { loaded.seen.at(-1)!.markReviewed(); });
    // Consumer 快照数组: 每次 render push — 回调后需取最新快照
    expect(loaded.seen.at(-1)?.derivation?.status).toBe('reviewed');
  });
});
