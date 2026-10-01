/* eslint-disable require-await -- test mocks use async for API consistency */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { selectChoiceImpl, type SelectChoiceParams } from '../select-choice';
import type { ButterflySession, StoryChapter, StoryTone } from '../../../types';
import type { UseButterflySessionReturn } from '../../session/types';
import type { ChapterData, NormalPhase } from '../types';
import type { NormalPlayerAction } from '../reducer';

const apiFetchVoidMock = vi.hoisted(() => vi.fn());
const loggerWarnMock = vi.hoisted(() => vi.fn());
const loggerInfoMock = vi.hoisted(() => vi.fn());

vi.mock('@/lib/api-client', () => ({
  apiFetchVoid: apiFetchVoidMock,
}));

vi.mock('@/lib/logger', () => ({
  logger: {
    info: loggerInfoMock,
    warn: loggerWarnMock,
    error: vi.fn(),
  },
}));

vi.mock('@/lib/race-timeout', () => ({
  raceWithTimeoutReject: vi.fn(async (promise: Promise<unknown>) => promise),
}));

type Ref<T> = { current: T };

function makeChapter(index: number, withChoice = false): StoryChapter {
  return {
    index,
    title: `Chapter ${index}`,
    content: `Chapter ${index} content`,
    tone: 'hopeful',
    timeSpan: 'one day',
    hasChoice: withChoice,
    createdAt: '2026-01-01T00:00:00Z',
    ...(withChoice
      ? {
          choice: {
            id: `choice-${index}`,
            chapterIndex: index,
            prompt: `Prompt ${index}`,
            options: [{ id: 'A', label: 'Path A', hint: '' }],
            selectedOption: null,
            createdAt: '2026-01-01T00:00:00Z',
            outlineRegenerated: false,
          },
        }
      : {}),
  };
}

function preloadedBranch(chapter: StoryChapter) {
  return {
    chapter,
    outline: null,
    choice: chapter.choice
      ? { chapterIndex: chapter.choice.chapterIndex, prompt: chapter.choice.prompt, options: chapter.choice.options }
      : null,
  };
}

function makeSession(status: ButterflySession['status'] = 'active'): ButterflySession {
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
    status,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
  };
}

