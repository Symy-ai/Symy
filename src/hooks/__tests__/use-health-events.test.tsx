// @vitest-environment happy-dom

/* eslint-disable require-await -- test mocks use async for API consistency */
import { renderHook, act } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '@/lib/api-client';
import { useHealthEvents } from '@/hooks/use-health-events';
import type { HealthEvent } from '@/types/buddy-state';

const apiFetchMock = vi.hoisted(() => vi.fn());
const loggerWarnMock = vi.hoisted(() => vi.fn());
const loggerInfoMock = vi.hoisted(() => vi.fn());
const channelMock = vi.hoisted(() => ({
  on: vi.fn().mockReturnThis(),
  subscribe: vi.fn().mockReturnThis(),
}));
const createClientMock = vi.hoisted(() => vi.fn(() => ({
  channel: vi.fn(() => channelMock),
  removeChannel: vi.fn(),
})));

vi.mock('@/lib/api-client', async () => {
  const actual = await vi.importActual<typeof import('@/lib/api-client')>('@/lib/api-client');
  return {
    ...actual,
    apiFetch: apiFetchMock,
  };
});

vi.mock('@/lib/logger', () => ({
  logger: {
    info: loggerInfoMock,
    warn: loggerWarnMock,
    error: vi.fn(),
  },
}));

vi.mock('@/lib/supabase-browser', () => ({
  createClient: createClientMock,
}));

const event = (id: string): HealthEvent => ({
  id,
  eventType: 'manual_adjustment',
  vitalityChange: 1,
  newVitality: 80,
  tokenChange: 0,
  triggerSource: 'test',
  triggerId: null,
  description: `event ${id}`,
  metadata: {},
  createdAt: '2026-01-01T00:00:00Z',
});

function renderHealthEvents(props?: Partial<Parameters<typeof useHealthEvents>[0]>) {
  return renderHook<ReturnType<typeof useHealthEvents>, Parameters<typeof useHealthEvents>[0]>(
    ({ userId, vitality, isDemo }: Parameters<typeof useHealthEvents>[0]) =>
      useHealthEvents({ isDemo, userId, vitality }),
    {
      initialProps: {
        isDemo: props?.isDemo ?? false,
        userId: props?.userId ?? 'user-1',
        vitality: props?.vitality ?? 80,
      },
    },
  );
}

async function advanceDebounce() {
  await act(async () => {
    vi.advanceTimersByTimeAsync(500);
  });
}

async function scheduleFetch(value: unknown = { events: [event('a')] }) {
  await act(async () => {
    apiFetchMock.mockResolvedValue(value);
    vi.advanceTimersByTimeAsync(500);
  });
}

