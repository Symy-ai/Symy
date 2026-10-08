// @vitest-environment happy-dom

import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useGuardMoments } from '@/hooks/use-guard-moments';

const apiFetchMock = vi.hoisted(() => vi.fn());
const loggerWarnMock = vi.hoisted(() => vi.fn());
const useAuthMock = vi.hoisted(() => vi.fn((): { user: { id: string } | null } => ({ user: { id: 'user-1' } })));

vi.mock('@/lib/api-client', () => ({ apiFetch: apiFetchMock }));
vi.mock('@/lib/logger', () => ({ logger: { warn: loggerWarnMock } }));
vi.mock('@/components/auth/auth-provider', () => ({ useAuth: useAuthMock }));

const eventsByType = (url: string) => {
  if (url.includes('challenge_completed')) {
    return {
      events: [
        { eventType: 'challenge_completed', triggerId: 'guard-1', metadata: { savedAmount: 30 }, createdAt: '2026-01-02T10:00:00' },
      ],
    };
  }
  return {
    events: [
      { eventType: 'mindful_recovery', triggerId: 'alt-1', metadata: { kind: 'green_alt_adoption', estSaved: 10 }, createdAt: '2026-01-01T09:00:00' },
      { eventType: 'mindful_recovery', triggerId: 'reuse-1', metadata: { kind: 'reuse_adoption', estSaved: 5 }, createdAt: '2026-01-01T08:00:00' },
      { eventType: 'mindful_recovery', triggerId: 'invalid', metadata: {}, createdAt: '2026-01-01T07:00:00' },
    ],
  };
};

async function settle() {
  await act(async () => {});
}

describe('useGuardMoments', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAuthMock.mockReturnValue({ user: { id: 'user-1' } });
  });

  it('初始为 loading，聚合三类时刻并去重', async () => {
    apiFetchMock.mockImplementation(eventsByType);
    const { result } = renderHook(() => useGuardMoments());
    expect(result.current.isLoading).toBe(true);
    await settle();

    expect(apiFetchMock).toHaveBeenCalledTimes(2);
    expect(result.current).toMatchObject({
      isLoading: false,
      timeline: {
        status: 'ok',
        trackCounts: { guard: 1, alt: 1, reuse: 1 },
        totalMoments: 3,
        activeDays: 2,
        totalSaved: 45,
      },
    });
    expect(result.current.timeline?.months.map((month) => month.monthKey)).toEqual(['2026-01']);
    expect(result.current.timeline?.months[0].moments.map((moment) => moment.id)).toEqual(['guard-1', 'alt-1', 'reuse-1']);
  });

  it('两类请求的 event_type 查询参数正确', async () => {
    apiFetchMock.mockResolvedValue({ events: [] });
    renderHook(() => useGuardMoments());
    await settle();

    const eventTypes = apiFetchMock.mock.calls.map(([url]) => new URL(url).searchParams.get('event_type')).sort();
    expect(eventTypes).toEqual(['challenge_completed', 'mindful_recovery']);
  });

  it('空数据返回引导空态', async () => {
    apiFetchMock.mockResolvedValue({ events: [] });
    const { result } = renderHook(() => useGuardMoments());
    await settle();

    expect(result.current).toMatchObject({
      isLoading: false,
      timeline: { status: 'empty', months: [], totalMoments: 0, totalSaved: 0 },
    });
  });

  it('请求失败静默降级为 null', async () => {
    apiFetchMock.mockRejectedValue(new Error('network down'));
    const { result } = renderHook(() => useGuardMoments());
    await settle();

    expect(result.current).toMatchObject({ isLoading: false, timeline: null });
    expect(loggerWarnMock).toHaveBeenCalledTimes(1);
  });

  it('未登录自动禁用且不发请求', async () => {
    useAuthMock.mockReturnValue({ user: null });
    apiFetchMock.mockResolvedValue({ events: [] });
    const { result } = renderHook(() => useGuardMoments());
    await settle();

    expect(result.current).toMatchObject({ isLoading: false, timeline: null });
    expect(apiFetchMock).not.toHaveBeenCalled();
  });
});
