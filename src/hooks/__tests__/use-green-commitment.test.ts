// @vitest-environment happy-dom
import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useGreenCommitment } from '@/hooks/use-green-commitment';
import type { WeeklyGuardEventInput } from '@/lib/weekly-guard-compare';

const apiFetchMock = vi.hoisted(() => vi.fn());
vi.mock('@/lib/api-client', () => ({ apiFetch: apiFetchMock }));
vi.mock('@/lib/logger', () => ({ logger: { warn: vi.fn() } }));
vi.mock('@/hooks/use-hourly-rate', () => ({ useHourlyRate: vi.fn(() => ({ hourlyRate: 20 })) }));

function event(overrides: Partial<WeeklyGuardEventInput>): WeeklyGuardEventInput {
  return { eventType: 'challenge_reward', triggerSource: 'deposit_api', triggerId: null, createdAt: new Date().toISOString(), ...overrides };
}

function commitment(overrides: Record<string, unknown> = {}): WeeklyGuardEventInput {
  return event({
    eventType: 'manual_adjustment',
    metadata: {
      source: 'green_commitment', category: 'food', subject: '咖啡',
      start_key: '2026-01-01', end_key: '2026-01-10', ...overrides,
    },
  });
}

function eventsByType(events: WeeklyGuardEventInput[]) {
  return (url: string) => ({ events: new URL(url).searchParams.get('event_type') === 'manual_adjustment' ? events.filter((item) => item.eventType === 'manual_adjustment') : events.filter((item) => item.eventType === new URL(url).searchParams.get('event_type')) });
}

async function settle() {
  await act(async () => {});
}

describe('useGreenCommitment', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-10T12:00:00'));
  });

  it('waits until chat history is ready before fetching', async () => {
    const { result, rerender } = renderHook(({ ready }: { ready: boolean }) => useGreenCommitment({ isDemo: false, historyReady: ready }), { initialProps: { ready: false } });
    await settle();
    expect(apiFetchMock).not.toHaveBeenCalled();
    expect(result.current.derivation).toBeNull();

    rerender({ ready: true });
    apiFetchMock.mockImplementation((url: string) => Promise.resolve(eventsByType([commitment()])(url)));
    await settle();
    expect(apiFetchMock).toHaveBeenCalledTimes(3);
  });

  it('auto-opens due settlement once history is ready', async () => {
    apiFetchMock.mockImplementation((url: string) => Promise.resolve(eventsByType([commitment()])(url)));
    const { result } = renderHook(() => useGreenCommitment({ isDemo: false, historyReady: true }));
    await settle();

    expect(result.current.open).toBe(true);
    expect(result.current.derivation?.dueSettlement).toMatchObject({
      outcome: 'insufficient', days: 9, hoursReclaimed: 0, refKey: '2026-01-01#2026-01-10',
    });
  });

  it('derives kept settlement from matched completed guards', async () => {
    apiFetchMock.mockImplementation((url: string) => Promise.resolve(eventsByType([
      commitment(),
      event({ eventType: 'challenge_completed', metadata: { category: 'food', savedAmount: 40 } }),
    ])(url)));
    const { result } = renderHook(() => useGreenCommitment({ isDemo: false, historyReady: true }));
    await settle();

    expect(result.current.derivation?.dueSettlement).toMatchObject({ outcome: 'kept', assistCount: 1, hoursReclaimed: 2 });
  });

  it('skips demo mode and exposes manual settlement controls', async () => {
    const { result } = renderHook(() => useGreenCommitment({ isDemo: true, historyReady: true }));
    await settle();

    expect(apiFetchMock).not.toHaveBeenCalled();
    expect(result.current.derivation).toBeNull();
    act(() => result.current.openSettlement());
    expect(result.current.open).toBe(true);
    act(() => result.current.closeSettlement());
    expect(result.current.open).toBe(false);
  });

  it('markSettled clears local due card and reports the settlement event', async () => {
    apiFetchMock.mockImplementation((url: string) => Promise.resolve(eventsByType([commitment()])(url)));
    const { result } = renderHook(() => useGreenCommitment({ isDemo: false, historyReady: true }));
    await settle();

    apiFetchMock.mockClear();
    apiFetchMock.mockResolvedValue(undefined);
    act(() => result.current.markSettled('2026-01-01#2026-01-10', 'kept'));
    expect(result.current.derivation?.dueSettlement).toBeNull();
    expect(apiFetchMock).toHaveBeenCalledWith('/api/buddy/health-events', {
      method: 'POST',
      body: {
        eventType: 'manual_adjustment', triggerSource: 'manual',
        description: 'Green commitment settled (kept) — 2026-01-01#2026-01-10',
        metadata: { source: 'green_commitment_settlement', ref_key: '2026-01-01#2026-01-10', outcome: 'kept' },
      },
    });
  });

  it('silently keeps derivation null when fetch fails', async () => {
    apiFetchMock.mockRejectedValue(new Error('network down'));
    const { result } = renderHook(() => useGreenCommitment({ isDemo: false, historyReady: true }));
    await settle();

    expect(result.current.derivation).toBeNull();
  });
});
