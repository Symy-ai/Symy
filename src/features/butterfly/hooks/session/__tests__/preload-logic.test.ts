/**
 * Tests for preload-logic.ts — createPreloadAccumulator, parseSSELine,
 * reducePreloadEvent, buildPreloadedChapter (pure functions).
 *
 * 🔧 ARCH fix (Round 69 ARCH-DEEP-69): 测试覆盖率 — preload-logic 0 tests → 26 tests
 *
 * Verifies the pure SSE event reduction pipeline that preloadNextChapter /
 * preloadBranch share: parse line → reduce event → build chapter.
 */

import { describe, it, expect } from 'vitest';
import {
  createPreloadAccumulator,
  parseSSELine,
  reducePreloadEvent,
  buildPreloadedChapter,
  type PreloadContext,
} from '../preload-logic';
import type { StoryEvent, StoryOutline } from '../../../types';

const demoCtx: PreloadContext = {
  isDemo: false,
  decisionType: 'bought',
  decisionDescription: 'Bought $89 shoes',
};

const demoModeCtx: PreloadContext = {
  isDemo: true,
  decisionType: 'bought',
  decisionDescription: 'Bought $89 shoes',
};

// ============================================================
// createPreloadAccumulator
// ============================================================

describe('createPreloadAccumulator', () => {
  it('returns a fresh accumulator with default values', () => {
    const acc = createPreloadAccumulator();
    expect(acc).toEqual({
      chapterText: '',
      chapterIndex: 0,
      chapterTitle: '',
      chapterTone: 'neutral',
      chapterTimeSpan: '',
      hasChoice: false,
      illustrationUrl: null,
      choiceData: null,
      newOutline: null,
      storyCompleteData: null,
    });
  });

  it('returns a new object each call (no shared reference)', () => {
    const a = createPreloadAccumulator();
    const b = createPreloadAccumulator();
    expect(a).not.toBe(b);
    a.chapterText = 'mutated';
    expect(b.chapterText).toBe('');
  });
});

// ============================================================
// parseSSELine
// ============================================================

describe('parseSSELine', () => {
  it('parses a valid SSE data line', () => {
    const event: StoryEvent = { type: 'chapter_text', data: { chapterIndex: 1, text: 'hi' } };
    const line = `data: ${JSON.stringify(event)}`;
    expect(parseSSELine(line)).toEqual(event);
  });

  it('returns null for non-data lines (comments, empty, etc.)', () => {
    expect(parseSSELine('')).toBeNull();
    expect(parseSSELine(': comment')).toBeNull();
    expect(parseSSELine('event: chapter_text')).toBeNull();
    expect(parseSSELine('id: 123')).toBeNull();
  });

  it('returns null for [DONE] sentinel', () => {
    expect(parseSSELine('data: [DONE]')).toBeNull();
  });

  it('returns null for whitespace-only data', () => {
    expect(parseSSELine('data:   ')).toBeNull();
    expect(parseSSELine('data: ')).toBeNull();
  });

  it('returns null for invalid JSON', () => {
    expect(parseSSELine('data: {invalid json}')).toBeNull();
    expect(parseSSELine('data: {"unclosed":')).toBeNull();
  });

  it('trims whitespace around JSON payload', () => {
    const event: StoryEvent = { type: 'chapter_end', data: { chapterIndex: 1, hasChoice: false } };
    const line = `data:   ${JSON.stringify(event)}   `;
    expect(parseSSELine(line)).toEqual(event);
  });

  it('parses line that does not start with "data: " (missing space)', () => {
    // per spec: prefix is "data: " (with space). "data:" without space should not match.
    expect(parseSSELine('data:{"x":1}')).toBeNull();
  });
});

// ============================================================
// reducePreloadEvent — chapter_start
// ============================================================

