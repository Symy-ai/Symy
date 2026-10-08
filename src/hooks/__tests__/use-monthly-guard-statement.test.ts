// @vitest-environment happy-dom

import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useMonthlyGuardStatement } from '@/hooks/use-monthly-guard-statement';

const apiFetchMock = vi.hoisted(() => vi.fn());
const loggerWarnMock = vi.hoisted(() => vi.fn());
const hourlyRateMock = vi.hoisted(() => vi.fn(() => ({ hourlyRate: 20 })));

vi.mock('@/lib/api-client', () => ({ apiFetch: apiFetchMock }));
vi.mock('@/lib/logger', () => ({ logger: { warn: loggerWarnMock } }));
vi.mock('@/hooks/use-hourly-rate', () => ({ useHourlyRate: hourlyRateMock }));
vi.mock('@/i18n/provider', () => ({ useI18n: vi.fn(() => ({ locale: 'zh' })) }));

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

describe('useMonthlyGuardStatement', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 9, 15, 15, 0, 0));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('生成当月月报、连胜与上月对比', async () => {
    mockEvents([
      event('pass-13', 'challenge_completed', '2026-10-13T10:00:00', { itemTitle: '耳机' }),
      event('pass-14', 'challenge_completed', '2026-10-14T10:00:00'),
      event('fail-15', 'challenge_failed', '2026-10-15T10:00:00'),
      event('reward-1', 'challenge_reward', '2026-10-15T11:00:00', { source: 'deposit', amount: 40, itemTitle: '耳机' }),
      event('prev-pass', 'challenge_completed', '2026-09-20T10:00:00'),
      event('prev-reward', 'challenge_reward', '2026-09-20T11:00:00', { source: 'deposit', amount: 20 }),
    ]);
    const { result } = renderHook(() => useMonthlyGuardStatement());
    expect(result.current.isLoading).toBe(true);
    await settle();

    expect(result.current.statement).toMatchObject({
      status: 'ok',
      monthKey: '2026-10',
      public: {
        intercepts: 3,
        passed: 2,
        abandoned: 1,
        passRate: 2 / 3,
        longestStreakDays: 2,
        hoursReclaimed: 2,
        compare: { status: 'ok', prevIntercepts: 1, prevHoursReclaimed: 1, intercepts: 'up', hoursReclaimed: 'up' },
        tone: 'steady',
      },
      private: { guardedAmount: 40 },
    });
  });

  it('空月返回 noData 而不构造 0 结论', async () => {
    apiFetchMock.mockResolvedValue({ events: [] });
    const { result } = renderHook(() => useMonthlyGuardStatement());
    await settle();

    expect(result.current.statement).toMatchObject({
      status: 'noData',
      monthKey: '2026-10',
      public: { intercepts: 0, passRate: null, compare: { status: 'noBaseline' } },
      private: { guardedAmount: 0 },
    });
  });

  it('仅上月有数据时当月仍为 noData', async () => {
    mockEvents([event('prev-pass', 'challenge_completed', '2026-09-20T10:00:00')]);
    const { result } = renderHook(() => useMonthlyGuardStatement());
    await settle();
    expect(result.current.statement?.status).toBe('noData');
  });

  it('重复与无效事件不入聚合', async () => {
    mockEvents([
      event('pass-1', 'challenge_completed', '2026-10-01T10:00:00'),
      event('pass-1', 'challenge_completed', '2026-10-02T10:00:00'),
      event('reward-bad', 'challenge_reward', '2026-10-01T11:00:00', { source: 'other', amount: 100 }),
    ]);
    const { result } = renderHook(() => useMonthlyGuardStatement());
    await settle();

    expect(result.current.statement?.public.intercepts).toBe(1);
    expect(result.current.statement?.private.guardedAmount).toBe(0);
  });

  it('请求失败静默降级为 null', async () => {
    apiFetchMock.mockRejectedValue(new Error('network down'));
    const { result } = renderHook(() => useMonthlyGuardStatement());
    await settle();

    expect(result.current).toMatchObject({ isLoading: false, statement: null });
    expect(loggerWarnMock).toHaveBeenCalledTimes(1);
  });
});
