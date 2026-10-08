// @vitest-environment happy-dom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { usePlayerActions } from '../use-player-actions';
import type { NormalPhase, ChapterData } from '../types';

vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

const apiGetMock = vi.fn<(u?: string) => Promise<unknown>>(() => Promise.resolve({ session: null }));
vi.mock('@/lib/api-client', () => ({
  apiFetch: ((...args: unknown[]) => apiGetMock(...(args as []))) as unknown as typeof import('@/lib/api-client')['apiFetch'],
}));

// impl 函数 mock — 本测试只锁 usePlayerActions 的编排行为 (advance/reset/goToChapter/retryChoice)
vi.mock('../advance-chapter', () => ({
  advanceToNextChapterImpl: vi.fn(),
}));
vi.mock('../select-choice', () => ({
  selectChoiceImpl: vi.fn(),
}));
// helpers 的 getFallbackChoice 供 retryChoice fallback 用
vi.mock('../helpers', async (importOriginal) => {
  const m = await importOriginal<typeof import('../helpers')>();
  return { ...m, getFallbackChoice: () => ({ prompt: 'fallback-prompt', options: [{ id: 'fb1', text: 'FB1' }] }) };
});

type Refs = Parameters<typeof usePlayerActions>[0]['refs'];

function makeRefs(): Refs {
  return {
    phaseRef: { current: 'idle' as NormalPhase },
    currentChoiceRef: { current: null as { prompt: string; options: unknown[] } | null },
    currentChapterIndexRef: { current: 1 },
    currentSceneIndexRef: { current: 0 },
    completedChaptersRef: { current: [] as ChapterData[] },
    isLoadingRef: { current: false },
    choicesRef: { current: {} as Record<number, string> },
    decisionTypeRef: { current: null as string | null },
    decisionDescRef: { current: '' },
    butterflyEffectRef: { current: null as string | null },
    finalToneRef: { current: null as string | null },
    isStreamingChapterRef: { current: false },
    processedChapterIndicesRef: { current: new Set<number>() },
    waitingForChoiceRef: { current: false },
    userClickedForChoiceRef: { current: false },
    pendingChoiceRef: { current: null as { chapterIndex: number; prompt: string; options: unknown[] } | null },
    choiceTimeoutRef: { current: null as ReturnType<typeof setTimeout> | null },
    storyCompleteRef: { current: null as unknown },
    hasRestoredRef: { current: false },
    restorationTimeoutRef: { current: null as ReturnType<typeof setTimeout> | null },
    safetyNetTimeoutRef: { current: null as ReturnType<typeof setTimeout> | null },
    preloadAfterChoiceTimeoutRef: { current: null as ReturnType<typeof setTimeout> | null },
    autoAdvanceTimeoutRef: { current: null as ReturnType<typeof setTimeout> | null },
    chapterAdvanceTimeoutRef: { current: null as ReturnType<typeof setTimeout> | null },
    sessionHookResetRef: { current: vi.fn() },
    sessionHookCreateSessionRef: { current: vi.fn() },
    sessionHookContinueStoryRef: { current: vi.fn() },
    sessionHookSessionRef: { current: null as unknown },
    pollAbortedRef: { current: false },
    pollCycleRef: { current: 0 },
    lastProcessedErrorRef: { current: null as string | null },
  } as unknown as Refs;
}

function setup(overrides: { session?: unknown; totalChapters?: number } = {}) {
  const dispatch = vi.fn();
  const transitionPhase = vi.fn();
  const sessionHook = { session: overrides.session ?? null, reset: vi.fn(), createSession: vi.fn(), continueStory: vi.fn() };
  const refs = makeRefs();
  const t = (key: string) => key;
  const hook = renderHook(() =>
    usePlayerActions({
      dispatch,
      transitionPhase,
      totalChapters: overrides.totalChapters ?? 3,
      sessionHook: sessionHook as never,
      t: t as never,
      refs: refs as never,
    })
  );
  return { dispatch, transitionPhase, sessionHook, refs, ...hook.result.current };
}

