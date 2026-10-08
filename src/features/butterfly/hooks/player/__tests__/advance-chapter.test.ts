import { afterEach, describe, expect, it, vi } from 'vitest';
import { advanceToNextChapterImpl, type AdvanceToNextChapterParams } from '../advance-chapter';
import type { ButterflySession, StoryChapter, StoryCompleteData } from '../../../types';
import type { UseButterflySessionReturn } from '../../session/types';
import type { ChapterData, NormalPhase } from '../types';

const apiFetchMock = vi.hoisted(() => vi.fn());
const loggerInfoMock = vi.hoisted(() => vi.fn());
const loggerWarnMock = vi.hoisted(() => vi.fn());
const loggerErrorMock = vi.hoisted(() => vi.fn());

vi.mock('@/lib/api-client', () => ({ apiFetch: apiFetchMock }));
vi.mock('@/lib/logger', () => ({
  logger: { info: loggerInfoMock, warn: loggerWarnMock, error: loggerErrorMock },
}));


function makeChapter(index: number, withChoice = false): StoryChapter {
  return {
    index,
    title: `Chapter ${index}`,
    content: `Scene one ${index}.|||Scene two ${index}.`,
    tone: 'hopeful',
    timeSpan: 'one day',
    hasChoice: withChoice,
    createdAt: '2026-01-01T00:00:00Z',
    ...(withChoice ? {
      choice: {
        id: `choice-${index}`,
        chapterIndex: index,
        prompt: `Prompt ${index}`,
        options: [{ id: 'A', label: 'Path A', hint: '' }],
        selectedOption: null,
        createdAt: '2026-01-01T00:00:00Z',
        outlineRegenerated: false,
      },
    } : {}),
  };
}

