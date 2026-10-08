import { describe, expect, it, vi } from 'vitest';
import {
  computeCompleteValues,
  convertStoryChapterToChapterData,
  getFallbackChoice,
  shouldCompleteAfterSubmit,
  splitScenes,
} from '../helpers';
import type { ButterflySession, StoryChapter, StoryCompleteData } from '../../../types';

function makeChapter(overrides?: Partial<StoryChapter>): StoryChapter {
  return {
    index: 1,
    title: 'The Crossing',
    content: 'First scene.|||Second scene.',
    tone: 'hopeful',
    timeSpan: 'one day',
    hasChoice: true,
    createdAt: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

function makeComplete(overrides?: Partial<StoryCompleteData>): StoryCompleteData {
  return {
    butterflyEffect: 'A small turn changed everything.',
    finalTone: 'dark',
    totalChapters: 5,
    ...overrides,
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
    butterflyEffect: 'Saved from a quiet trap.',
    finalTone: 'neutral',
    status: 'active',
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

describe('splitScenes', () => {
  it('returns an empty array for empty input', () => {
    expect(splitScenes('')).toEqual([]);
  });

  it('splits explicit scenes and trims empty segments', () => {
    expect(splitScenes(' One ||| ||| Two ')).toEqual(['One', 'Two']);
  });

  it('keeps an unpunctuated paragraph as one scene (no sentence anchors to split on)', () => {
    // 实现语义: 句号/感叹号是分割锚 — 无标点 match=null 走 [content] 兜底,
    // 累计长度超 50 后整段作为单块 push (不按字符硬切)
    const result = splitScenes('a'.repeat(81));
    expect(result).toHaveLength(1);
    expect(result[0]).toHaveLength(81);
  });

  it('splits a long paragraph by sentences and keeps repeated text intact', () => {
    // 前提: content.length > 80 才走句级分块 — 71 字符的 12 句 Same 不触发, 整段返回
    // 超过 80 的 16 句版本: 累计式分块加满句子直到超 50 字符
    expect(splitScenes('Same. '.repeat(12).trim())).toEqual(['Same. '.repeat(12).trim()]);
    const long = 'Same. '.repeat(16).trim(); // 95 字符 > 80
    const chunks = splitScenes(long);
    expect(chunks.length).toBeGreaterThan(1);
    // BUG-275 回归锚: 重复句子不丢 — 拼回应等于原文
    expect(chunks.join(' ')).toBe(long);
  });

  it('keeps a short text as one scene even without punctuation', () => {
    expect(splitScenes('A quiet street')).toEqual(['A quiet street']);
  });
});

describe('convertStoryChapterToChapterData', () => {
  it('maps chapter fields and scene text', () => {
    expect(convertStoryChapterToChapterData(makeChapter())).toMatchObject({
      index: 1,
      title: 'The Crossing',
      tone: 'hopeful',
      timeSpan: 'one day',
      hasChoice: true,
      scenes: [
        { text: 'First scene.', imageUrl: '' },
        { text: 'Second scene.', imageUrl: '' },
      ],
    });
  });

  it('uses the first scene illustration array entry', () => {
    const result = convertStoryChapterToChapterData(makeChapter({
      sceneIllustrations: { 0: ['scene-one.png', 'alternate.png'], 1: ['scene-two.png'] },
    }));

    expect(result.scenes.map(scene => scene.imageUrl)).toEqual(['scene-one.png', 'scene-two.png']);
  });

  it('accepts a scalar scene illustration and falls back to the chapter cover', () => {
    const result = convertStoryChapterToChapterData(makeChapter({
      illustrationUrl: 'cover.png',
      sceneIllustrations: { 0: ['first.png'] },
    }));

    expect(result.scenes.map(scene => scene.imageUrl)).toEqual(['first.png', 'cover.png']);
  });

  it('ignores an empty illustration array', () => {
    const result = convertStoryChapterToChapterData(makeChapter({
      illustrationUrl: 'cover.png',
      sceneIllustrations: { 0: [] },
    }));

    expect(result.scenes[0].imageUrl).toBe('cover.png');
  });
});

describe('shouldCompleteAfterSubmit', () => {
  it('is false when every source is empty', () => {
    expect(shouldCompleteAfterSubmit({
      butterflyEffect: null,
      storyComplete: null,
      preloadedStoryComplete: null,
      session: null,
    })).toBe(false);
  });

  it('recognizes each completion data source', () => {
    const complete = makeComplete();
    const session = makeSession({ status: 'completed' });

    expect(shouldCompleteAfterSubmit({ butterflyEffect: 'effect', storyComplete: null, preloadedStoryComplete: null, session: null })).toBe(true);
    expect(shouldCompleteAfterSubmit({ butterflyEffect: null, storyComplete: complete, preloadedStoryComplete: null, session: null })).toBe(true);
    expect(shouldCompleteAfterSubmit({ butterflyEffect: null, storyComplete: null, preloadedStoryComplete: complete, session: null })).toBe(true);
    expect(shouldCompleteAfterSubmit({ butterflyEffect: null, storyComplete: null, preloadedStoryComplete: null, session })).toBe(true);
  });
});

describe('computeCompleteValues', () => {
  it('returns defaults when all sources are empty', () => {
    expect(computeCompleteValues({
      butterflyEffect: null,
      finalTone: null,
      storyComplete: null,
      preloadedStoryComplete: null,
      session: null,
    })).toEqual({ bf: 'Your butterfly effect story is complete.', ft: 'twist' });
  });

  it('prioritizes refs over preloaded, streamed, and session data', () => {
    expect(computeCompleteValues({
      butterflyEffect: 'ref effect',
      finalTone: 'hopeful',
      storyComplete: makeComplete(),
      preloadedStoryComplete: makeComplete({ butterflyEffect: 'preloaded effect' }),
      session: makeSession(),
    })).toEqual({ bf: 'ref effect', ft: 'hopeful' });
  });

  it('falls back through preloaded, streamed, session, and defaults', () => {
    const args = {
      butterflyEffect: null,
      finalTone: null,
      storyComplete: null,
      preloadedStoryComplete: null,
      session: null,
    } as Parameters<typeof computeCompleteValues>[0];

    expect(computeCompleteValues(args)).toEqual({ bf: 'Your butterfly effect story is complete.', ft: 'twist' });
    expect(computeCompleteValues({ ...args, preloadedStoryComplete: makeComplete() })).toEqual({ bf: 'A small turn changed everything.', ft: 'dark' });
    expect(computeCompleteValues({ ...args, storyComplete: makeComplete({ butterflyEffect: 'stream effect', finalTone: 'neutral' }), session: makeSession() })).toEqual({ bf: 'stream effect', ft: 'neutral' });
    expect(computeCompleteValues({ ...args, session: makeSession() })).toEqual({ bf: 'Saved from a quiet trap.', ft: 'neutral' });
  });
});

describe('getFallbackChoice', () => {
  it('returns two localized options with stable ids', () => {
    const t = vi.fn((key: string, options?: { defaultValue?: string }) => `${key}:${options?.defaultValue ?? ''}`);

    expect(getFallbackChoice(t)).toEqual({
      prompt: 'butterfly.fallbackChoicePrompt:Which path do you take?',
      options: [
        { id: 'A', label: 'butterfly.fallbackChoiceA:The familiar path', hint: 'butterfly.fallbackChoiceAHint:Safety has its own cost.' },
        { id: 'B', label: 'butterfly.fallbackChoiceB:The uncharted path', hint: 'butterfly.fallbackChoiceBHint:The unknown holds both treasure and danger.' },
      ],
    });
  });
});
