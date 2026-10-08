// @vitest-environment happy-dom

import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useWeeklyGuardCompare } from '@/hooks/use-weekly-guard-compare';

const apiFetchMock = vi.hoisted(() => vi.fn());
const loggerWarnMock = vi.hoisted(() => vi.fn());
const hourlyRateMock = vi.hoisted(() => vi.fn(() => ({ hourlyRate: 20 })));

vi.mock('@/lib/api-client', () => ({ apiFetch: apiFetchMock }));
vi.mock('@/lib/logger', () => ({ logger: { warn: loggerWarnMock } }));
vi.mock('@/hooks/use-hourly-rate', () => ({ useHourlyRate: hourlyRateMock }));

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

describe('useWeeklyGuardCompare', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 9, 8, 15, 0, 0));
    hourlyRateMock.mockReturnValue({ hourlyRate: 20 });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('计算本周与上周的拦截、胜率和自由小时', async () => {
    mockEvents([
      event('pass-a', 'challenge_completed', '2026-10-08T10:00:00'),
      event('pass-b', 'challenge_completed', '2026-10-07T10:00:00'),
      event('fail-a', 'challenge_failed', '2026-10-08T11:00:00'),
      event('pass-prev', 'challenge_completed', '2026-10-01T10:00:00'),
      event('fail-prev', 'challenge_failed', '2026-10-01T11:00:00'),
      event('reward-this', 'challenge_reward', '2026-10-08T12:00:00', { source: 'deposit', amount: 50 }),
      event('reward-prev', 'challenge_reward', '2026-10-01T12:00:00', { source: 'deposit', amount: 20 }),
    ]);
    const { result } = renderHook(() => useWeeklyGuardCompare());
    await settle();

    expect(result.current.compare).toMatchObject({
      status: 'ok',
      thisWeek: { intercepts: 3, passed: 2, passRate: 2 / 3, guardedAmount: 50, hoursReclaimed: 2.5 },
      lastWeek: { intercepts: 2, passed: 1, passRate: 0.5, guardedAmount: 20, hoursReclaimed: 1 },
      trends: { intercepts: 'up', passRate: 'up', hoursReclaimed: 'up' },
    });
  });

  it('上周缺数据返回 noBaseline 引导态', async () => {
    mockEvents([event('pass-a', 'challenge_completed', '2026-10-08T10:00:00')]);
    const { result } = renderHook(() => useWeeklyGuardCompare());
    await settle();

    expect(result.current.compare?.status).toBe('noBaseline');
    expect(result.current.compare?.lastWeek).toMatchObject({ intercepts: 0, passRate: null, guardedAmount: 0 });
  });

  it('本周缺数据但上周有数据时给下降趋势', async () => {
    mockEvents([event('pass-prev', 'challenge_completed', '2026-10-01T10:00:00')]);
    const { result } = renderHook(() => useWeeklyGuardCompare());
    await settle();

    expect(result.current.compare?.status).toBe('ok');
    expect(result.current.compare?.trends).toEqual({ intercepts: 'down', passRate: 'flat', hoursReclaimed: 'flat' });
  });

  it('重复 triggerId 与非法转存不入聚合', async () => {
    mockEvents([
      event('pass-a', 'challenge_completed', '2026-10-08T10:00:00'),
      event('pass-a', 'challenge_completed', '2026-10-08T11:00:00'),
      event('reward-bad', 'challenge_reward', '2026-10-08T12:00:00', { source: 'other', amount: 100 }),
    ]);
    const { result } = renderHook(() => useWeeklyGuardCompare());
    await settle();

    expect(result.current.compare?.thisWeek).toMatchObject({ intercepts: 1, guardedAmount: 0, hoursReclaimed: 0 });
  });

  it('空数据返回 noBaseline 且 loading 终态正确', async () => {
    apiFetchMock.mockResolvedValue({ events: [] });
    const { result } = renderHook(() => useWeeklyGuardCompare());
    expect(result.current.isLoading).toBe(true);
    await settle();

    expect(result.current.isLoading).toBe(false);
    expect(result.current.compare).toMatchObject({
      status: 'noBaseline',
      thisWeek: { intercepts: 0, passRate: null, guardedAmount: 0, hoursReclaimed: 0 },
      lastWeek: { intercepts: 0, passRate: null, guardedAmount: 0, hoursReclaimed: 0 },
    });
  });

  it('请求失败降级 null 并记录日志', async () => {
    apiFetchMock.mockRejectedValue(new Error('network down'));
    const { result } = renderHook(() => useWeeklyGuardCompare());
    await settle();

    expect(result.current).toMatchObject({ isLoading: false, compare: null });
    expect(loggerWarnMock).toHaveBeenCalledTimes(1);
  });
});
