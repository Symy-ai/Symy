// @vitest-environment happy-dom

import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useGuardWinRate } from '@/hooks/use-guard-win-rate';

const apiFetchMock = vi.hoisted(() => vi.fn());
const loggerWarnMock = vi.hoisted(() => vi.fn());

vi.mock('@/lib/api-client', () => ({ apiFetch: apiFetchMock }));
vi.mock('@/lib/logger', () => ({ logger: { warn: loggerWarnMock } }));

type Event = {
  id: string;
  eventType: string;
  triggerSource: string | null;
  triggerId: string | null;
  metadata?: Record<string, unknown> | null;
  createdAt: string;
};

const event = (id: string, eventType: string, createdAt: string, metadata: Record<string, unknown> | null = null): Event => ({
  id,
  eventType,
  triggerSource: eventType === 'challenge_reward' ? 'deposit_api' : null,
  triggerId: id,
  metadata,
  createdAt,
});

const mockEvents = (events: Event[]) =>
  apiFetchMock.mockImplementation((url: string) => {
    const type = new URL(url).searchParams.get('event_type');
    return { events: events.filter((item) => item.eventType === type) };
  });

async function settle() {
  await act(async () => {});
}

describe('useGuardWinRate', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 0, 6, 12, 0, 0));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('成功聚合胜率、连胜与转存金额', async () => {
    mockEvents([
      ...[6, 7, 8].map((index) => event(`pass-${index}`, 'challenge_completed', `2026-01-${String(index).padStart(2, '0')}T10:00:00`, { savedAmount: 10 })),
      ...[1, 2].map((index) => event(`fail-${index}`, 'challenge_failed', `2026-01-${String(index).padStart(2, '0')}T11:00:00`)),
      event('reward-1', 'challenge_reward', '2026-01-06T12:00:00', { source: 'deposit', amount: 66 }),
    ]);
    const { result } = renderHook(() => useGuardWinRate());
    expect(result.current.isLoading).toBe(true);
    await settle();

    expect(result.current).toMatchObject({
      isLoading: false,
      summary: { status: 'ok', settled: 5, passed: 3, abandoned: 2, deposited: 1, winRate: 0.6, streakDays: 3, guardedAmount: 66 },
    });
    expect(apiFetchMock).toHaveBeenCalledTimes(3);
  });

  it('样本不足时不伪造胜率结论', async () => {
    mockEvents([
      event('pass-1', 'challenge_completed', '2026-01-01T10:00:00'),
      event('fail-1', 'challenge_failed', '2026-01-01T11:00:00'),
    ]);
    const { result } = renderHook(() => useGuardWinRate());
    await settle();

    expect(result.current.summary).toMatchObject({ status: 'insufficient', settled: 2, passed: 1, abandoned: 1, winRate: 0, streakDays: 0 });
  });

  it('零分母空数据返回 insufficient 而非 0 胜率', async () => {
    apiFetchMock.mockResolvedValue({ events: [] });
    const { result } = renderHook(() => useGuardWinRate());
    await settle();

    expect(result.current.summary).toMatchObject({ status: 'insufficient', settled: 0, passed: 0, abandoned: 0, winRate: 0, guardedAmount: 0 });
  });

  it('同 triggerId 事件去重且无效转存不入账', async () => {
    mockEvents([
      event('pass-1', 'challenge_completed', '2026-01-01T10:00:00'),
      event('pass-1', 'challenge_completed', '2026-01-02T10:00:00'),
      event('reward-bad', 'challenge_reward', '2026-01-01T12:00:00', { source: 'other', amount: 999 }),
    ]);
    const { result } = renderHook(() => useGuardWinRate());
    await settle();

    expect(result.current.summary).toMatchObject({ settled: 1, passed: 1, deposited: 0, guardedAmount: 0 });
  });

  it('加载失败静默降级为 null', async () => {
    apiFetchMock.mockRejectedValue(new Error('network down'));
    const { result } = renderHook(() => useGuardWinRate());
    await settle();

    expect(result.current).toMatchObject({ isLoading: false, summary: null });
    expect(loggerWarnMock).toHaveBeenCalledTimes(1);
  });
});
