// @vitest-environment happy-dom

import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { apiFetch } from '@/lib/api-client';
import { logger } from '@/lib/logger';
import { useDailyTasks } from '@/hooks/use-daily-tasks';

vi.mock('@/lib/api-client', () => ({ apiFetch: vi.fn() }));
vi.mock('@/lib/logger', () => ({ logger: { info: vi.fn() } }));

async function settle() {
  await act(async () => {});
}

describe('useDailyTasks', () => {
  beforeEach(() => {
    cleanup();
    localStorage.clear();
    vi.mocked(apiFetch).mockReset();
    vi.mocked(logger.info).mockClear();
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 9, 8, 3, 0, 0));
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it('loads persisted tasks and removes stale date keys', async () => {
    localStorage.setItem('symy_daily_tasks_2026-10-06', '{"seen":true,"chatted":false,"hourlyRateSet":false}');
    localStorage.setItem('symy_daily_tasks_2026-10-07', '{"seen":true,"chatted":true,"hourlyRateSet":false}');

    const { result } = renderHook(() => useDailyTasks(true, 0));
    await settle();

    expect(result.current.tasks).toEqual({ seen: true, chatted: true, hourlyRateSet: false });
    expect(result.current.completedCount).toBe(2);
    expect(localStorage.getItem('symy_daily_tasks_2026-10-06')).toBeNull();
    expect(apiFetch).not.toHaveBeenCalled();
  });

  it('marks tasks once and persists the flipped state', async () => {
    const { result } = renderHook(() => useDailyTasks(true, 0));
    await settle();

    act(() => result.current.markSeen());
    act(() => result.current.markSeen());
    act(() => result.current.markChatted());

    expect(result.current.tasks).toEqual({ seen: true, chatted: true, hourlyRateSet: false });
    expect(JSON.parse(localStorage.getItem('symy_daily_tasks_2026-10-07') || '{}')).toEqual({
      seen: true,
      chatted: true,
      hourlyRateSet: false,
    });
  });

  it('derives hourlyRateSet from the current hourly rate', async () => {
    const { result, rerender } = renderHook(({ rate }) => useDailyTasks(true, rate), { initialProps: { rate: 0 } });
    await settle();
    expect(result.current.tasks.hourlyRateSet).toBe(false);

    rerender({ rate: 20 });
    await settle();
    expect(result.current.tasks.hourlyRateSet).toBe(true);
    expect(JSON.parse(localStorage.getItem('symy_daily_tasks_2026-10-07') || '{}').hourlyRateSet).toBe(true);
  });

  it('syncs seen from a completed server challenge once', async () => {
    vi.mocked(apiFetch).mockResolvedValue({ count: 1 });
    const { result } = renderHook(() => useDailyTasks(false, 0));
    expect(apiFetch).toHaveBeenCalledWith('/api/challenge/limit');
    await settle();

    expect(result.current.tasks.seen).toBe(true);
    expect(JSON.parse(localStorage.getItem('symy_daily_tasks_2026-10-07') || '{}').seen).toBe(true);
  });

  it('uses the 4am UTC-8 window key and rotates across that boundary', async () => {
    localStorage.setItem('symy_daily_tasks_2026-10-07', '{"seen":true,"chatted":false,"hourlyRateSet":false}');
    const { result } = renderHook(() => useDailyTasks(true, 0));
    await settle();
    expect(result.current.tasks.seen).toBe(true);

    act(() => vi.setSystemTime(new Date(2026, 9, 8, 21, 0, 0)));
    const rotated = renderHook(() => useDailyTasks(true, 0));
    await settle();
    expect(rotated.result.current.tasks).toEqual({ seen: false, chatted: false, hourlyRateSet: false });
    expect(localStorage.getItem('symy_daily_tasks_2026-10-08')).toBeNull();
  });
});
