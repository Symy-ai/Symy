import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ButterflyMachineContext, ButterflyMachineEvent } from '../butterfly-machine';
import { AuthExpiredError } from '../auth-expired-error';
import { MachineGuards } from '../machine-guards';
import { initialContext } from '../butterfly-machine-types';
import type { ButterflySession, StoryChapter } from '../../../types';
import { logger } from '@/lib/logger';

vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

function chapter(index = 1): StoryChapter {
  return {
    index,
    title: 'Chapter',
    content: 'Content',
    tone: 'neutral',
    timeSpan: 'now',
    hasChoice: false,
    createdAt: '2026-01-01T00:00:00Z',
  };
}

function session(overrides: Partial<ButterflySession> = {}): ButterflySession {
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
    chapters: [chapter()],
    choices: [],
    butterflyEffect: null,
    finalTone: null,
    status: 'active',
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

function context(overrides: Partial<ButterflyMachineContext> = {}): ButterflyMachineContext {
  return { ...initialContext, ...overrides };
}

describe('MachineGuards', () => {
  beforeEach(() => {
    vi.mocked(logger.warn).mockClear();
  });

  describe('BUG-223 canCreateSession', () => {
    it('allows demo mode without userId', () => {
      expect(MachineGuards.canCreateSession({ context: context({ isDemo: true, userId: null }) })).toBe(true);
      expect(logger.warn).not.toHaveBeenCalled();
    });

    it('allows non-demo mode with userId', () => {
      expect(MachineGuards.canCreateSession({ context: context({ userId: 'user-1' }) })).toBe(true);
      expect(logger.warn).not.toHaveBeenCalled();
    });

    it('rejects missing userId and leaves a warning trace', () => {
      expect(MachineGuards.canCreateSession({ context: context({ userId: null }) })).toBe(false);
      expect(logger.warn).toHaveBeenCalledWith(
        '[ButterflyMachine] CREATE_SESSION dropped by guard: userId missing (SYNC_CONTEXT not applied?)',
      );
    });
  });

  describe('BUG-250 canSubmitChoice', () => {
    it('rejects without a session', () => {
      expect(MachineGuards.canSubmitChoice({
        context: context(),
        event: { type: 'SUBMIT_CHOICE', chapterIndex: 1, selectedOption: 'A' },
      })).toBe(false);
    });

    it('rejects non submit events', () => {
      expect(MachineGuards.canSubmitChoice({ context: context({ session: session() }), event: { type: 'CONTINUE' } })).toBe(false);
    });

    it('allows a pending choice for the requested chapter', () => {
      expect(MachineGuards.canSubmitChoice({
        context: context({ session: session({ choices: [{ id: 'c1', chapterIndex: 1, prompt: 'p', options: [], selectedOption: null, createdAt: '', outlineRegenerated: false }] }) }),
        event: { type: 'SUBMIT_CHOICE', chapterIndex: 1, selectedOption: 'A' },
      })).toBe(true);
    });

    it('rejects an already selected choice', () => {
      expect(MachineGuards.canSubmitChoice({
        context: context({ session: session({ choices: [{ id: 'c1', chapterIndex: 1, prompt: 'p', options: [], selectedOption: 'A', createdAt: '', outlineRegenerated: false }] }) }),
        event: { type: 'SUBMIT_CHOICE', chapterIndex: 1, selectedOption: 'B' },
      })).toBe(false);
    });
  });

  it.each([
    ['canRegenerate', false, true],
    ['isNotPreloading', true, false],
    ['hasPendingChoice', false, true],
    ['notDemo', true, false],
    ['hasActiveSessionWithChapters', false, true],
  ] as const)('%s distinguishes false and true contexts', (guard, empty, active) => {
    const args = { context: context() };
    const activeArgs = { context: context({ session: session(), completedChapters: [chapter()], pendingChoice: { chapterIndex: 1, prompt: 'p', options: [] }, isPreloading: true, isDemo: true }) };
    expect(MachineGuards[guard](args)).toBe(empty);
    expect(MachineGuards[guard](activeArgs)).toBe(active);
  });

  describe('restore routing', () => {
    it('activeSessionHasPendingChoice rejects completed sessions even with an unselected choice', () => {
      const completed = session({ status: 'completed', choices: [{ id: 'c1', chapterIndex: 1, prompt: 'p', options: [], selectedOption: null, createdAt: '', outlineRegenerated: false }] });
      expect(MachineGuards.activeSessionHasPendingChoice({ event: { output: completed } })).toBe(false);
    });

    it('activeSessionHasPendingChoice detects an active pending choice', () => {
      expect(MachineGuards.activeSessionHasPendingChoice({
        event: { output: session({ choices: [{ id: 'c1', chapterIndex: 1, prompt: 'p', options: [], selectedOption: null, createdAt: '', outlineRegenerated: false }] }) },
      })).toBe(true);
    });

    it.each([
      ['activeSessionHasPendingChoice', { output: session() }, false],
      ['activeSessionCompleted', { output: session() }, false],
      ['activeSessionCompleted', { output: session({ status: 'completed' }) }, true],
      ['activeSessionStreaming', { output: session({ outline: null }) }, false],
      ['activeSessionStreaming', { output: session({ outline: { version: 1, decisionType: 'career' as never, decisionDescription: 'test', chapters: [], endingHint: '' } }) }, true],
    ] as const)('%s handles null and status boundaries', (guard, event, expected) => {
      expect(MachineGuards[guard]({ event: { ...event, output: 'output' in event && event.output === null ? null : event.output } })).toBe(expected);
    });
  });

  describe('submit result routing', () => {
    it.each([
      ['isSubmitPreloadedStream', { output: null }, false],
      ['isSubmitPreloadedStream', { output: { type: 'preloaded', choice: null } }, true],
      ['isSubmitPreloadedChoice', { output: { type: 'preloaded', choice: { chapterIndex: 1, prompt: 'p', options: [] } } }, true],
      ['isSubmitStream', { output: { type: 'stream' } }, true],
      ['isSubmitComplete', { output: { type: 'complete' } }, true],
    ] as const)('%s routes service output', (guard, event, expected) => {
      expect(MachineGuards[guard]({ event })).toBe(expected);
    });
  });

  describe('retry routing', () => {
    it('hasSessionAndChapters is true only with session and completed chapters', () => {
      expect(MachineGuards.hasSessionAndChapters({ context: context() })).toBe(false);
      expect(MachineGuards.hasSessionAndChapters({ context: context({ session: session() }) })).toBe(false);
      expect(MachineGuards.hasSessionAndChapters({ context: context({ session: session(), completedChapters: [chapter()] }) })).toBe(true);
    });

    it('hasSessionNoChapters is true only with session and no completed chapters', () => {
      expect(MachineGuards.hasSessionNoChapters({ context: context() })).toBe(false);
      expect(MachineGuards.hasSessionNoChapters({ context: context({ session: session(), completedChapters: [] }) })).toBe(true);
      expect(MachineGuards.hasSessionNoChapters({ context: context({ session: session(), completedChapters: [chapter()] }) })).toBe(false);
    });

    it('isAuthExpiredError matches instance and serialized name only', () => {
      expect(MachineGuards.isAuthExpiredError({ event: { error: new AuthExpiredError() } })).toBe(true);
      expect(MachineGuards.isAuthExpiredError({ event: { error: { name: 'AuthExpiredError' } } })).toBe(true);
      expect(MachineGuards.isAuthExpiredError({ event: { error: new Error('plain') } })).toBe(false);
    });
  });

  describe('preload and chapter guards', () => {
    it('hasPreloadedChapterData accepts only the immediately next chapter', () => {
      const preloaded = { chapter: chapter(2), choice: null, outline: null, illustrationUrl: null };
      const active = context({ preloadedChapterData: preloaded, session: session({ currentChapter: 1 }) });
      expect(MachineGuards.hasPreloadedChapterData({ context: active })).toBe(true);
      expect(MachineGuards.hasPreloadedChapterData({ context: { ...active, preloadedChapterData: { ...preloaded, chapter: chapter(3) } } })).toBe(false);
      expect(MachineGuards.hasPreloadedChapterData({ context: { ...active, preloadedChapterData: null } })).toBe(false);
    });

    it('chapterHasNoIllustration requires matching chapter and missing illustration', () => {
      const info = { chapterIndex: 1, title: 'Chapter', tone: 'neutral' as const, timeSpan: 'now' };
      const event = { type: 'CHAPTER_END', data: { chapterIndex: 1, hasChoice: false } } satisfies ButterflyMachineEvent;
      expect(MachineGuards.chapterHasNoIllustration({ context: context({ currentChapterInfo: { ...info, illustrationUrl: '' } }), event })).toBe(true);
      expect(MachineGuards.chapterHasNoIllustration({ context: context({ currentChapterInfo: { ...info, illustrationUrl: 'url' } }), event })).toBe(false);
      expect(MachineGuards.chapterHasNoIllustration({ context: context({ currentChapterInfo: { ...info } }), event: { type: 'CHAPTER_START', data: { chapterIndex: 1, title: 'Chapter', tone: 'neutral', timeSpan: 'now' } } })).toBe(false);
    });

    it('chapterSceneNotTriggered deduplicates by chapter index', () => {
      const event = { type: 'CHAPTER_END', data: { chapterIndex: 1, hasChoice: false } } as ButterflyMachineEvent;
      expect(MachineGuards.chapterSceneNotTriggered({ context: context({ chapterSceneTriggered: [] }), event })).toBe(true);
      expect(MachineGuards.chapterSceneNotTriggered({ context: context({ chapterSceneTriggered: [1] }), event })).toBe(false);
    });

    it('noChoiceAndSessionActive allows choiceless active chapters only', () => {
      const event = { type: 'CHAPTER_END', data: { chapterIndex: 1, hasChoice: false } } as ButterflyMachineEvent;
      expect(MachineGuards.noChoiceAndSessionActive({ context: context(), event })).toBe(true);
      const withChoice: ButterflyMachineEvent = { type: 'CHAPTER_END', data: { chapterIndex: 1, hasChoice: true } };
      expect(MachineGuards.noChoiceAndSessionActive({ context: context(), event: withChoice })).toBe(false);
      expect(MachineGuards.noChoiceAndSessionActive({ context: context({ session: session({ status: 'completed' }) }), event })).toBe(false);
      expect(MachineGuards.noChoiceAndSessionActive({ context: context(), event: { type: 'CONTINUE' } })).toBe(false);
    });

    it('isSessionAlreadyComplete requires completed status and at least three chapters', () => {
      expect(MachineGuards.isSessionAlreadyComplete({ event: { output: session({ status: 'completed', chapters: [chapter(1), chapter(2), chapter(3)] }) } })).toBe(true);
      expect(MachineGuards.isSessionAlreadyComplete({ event: { output: session({ status: 'completed', chapters: [chapter(1)] }) } })).toBe(false);
      expect(MachineGuards.isSessionAlreadyComplete({ event: { output: null } })).toBe(false);
    });
  });
});