function makeParams(overrides?: Partial<SelectChoiceParams>): {
  params: SelectChoiceParams;
  dispatch: ReturnType<typeof vi.fn>;
  transitionPhase: ReturnType<typeof vi.fn>;
  sessionHook: {
    submitChoice: ReturnType<typeof vi.fn>;
    preloadNextChapter: ReturnType<typeof vi.fn>;
    continueStory: ReturnType<typeof vi.fn>;
    clearPreloadedStoryComplete: ReturnType<typeof vi.fn>;
  };
  refs: {
    phase: Ref<NormalPhase>;
    currentChapterIndex: Ref<number>;
    completedChapters: Ref<ChapterData[]>;
    choices: Ref<Record<number, string>>;
    waitingForChoice: Ref<boolean>;
    userClickedForChoice: Ref<boolean>;
    pendingChoice: Ref<SelectChoiceParams['pendingChoiceRef']['current']>;
    butterflyEffect: Ref<string | null>;
    finalTone: Ref<SelectChoiceParams['finalToneRef']['current']>;
    storyComplete: Ref<SelectChoiceParams['storyCompleteRef']['current']>;
    processedChapterIndices: Ref<Set<number>>;
    preloadAfterChoiceTimeout: Ref<ReturnType<typeof setTimeout> | null>;
    session: Ref<ButterflySession | null>;
  };
} {
  const dispatch = vi.fn((action: NormalPlayerAction) => {
    if (action.type === 'UPDATE_COMPLETED_CHAPTERS') {
      refs.completedChapters.current = action.payload(refs.completedChapters.current);
    }
  });
  const transitionPhase = vi.fn();
  const sessionHook = {
    submitChoice: vi.fn().mockResolvedValue(undefined),
    preloadNextChapter: vi.fn().mockResolvedValue(undefined),
    continueStory: vi.fn(),
    clearPreloadedStoryComplete: vi.fn(),
    preloadedBranches: {},
    preloadedStoryComplete: null,
    session: null as ButterflySession | null,
  } as unknown as UseButterflySessionReturn;
  type SessionHook = typeof sessionHook & {
    submitChoice: ReturnType<typeof vi.fn>;
    preloadNextChapter: ReturnType<typeof vi.fn>;
    continueStory: ReturnType<typeof vi.fn>;
    clearPreloadedStoryComplete: ReturnType<typeof vi.fn>;
  };
  const refs = {
    phase: { current: 'choosing' as NormalPhase },
    currentChapterIndex: { current: 1 },
    completedChapters: { current: [] as ChapterData[] },
    choices: { current: {} as Record<number, string> },
    waitingForChoice: { current: true },
    userClickedForChoice: { current: true },
    pendingChoice: { current: null },
    butterflyEffect: { current: null },
    finalTone: { current: null },
    storyComplete: { current: null },
    processedChapterIndices: { current: new Set<number>() },
    preloadAfterChoiceTimeout: { current: null },
    session: { current: makeSession() },
  };
  const params: SelectChoiceParams = {
    optionId: 'A',
    dispatch,
    transitionPhase,
    totalChapters: 3,
    sessionHook,
    phaseRef: refs.phase,
    currentChapterIndexRef: refs.currentChapterIndex,
    completedChaptersRef: refs.completedChapters,
    choicesRef: refs.choices,
    waitingForChoiceRef: refs.waitingForChoice,
    userClickedForChoiceRef: refs.userClickedForChoice,
    pendingChoiceRef: refs.pendingChoice,
    butterflyEffectRef: refs.butterflyEffect,
    finalToneRef: refs.finalTone,
    storyCompleteRef: refs.storyComplete,
    processedChapterIndicesRef: refs.processedChapterIndices,
    preloadAfterChoiceTimeoutRef: refs.preloadAfterChoiceTimeout,
    sessionHookSessionRef: refs.session,
    ...overrides,
  };
  return {
    params,
    dispatch,
    transitionPhase,
    sessionHook: sessionHook as SessionHook,
    refs,
  };
}