function makeSession(overrides?: Partial<ButterflySession>): ButterflySession {
  return {
    id: 'session-1',
    userId: 'user-1',
    decisionType: 'bought',
    decisionDescription: 'Coffee',
    amount: 10,
    platform: null,
    context: null,
    outline: null,
    currentChapter: 1,
    chapters: [],
    choices: [],
    butterflyEffect: null,
    finalTone: null,
    status: 'active',
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

function makeComplete(overrides?: Partial<StoryCompleteData>): StoryCompleteData {
  return { butterflyEffect: 'complete effect', finalTone: 'dark', totalChapters: 3, ...overrides };
}

function makeChapterData(index: number, withChoice = false): ChapterData {
  const chapter = makeChapter(index, withChoice);
  return {
    index,
    title: chapter.title,
    tone: chapter.tone,
    timeSpan: chapter.timeSpan,
    hasChoice: withChoice,
    scenes: [
      { text: `Scene one ${index}.`, imageUrl: '' },
      { text: `Scene two ${index}.`, imageUrl: '' },
    ],
  };
}

function makeParams(overrides?: Partial<AdvanceToNextChapterParams>) {
  // reducer-style dispatch: UPDATE_COMPLETED_CHAPTERS 的 payload 是 (prev)=>updated thunk,
  // mock dispatch 必须执行它才能同步 completedChaptersRef (真实链路由 reducer 消费)
  let refsHolder: { completedChapters: { current: unknown[] } } | undefined; // eslint-disable-line prefer-const -- bound to refs below
  const dispatch = vi.fn((action: { type: string; payload?: unknown }) => {
    if (action?.type === 'UPDATE_COMPLETED_CHAPTERS' && typeof action.payload === 'function' && refsHolder) {
      const fn = action.payload as (prev: unknown[]) => unknown[];
      refsHolder.completedChapters.current = fn(refsHolder.completedChapters.current);
    }
  });
  const transitionPhase = vi.fn();
  const sessionHook = {
    continueStory: vi.fn().mockResolvedValue(undefined),
    preloadNextChapter: vi.fn().mockResolvedValue(undefined),
    clearPreloadedStoryComplete: vi.fn(),
    preloadedChapterData: null,
    preloadedStoryComplete: null,
    session: makeSession(),
  } as unknown as UseButterflySessionReturn;
  const refs = {
    phase: { current: 'chapterComplete' as NormalPhase },
    currentChapterIndex: { current: 1 },
    completedChapters: { current: [] as ChapterData[] },
    isLoading: { current: false },
    butterflyEffect: { current: null as string | null },
    finalTone: { current: null as AdvanceToNextChapterParams['finalToneRef']['current'] },
    isStreamingChapter: { current: false },
    processedChapterIndices: { current: new Set<number>() },
    pendingChoice: { current: null as AdvanceToNextChapterParams['pendingChoiceRef']['current'] },
    storyComplete: { current: null as StoryCompleteData | null },
    pollAborted: { current: false },
    pollCycle: { current: 0 },
  };
  refsHolder = refs as unknown as { completedChapters: { current: unknown[] } };
  const params: AdvanceToNextChapterParams = {
    dispatch,
    transitionPhase,
    totalChapters: 3,
    sessionHook,
    phaseRef: refs.phase,
    currentChapterIndexRef: refs.currentChapterIndex,
    completedChaptersRef: refs.completedChapters,
    isLoadingRef: refs.isLoading,
    butterflyEffectRef: refs.butterflyEffect,
    finalToneRef: refs.finalTone,
    isStreamingChapterRef: refs.isStreamingChapter,
    processedChapterIndicesRef: refs.processedChapterIndices,
    pendingChoiceRef: refs.pendingChoice,
    storyCompleteRef: refs.storyComplete,
    pollAbortedRef: refs.pollAborted,
    pollCycleRef: refs.pollCycle,
    ...overrides,
  };
  return { params, dispatch, transitionPhase, sessionHook, refs };
}

describe('advanceToNextChapterImpl', () => {
  afterEach(() => {
    vi.clearAllMocks();
    vi.useRealTimers();
  });

  it('ignores calls outside chapterComplete', () => {
    const { params, dispatch, transitionPhase, sessionHook } = makeParams();
    params.phaseRef.current = 'playing';

    advanceToNextChapterImpl(params);

    expect(dispatch).not.toHaveBeenCalled();
    expect(transitionPhase).not.toHaveBeenCalled();
    expect(sessionHook.continueStory).not.toHaveBeenCalled();
  });

  it('completes immediately with completion-value priority', () => {
    const { params, dispatch, transitionPhase, sessionHook, refs } = makeParams();
    refs.storyComplete.current = makeComplete();
    sessionHook.preloadedStoryComplete = makeComplete({ butterflyEffect: 'preloaded effect', finalTone: 'hopeful' });
    sessionHook.session = makeSession({ butterflyEffect: 'session effect', finalTone: 'neutral' });

    advanceToNextChapterImpl(params);

    expect(dispatch).toHaveBeenCalledWith({ type: 'SET_BUTTERFLY_EFFECT', payload: 'preloaded effect' });
    expect(dispatch).toHaveBeenCalledWith({ type: 'SET_FINAL_TONE', payload: 'hopeful' });
    expect(refs.butterflyEffect.current).toBe('preloaded effect');
    expect(refs.finalTone.current).toBe('hopeful');
    expect(sessionHook.clearPreloadedStoryComplete).toHaveBeenCalledTimes(1);
    expect(transitionPhase).toHaveBeenCalledWith('complete');
    expect(sessionHook.continueStory).not.toHaveBeenCalled();
  });

  it('applies matching preloaded chapter data without starting a stream', () => {
    const { params, dispatch, transitionPhase, sessionHook, refs } = makeParams();
    const choice = { chapterIndex: 2, prompt: 'Prompt 2', options: [{ id: 'A', label: 'Path A', hint: '' }] };
    sessionHook.preloadedChapterData = { chapter: makeChapter(2), outline: null, choice, illustrationUrl: null };

    advanceToNextChapterImpl(params);

    expect(refs.completedChapters.current).toHaveLength(1);
    expect(refs.completedChapters.current[0].index).toBe(2);
    expect(refs.processedChapterIndices.current.has(2)).toBe(true);
    expect(refs.pendingChoice.current).toEqual(choice);
    expect(dispatch).toHaveBeenCalledWith({ type: 'SET_CURRENT_CHAPTER_INDEX', payload: 2 });
    expect(dispatch).toHaveBeenCalledWith({ type: 'SET_CURRENT_CHOICE', payload: { prompt: 'Prompt 2', options: choice.options } });
    expect(transitionPhase).toHaveBeenCalledWith('playing');
    expect(refs.isLoading.current).toBe(false);
    expect(sessionHook.preloadNextChapter).toHaveBeenCalledTimes(1);
    expect(sessionHook.continueStory).not.toHaveBeenCalled();
  });

  it('ignores stale preloaded data for another chapter index', () => {
    const { params, sessionHook } = makeParams();
    sessionHook.preloadedChapterData = { chapter: makeChapter(3), outline: null, choice: null, illustrationUrl: null };

    advanceToNextChapterImpl(params);

    expect(sessionHook.continueStory).toHaveBeenCalledTimes(1);
  });

  it('replays an already completed chapter and its cached choice', () => {
    const { params, dispatch, transitionPhase, sessionHook, refs } = makeParams();
    refs.completedChapters.current = [makeChapterData(1), makeChapterData(2, true)];
    sessionHook.session = makeSession({
      choices: [{
        id: 'choice-2',
        chapterIndex: 2,
        prompt: 'Prompt 2',
        options: [{ id: 'A', label: 'Path A', hint: '' }],
        selectedOption: 'A',
        createdAt: '2026-01-01T00:00:00Z',
        outlineRegenerated: true,
      }],
    });

    advanceToNextChapterImpl(params);

    expect(refs.pendingChoice.current).toMatchObject({ chapterIndex: 2, prompt: 'Prompt 2' });
    expect(dispatch).toHaveBeenCalledWith({ type: 'SET_CURRENT_CHAPTER_INDEX', payload: 2 });
    expect(transitionPhase).toHaveBeenCalledWith('playing');
    expect(sessionHook.preloadNextChapter).toHaveBeenCalledTimes(1);
    expect(sessionHook.continueStory).not.toHaveBeenCalled();
  });

  it('skips continueStory while the machine is already streaming', () => {
    const { params, dispatch, sessionHook, refs } = makeParams();
    refs.isStreamingChapter.current = true;

    advanceToNextChapterImpl(params);

    expect(dispatch).toHaveBeenCalledWith({ type: 'SET_CURRENT_CHAPTER_INDEX', payload: 2 });
    expect(dispatch).toHaveBeenCalledWith({ type: 'SET_IS_LOADING', payload: true });
    expect(sessionHook.continueStory).not.toHaveBeenCalled();
    expect(sessionHook.preloadNextChapter).not.toHaveBeenCalled();
  });

  it('continues a missing chapter and keeps loading on success', async () => {
    const { params, dispatch, sessionHook } = makeParams();

    advanceToNextChapterImpl(params);
    await Promise.resolve();

    expect(dispatch).toHaveBeenCalledWith({ type: 'SET_CURRENT_CHAPTER_INDEX', payload: 2 });
    expect(dispatch).toHaveBeenCalledWith({ type: 'SET_IS_LOADING', payload: true });
    expect(sessionHook.continueStory).toHaveBeenCalledTimes(1);
    expect(dispatch).not.toHaveBeenCalledWith({ type: 'SET_IS_LOADING', payload: false });
  });

  it('completes when continueStory rejects after the story finished', async () => {
    const { params, dispatch, transitionPhase, sessionHook, refs } = makeParams();
    vi.mocked(sessionHook.continueStory).mockRejectedValue(new Error('closed'));
    sessionHook.session = makeSession({ status: 'completed', butterflyEffect: 'session effect', finalTone: 'neutral' });

    advanceToNextChapterImpl(params);
    await Promise.resolve();
    await Promise.resolve();

    expect(loggerErrorMock).toHaveBeenCalled();
    expect(refs.butterflyEffect.current).toBe('session effect');
    expect(refs.finalTone.current).toBe('neutral');
    expect(dispatch).toHaveBeenCalledWith({ type: 'SET_IS_LOADING', payload: false });
    expect(transitionPhase).toHaveBeenCalledWith('complete');
  });

  it('uses real completion data immediately on the final chapter', () => {
    const { params, dispatch, transitionPhase, sessionHook, refs } = makeParams({
      totalChapters: 1,
    });
    sessionHook.preloadedStoryComplete = makeComplete();

    advanceToNextChapterImpl(params);

    expect(dispatch).toHaveBeenCalledWith({ type: 'SET_BUTTERFLY_EFFECT', payload: 'complete effect' });
    expect(dispatch).toHaveBeenCalledWith({ type: 'SET_FINAL_TONE', payload: 'dark' });
    expect(refs.butterflyEffect.current).toBe('complete effect');
    expect(sessionHook.clearPreloadedStoryComplete).toHaveBeenCalledTimes(1);
    expect(transitionPhase).toHaveBeenCalledWith('complete');
    expect(apiFetchMock).not.toHaveBeenCalled();
  });

  it('shows fallback completion data and polls once for missing final data', async () => {
    vi.useFakeTimers();
    apiFetchMock.mockResolvedValue({ session: makeSession({ status: 'completed', butterflyEffect: 'polled effect', finalTone: 'twist' }) });
    const { params, dispatch, transitionPhase, sessionHook, refs } = makeParams({ totalChapters: 1 });
    sessionHook.session = makeSession({ status: 'completed', butterflyEffect: null, finalTone: null });

    advanceToNextChapterImpl(params);
    expect(dispatch).toHaveBeenCalledWith({ type: 'SET_BUTTERFLY_EFFECT', payload: 'Your butterfly effect story is complete.' });
    expect(transitionPhase).toHaveBeenCalledWith('complete');

    await vi.advanceTimersByTimeAsync(2000);
    expect(apiFetchMock).toHaveBeenCalledWith('/api/butterfly/session?sessionId=session-1');
    expect(dispatch).toHaveBeenCalledWith({ type: 'SET_BUTTERFLY_EFFECT', payload: 'polled effect' });
    expect(dispatch).toHaveBeenCalledWith({ type: 'SET_FINAL_TONE', payload: 'twist' });
    expect(refs.butterflyEffect.current).toBe('polled effect');
  });
});
