// @vitest-environment happy-dom

import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useGachaBilling } from '../use-gacha-billing';

const loggerInfoMock = vi.hoisted(() => vi.fn());

vi.mock('@/lib/logger', () => ({ logger: { info: loggerInfoMock } }));

async function settle() {
  await act(async () => {});
}

describe('useGachaBilling', () => {
  const incrementGachaCount = vi.fn(async () => {});
  const decrementGachaCount = vi.fn(async () => {});

  beforeEach(() => {
    vi.clearAllMocks();
    incrementGachaCount.mockClear();
    decrementGachaCount.mockClear();
  });

  it('chapter_start 后按 pullAttempt 扣费一次', async () => {
    // effect 依赖 currentChapterInfoP — 先挂载(ref 为 null, effect 早退),
    // 设 ref 后必须 rerender 让 effect 重跑才扣费
    const { result, rerender } = renderHook(({ chapter }) => useGachaBilling(
      false,
      'playing',
      'desc',
      chapter,
      0,
      null,
      null,
      incrementGachaCount,
      decrementGachaCount,
    ), { initialProps: { chapter: null as unknown } });
    result.current.pullAttemptIdRef.current = 'attempt-1234';
    rerender({ chapter: { chapterIndex: 1 } });
    await settle();

    expect(vi.mocked(incrementGachaCount)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(incrementGachaCount).mock.calls[0]).toEqual([]);
  });

  it('同一 pullAttempt 的后续更新不重复扣费', async () => {
    const { result, rerender } = renderHook(({ chapter }) => useGachaBilling(
      false,
      'playing',
      'desc',
      chapter,
      0,
      null,
      null,
      incrementGachaCount,
      decrementGachaCount,
    ), { initialProps: { chapter: null as unknown } });
    result.current.pullAttemptIdRef.current = 'attempt-1234';

    rerender({ chapter: { chapterIndex: 1 } });
    await settle();
    rerender({ chapter: { chapterIndex: 1, title: 'Changed' } });
    await settle();

    expect(vi.mocked(incrementGachaCount)).toHaveBeenCalledTimes(1);
  });

  it('已有完成章节时不扣费', async () => {
    const { result } = renderHook(() => useGachaBilling(
      false,
      'playing',
      'desc',
      { chapterIndex: 2 },
      1,
      null,
      null,
      incrementGachaCount,
      decrementGachaCount,
    ));
    result.current.pullAttemptIdRef.current = 'attempt-1234';
    await settle();

    expect(vi.mocked(incrementGachaCount)).not.toHaveBeenCalled();
  });

  it('失败后退款且同一 pullAttempt 只退一次', async () => {
    const { result, rerender } = renderHook(({ error, playerError }) => useGachaBilling(
      false,
      'error',
      'desc',
      { chapterIndex: 1 },
      0,
      error,
      playerError,
      incrementGachaCount,
      decrementGachaCount,
    ), { initialProps: { error: null as string | null, playerError: null as string | null } });
    result.current.pullAttemptIdRef.current = 'attempt-1234';
    await settle();

    rerender({ error: 'story failed', playerError: 'internal error' });
    await settle();
    rerender({ error: 'story failed again', playerError: 'internal error again' });
    await settle();

    expect(vi.mocked(decrementGachaCount)).toHaveBeenCalledTimes(1);
  });

  it('429 和限流文案不退款', async () => {
    for (const playerError of ['HTTP 429', 'Too Many Requests', 'rate limit exceeded', 'Daily limit reached']) {
      const { result } = renderHook(() => useGachaBilling(
        false,
        'playing',
        'desc',
        { chapterIndex: 1 },
        0,
        'failed',
        playerError,
        incrementGachaCount,
        decrementGachaCount,
      ));
      result.current.pullAttemptIdRef.current = `attempt-${playerError}`;
      await settle();
    }

    expect(vi.mocked(decrementGachaCount)).not.toHaveBeenCalled();
  });

  it('idle 且无决策时重置扣费引用', async () => {
    const { result, rerender } = renderHook(({ phase, decision }) => useGachaBilling(
      false,
      phase,
      decision,
      { chapterIndex: 1 },
      0,
      null,
      null,
      incrementGachaCount,
      decrementGachaCount,
    ), { initialProps: { phase: 'playing', decision: 'desc' as string | null } });
    result.current.pullAttemptIdRef.current = 'attempt-1234';
    await settle();

    rerender({ phase: 'idle', decision: null as string | null });
    expect(result.current.gachaIncrementedForSessionRef.current).toBeNull();
    expect(result.current.pullAttemptIdRef.current).toBeNull();
    expect(result.current.gachaRefundedForSessionRef.current).toBeNull();
  });
});