describe('selectChoiceImpl', () => {
  afterEach(() => {
    vi.clearAllMocks();
    vi.clearAllTimers();
  });

  it('非 choosing 阶段防御性忽略, 不推进任何状态', async () => {
    const { params, dispatch, transitionPhase } = makeParams();
    params.phaseRef.current = 'playing';
    await selectChoiceImpl(params);
    expect(dispatch).not.toHaveBeenCalled();
    expect(transitionPhase).not.toHaveBeenCalled();
    expect(params.choicesRef.current).toEqual({});
  });

  it('有效预加载分支: 立即进入章节完成态并提交选择', async () => {
    const { params, dispatch, transitionPhase, refs } = makeParams();
    const chapter = makeChapter(2, true);
    params.sessionHook.preloadedBranches = { A: preloadedBranch(chapter) };
    await selectChoiceImpl(params);

    expect(refs.choices.current[1]).toBe('A');
    expect(refs.completedChapters.current).toHaveLength(1);
    expect(refs.completedChapters.current[0]).toMatchObject({ index: 2, title: 'Chapter 2' });
    expect(refs.pendingChoice.current).toMatchObject({ prompt: 'Prompt 2' });
    expect(transitionPhase).toHaveBeenCalledWith('chapterComplete');
    expect(params.sessionHook.submitChoice).toHaveBeenCalledWith(1, 'A');
    expect(dispatch).toHaveBeenCalledWith({ type: 'SET_CURRENT_CHOICE', payload: null });
  });

  it('预加载分支章节号不匹配时视为 stale, 走流式下一章路径', async () => {
    const { params, transitionPhase, refs, dispatch } = makeParams();
    const stale = makeChapter(3);
    params.sessionHook.preloadedBranches = { A: preloadedBranch(stale) };
    await selectChoiceImpl(params);

    expect(refs.completedChapters.current).toEqual([]);
    expect(transitionPhase).not.toHaveBeenCalledWith('chapterComplete');
    expect(dispatch).toHaveBeenCalledWith({ type: 'SET_IS_LOADING', payload: true });
  });

  it('预加载提交超时时降级直调 choice API, 后续错误不阻断章节完成态', async () => {
    const { raceWithTimeoutReject } = await import('@/lib/race-timeout');
    vi.mocked(raceWithTimeoutReject).mockRejectedValueOnce(new Error('submitChoice timeout'));
    apiFetchVoidMock.mockResolvedValueOnce(undefined);
    const { params, transitionPhase, refs } = makeParams();
    const chapter = makeChapter(2, true);
    params.sessionHook.preloadedBranches = { A: preloadedBranch(chapter) };
    await selectChoiceImpl(params);

    expect(apiFetchVoidMock).toHaveBeenCalledWith('/api/butterfly/choice', {
      method: 'POST',
      body: { sessionId: 'session-1', chapterIndex: 1, selectedOption: 'A' },
    });
    expect(loggerInfoMock).toHaveBeenCalledWith(
      '[NormalPlayer] Choice API direct call succeeded',
    );
    expect(transitionPhase).toHaveBeenCalledWith('chapterComplete');
    expect(refs.pendingChoice.current).toMatchObject({ prompt: 'Prompt 2' });
  });

  it('最后一章无 choice: 1.5s 后预加载完成数据', async () => {
    vi.useFakeTimers();
    const { params, sessionHook } = makeParams();
    const chapter = makeChapter(2);
    params.sessionHook.preloadedBranches = { A: preloadedBranch(chapter) };
    params.totalChapters = 2;
    await selectChoiceImpl(params);

    expect(sessionHook.preloadNextChapter).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1500);
    expect(sessionHook.preloadNextChapter).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });

  it('已有下一章缓存: 选择后进入 chapterComplete', async () => {
    const { params, transitionPhase } = makeParams();
    params.currentChapterIndexRef.current = 1;
    params.completedChaptersRef.current = [{
      index: 2,
      title: 'Cached',
      tone: 'hopeful',
      timeSpan: '',
      hasChoice: false,
      scenes: [],
    }];
    await selectChoiceImpl(params);
    expect(transitionPhase).toHaveBeenCalledWith('chapterComplete');
    expect(apiFetchVoidMock).not.toHaveBeenCalled();
  });

  it('完成数据可用: 使用预加载结局数据并进入 complete', async () => {
    const { params, dispatch, transitionPhase, refs } = makeParams();
    params.sessionHook.preloadedStoryComplete = {
      butterflyEffect: 'saved the garden',
      finalTone: 'hopeful' satisfies StoryTone,
      totalChapters: 3,
    };
    await selectChoiceImpl(params);

    expect(dispatch).toHaveBeenCalledWith({
      type: 'SET_BUTTERFLY_EFFECT',
      payload: 'saved the garden',
    });
    expect(dispatch).toHaveBeenCalledWith({ type: 'SET_FINAL_TONE', payload: 'hopeful' });
    expect(refs.butterflyEffect.current).toBe('saved the garden');
    expect(refs.finalTone.current).toBe('hopeful');
    expect(params.sessionHook.clearPreloadedStoryComplete).toHaveBeenCalledTimes(1);
    expect(transitionPhase).toHaveBeenCalledWith('complete');
  });

  it('流式路径 API 失败不阻断安全检查, 5s 后仍 choosing 则继续故事', async () => {
    vi.useFakeTimers();
    apiFetchVoidMock.mockRejectedValueOnce(new Error('api unavailable'));
    const { params, sessionHook, refs } = makeParams();
    await selectChoiceImpl(params);

    expect(apiFetchVoidMock).toHaveBeenCalledTimes(1);
    expect(loggerWarnMock).toHaveBeenCalledWith(
      '[NormalPlayer] Choice API direct call failed (continuing to phase check):',
      'api unavailable',
    );
    expect(sessionHook.continueStory).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(5000);
    expect(sessionHook.continueStory).toHaveBeenCalledTimes(1);
    expect(refs.choices.current[1]).toBe('A');
    vi.useRealTimers();
  });
});
