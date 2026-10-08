import { describe, expect, it, vi } from 'vitest';
import type { ButterflyMachineContext, ButterflyMachineEvent } from '../butterfly-machine';
import { initialContext } from '../butterfly-machine-types';
import type { ButterflyChoice, ButterflySession, StoryChapter, StoryOutline } from '../../../types';
import { SessionActions } from '../machine-actions-session';
import type { PreloadedChapterData } from '../types';
import { BUTTERFLY_EFFECT_FALLBACK } from '../constants';

vi.mock('xstate', () => ({
  assign: (value: unknown) => ({ __assign: value }),
}));
vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

type AssignFn = (params: { context: ButterflyMachineContext; event: ButterflyMachineEvent }) => Partial<ButterflyMachineContext>;

function action(name: keyof typeof SessionActions): AssignFn {
  const value = (SessionActions[name] as unknown as { __assign: AssignFn | Partial<ButterflyMachineContext> }).__assign;
  return typeof value === 'function' ? value : () => value;
}

function context(overrides: Partial<ButterflyMachineContext> = {}): ButterflyMachineContext {
  return { ...initialContext, ...overrides };
}

function chapter(index = 1, overrides: Partial<StoryChapter> = {}): StoryChapter {
  return {
    index,
    title: `Chapter ${index}`,
    content: `Content ${index}`,
    tone: 'neutral',
    timeSpan: 'now',
    hasChoice: true,
    createdAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function choice(chapterIndex = 2, overrides: Partial<ButterflyChoice> = {}): ButterflyChoice {
  return {
    id: `choice-${chapterIndex}`,
    chapterIndex,
    prompt: 'Choose',
    options: [{ id: 'left', label: 'Left', hint: '' }, { id: 'right', label: 'Right', hint: '' }],
    selectedOption: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    outlineRegenerated: false,
    ...overrides,
  };
}

function pendingChoice(chapterIndex = 2) {
  const current = choice(chapterIndex);
  return { chapterIndex, prompt: current.prompt, options: current.options };
}

function outline(overrides: Partial<StoryOutline> = {}): StoryOutline {
  return {
    version: 1,
    decisionType: 'career' as never,
    decisionDescription: 'test',
    endingHint: '',
    chapters: [
      { index: 1, title: 'Chapter 1', summary: 'S1', hasChoice: true, tone: 'neutral' as never, timeSpan: 'now' },
      { index: 2, title: 'Chapter 2', summary: 'S2', hasChoice: true, tone: 'neutral' as never, timeSpan: 'now' },
    ],
    ...overrides,
  };
}

function session(overrides: Partial<ButterflySession> = {}): ButterflySession {
  return {
    id: 'session-1',
    userId: 'user-1',
    decisionType: 'career' as never,
    decisionDescription: 'test',
    amount: 10,
    platform: null,
    context: null,
    currentChapter: 1,
    chapters: [chapter(1)],
    choices: [choice(1, { selectedOption: 'left' })],
    outline: outline(),
    finalTone: 'twist',
    butterflyEffect: 'effect',
    status: 'active',
    isExample: false,
    isBookmarked: false,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function preloaded(nextChapter = 2, nextChoice: ReturnType<typeof pendingChoice> | null = pendingChoice()): PreloadedChapterData {
  return { chapter: chapter(nextChapter), choice: nextChoice, outline: outline(), illustrationUrl: null };
}

function run(name: keyof typeof SessionActions, current = context(), event = { type: 'LOAD_ACTIVE' } as ButterflyMachineEvent): Partial<ButterflyMachineContext> {
  return action(name)({ context: current, event });
}

function outputEvent(output: unknown): ButterflyMachineEvent {
  return { type: 'xstate.done.actor.test', output } as unknown as ButterflyMachineEvent;
}

describe('SessionActions', () => {
  it('assignSubmitChoiceStart saves and clears pending choice while loading', () => {
    const pending = pendingChoice();
    expect(run('assignSubmitChoiceStart', context({ pendingChoice: pending }))).toEqual({
      savedPendingChoice: pending,
      pendingChoice: null,
      isLoading: true,
    });
  });

  it('assignSubmitChoiceStart handles a null pending choice', () => {
    expect(run('assignSubmitChoiceStart')).toEqual({
      savedPendingChoice: null,
      pendingChoice: null,
      isLoading: true,
    });
  });

  it('assignSubmittedChoicePreloaded restores session, choice, and clears preload state', () => {
    const resultSession = session({ chapters: [chapter(1), chapter(2)] });
    const nextChoice = pendingChoice(2);
    const result = run('assignSubmittedChoicePreloaded', context({
      completedChapters: [chapter(1, { illustrationUrl: 'local://chapter-1' })],
      preloadedBranches: { left: { chapter: chapter(2), choice: null, outline: null } },
      preloadedChapterData: preloaded(),
      savedPendingChoice: pendingChoice(),
      isLoading: true,
    }), outputEvent({ type: 'preloaded', session: resultSession, chapter: chapter(2), choice: nextChoice, outline: outline() }));
    expect(result).toEqual({
      session: resultSession,
      completedChapters: [chapter(1, { illustrationUrl: 'local://chapter-1' }), chapter(2)],
      pendingChoice: nextChoice,
      preloadedBranches: {},
      preloadedChapterData: null,
      isLoading: false,
      savedPendingChoice: null,
    });
  });

  it('assignSubmittedChoicePreloaded ignores non-preloaded output and null session output', () => {
    expect(run('assignSubmittedChoicePreloaded', context(), outputEvent({ type: 'stream', session: session() }))).toEqual({});
    expect(run('assignSubmittedChoicePreloaded', context(), { type: 'LOAD_ACTIVE' } as ButterflyMachineEvent)).toEqual({});
  });

  it('assignSubmittedChoiceStream prepares streaming and clears stale preload data', () => {
    const resultSession = session({ chapters: [chapter(1), chapter(2)] });
    const demoOverride = { currentChapter: 2, choices: { 1: 'left' } };
    const result = run('assignSubmittedChoiceStream', context({
      completedChapters: [chapter(1, { illustrationUrl: 'local://chapter-1' })],
      streamingText: 'stale',
      pendingChoice: pendingChoice(),
      preloadedBranches: { left: { chapter: chapter(2), choice: null, outline: null } },
      preloadedChapterData: preloaded(),
      savedPendingChoice: pendingChoice(),
    }), outputEvent({ type: 'stream', session: resultSession, demoOverride }));
    expect(result).toEqual({
      session: resultSession,
      completedChapters: [chapter(1, { illustrationUrl: 'local://chapter-1' }), chapter(2)],
      streamingText: '',
      pendingChoice: null,
      preloadedBranches: {},
      preloadedChapterData: null,
      isLoading: true,
      savedPendingChoice: null,
      pendingDemoOverride: demoOverride,
    });
  });

  it('assignSubmittedChoiceStream ignores non-stream output and empty session', () => {
    expect(run('assignSubmittedChoiceStream', context(), outputEvent({ type: 'complete', session: session({ status: 'completed' }) }))).toEqual({});
    expect(run('assignSubmittedChoiceStream', context(), outputEvent({ type: 'stream', session: null }))).toEqual({
      session: null,
      completedChapters: [],
      streamingText: '',
      pendingChoice: null,
      preloadedBranches: {},
      preloadedChapterData: null,
      isLoading: true,
      savedPendingChoice: null,
      pendingDemoOverride: undefined,
    });
  });

  it('assignSubmittedChoiceComplete builds storyComplete and clears preload state', () => {
    const resultSession = session({ status: 'completed', chapters: [chapter(1), chapter(2), chapter(3)], butterflyEffect: 'server effect' });
    const result = run('assignSubmittedChoiceComplete', context({
      completedChapters: [chapter(1, { illustrationUrl: 'local://chapter-1' })],
      preloadedBranches: { left: { chapter: chapter(2), choice: null, outline: null } },
      savedPendingChoice: pendingChoice(),
    }), outputEvent({ type: 'complete', session: resultSession }));
    expect(result).toEqual({
      session: resultSession,
      completedChapters: [chapter(1, { illustrationUrl: 'local://chapter-1' }), chapter(2), chapter(3)],
      storyComplete: { finalTone: 'twist', totalChapters: 3, butterflyEffect: 'server effect' },
      preloadedBranches: {},
      isLoading: false,
      savedPendingChoice: null,
    });
  });

  it('assignSubmittedChoiceComplete falls back from outline and ignores other result types', () => {
    const resultSession = session({ status: 'completed', finalTone: null, butterflyEffect: null, outline: outline({ chapters: [{ ...chapter(1), tone: 'hopeful' as never, summary: 'S', hasChoice: true }] }) });
    const result = run('assignSubmittedChoiceComplete', context(), outputEvent({ type: 'complete', session: resultSession }));
    expect(result.storyComplete).toEqual({ finalTone: 'hopeful', totalChapters: 1, butterflyEffect: BUTTERFLY_EFFECT_FALLBACK });
    expect(run('assignSubmittedChoiceComplete', context(), outputEvent({ type: 'stream', session: session() }))).toEqual({});
  });

  it('assignContinuedChapterPreloadedFromContext appends new chapter and choice', () => {
    const result = run('assignContinuedChapterPreloadedFromContext', context({
      session: session({ currentChapter: 1 }),
      completedChapters: [chapter(1)],
      preloadedChapterData: preloaded(2),
      isLoading: true,
    }));
    const currentSession = result.session;
    expect(currentSession?.chapters).toHaveLength(2);
    expect(currentSession?.currentChapter).toBe(2);
    expect(currentSession?.choices).toHaveLength(2);
    expect(currentSession?.choices[1]).toMatchObject({ chapterIndex: 2, prompt: 'Choose', selectedOption: null });
    expect(result.completedChapters).toEqual([chapter(1), chapter(2)]);
    expect(result.pendingChoice).toEqual(pendingChoice(2));
    expect(result.preloadedChapterData).toBeNull();
    expect(result.isLoading).toBe(false);
  });

  it('assignContinuedChapterPreloadedFromContext deduplicates repeated chapter and choice', () => {
    const existing = choice(2, { id: 'old', prompt: 'Old', options: [{ id: 'up', label: 'Up', hint: '' }], selectedOption: 'left' });
    const result = run('assignContinuedChapterPreloadedFromContext', context({
      session: session({ chapters: [chapter(1), chapter(2)], choices: [choice(1, { selectedOption: 'left' }), existing] }),
      completedChapters: [chapter(1), chapter(2)],
      preloadedChapterData: preloaded(2),
    }));
    const currentSession = result.session;
    expect(currentSession?.chapters).toHaveLength(2);
    expect(currentSession?.choices).toHaveLength(2);
    expect(currentSession?.choices[1]).toMatchObject({ id: 'old', chapterIndex: 2, prompt: 'Choose', selectedOption: 'left' });
    expect(result.completedChapters).toHaveLength(2);
  });

  it('assignContinuedChapterPreloadedFromContext no-ops without preload or session', () => {
    expect(run('assignContinuedChapterPreloadedFromContext', context({ session: session() }))).toEqual({});
    expect(run('assignContinuedChapterPreloadedFromContext', context({ preloadedChapterData: preloaded() }))).toEqual({});
  });

  it('assignContinuedChapterPreloadedFromEvent applies PRELOAD_CHAPTER_DONE data', () => {
    const data = preloaded(2);
    const result = run('assignContinuedChapterPreloadedFromEvent', context({
      session: session({ currentChapter: 1 }),
      completedChapters: [chapter(1)],
      isLoading: true,
    }), { type: 'PRELOAD_CHAPTER_DONE', data });
    expect(result.session?.chapters).toEqual([chapter(1), chapter(2)]);
    expect(result.session?.currentChapter).toBe(2);
    expect(result.completedChapters).toEqual([chapter(1), chapter(2)]);
    expect(result.pendingChoice).toEqual(pendingChoice(2));
    expect(result.preloadedChapterData).toBeNull();
    expect(result.isLoading).toBe(false);
  });

  it('assignContinuedChapterPreloadedFromEvent deduplicates and ignores invalid events', () => {
    const existing = choice(2, { prompt: 'Old', selectedOption: 'left' });
    const data = preloaded(2);
    const result = run('assignContinuedChapterPreloadedFromEvent', context({
      session: session({ chapters: [chapter(1), chapter(2)], choices: [choice(1, { selectedOption: 'left' }), existing] }),
      completedChapters: [chapter(1), chapter(2)],
    }), { type: 'PRELOAD_CHAPTER_DONE', data });
    expect(result.session?.choices).toHaveLength(2);
    expect(result.session?.choices[1]).toMatchObject({ prompt: 'Choose' });
    expect(result.completedChapters).toHaveLength(2);
    expect(run('assignContinuedChapterPreloadedFromEvent', context({ session: session() }), { type: 'PRELOAD_CHAPTER_DONE', data: null } as ButterflyMachineEvent)).toEqual({});
    expect(run('assignContinuedChapterPreloadedFromEvent', context(), { type: 'PRELOAD_CHAPTER_DONE', data } as ButterflyMachineEvent)).toEqual({});
  });

  it('assignContinuedChapterStreamFromContext prepares demo stream state', () => {
    const currentSession = session({ currentChapter: 3 });
    const result = run('assignContinuedChapterStreamFromContext', context({
      session: currentSession,
      isDemo: true,
      streamingText: 'stale',
      isPreloading: true,
      preloadedChapterData: preloaded(),
      pendingChoice: pendingChoice(),
      isLoading: false,
    }));
    expect(result).toEqual({
      streamingText: '',
      isPreloading: false,
      preloadedChapterData: null,
      pendingChoice: null,
      isLoading: true,
      pendingDemoOverride: { currentChapter: 3, choices: { 1: 'left' } },
    });
  });

  it('assignContinuedChapterStreamFromContext omits demo override in normal mode', () => {
    expect(run('assignContinuedChapterStreamFromContext', context({ session: session() }))).toMatchObject({ pendingDemoOverride: undefined });
  });

  it('assignContinuedChapterStreamFromContext no-ops without session', () => {
    expect(run('assignContinuedChapterStreamFromContext')).toEqual({});
  });

  it('assignActiveSessionChoosing restores first unanswered choice and local illustrations', () => {
    const currentSession = session({ choices: [choice(1, { selectedOption: 'left' }), choice(2), choice(3)] });
    const expectedChoice = pendingChoice(2);
    const result = run('assignActiveSessionChoosing', context({ completedChapters: [chapter(1, { illustrationUrl: 'local://chapter-1' })], isLoading: true }), outputEvent(currentSession));
    expect(result).toEqual({
      session: currentSession,
      completedChapters: [chapter(1, { illustrationUrl: 'local://chapter-1' })],
      pendingChoice: expectedChoice,
      isLoading: false,
    });
  });

  it('assignActiveSessionChoosing nullifies choice when all are answered and ignores null session', () => {
    const currentSession = session({ choices: [choice(1, { selectedOption: 'left' })] });
    expect(run('assignActiveSessionChoosing', context(), outputEvent(currentSession))).toMatchObject({ pendingChoice: null });
    expect(run('assignActiveSessionChoosing', context(), outputEvent(null))).toEqual({});
  });

  it('assignActiveSessionStreaming restores session and resets stale stream text', () => {
    const currentSession = session({ status: 'active' });
    const result = run('assignActiveSessionStreaming', context({ streamingText: 'stale', isLoading: true }), outputEvent(currentSession));
    expect(result).toEqual({ session: currentSession, completedChapters: [chapter(1)], streamingText: '', isLoading: false });
  });

  it('assignActiveSessionStreaming ignores a null session', () => {
    expect(run('assignActiveSessionStreaming', context({ streamingText: 'stale' }), outputEvent(null))).toEqual({});
  });

  it('assignActiveSessionComplete restores completed story with storyComplete fallbacks', () => {
    const currentSession = session({ status: 'completed', chapters: [chapter(1), chapter(2)], finalTone: null, butterflyEffect: null, outline: outline({ chapters: [{ ...chapter(1), summary: 'S1', hasChoice: true, tone: 'neutral' as never }, { ...chapter(2), summary: 'S2', hasChoice: true, tone: 'hopeful' as never }] }) });
    const result = run('assignActiveSessionComplete', context({ completedChapters: [chapter(1, { illustrationUrl: 'local://chapter-1' })], isLoading: true }), outputEvent(currentSession));
    expect(result).toEqual({
      session: currentSession,
      completedChapters: [
        expect.objectContaining(chapter(1, { illustrationUrl: 'local://chapter-1' })),
        chapter(2),
      ],
      storyComplete: { finalTone: 'hopeful', totalChapters: 2, butterflyEffect: BUTTERFLY_EFFECT_FALLBACK },
      isLoading: false,
    });
  });

  it('assignActiveSessionComplete prefers explicit completion fields and ignores null session', () => {
    const currentSession = session({ status: 'completed', chapters: [chapter(1), chapter(2)] });
    expect(run('assignActiveSessionComplete', context(), outputEvent(currentSession)).storyComplete).toEqual({ finalTone: 'twist', totalChapters: 2, butterflyEffect: 'effect' });
    expect(run('assignActiveSessionComplete', context(), outputEvent(null))).toEqual({});
  });

  it('assignNoActiveSession returns an empty assignment', () => {
    expect(run('assignNoActiveSession', context({ session: session(), isLoading: true }))).toEqual({});
    expect(run('assignNoActiveSession', context(), { type: 'LOAD_ACTIVE_DONE', session: null } as ButterflyMachineEvent)).toEqual({});
  });

  it('assignAuthExpired exposes stable auth error and stops loading', () => {
    expect(run('assignAuthExpired', context({ isLoading: true, error: null, errorDetail: null }))).toEqual({
      error: 'Your session has expired. Please sign in again.',
      errorDetail: 'AUTH_EXPIRED_401',
      isLoading: false,
    });
  });

  it('assignAuthExpired replaces previous diagnostic state', () => {
    expect(run('assignAuthExpired', context({ error: 'old', errorDetail: 'old detail', isLoading: true }))).toEqual({
      error: 'Your session has expired. Please sign in again.',
      errorDetail: 'AUTH_EXPIRED_401',
      isLoading: false,
    });
  });

  it('assignRegenerateResult updates matching chapters in both copies', () => {
    const result = run('assignRegenerateResult', context({
      session: session({ chapters: [chapter(1)] }),
      completedChapters: [chapter(1), chapter(2)],
      regeneratingChapters: [1, 2],
    }), outputEvent({ chapterIndex: 1, url: 'https://example.test/new.png' }));
    expect(result.completedChapters).toEqual([chapter(1, { illustrationUrl: 'https://example.test/new.png' }), chapter(2)]);
    expect(result.session?.chapters[0].illustrationUrl).toBe('https://example.test/new.png');
    expect(result.regeneratingChapters).toEqual([2]);
  });

  it('assignRegenerateResult distinguishes soft and hard regeneration failure', () => {
    const soft = run('assignRegenerateResult', context({ regeneratingChapters: [1] }), outputEvent({ chapterIndex: 1, url: null }));
    expect(soft).toEqual({ regeneratingChapters: [] });
    const hard = run('assignRegenerateResult', context({ regeneratingChapters: [1] }), outputEvent({ chapterIndex: 1, url: null, hardFailed: true }));
    expect(hard).toEqual({ regeneratingChapters: [], error: 'Illustration regeneration failed for chapter 1. Please check your network and try again.' });
  });

  it('assignRegenerateResult tolerates a missing output', () => {
    expect(run('assignRegenerateResult', context(), outputEvent(null))).toEqual({ regeneratingChapters: [] });
  });

  it('toggleOutline flips from both current values', () => {
    expect(run('toggleOutline', context({ outlineVisible: false }))).toEqual({ outlineVisible: true });
    expect(run('toggleOutline', context({ outlineVisible: true }))).toEqual({ outlineVisible: false });
  });

  it('clearPendingDemoOverride clears the consumed override', () => {
    expect(run('clearPendingDemoOverride', context({ pendingDemoOverride: { currentChapter: 2, choices: {} } }))).toEqual({ pendingDemoOverride: undefined });
    expect(run('clearPendingDemoOverride', context())).toEqual({ pendingDemoOverride: undefined });
  });

  it('setError preserves STREAM_ERROR raw message', () => {
    expect(run('setError', context({ isLoading: true }), { type: 'STREAM_ERROR', data: { chapterIndex: 1, message: 'stream failed' } } as unknown as ButterflyMachineEvent)).toEqual({ error: 'stream failed', errorDetail: 'stream failed', isLoading: false });
  });

  it('setError maps known errors and preserves raw details', () => {
    const cases = [
      ['Failed to generate story outline: 429', 'AI service is temporarily unavailable. Please try again in a moment.'],
      ['Story engine unavailable', 'AI service is temporarily unavailable. Please try again in a moment.'],
      ['Failed to create session', 'Failed to create story session. Please try again.'],
      ['Failed to fetch', 'Network connection issue. Please check your internet and try again.'],
      ['Custom failure', 'Custom failure'],
    ] as const;
    for (const [raw, friendly] of cases) {
      expect(run('setError', context(), { type: 'CREATE_SESSION_DONE', error: new Error(raw) } as unknown as ButterflyMachineEvent)).toEqual({ error: friendly, errorDetail: raw, isLoading: false });
    }
  });

  it('setError accepts strings and unknown empty errors', () => {
    expect(run('setError', context(), { type: 'CREATE_SESSION_DONE', error: 'plain' } as unknown as ButterflyMachineEvent)).toEqual({ error: 'plain', errorDetail: 'plain', isLoading: false });
    expect(run('setError', context(), { type: 'CREATE_SESSION_DONE' } as ButterflyMachineEvent)).toEqual({ error: 'AI service is temporarily unavailable. Please try again in a moment.', errorDetail: '', isLoading: false });
  });

  it('assignRestorePendingChoice restores and clears the saved copy', () => {
    const pending = pendingChoice();
    expect(run('assignRestorePendingChoice', context({ savedPendingChoice: pending }))).toEqual({ pendingChoice: pending, savedPendingChoice: null });
    expect(run('assignRestorePendingChoice')).toEqual({ pendingChoice: null, savedPendingChoice: null });
  });

  it('clearError clears both user-facing and diagnostic errors', () => {
    expect(run('clearError', context({ error: 'error', errorDetail: 'detail' }))).toEqual({ error: null, errorDetail: null });
    expect(run('clearError', context())).toEqual({ error: null, errorDetail: null });
  });
});