describe('reducePreloadEvent: chapter_start', () => {
  it('sets chapter metadata (title/tone/timeSpan/index)', () => {
    const acc = createPreloadAccumulator();
    const event: StoryEvent = {
      type: 'chapter_start',
      data: { chapterIndex: 3, title: 'The Turning Point', tone: 'dark', timeSpan: '3 years later' },
    };
    const next = reducePreloadEvent(event, acc, demoCtx);
    expect(next.chapterIndex).toBe(3);
    expect(next.chapterTitle).toBe('The Turning Point');
    expect(next.chapterTone).toBe('dark');
    expect(next.chapterTimeSpan).toBe('3 years later');
  });

  it('sets illustrationUrl to "" in normal mode (waits for AI illustration)', () => {
    const acc = createPreloadAccumulator();
    const event: StoryEvent = {
      type: 'chapter_start',
      data: { chapterIndex: 1, title: 'T', tone: 'neutral', timeSpan: 'now' },
    };
    const next = reducePreloadEvent(event, acc, demoCtx);
    expect(next.illustrationUrl).toBe('');
  });

  it('sets illustrationUrl to demo CDN URL in demo mode', () => {
    const acc = createPreloadAccumulator();
    const event: StoryEvent = {
      type: 'chapter_start',
      data: { chapterIndex: 1, title: 'T', tone: 'neutral', timeSpan: 'now' },
    };
    const next = reducePreloadEvent(event, acc, demoModeCtx);
    expect(next.illustrationUrl).toMatch(/^https:\/\//);
    expect(next.illustrationUrl).toContain('.png');
  });

  it('preserves existing accumulated text (does not reset chapterText)', () => {
    const acc = createPreloadAccumulator();
    acc.chapterText = 'preexisting';
    const event: StoryEvent = {
      type: 'chapter_start',
      data: { chapterIndex: 1, title: 'T', tone: 'neutral', timeSpan: 'now' },
    };
    const next = reducePreloadEvent(event, acc, demoCtx);
    expect(next.chapterText).toBe('preexisting');
  });

  it('does not mutate the original accumulator', () => {
    const acc = createPreloadAccumulator();
    const original = { ...acc };
    const event: StoryEvent = {
      type: 'chapter_start',
      data: { chapterIndex: 1, title: 'T', tone: 'neutral', timeSpan: 'now' },
    };
    reducePreloadEvent(event, acc, demoCtx);
    expect(acc).toEqual(original);
  });
});

// ============================================================
// reducePreloadEvent — chapter_text
// ============================================================

describe('reducePreloadEvent: chapter_text', () => {
  it('appends text to accumulated chapterText', () => {
    const acc = createPreloadAccumulator();
    acc.chapterText = 'Hello';
    const event: StoryEvent = {
      type: 'chapter_text',
      data: { chapterIndex: 1, text: ', world!' },
    };
    const next = reducePreloadEvent(event, acc, demoCtx);
    expect(next.chapterText).toBe('Hello, world!');
  });

  it('accumulates multiple chapter_text events', () => {
    let acc = createPreloadAccumulator();
    acc = reducePreloadEvent({ type: 'chapter_text', data: { chapterIndex: 1, text: 'A' } }, acc, demoCtx);
    acc = reducePreloadEvent({ type: 'chapter_text', data: { chapterIndex: 1, text: 'B' } }, acc, demoCtx);
    acc = reducePreloadEvent({ type: 'chapter_text', data: { chapterIndex: 1, text: 'C' } }, acc, demoCtx);
    expect(acc.chapterText).toBe('ABC');
  });
});

// ============================================================
// reducePreloadEvent — chapter_end
// ============================================================

describe('reducePreloadEvent: chapter_end', () => {
  it('sets hasChoice flag', () => {
    const acc = createPreloadAccumulator();
    const event: StoryEvent = {
      type: 'chapter_end',
      data: { chapterIndex: 1, hasChoice: true },
    };
    const next = reducePreloadEvent(event, acc, demoCtx);
    expect(next.hasChoice).toBe(true);
  });

  it('replaces chapterText with fullText if provided (cleaned text)', () => {
    const acc = createPreloadAccumulator();
    acc.chapterText = 'partial with [tool_result] artifacts';
    const event: StoryEvent = {
      type: 'chapter_end',
      data: { chapterIndex: 1, hasChoice: false, fullText: 'cleaned final text' },
    };
    const next = reducePreloadEvent(event, acc, demoCtx);
    expect(next.chapterText).toBe('cleaned final text');
  });

  it('preserves accumulated chapterText if fullText is not provided', () => {
    const acc = createPreloadAccumulator();
    acc.chapterText = 'accumulated';
    const event: StoryEvent = {
      type: 'chapter_end',
      data: { chapterIndex: 1, hasChoice: false },
    };
    const next = reducePreloadEvent(event, acc, demoCtx);
    expect(next.chapterText).toBe('accumulated');
  });
});

// ============================================================
// reducePreloadEvent — illustration_generated
// ============================================================

describe('reducePreloadEvent: illustration_generated', () => {
  it('updates illustrationUrl when chapterIndex matches', () => {
    const acc = createPreloadAccumulator();
    acc.chapterIndex = 2;
    const event: StoryEvent = {
      type: 'illustration_generated',
      data: { chapterIndex: 2, illustrationUrl: 'https://x/y.png' },
    };
    const next = reducePreloadEvent(event, acc, demoCtx);
    expect(next.illustrationUrl).toBe('https://x/y.png');
  });

  it('ignores illustration for a different chapter index', () => {
    const acc = createPreloadAccumulator();
    acc.chapterIndex = 2;
    acc.illustrationUrl = 'original';
    const event: StoryEvent = {
      type: 'illustration_generated',
      data: { chapterIndex: 5, illustrationUrl: 'https://x/other.png' },
    };
    const next = reducePreloadEvent(event, acc, demoCtx);
    expect(next.illustrationUrl).toBe('original');
  });
});

// ============================================================
// reducePreloadEvent — choice_prompt
// ============================================================

describe('reducePreloadEvent: choice_prompt', () => {
  it('stores choice data (chapterIndex/prompt/options)', () => {
    const acc = createPreloadAccumulator();
    const options = [
      { id: 'A', label: 'Path A', hint: 'hint A' },
      { id: 'B', label: 'Path B', hint: 'hint B' },
    ];
    const event: StoryEvent = {
      type: 'choice_prompt',
      data: { chapterIndex: 2, prompt: 'Which path?', options },
    };
    const next = reducePreloadEvent(event, acc, demoCtx);
    expect(next.choiceData).toEqual({
      chapterIndex: 2,
      prompt: 'Which path?',
      options,
    });
  });

  it('overwrites previous choice data on second choice_prompt', () => {
    const acc = createPreloadAccumulator();
    acc.choiceData = { chapterIndex: 1, prompt: 'old', options: [] };
    const event: StoryEvent = {
      type: 'choice_prompt',
      data: { chapterIndex: 2, prompt: 'new', options: [{ id: 'A', label: 'a', hint: 'h' }] },
    };
    const next = reducePreloadEvent(event, acc, demoCtx);
    expect(next.choiceData?.chapterIndex).toBe(2);
    expect(next.choiceData?.prompt).toBe('new');
  });
});

// ============================================================
// reducePreloadEvent — outline_generated / outline_updated
// ============================================================

describe('reducePreloadEvent: outline_generated', () => {
  it('builds newOutline from event data + ctx.decisionType/Description', () => {
    const acc = createPreloadAccumulator();
    const chapters = [
      { index: 1, title: 'Ch1', summary: 's1', hasChoice: false, tone: 'neutral' as const, timeSpan: 'now' },
      { index: 2, title: 'Ch2', summary: 's2', hasChoice: true, tone: 'twist' as const, timeSpan: 'later' },
    ];
    const event: StoryEvent = {
      type: 'outline_generated',
      data: { version: 1, chapters, endingHint: 'maybe' },
    };
    const next = reducePreloadEvent(event, acc, demoCtx);
    expect(next.newOutline).toEqual({
      version: 1,
      decisionType: 'bought',
      decisionDescription: 'Bought $89 shoes',
      chapters,
      endingHint: 'maybe',
    } satisfies StoryOutline);
  });

  it('returns acc unchanged when ctx.decisionType is undefined', () => {
    const acc = createPreloadAccumulator();
    acc.chapterText = 'preserve me';
    const ctx: PreloadContext = {
      isDemo: false,
      decisionType: undefined,
      decisionDescription: undefined,
    };
    const event: StoryEvent = {
      type: 'outline_generated',
      data: { version: 1, chapters: [], endingHint: 'x' },
    };
    const next = reducePreloadEvent(event, acc, ctx);
    expect(next).toBe(acc);
    expect(next.newOutline).toBeNull();
  });

  it('handles outline_updated identically to outline_generated', () => {
    const acc = createPreloadAccumulator();
    acc.newOutline = {
      version: 1,
      decisionType: 'bought',
      decisionDescription: 'old',
      chapters: [],
      endingHint: 'old hint',
    };
    const event: StoryEvent = {
      type: 'outline_updated',
      data: { version: 2, chapters: [], endingHint: 'new hint' },
    };
    const next = reducePreloadEvent(event, acc, demoCtx);
    expect(next.newOutline?.version).toBe(2);
    expect(next.newOutline?.endingHint).toBe('new hint');
  });
});

// ============================================================
// reducePreloadEvent — story_complete
// ============================================================

describe('reducePreloadEvent: story_complete', () => {
  it('records storyCompleteData without mutating other fields', () => {
    const acc = createPreloadAccumulator();
    acc.chapterText = 'final chapter text';
    const completeData = {
      finalTone: 'twist' as const,
      totalChapters: 5,
      butterflyEffect: 'A single decision changed everything.',
    };
    const event: StoryEvent = { type: 'story_complete', data: completeData };
    const next = reducePreloadEvent(event, acc, demoCtx);
    expect(next.storyCompleteData).toEqual(completeData);
    expect(next.chapterText).toBe('final chapter text');
  });
});

// ============================================================
// reducePreloadEvent — unknown / default
// ============================================================

describe('reducePreloadEvent: unknown event types', () => {
  it('returns acc unchanged for unknown event type', () => {
    const acc = createPreloadAccumulator();
    acc.chapterText = 'preserved';
    // Cast to StoryEvent to simulate a future/unknown event type not in the union
    const event = { type: 'unknown_future_event', data: {} } as unknown as StoryEvent;
    const next = reducePreloadEvent(event, acc, demoCtx);
    expect(next).toBe(acc);
  });

  it('returns acc unchanged for illustration_failed (no handler)', () => {
    const acc = createPreloadAccumulator();
    acc.illustrationUrl = 'existing';
    const event: StoryEvent = {
      type: 'illustration_failed',
      data: { chapterIndex: 1, reason: 'timeout' },
    };
    const next = reducePreloadEvent(event, acc, demoCtx);
    expect(next).toBe(acc);
    expect(next.illustrationUrl).toBe('existing');
  });
});

// ============================================================
// buildPreloadedChapter
// ============================================================

describe('buildPreloadedChapter', () => {
  it('constructs StoryChapter from accumulator fields', () => {
    const acc = createPreloadAccumulator();
    acc.chapterIndex = 3;
    acc.chapterTitle = 'The Turning Point';
    acc.chapterText = 'Full chapter content...';
    acc.chapterTone = 'dark';
    acc.chapterTimeSpan = '5 years later';
    acc.hasChoice = true;
    acc.illustrationUrl = 'https://x/illustration.png';

    const chapter = buildPreloadedChapter(acc);
    expect(chapter).toEqual({
      index: 3,
      title: 'The Turning Point',
      content: 'Full chapter content...',
      tone: 'dark',
      timeSpan: '5 years later',
      hasChoice: true,
      illustrationUrl: 'https://x/illustration.png',
      createdAt: expect.any(String) as string,
    });
  });

  it('omits illustrationUrl when acc.illustrationUrl is null or empty', () => {
    const accNull = createPreloadAccumulator();
    accNull.chapterIndex = 1;
    accNull.chapterTitle = 'T';
    accNull.chapterText = 'text';
    accNull.chapterTone = 'neutral';
    accNull.chapterTimeSpan = 'now';
    accNull.illustrationUrl = null;
    expect(buildPreloadedChapter(accNull).illustrationUrl).toBeUndefined();

    const accEmpty = createPreloadAccumulator();
    accEmpty.chapterIndex = 1;
    accEmpty.chapterTitle = 'T';
    accEmpty.chapterText = 'text';
    accEmpty.chapterTone = 'neutral';
    accEmpty.chapterTimeSpan = 'now';
    accEmpty.illustrationUrl = '';
    expect(buildPreloadedChapter(accEmpty).illustrationUrl).toBeUndefined();
  });

  it('generates a valid ISO timestamp for createdAt', () => {
    const acc = createPreloadAccumulator();
    acc.chapterIndex = 1;
    const chapter = buildPreloadedChapter(acc);
    expect(() => new Date(chapter.createdAt).toISOString()).not.toThrow();
    expect(new Date(chapter.createdAt).toString()).not.toBe('Invalid Date');
  });
});

// ============================================================
// Integration: full SSE pipeline
// ============================================================

describe('integration: full preload pipeline', () => {
  it('processes a complete chapter stream into a StoryChapter', () => {
    const lines = [
      'data: {"type":"chapter_start","data":{"chapterIndex":2,"title":"Ch2","tone":"hopeful","timeSpan":"next day"}}',
      'data: {"type":"chapter_text","data":{"chapterIndex":2,"text":"Once upon "}}',
      'data: {"type":"chapter_text","data":{"chapterIndex":2,"text":"a time..."}}',
      'data: {"type":"chapter_end","data":{"chapterIndex":2,"hasChoice":false,"fullText":"Once upon a time..."}}',
      'data: [DONE]',
    ];

    let acc = createPreloadAccumulator();
    for (const line of lines) {
      const event = parseSSELine(line);
      if (event) acc = reducePreloadEvent(event, acc, demoCtx);
    }

    expect(acc.chapterText).toBe('Once upon a time...');
    expect(acc.hasChoice).toBe(false);
    expect(acc.chapterIndex).toBe(2);

    const chapter = buildPreloadedChapter(acc);
    expect(chapter.index).toBe(2);
    expect(chapter.title).toBe('Ch2');
    expect(chapter.content).toBe('Once upon a time...');
    expect(chapter.tone).toBe('hopeful');
  });

  it('processes a choice chapter with illustration + choice_prompt', () => {
    const lines = [
      'data: {"type":"chapter_start","data":{"chapterIndex":3,"title":"Crossroads","tone":"twist","timeSpan":"later"}}',
      'data: {"type":"chapter_text","data":{"chapterIndex":3,"text":"You stand at a fork..."}}',
      'data: {"type":"illustration_generated","data":{"chapterIndex":3,"illustrationUrl":"https://x/c.png"}}',
      'data: {"type":"chapter_end","data":{"chapterIndex":3,"hasChoice":true}}',
      'data: {"type":"choice_prompt","data":{"chapterIndex":3,"prompt":"Which path?","options":[{"id":"A","label":"Left","hint":"safe"},{"id":"B","label":"Right","hint":"risky"}]}}',
    ];

    let acc = createPreloadAccumulator();
    for (const line of lines) {
      const event = parseSSELine(line);
      if (event) acc = reducePreloadEvent(event, acc, demoCtx);
    }

    expect(acc.hasChoice).toBe(true);
    expect(acc.illustrationUrl).toBe('https://x/c.png');
    expect(acc.choiceData?.prompt).toBe('Which path?');
    expect(acc.choiceData?.options).toHaveLength(2);

    const chapter = buildPreloadedChapter(acc);
    expect(chapter.illustrationUrl).toBe('https://x/c.png');
  });

  it('handles story_complete at the end of last chapter', () => {
    const lines = [
      'data: {"type":"chapter_start","data":{"chapterIndex":5,"title":"Finale","tone":"twist","timeSpan":"end"}}',
      'data: {"type":"chapter_text","data":{"chapterIndex":5,"text":"The end."}}',
      'data: {"type":"chapter_end","data":{"chapterIndex":5,"hasChoice":false}}',
      'data: {"type":"story_complete","data":{"finalTone":"twist","totalChapters":5,"butterflyEffect":"Everything changed."}}',
    ];

    let acc = createPreloadAccumulator();
    for (const line of lines) {
      const event = parseSSELine(line);
      if (event) acc = reducePreloadEvent(event, acc, demoCtx);
    }

    expect(acc.storyCompleteData).toEqual({
      finalTone: 'twist',
      totalChapters: 5,
      butterflyEffect: 'Everything changed.',
    });
  });
});