describe('useHealthEvents', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    apiFetchMock.mockReset();
    loggerWarnMock.mockClear();
    loggerInfoMock.mockClear();
    createClientMock.mockClear();
    channelMock.on.mockClear();
    channelMock.subscribe.mockClear();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('认证用户首次加载: 500ms 去抖后请求 limit=50 并映射事件', async () => {
    const { result } = renderHealthEvents();
    expect(result.current.isLoadingEvents).toBe(true);
    expect(apiFetchMock).not.toHaveBeenCalled();

    await scheduleFetch();

    expect(apiFetchMock).toHaveBeenCalledWith('/api/buddy/health-events?limit=50');
    expect(result.current.healthEvents).toHaveLength(1);
    expect(result.current.healthEventsError).toBeNull();
    expect(result.current.isLoadingEvents).toBe(false);
  });

  it('demo 与未登录直接清空且不发起请求', async () => {
    const demo = renderHealthEvents({ isDemo: true, userId: undefined });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(demo.result.current).toMatchObject({
      healthEvents: [],
      isLoadingEvents: false,
      healthEventsError: null,
    });
    demo.unmount();

    const anonymous = renderHealthEvents();
    await act(async () => {
      anonymous.rerender({ isDemo: false, userId: undefined, vitality: 80 });
    });
    expect(anonymous.result.current).toMatchObject({
      healthEvents: [],
      isLoadingEvents: false,
      healthEventsError: null,
    });
    await advanceDebounce();
    expect(apiFetchMock).not.toHaveBeenCalled();
  });

  it('首次 401 错误映射认证文案; retry 重置成功错误', async () => {
    apiFetchMock.mockRejectedValue(new ApiError(401, 'unauthorized'));
    const { result } = renderHealthEvents();
    await advanceDebounce();
    expect(result.current.healthEventsError).toBe('Authentication required');
    expect(result.current.isLoadingEvents).toBe(false);

    await act(async () => {
      result.current.retryFetch();
    });
    expect(result.current.healthEventsError).toBeNull();
    await scheduleFetch({ events: [] });
    expect(result.current.healthEvents).toEqual([]);
    expect(result.current.healthEventsError).toBeNull();
  });

  it('普通首次错误保留原始 message; 非事件响应降级为空数组', async () => {
    apiFetchMock.mockRejectedValueOnce(new Error('network down'));
    const { result } = renderHealthEvents();
    await advanceDebounce();
    expect(result.current.healthEventsError).toBe('network down');

    await act(async () => {
      result.current.retryFetch();
    });
    await scheduleFetch({ events: 'bad' });
    expect(result.current.healthEvents).toEqual([]);
  });

  it('后续 vitality 刷新触发请求但保持旧数据且 loading 不回弹', async () => {
    const { result, rerender } = renderHealthEvents();
    await scheduleFetch({ events: [event('old')] });
    expect(result.current.healthEvents[0].id).toBe('old');

    apiFetchMock.mockReturnValue(new Promise(() => {}));
    await act(async () => {
      rerender({ isDemo: false, userId: 'user-1', vitality: 70 });
      vi.advanceTimersByTimeAsync(500);
    });

    expect(apiFetchMock).toHaveBeenCalledTimes(2);
    expect(result.current.healthEvents[0].id).toBe('old');
    expect(result.current.isLoadingEvents).toBe(false);
  });

  it('用户切换清空数据并重置加载态', async () => {
    const { result, rerender } = renderHealthEvents();
    await scheduleFetch({ events: [event('user-a')] });

    await act(async () => {
      rerender({ isDemo: false, userId: 'user-b', vitality: 80 });
    });
    expect(result.current.healthEvents).toEqual([]);
    await scheduleFetch({ events: [event('user-b')] });
    expect(result.current.healthEvents[0].id).toBe('user-b');
  });

  it('Realtime 事件防抖 1s 后触发刷新; 卸载注销 channel 与清理定时器', async () => {
    const { result, unmount } = renderHealthEvents();
    await scheduleFetch();

    expect(createClientMock).toHaveBeenCalledTimes(1);
    expect(channelMock.on).toHaveBeenCalledWith(
      'postgres_changes',
      expect.objectContaining({ table: 'health_events', filter: 'user_id=eq.user-1' }),
      expect.any(Function),
    );
    expect(channelMock.subscribe).toHaveBeenCalledTimes(1);

    const realtimeCallback = channelMock.on.mock.calls[0][2] as () => void;
    realtimeCallback();
    realtimeCallback();
    expect(result.current.healthEvents).toHaveLength(1);

    await act(async () => {
      vi.advanceTimersByTimeAsync(1000);
    });
    await scheduleFetch({ events: [event('realtime')] });
    expect(result.current.healthEvents[0].id).toBe('realtime');
    expect(loggerInfoMock).toHaveBeenCalledWith(
      expect.stringContaining('Realtime UPDATE'),
    );

    unmount();
    expect((createClientMock.mock.results[0].value as { removeChannel: ReturnType<typeof vi.fn> }).removeChannel)
      .toHaveBeenCalledWith(channelMock);
  });

  it('卸载在 500ms 去抖内发生时取消请求; 过期响应不写入状态', async () => {
    let rejectFetch: ((error: Error) => void) | undefined;
    apiFetchMock.mockImplementation(() => new Promise((_resolve, reject) => {
      rejectFetch = reject;
    }));
    const { result, unmount } = renderHealthEvents();
    await advanceDebounce();
    unmount();

    rejectFetch?.(new Error('late error'));
    await act(async () => {
      vi.advanceTimersByTimeAsync(500);
    });
    expect(result.current.healthEvents).toEqual([]);
    expect(loggerWarnMock).not.toHaveBeenCalledWith(
      '[useHealthEvents] Failed to fetch (subsequent):',
      'late error',
    );
  });
});
