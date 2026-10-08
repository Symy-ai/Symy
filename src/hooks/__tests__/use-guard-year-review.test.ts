// @vitest-environment happy-dom

import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useGuardYearReview } from '@/hooks/use-guard-year-review';

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
  triggerSource: null,
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

describe('useGuardYearReview', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 11, 20, 15, 0, 0));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('成功聚合年度拦截、小时与活跃月', async () => {
    mockEvents([
      ...[1, 2, 3, 4, 5].map((index) => event(`pass-${index}`, 'challenge_completed', `2026-${String(index).padStart(2, '0')}-10T10:00:00`, { savedAmount: 20 })),
      event('pass-extra', 'challenge_completed', '2026-01-11T10:00:00', { savedAmount: 20 }),
    ]);
    const { result } = renderHook(() => useGuardYearReview({ hourlyRate: 20, locale: 'zh' }));
    expect(result.current.isLoading).toBe(true);
    await settle();

    expect(result.current).toMatchObject({
      isLoading: false,
      review: {
        status: 'ok',
        year: 2026,
        totals: { intercepts: 6, commitments: 0, adoptions: 0 },
        activeMonths: 5,
        longestStreakDays: 2,
        private: { hoursReclaimed: 6 },
      },
    });
    expect(apiFetchMock).toHaveBeenCalledTimes(4);
  });

  it('空年返回 insufficient 且保留空结构', async () => {
    apiFetchMock.mockResolvedValue({ events: [] });
    const { result } = renderHook(() => useGuardYearReview({ hourlyRate: 20, locale: 'zh' }));
    await settle();

    expect(result.current.review).toMatchObject({
      status: 'insufficient',
      year: 2026,
      totals: { intercepts: 0, commitments: 0, adoptions: 0 },
      activeMonths: 0,
      months: expect.any(Array),
      private: { hoursReclaimed: 0 },
    });
    expect(result.current.review.months).toHaveLength(12);
  });

  it('样本不足时不给年度结论但保留月度数据', async () => {
    mockEvents([
      event('pass-1', 'challenge_completed', '2026-01-10T10:00:00', { savedAmount: 20 }),
      event('pass-2', 'challenge_completed', '2026-02-10T10:00:00', { savedAmount: 20 }),
    ]);
    const { result } = renderHook(() => useGuardYearReview({ hourlyRate: 20, locale: 'zh' }));
    await settle();

    expect(result.current.review).toMatchObject({ status: 'insufficient', totals: { intercepts: 2 }, activeMonths: 2, private: { hoursReclaimed: 2 } });
  });

  it('同类重复 triggerId 去重', async () => {
    mockEvents([
      event('pass-1', 'challenge_completed', '2026-01-10T10:00:00', { savedAmount: 20 }),
      event('pass-1', 'challenge_completed', '2026-02-10T10:00:00', { savedAmount: 20 }),
    ]);
    const { result } = renderHook(() => useGuardYearReview({ hourlyRate: 20, locale: 'zh' }));
    await settle();
    expect(result.current.review.totals.intercepts).toBe(1);
  });

  it('请求失败降级为数据不足年评', async () => {
    apiFetchMock.mockRejectedValue(new Error('network down'));
    const { result } = renderHook(() => useGuardYearReview({ hourlyRate: 20, locale: 'zh' }));
    await settle();

    expect(result.current).toMatchObject({ isLoading: false, review: { status: 'insufficient', totals: { intercepts: 0 } } });
    expect(loggerWarnMock).toHaveBeenCalledTimes(1);
  });
});