describe('usePlayerActions (编排行为)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    apiGetMock.mockReset().mockResolvedValue({ session: null });
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('advance: 非 playing 阶段直接 no-op', () => {
    const { dispatch, transitionPhase, advance } = setup();
    advance();
    expect(dispatch).not.toHaveBeenCalled();
    expect(transitionPhase).not.toHaveBeenCalled();
  });

  it('advance: 场景未看完 → SET_CURRENT_SCENE_INDEX+1', () => {
    const { dispatch, refs, advance } = setup();
    refs.phaseRef.current = 'playing';
    refs.completedChaptersRef.current = [{ index: 1, title: 'C1', scenes: [{ text: 's1' }, { text: 's2' }], hasChoice: false } as unknown as ChapterData];
    advance();
    expect(dispatch).toHaveBeenCalledWith({ type: 'SET_CURRENT_SCENE_INDEX', payload: 1 });
  });

  it('advance: 章节有已做选择 → chapterComplete (BUG-250)', () => {
    const { transitionPhase, refs, advance } = setup();
    refs.phaseRef.current = 'playing';
    refs.completedChaptersRef.current = [{ index: 1, title: 'C1', scenes: [{ text: 's1' }], hasChoice: true } as unknown as ChapterData];
    refs.choicesRef.current = { 1: 'opt_a' };
    advance();
    expect(transitionPhase).toHaveBeenCalledWith('chapterComplete');
  });

  it('advance: 流式中禁止推进', () => {
    const { dispatch, refs, advance } = setup();
    refs.phaseRef.current = 'playing';
    refs.isStreamingChapterRef.current = true;
    refs.completedChaptersRef.current = [{ index: 1, title: 'C1', scenes: [{ text: 's1' }], hasChoice: false } as unknown as ChapterData];
    advance();
    expect(dispatch).not.toHaveBeenCalled();
  });

  it('advance: hasChoice + pendingChoice 命中 → choosing + SET_CURRENT_CHOICE', () => {
    const { dispatch, transitionPhase, refs, advance } = setup();
    refs.phaseRef.current = 'playing';
    refs.completedChaptersRef.current = [{ index: 1, title: 'C1', scenes: [{ text: 's1' }], hasChoice: true } as unknown as ChapterData];
    refs.pendingChoiceRef.current = { chapterIndex: 1, prompt: 'P?', options: [] };
    advance();
    expect(dispatch).toHaveBeenCalledWith({ type: 'SET_CURRENT_CHOICE', payload: { prompt: 'P?', options: [] } });
    expect(transitionPhase).toHaveBeenCalledWith('choosing');
  });

  it('advance: 无选择 + 非最后一章 → 800ms 后自动推进 (跳过 chapterComplete)', () => {
    vi.useFakeTimers();
    try {
      const { dispatch, refs, advance } = setup({ totalChapters: 3 });
      refs.phaseRef.current = 'playing';
      refs.completedChaptersRef.current = [
        { index: 1, title: 'C1', scenes: [{ text: 's1' }], hasChoice: false } as unknown as ChapterData,
        { index: 2, title: 'C2', scenes: [{ text: 's2' }], hasChoice: false } as unknown as ChapterData,
      ];
      refs.currentChapterIndexRef.current = 1;
      advance();
      // 800ms 内未推进
      expect(dispatch).not.toHaveBeenCalledWith({ type: 'SET_CURRENT_CHAPTER_INDEX', payload: 2 });
      act(() => { vi.advanceTimersByTime(800); });
      // 下一章已存在 → 直接播放
      expect(dispatch).toHaveBeenCalledWith({ type: 'SET_CURRENT_CHAPTER_INDEX', payload: 2 });
      expect(dispatch).toHaveBeenCalledWith({ type: 'SET_CURRENT_SCENE_INDEX', payload: 0 });
    } finally {
      vi.useRealTimers();
    }
  });

  it('advance: 最后一章 → chapterComplete (See Your Future)', () => {
    const { transitionPhase, refs, advance } = setup({ totalChapters: 1 });
    refs.phaseRef.current = 'playing';
    refs.completedChaptersRef.current = [{ index: 1, title: 'C1', scenes: [{ text: 's1' }], hasChoice: false } as unknown as ChapterData];
    refs.currentChapterIndexRef.current = 1;
    advance();
    expect(transitionPhase).toHaveBeenCalledWith('chapterComplete');
  });

  it('goToChapter: 只允许已完成章节 + 非流式态', () => {
    const { dispatch, transitionPhase, refs, goToChapter } = setup();
    refs.completedChaptersRef.current = [{ index: 1, title: 'C1', scenes: [], hasChoice: false } as unknown as ChapterData];
    // 未完成章节 → no-op
    goToChapter(5);
    expect(dispatch).not.toHaveBeenCalled();
    // 已完成 + 流式中 → no-op
    refs.isStreamingChapterRef.current = true;
    goToChapter(1);
    expect(dispatch).not.toHaveBeenCalled();
    // 已完成 + 空闲 → 跳转
    refs.isStreamingChapterRef.current = false;
    goToChapter(1);
    expect(dispatch).toHaveBeenCalledWith({ type: 'SET_CURRENT_CHAPTER_INDEX', payload: 1 });
    expect(transitionPhase).toHaveBeenCalledWith('playing');
  });

  it('retryChoice: choosing + choice 已到 → no-op; DB 命中 → SET_CURRENT_CHOICE', async () => {
    const { dispatch, refs, retryChoice } = setup();
    refs.phaseRef.current = 'choosing';
    refs.currentChoiceRef.current = { prompt: 'already', options: [] };
    await act(async () => { await retryChoice(); });
    expect(apiGetMock).not.toHaveBeenCalled();

    refs.currentChoiceRef.current = null;
    apiGetMock.mockResolvedValueOnce({ session: { choices: [{ chapterIndex: 1, selectedOption: null, prompt: 'DB-P', options: [{ id: 'x' }] }] } });
    await act(async () => { await retryChoice(); });
    expect(apiGetMock).toHaveBeenCalled();
    expect(dispatch).toHaveBeenCalledWith({ type: 'SET_CURRENT_CHOICE', payload: { prompt: 'DB-P', options: [{ id: 'x' }] } });
  });

  it('retryChoice: DB 无选择 → fallback 默认选项', async () => {
    const { dispatch, refs, retryChoice } = setup();
    refs.phaseRef.current = 'choosing';
    refs.currentChoiceRef.current = null;
    apiGetMock.mockResolvedValueOnce({ session: { choices: [] } });
    await act(async () => { await retryChoice(); });
    expect(dispatch).toHaveBeenCalledWith({ type: 'SET_CURRENT_CHOICE', payload: { prompt: 'fallback-prompt', options: [{ id: 'fb1', text: 'FB1' }] } });
    expect(refs.pendingChoiceRef.current?.prompt).toBe('fallback-prompt');
  });

  it('reset: 清全部状态 + 中止轮询 + 清 6 类 timer + 恢复标记复位', () => {
    vi.useFakeTimers();
    try {
      const { dispatch, transitionPhase, refs, reset } = setup();
      // 预置脏状态
      refs.phaseRef.current = 'playing';
      refs.isLoadingRef.current = true;
      refs.pollCycleRef.current = 5;
      refs.hasRestoredRef.current = true;
      refs.pendingChoiceRef.current = { chapterIndex: 1, prompt: 'x', options: [] };
      refs.restorationTimeoutRef.current = setTimeout(() => {}, 9999);
      refs.autoAdvanceTimeoutRef.current = setTimeout(() => {}, 9999);
      refs.chapterAdvanceTimeoutRef.current = setTimeout(() => {}, 9999);
      refs.choiceTimeoutRef.current = setTimeout(() => {}, 9999);
      refs.safetyNetTimeoutRef.current = setTimeout(() => {}, 9999);
      refs.preloadAfterChoiceTimeoutRef.current = setTimeout(() => {}, 9999);

      reset();

      expect(refs.sessionHookResetRef.current).toHaveBeenCalled();
      expect(transitionPhase).toHaveBeenCalledWith('idle');
      expect(refs.pollAbortedRef.current).toBe(true);
      expect(refs.hasRestoredRef.current).toBe(false);
      expect(refs.pendingChoiceRef.current).toBeNull();
      // 6 类 timer 全清
      expect(refs.restorationTimeoutRef.current).toBeNull();
      expect(refs.autoAdvanceTimeoutRef.current).toBeNull();
      expect(refs.chapterAdvanceTimeoutRef.current).toBeNull();
      expect(refs.choiceTimeoutRef.current).toBeNull();
      expect(refs.safetyNetTimeoutRef.current).toBeNull();
      expect(refs.preloadAfterChoiceTimeoutRef.current).toBeNull();
      // dispatch 风暴验证关键项
      expect(dispatch).toHaveBeenCalledWith({ type: 'SET_IS_LOADING', payload: false });
      expect(dispatch).toHaveBeenCalledWith({ type: 'SET_CURRENT_CHAPTER_INDEX', payload: 1 });
    } finally {
      vi.useRealTimers();
    }
  });

  it('start: 成功返回 true (createSession 走 ref), 失败返回 false + SET_ERROR', async () => {
    const { refs, start } = setup();
    refs.sessionHookCreateSessionRef.current = vi.fn().mockResolvedValue(undefined);
    let ok: boolean | undefined;
    await act(async () => { ok = await start({ decisionType: 'buy', decisionDescription: 'd' } as never); });
    expect(ok).toBe(true);

    const { refs: refs2, dispatch, start: start2 } = setup();
    refs2.sessionHookCreateSessionRef.current = vi.fn().mockRejectedValue(new Error('boom'));
    await act(async () => { ok = await start2({ decisionType: 'buy', decisionDescription: 'd' } as never); });
    expect(ok).toBe(false);
    expect(dispatch).toHaveBeenCalledWith({ type: 'SET_ERROR', payload: 'boom' });
  });
});
