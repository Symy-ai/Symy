/**
 * Tests for butterfly/lib/engine/ — pure helper functions for story-engine.ts
 *
 * 🔧 ARCH fix (Round 75 ARCH-DEEP-75): 测试覆盖率 — engine/ 0 tests → +N tests
 *
 * Scope: ONLY pure functions (no DB / no Letta / no Supabase).
 *   - constants.ts: DEFAULT_CHAPTER_COUNT, CHOICE_CHAPTER_INDICES
 *   - prompts.ts: cleanAgentReply, buildOutlineSystemPrompt, buildOutlineUserPrompt,
 *     buildRegenerateOutlinePrompt, buildChapterStorySystemPrompt,
 *     buildChapterStoryUserPrompt, buildChoiceOptionsPrompt, buildButterflyAgentMessage
 *   - parsers.ts: parseOutlineFromLLM, parseChoiceFromLLM, validateTone, generateFallbackOutline
 *   - stream-helpers.ts: isToolCallEvent, extractTextFromLettaSSELine, truncateAtSentence
 *
 * Skipped (require Letta/Supabase):
 *   - story-engine.ts: generateOutline, regenerateOutline, streamChapterStory,
 *     generateChoiceOptions, generateButterflySummary, clearButterflyContextFromAgent
 *   - stream-helpers.ts: transformLettaStreamToStoryStream (semi-pure, takes a stream)
 */

import { describe, it, expect } from 'vitest';
import {
  DEFAULT_CHAPTER_COUNT,
  CHOICE_CHAPTER_INDICES,
} from '@/features/butterfly/lib/engine/constants';
import {
  cleanAgentReply,
  buildOutlineSystemPrompt,
  buildOutlineUserPrompt,
  buildRegenerateOutlinePrompt,
  buildChapterStorySystemPrompt,
  buildChapterStoryUserPrompt,
  buildChoiceOptionsPrompt,
  buildButterflyAgentMessage,
} from '@/features/butterfly/lib/engine/prompts';
import {
  parseOutlineFromLLM,
  parseChoiceFromLLM,
  validateTone,
  generateFallbackOutline,
} from '@/features/butterfly/lib/engine/parsers';
import {
  isToolCallEvent,
  extractTextFromLettaSSELine,
  truncateAtSentence,
} from '@/features/butterfly/lib/engine/stream-helpers';
import type { StoryOutline, StoryChapter } from '@/features/butterfly/types';

// ============================================================
// Constants
// ============================================================

describe('DEFAULT_CHAPTER_COUNT', () => {
  it('is 3 (V37 optimization: 5 → 3 chapters)', () => {
    expect(DEFAULT_CHAPTER_COUNT).toBe(3);
  });

  it('is a positive integer', () => {
    expect(Number.isInteger(DEFAULT_CHAPTER_COUNT)).toBe(true);
    expect(DEFAULT_CHAPTER_COUNT).toBeGreaterThan(0);
  });
});

describe('CHOICE_CHAPTER_INDICES', () => {
  it('is [2] (only one crossroads, at chapter 2 of 3)', () => {
    expect(CHOICE_CHAPTER_INDICES).toEqual([2]);
  });

  it('contains valid indices within chapter count (1..DEFAULT_CHAPTER_COUNT)', () => {
    for (const idx of CHOICE_CHAPTER_INDICES) {
      expect(idx).toBeGreaterThanOrEqual(1);
      expect(idx).toBeLessThan(DEFAULT_CHAPTER_COUNT); // strict < so there's an ending chapter after
    }
  });

  it('has at least one choice index (story must have at least one crossroads)', () => {
    expect(CHOICE_CHAPTER_INDICES.length).toBeGreaterThan(0);
  });
});

// ============================================================
// cleanAgentReply
// ============================================================

describe('cleanAgentReply', () => {
  it('trims whitespace', () => {
    expect(cleanAgentReply('  hello  ', 'prose')).toBe('hello');
  });

  it('removes "Here\'s the story:" prefix when followed by newline + ```', () => {
    const input = "Here's the story:\n```\nOnce upon a time...\n```";
    expect(cleanAgentReply(input, 'json')).toBe('Once upon a time...');
  });

  it('removes "Here is your outline:" prefix when followed by newline + {', () => {
    const input = "Here is your outline:\n{\"chapters\":[]}";
    expect(cleanAgentReply(input, 'json')).toBe('{"chapters":[]}');
  });

  it('removes "I\'ll generate you a story:" prefix', () => {
    const input = "I'll generate you a story:\n```\ncontent\n```";
    expect(cleanAgentReply(input, 'json')).toBe('content');
  });

  it('removes "Let me create the outline:" prefix', () => {
    const input = "Let me create the outline:\n```\njson content\n```";
    expect(cleanAgentReply(input, 'json')).toBe('json content');
  });

  it('removes "I\'ve recorded..." patterns', () => {
    const input = "I've recorded your tokens.\n\n```\nactual content\n```";
    expect(cleanAgentReply(input, 'json')).toBe('actual content');
  });

  it('removes tool result patterns (I\'ve updated...)', () => {
    const input = "I've updated your buddy state.\n\n```json\n{\"a\":1}\n```";
    expect(cleanAgentReply(input, 'json')).toBe('{"a":1}');
  });

  it('removes "Your buddy..." patterns', () => {
    const input = "Your buddy is thriving.\n\n```\ncontent\n```";
    expect(cleanAgentReply(input, 'json')).toBe('content');
  });

  it('removes "Tool call..." patterns', () => {
    const input = "Tool call executed.\n\n```\ncontent\n```";
    expect(cleanAgentReply(input, 'json')).toBe('content');
  });

  it('in json mode, extracts content from code block', () => {
    const input = '```json\n{"key":"value"}\n```';
    expect(cleanAgentReply(input, 'json')).toBe('{"key":"value"}');
  });

  it('in json mode, extracts content from code block without json lang tag', () => {
    const input = '```\n{"key":"value"}\n```';
    expect(cleanAgentReply(input, 'json')).toBe('{"key":"value"}');
  });

  it('in prose mode, does NOT extract from code block (returns full text)', () => {
    const input = '```\nsome prose\n```';
    // In prose mode, no code block extraction — returns as-is after trimming
    const result = cleanAgentReply(input, 'prose');
    expect(result).toContain('some prose');
  });

  it('returns empty string for empty input', () => {
    expect(cleanAgentReply('', 'prose')).toBe('');
    expect(cleanAgentReply('', 'json')).toBe('');
  });

  it('returns empty string for whitespace-only input', () => {
    expect(cleanAgentReply('   \n\t  ', 'prose')).toBe('');
  });

  it('does not remove prefix when not followed by newline + ``` or {', () => {
    // Prefix on same line as content — should NOT be removed (regex requires \n)
    const input = "Here's the story: content here";
    expect(cleanAgentReply(input, 'prose')).toBe("Here's the story: content here");
  });

  it('preserves dollar signs in content (regression test)', () => {
    const input = '```json\n{"amount": "$55"}\n```';
    expect(cleanAgentReply(input, 'json')).toBe('{"amount": "$55"}');
  });
});

// ============================================================
// buildOutlineSystemPrompt
// ============================================================

describe('buildOutlineSystemPrompt', () => {
  it('returns a non-empty string', () => {
    const prompt = buildOutlineSystemPrompt();
    expect(typeof prompt).toBe('string');
    expect(prompt.length).toBeGreaterThan(500);
  });

  it('includes DEFAULT_CHAPTER_COUNT (3) as the chapter count', () => {
    const prompt = buildOutlineSystemPrompt();
    expect(prompt).toContain('3 chapters');
  });

  it('mentions butterfly effect', () => {
    const prompt = buildOutlineSystemPrompt();
    expect(prompt.toLowerCase()).toContain('butterfly');
  });

  it('mentions JSON output format', () => {
    const prompt = buildOutlineSystemPrompt();
    expect(prompt).toContain('JSON');
  });

  it('mentions tone values (hopeful, neutral, dark, twist)', () => {
    const prompt = buildOutlineSystemPrompt();
    expect(prompt).toContain('hopeful');
    expect(prompt).toContain('neutral');
    expect(prompt).toContain('dark');
    expect(prompt).toContain('twist');
  });

  it('emphasizes short time spans (hours/days, not years)', () => {
    const prompt = buildOutlineSystemPrompt();
    expect(prompt.toLowerCase()).toContain('short');
    expect(prompt).toContain('hours');
  });

  it('returns the same content on repeated calls (pure)', () => {
    const a = buildOutlineSystemPrompt();
    const b = buildOutlineSystemPrompt();
    expect(a).toBe(b);
  });
});

// ============================================================
// buildOutlineUserPrompt
// ============================================================

describe('buildOutlineUserPrompt', () => {
  it('includes "DECIDED TO BUY" for bought decision type', () => {
    const prompt = buildOutlineUserPrompt('bought', 'a widget', 50, 'amazon');
    expect(prompt).toContain('DECIDED TO BUY');
    expect(prompt).toContain('a widget');
  });

  it('includes "DECIDED NOT TO BUY" for resisted decision type', () => {
    const prompt = buildOutlineUserPrompt('resisted', 'a jacket', 100, 'tiktok_shop');
    expect(prompt).toContain('DECIDED NOT TO BUY');
    expect(prompt).toContain('a jacket');
  });

  it('includes formatted amount when provided', () => {
    const prompt = buildOutlineUserPrompt('bought', 'thing', 89.99, 'amazon');
    expect(prompt).toContain('$89.99');
  });

  it('omits amount line when not provided', () => {
    const prompt = buildOutlineUserPrompt('bought', 'thing');
    expect(prompt).not.toMatch(/Amount:/);
  });

  it('includes context when provided', () => {
    const prompt = buildOutlineUserPrompt('bought', 'thing', 50, 'amazon', 'User has low vitality');
    expect(prompt).toContain('User has low vitality');
  });

  it('includes USER CONTEXT warning when context is provided', () => {
    const prompt = buildOutlineUserPrompt('bought', 'thing', 50, 'amazon', 'some context');
    expect(prompt).toContain('USER CONTEXT');
  });

  it('omits USER CONTEXT warning when context is not provided', () => {
    const prompt = buildOutlineUserPrompt('bought', 'thing', 50, 'amazon');
    expect(prompt).not.toContain('USER CONTEXT');
  });

  it('includes chapter count (3)', () => {
    const prompt = buildOutlineUserPrompt('bought', 'thing');
    expect(prompt).toContain('3 chapters');
  });

  it('preserves dollar signs in decisionDescription', () => {
    const prompt = buildOutlineUserPrompt('bought', '$55 shirt', 55);
    expect(prompt).toContain('$55 shirt');
  });
});

// ============================================================
// buildRegenerateOutlinePrompt
// ============================================================

describe('buildRegenerateOutlinePrompt', () => {
  const mockOutline: StoryOutline = {
    version: 1,
    decisionType: 'bought',
    decisionDescription: 'a widget',
    chapters: [
      { index: 1, title: 'Ch1', summary: 'Summary 1', hasChoice: false, tone: 'neutral', timeSpan: 'now' },
      { index: 2, title: 'Ch2', summary: 'Summary 2', hasChoice: true, tone: 'twist', timeSpan: 'later' },
    ],
    endingHint: 'Hint',
  };
  const mockPrevChapters: StoryChapter[] = [
    { index: 1, title: 'Ch1', content: 'Content 1', tone: 'neutral', timeSpan: 'now', hasChoice: false, createdAt: '2024-01-01' },
    { index: 2, title: 'Ch2', content: 'Content 2', tone: 'twist', timeSpan: 'later', hasChoice: true, createdAt: '2024-01-02' },
  ];

  it('includes chapter summaries from previous outline (only for told chapters)', () => {
    // buildRegenerateOutlinePrompt filters previousOutline.chapters by ch.index <= previousChapters.length
    // With 2 previousChapters, both chapter summaries should appear.
    const prompt = buildRegenerateOutlinePrompt(mockPrevChapters, mockOutline, {
      prompt: 'Which path?',
      selectedOption: 'A',
      selectedLabel: 'Left',
    }, 'bought');
    expect(prompt).toContain('Summary 1');
    expect(prompt).toContain('Summary 2');
  });

  it('includes the selected choice label', () => {
    const prompt = buildRegenerateOutlinePrompt(mockPrevChapters, mockOutline, {
      prompt: 'Which path?',
      selectedOption: 'A',
      selectedLabel: 'Left turn',
    }, 'bought');
    expect(prompt).toContain('Left turn');
  });

  it('includes the next chapter index (previousChapters.length + 1)', () => {
    // With 2 previousChapters, next chapter index = 3
    const prompt = buildRegenerateOutlinePrompt(mockPrevChapters, mockOutline, {
      prompt: 'P',
      selectedOption: 'A',
      selectedLabel: 'L',
    }, 'bought');
    expect(prompt).toContain('chapter 3'); // previousChapters.length (2) + 1 = 3
  });

  it('includes the choice prompt question', () => {
    const prompt = buildRegenerateOutlinePrompt(mockPrevChapters, mockOutline, {
      prompt: 'Which path will you take?',
      selectedOption: 'A',
      selectedLabel: 'L',
    }, 'bought');
    expect(prompt).toContain('Which path will you take?');
  });

  it('includes the JSON output format', () => {
    const prompt = buildRegenerateOutlinePrompt(mockPrevChapters, mockOutline, {
      prompt: 'P',
      selectedOption: 'A',
      selectedLabel: 'L',
    }, 'bought');
    expect(prompt).toContain('```json');
  });

  it('includes "bought" / "resisted" based on decisionType', () => {
    const boughtPrompt = buildRegenerateOutlinePrompt(mockPrevChapters, mockOutline, {
      prompt: 'P', selectedOption: 'A', selectedLabel: 'L',
    }, 'bought');
    expect(boughtPrompt).toContain('bought');

    const resistedPrompt = buildRegenerateOutlinePrompt(mockPrevChapters, mockOutline, {
      prompt: 'P', selectedOption: 'A', selectedLabel: 'L',
    }, 'resisted');
    expect(resistedPrompt).toContain('resisted buying');
  });
});

// ============================================================
// buildChapterStorySystemPrompt
// ============================================================

describe('buildChapterStorySystemPrompt', () => {
  it('returns a non-empty string', () => {
    const prompt = buildChapterStorySystemPrompt();
    expect(typeof prompt).toBe('string');
    expect(prompt.length).toBeGreaterThan(500);
  });

  it('mentions "scene cards" / visual novel format', () => {
    const prompt = buildChapterStorySystemPrompt();
    expect(prompt.toLowerCase()).toContain('scene');
  });

  // 🔧 P1-4 fix: Changed from 5 scenes (||| separated) to 1 scene per chapter (shorter format)
  it('mentions "scene" / visual novel format', () => {
    const prompt = buildChapterStorySystemPrompt();
    expect(prompt.toLowerCase()).toContain('scene');
  });

  it('requires exactly 1 scene per chapter (P1-4 shorter format)', () => {
    const prompt = buildChapterStorySystemPrompt();
    expect(prompt).toContain('1 scene');
    // Should NOT mention 5 scenes (old format)
    expect(prompt).not.toContain('5 scene');
  });

  it('requires second person ("you") narrative', () => {
    const prompt = buildChapterStorySystemPrompt();
    // Prompt uses "Second person" (capital S) — check case-insensitively
    expect(prompt.toLowerCase()).toContain('second person');
  });
});

// ============================================================
// Story language instruction (batch73-c — locale 穿线后 zh 用户故事必须中文)
// ============================================================

describe('story language instruction', () => {
  it('buildOutlineSystemPrompt requires Chinese output for zh', () => {
    const prompt = buildOutlineSystemPrompt('zh');
    expect(prompt).toContain('Chinese (Simplified)');
    expect(prompt).not.toContain('Write the ENTIRE story in **English**');
  });

  it('buildOutlineSystemPrompt defaults to English when locale is missing', () => {
    expect(buildOutlineSystemPrompt()).toContain(
      'Write the ENTIRE story in **English**',
    );
  });

  it('buildChapterStorySystemPrompt requires Chinese output for zh', () => {
    const prompt = buildChapterStorySystemPrompt('zh');
    expect(prompt).toContain('Chinese (Simplified)');
    expect(prompt).not.toContain('in **English**');
  });

  it('buildChapterStorySystemPrompt defaults to English when locale is missing', () => {
    expect(buildChapterStorySystemPrompt()).toContain('in **English**');
  });
});

// ============================================================
// buildChapterStoryUserPrompt
// ============================================================

describe('buildChapterStoryUserPrompt', () => {
  const mockChapter = {
    index: 2,
    title: 'The First Ripple',
    summary: 'Summary',
    hasChoice: true,
    tone: 'twist' as const,
    timeSpan: 'the next morning',
  };

  it('includes chapter index and title', () => {
    const prompt = buildChapterStoryUserPrompt(mockChapter, 'bought', 'a widget');
    expect(prompt).toContain('Chapter 2');
    expect(prompt).toContain('The First Ripple');
  });

  it('includes chapter summary', () => {
    const prompt = buildChapterStoryUserPrompt(mockChapter, 'bought', 'a widget');
    expect(prompt).toContain('Summary');
  });

  it('includes time span', () => {
    const prompt = buildChapterStoryUserPrompt(mockChapter, 'bought', 'a widget');
    expect(prompt).toContain('the next morning');
  });

  it('includes tone', () => {
    const prompt = buildChapterStoryUserPrompt(mockChapter, 'bought', 'a widget');
    expect(prompt).toContain('twist');
  });

  it('includes decision type and description', () => {
    const prompt = buildChapterStoryUserPrompt(mockChapter, 'bought', 'a widget');
    expect(prompt).toContain('bought');
    expect(prompt).toContain('a widget');
  });

  it('omits previous chapter context when not provided', () => {
    const prompt = buildChapterStoryUserPrompt(mockChapter, 'bought', 'a widget');
    expect(prompt).not.toContain('Previous chapter');
  });

  it('includes previous chapter context (last 300 chars) when provided', () => {
    const prev = 'A'.repeat(500);
    const prompt = buildChapterStoryUserPrompt(mockChapter, 'bought', 'a widget', prev);
    expect(prompt).toContain('Previous chapter');
    // Should include the last 300 chars of prev
    expect(prompt).toContain('A'.repeat(300));
    // Should NOT include the first 200 chars (only last 300)
    expect(prompt).not.toContain('A'.repeat(301));
  });

  it('includes user context section when storyContext provided', () => {
    const prompt = buildChapterStoryUserPrompt(mockChapter, 'bought', 'a widget', undefined, 'User has Iceland dream fund');
    expect(prompt).toContain('USER CONTEXT');
    expect(prompt).toContain('Iceland');
  });

  it('omits user context section when storyContext not provided', () => {
    const prompt = buildChapterStoryUserPrompt(mockChapter, 'bought', 'a widget');
    expect(prompt).not.toContain('USER CONTEXT');
  });
});

// ============================================================
// buildChoiceOptionsPrompt
// ============================================================

describe('buildChoiceOptionsPrompt', () => {
  const mockChapter = {
    index: 2,
    title: 'The First Ripple',
    summary: 'Summary',
    hasChoice: true,
    tone: 'twist' as const,
    timeSpan: 'later',
  };

  it('includes chapter index and title', () => {
    const prompt = buildChoiceOptionsPrompt(mockChapter, 'chapter content here', 'bought');
    expect(prompt).toContain('Chapter 2');
    expect(prompt).toContain('The First Ripple');
  });

  it('includes chapter ending (last 500 chars)', () => {
    const content = 'B'.repeat(700);
    const prompt = buildChoiceOptionsPrompt(mockChapter, content, 'bought');
    expect(prompt).toContain('Chapter ending');
    expect(prompt).toContain('B'.repeat(500));
    expect(prompt).not.toContain('B'.repeat(501));
  });

  it('includes decision type', () => {
    const prompt = buildChoiceOptionsPrompt(mockChapter, 'content', 'bought');
    expect(prompt).toContain('bought');
  });

  it('requires EXACTLY 2 choice options (A and B)', () => {
    const prompt = buildChoiceOptionsPrompt(mockChapter, 'content', 'bought');
    expect(prompt).toContain('EXACTLY 2 choice options');
    expect(prompt).toContain('"A"');
    expect(prompt).toContain('"B"');
  });

  it('includes JSON output format', () => {
    const prompt = buildChoiceOptionsPrompt(mockChapter, 'content', 'bought');
    expect(prompt).toContain('```json');
  });

  it('includes user context section when storyContext provided', () => {
    const prompt = buildChoiceOptionsPrompt(mockChapter, 'content', 'bought', 'user has low vitality');
    expect(prompt).toContain('User context');
    expect(prompt).toContain('low vitality');
  });

  it('omits user context section when storyContext not provided', () => {
    const prompt = buildChoiceOptionsPrompt(mockChapter, 'content', 'bought');
    expect(prompt).not.toContain('User context');
  });
});

// ============================================================
// buildButterflyAgentMessage
// ============================================================

describe('buildButterflyAgentMessage', () => {
  it('includes "[BUTTERFLY EFFECT - OUTLINE MODE]" for outline mode', () => {
    const msg = buildButterflyAgentMessage('outline', 'sys', 'usr');
    expect(msg).toContain('[BUTTERFLY EFFECT - OUTLINE MODE]');
  });

  it('includes "[BUTTERFLY EFFECT - CHAPTER MODE]" for chapter mode', () => {
    const msg = buildButterflyAgentMessage('chapter', 'sys', 'usr');
    expect(msg).toContain('[BUTTERFLY EFFECT - CHAPTER MODE]');
  });

  it('includes "[BUTTERFLY EFFECT - CHOICE MODE]" for choice mode', () => {
    const msg = buildButterflyAgentMessage('choice', 'sys', 'usr');
    expect(msg).toContain('[BUTTERFLY EFFECT - CHOICE MODE]');
  });

  it('includes "[BUTTERFLY EFFECT - REGENERATE MODE]" for regenerate mode', () => {
    const msg = buildButterflyAgentMessage('regenerate', 'sys', 'usr');
    expect(msg).toContain('[BUTTERFLY EFFECT - REGENERATE MODE]');
  });

  it('includes "[BUTTERFLY EFFECT - SUMMARY MODE]" for summary mode', () => {
    const msg = buildButterflyAgentMessage('summary', 'sys', 'usr');
    expect(msg).toContain('[BUTTERFLY EFFECT - SUMMARY MODE]');
  });

  it('includes CRITICAL INSTRUCTION to not call tools', () => {
    const msg = buildButterflyAgentMessage('outline', 'sys', 'usr');
    expect(msg).toContain('CRITICAL INSTRUCTION');
    expect(msg).toContain('NOT call any tools');
  });

  it('mentions specific tool names that should not be called', () => {
    const msg = buildButterflyAgentMessage('chapter', 'sys', 'usr');
    expect(msg).toContain('add_tokens');
    expect(msg).toContain('record_impulse');
    expect(msg).toContain('complete_challenge');
  });

  it('includes systemPrompt content', () => {
    const msg = buildButterflyAgentMessage('outline', 'SYS_PROMPT_CONTENT', 'usr');
    expect(msg).toContain('SYS_PROMPT_CONTENT');
  });

  it('includes userPrompt content', () => {
    const msg = buildButterflyAgentMessage('outline', 'sys', 'USR_PROMPT_CONTENT');
    expect(msg).toContain('USR_PROMPT_CONTENT');
  });

  it('includes a separator between system and user prompts', () => {
    const msg = buildButterflyAgentMessage('outline', 'sys', 'usr');
    expect(msg).toContain('---');
  });

  it('includes a final REMINDER about no tools', () => {
    const msg = buildButterflyAgentMessage('outline', 'sys', 'usr');
    expect(msg).toContain('REMINDER');
  });

  it('handles empty systemPrompt', () => {
    const msg = buildButterflyAgentMessage('choice', '', 'usr');
    expect(msg).toContain('[BUTTERFLY EFFECT - CHOICE MODE]');
    expect(msg).toContain('usr');
  });
});

// ============================================================
// parseOutlineFromLLM
// ============================================================

describe('parseOutlineFromLLM', () => {
  it('parses valid JSON with chapters', () => {
    const json = JSON.stringify({
      chapters: [
        { index: 1, title: 'Ch1', summary: 'S1', tone: 'neutral', timeSpan: 'now' },
        { index: 2, title: 'Ch2', summary: 'S2', tone: 'twist', timeSpan: 'later' },
        { index: 3, title: 'Ch3', summary: 'S3', tone: 'twist', timeSpan: 'end' },
      ],
      endingHint: 'The end',
    });
    const outline = parseOutlineFromLLM(json, 'bought', 'a widget');
    expect(outline.version).toBe(1);
    expect(outline.chapters).toHaveLength(3);
    expect(outline.chapters[0].title).toBe('Ch1');
    expect(outline.endingHint).toBe('The end');
  });

  it('sets hasChoice based on CHOICE_CHAPTER_INDICES (chapter 2)', () => {
    const json = JSON.stringify({
      chapters: [
        { index: 1, title: 'Ch1', summary: 'S1', tone: 'neutral', timeSpan: 'now' },
        { index: 2, title: 'Ch2', summary: 'S2', tone: 'twist', timeSpan: 'later' },
        { index: 3, title: 'Ch3', summary: 'S3', tone: 'twist', timeSpan: 'end' },
      ],
      endingHint: 'end',
    });
    const outline = parseOutlineFromLLM(json, 'bought', 'widget');
    expect(outline.chapters[0].hasChoice).toBe(false); // index 1
    expect(outline.chapters[1].hasChoice).toBe(true);  // index 2
    expect(outline.chapters[2].hasChoice).toBe(false); // index 3
  });

  it('overrides LLM-provided hasChoice with CHOICE_CHAPTER_INDICES logic', () => {
    const json = JSON.stringify({
      chapters: [
        { index: 1, title: 'Ch1', summary: 'S1', hasChoice: true, tone: 'neutral', timeSpan: 'now' },
        { index: 2, title: 'Ch2', summary: 'S2', hasChoice: false, tone: 'twist', timeSpan: 'later' },
      ],
      endingHint: 'end',
    });
    const outline = parseOutlineFromLLM(json, 'bought', 'widget');
    expect(outline.chapters[0].hasChoice).toBe(false); // overridden
    expect(outline.chapters[1].hasChoice).toBe(true);  // overridden
  });

  it('defaults missing chapter index to i+1', () => {
    const json = JSON.stringify({
      chapters: [
        { title: 'Ch1', summary: 'S1', tone: 'neutral', timeSpan: 'now' }, // no index
        { title: 'Ch2', summary: 'S2', tone: 'twist', timeSpan: 'later' }, // no index
      ],
      endingHint: 'end',
    });
    const outline = parseOutlineFromLLM(json, 'bought', 'widget');
    expect(outline.chapters[0].index).toBe(1);
    expect(outline.chapters[1].index).toBe(2);
  });

  it('defaults missing title to "Chapter N"', () => {
    const json = JSON.stringify({
      chapters: [{ index: 1, summary: 'S1', tone: 'neutral', timeSpan: 'now' }], // no title
      endingHint: 'end',
    });
    const outline = parseOutlineFromLLM(json, 'bought', 'widget');
    expect(outline.chapters[0].title).toBe('Chapter 1');
  });

  it('defaults missing timeSpan to "sometime later"', () => {
    const json = JSON.stringify({
      chapters: [{ index: 1, title: 'Ch1', summary: 'S1', tone: 'neutral' }], // no timeSpan
      endingHint: 'end',
    });
    const outline = parseOutlineFromLLM(json, 'bought', 'widget');
    expect(outline.chapters[0].timeSpan).toBe('sometime later');
  });

  it('defaults missing endingHint to "The future remains unwritten."', () => {
    const json = JSON.stringify({
      chapters: [{ index: 1, title: 'Ch1', summary: 'S1', tone: 'neutral', timeSpan: 'now' }],
      // no endingHint
    });
    const outline = parseOutlineFromLLM(json, 'bought', 'widget');
    expect(outline.endingHint).toBe('The future remains unwritten.');
  });

  it('uses validateTone for invalid tone values (defaults to neutral)', () => {
    const json = JSON.stringify({
      chapters: [{ index: 1, title: 'Ch1', summary: 'S1', tone: 'INVALID_TONE', timeSpan: 'now' }],
      endingHint: 'end',
    });
    const outline = parseOutlineFromLLM(json, 'bought', 'widget');
    expect(outline.chapters[0].tone).toBe('neutral');
  });

  it('preserves decisionType and decisionDescription in result', () => {
    const json = JSON.stringify({
      chapters: [],
      endingHint: 'end',
    });
    const outline = parseOutlineFromLLM(json, 'resisted', 'a jacket');
    expect(outline.decisionType).toBe('resisted');
    expect(outline.decisionDescription).toBe('a jacket');
  });

  it('extracts JSON from text with prefix/suffix', () => {
    const input = `Here's your outline:
\`\`\`json
{"chapters":[{"index":1,"title":"Ch1","summary":"S1","tone":"neutral","timeSpan":"now"}],"endingHint":"end"}
\`\`\`
Hope you like it!`;
    const outline = parseOutlineFromLLM(input, 'bought', 'widget');
    expect(outline.chapters).toHaveLength(1);
    expect(outline.chapters[0].title).toBe('Ch1');
  });

  it('returns fallback outline when content has no JSON', () => {
    const outline = parseOutlineFromLLM('no json here', 'bought', 'widget');
    expect(outline.chapters).toHaveLength(3); // fallback has 3 chapters (Round 75 fix)
  });

  it('returns fallback outline when JSON is invalid', () => {
    const outline = parseOutlineFromLLM('{invalid json}', 'bought', 'widget');
    expect(outline.chapters).toHaveLength(3); // fallback has 3 chapters (Round 75 fix)
  });

  it('handles empty chapters array in JSON', () => {
    const json = JSON.stringify({ chapters: [], endingHint: 'end' });
    const outline = parseOutlineFromLLM(json, 'bought', 'widget');
    expect(outline.chapters).toEqual([]);
  });
});

// ============================================================
// parseChoiceFromLLM
// ============================================================

describe('parseChoiceFromLLM', () => {
  it('parses valid choice JSON', () => {
    const json = JSON.stringify({
      prompt: 'Which path?',
      options: [
        { id: 'A', label: 'Left', hint: 'Mystery' },
        { id: 'B', label: 'Right', hint: 'Safety' },
      ],
    });
    const result = parseChoiceFromLLM(json);
    expect(result.prompt).toBe('Which path?');
    expect(result.options).toHaveLength(2);
    expect(result.options[0].id).toBe('A');
    expect(result.options[1].id).toBe('B');
  });

  it('returns fallback choice when no JSON found', () => {
    const result = parseChoiceFromLLM('no json');
    expect(result.prompt).toBe('Which path do you take?');
    expect(result.options).toHaveLength(2);
    expect(result.options[0].id).toBe('A');
    expect(result.options[1].id).toBe('B');
  });

  it('returns fallback choice when JSON is invalid', () => {
    const result = parseChoiceFromLLM('{invalid}');
    expect(result.prompt).toBe('Which path do you take?');
    expect(result.options).toHaveLength(2);
  });

  it('defaults missing prompt to "What do you choose?"', () => {
    const json = JSON.stringify({ options: [] });
    const result = parseChoiceFromLLM(json);
    expect(result.prompt).toBe('What do you choose?');
  });

  it('defaults missing option id to A, B, C, ...', () => {
    const json = JSON.stringify({
      prompt: 'Pick',
      options: [
        { label: 'L1', hint: 'H1' }, // no id
        { label: 'L2', hint: 'H2' }, // no id
      ],
    });
    const result = parseChoiceFromLLM(json);
    expect(result.options[0].id).toBe('A');
    expect(result.options[1].id).toBe('B');
  });

  it('defaults missing label to "Option"', () => {
    const json = JSON.stringify({
      prompt: 'Pick',
      options: [{ id: 'A', hint: 'H1' }], // no label
    });
    const result = parseChoiceFromLLM(json);
    expect(result.options[0].label).toBe('Option');
  });

  it('defaults missing hint to empty string', () => {
    const json = JSON.stringify({
      prompt: 'Pick',
      options: [{ id: 'A', label: 'L' }], // no hint
    });
    const result = parseChoiceFromLLM(json);
    expect(result.options[0].hint).toBe('');
  });

  it('deduplicates duplicate option ids (M13 fix)', () => {
    const json = JSON.stringify({
      prompt: 'Pick',
      options: [
        { id: 'A', label: 'L1', hint: 'H1' },
        { id: 'A', label: 'L2', hint: 'H2' }, // duplicate id
        { id: 'A', label: 'L3', hint: 'H3' }, // duplicate id
      ],
    });
    const result = parseChoiceFromLLM(json);
    expect(result.options).toHaveLength(3);
    expect(result.options[0].id).toBe('A');
    expect(result.options[1].id).toBe('A_1');
    expect(result.options[2].id).toBe('A_2');
  });

  it('handles empty options array', () => {
    const json = JSON.stringify({ prompt: 'Pick', options: [] });
    const result = parseChoiceFromLLM(json);
    expect(result.options).toEqual([]);
  });
});

// ============================================================
// validateTone
// ============================================================

describe('validateTone', () => {
  it('returns "hopeful" for "hopeful"', () => {
    expect(validateTone('hopeful')).toBe('hopeful');
  });

  it('returns "neutral" for "neutral"', () => {
    expect(validateTone('neutral')).toBe('neutral');
  });

  it('returns "dark" for "dark"', () => {
    expect(validateTone('dark')).toBe('dark');
  });

  it('returns "twist" for "twist"', () => {
    expect(validateTone('twist')).toBe('twist');
  });

  it('returns "neutral" for unknown string', () => {
    expect(validateTone('unknown')).toBe('neutral');
    expect(validateTone('happy')).toBe('neutral');
    expect(validateTone('')).toBe('neutral');
  });

  it('returns "neutral" for non-string types (defensive)', () => {
    expect(validateTone(123)).toBe('neutral');
    expect(validateTone(null)).toBe('neutral');
    expect(validateTone(undefined)).toBe('neutral');
    expect(validateTone({})).toBe('neutral');
    expect(validateTone([])).toBe('neutral');
  });

  it('is case-sensitive ("Hopeful" is invalid)', () => {
    expect(validateTone('Hopeful')).toBe('neutral');
    expect(validateTone('HOPEFUL')).toBe('neutral');
    expect(validateTone('Twist')).toBe('neutral');
  });
});

// ============================================================
// generateFallbackOutline (Round 75 fix: 5 → 3 chapters)
// ============================================================

describe('generateFallbackOutline (Round 75 fix: 3 chapters)', () => {
  it('returns an outline with 3 chapters (DEFAULT_CHAPTER_COUNT)', () => {
    const outline = generateFallbackOutline('bought', 'a widget');
    expect(outline.chapters).toHaveLength(3);
  });

  it('does NOT return 5 chapters (regression test for Round 75 fix)', () => {
    const outline = generateFallbackOutline('bought', 'a widget');
    expect(outline.chapters).not.toHaveLength(5);
    expect(outline.chapters).not.toHaveLength(4);
  });

  it('has chapter indices 1, 2, 3 (sequential)', () => {
    const outline = generateFallbackOutline('bought', 'a widget');
    expect(outline.chapters.map((c) => c.index)).toEqual([1, 2, 3]);
  });

  it('has hasChoice=true ONLY on chapter 2 (CHOICE_CHAPTER_INDICES)', () => {
    const outline = generateFallbackOutline('bought', 'a widget');
    expect(outline.chapters[0].hasChoice).toBe(false); // chapter 1
    expect(outline.chapters[1].hasChoice).toBe(true);  // chapter 2
    expect(outline.chapters[2].hasChoice).toBe(false); // chapter 3
  });

  it('does NOT have a chapter 4 with hasChoice=true (regression test)', () => {
    const outline = generateFallbackOutline('bought', 'a widget');
    const ch4 = outline.chapters.find((c) => c.index === 4);
    expect(ch4).toBeUndefined();
  });

  it('preserves decisionType in result', () => {
    const bought = generateFallbackOutline('bought', 'a widget');
    const resisted = generateFallbackOutline('resisted', 'a jacket');
    expect(bought.decisionType).toBe('bought');
    expect(resisted.decisionType).toBe('resisted');
  });

  it('preserves decisionDescription in result', () => {
    const outline = generateFallbackOutline('bought', 'a $55 widget');
    expect(outline.decisionDescription).toBe('a $55 widget');
  });

  it('uses "bought" or "resisted" in chapter 1 summary based on decisionType', () => {
    const bought = generateFallbackOutline('bought', 'a widget');
    const resisted = generateFallbackOutline('resisted', 'a widget');
    expect(bought.chapters[0].summary).toContain('bought');
    expect(resisted.chapters[0].summary).toContain('resisted');
  });

  it('has version=1', () => {
    const outline = generateFallbackOutline('bought', 'a widget');
    expect(outline.version).toBe(1);
  });

  it('has a non-empty endingHint', () => {
    const outline = generateFallbackOutline('bought', 'a widget');
    expect(outline.endingHint.length).toBeGreaterThan(0);
  });

  it('every chapter has valid tone (hopeful/neutral/dark/twist)', () => {
    const outline = generateFallbackOutline('bought', 'a widget');
    for (const ch of outline.chapters) {
      expect(['hopeful', 'neutral', 'dark', 'twist']).toContain(ch.tone);
    }
  });

  it('every chapter has required fields', () => {
    const outline = generateFallbackOutline('bought', 'a widget');
    for (const ch of outline.chapters) {
      expect(ch).toEqual(
        expect.objectContaining({
          index: expect.any(Number),
          title: expect.any(String),
          summary: expect.any(String),
          hasChoice: expect.any(Boolean),
          tone: expect.any(String),
          timeSpan: expect.any(String),
        }),
      );
    }
  });
});

// ============================================================
// isToolCallEvent
// ============================================================

describe('isToolCallEvent', () => {
  it('returns true for tool_call event', () => {
    const line = 'data: {"type":"tool_call","tool":"add_tokens"}';
    expect(isToolCallEvent(line)).toBe(true);
  });

  it('returns true for tool_result event', () => {
    const line = 'data: {"type":"tool_result","tool":"add_tokens"}';
    expect(isToolCallEvent(line)).toBe(true);
  });

  it('returns false for token event (not a tool call)', () => {
    const line = 'data: {"type":"token","content":"hello"}';
    expect(isToolCallEvent(line)).toBe(false);
  });

  it('returns false for reasoning event', () => {
    const line = 'data: {"type":"reasoning","content":"thinking..."}';
    expect(isToolCallEvent(line)).toBe(false);
  });

  it('returns false for done event', () => {
    const line = 'data: {"type":"done"}';
    expect(isToolCallEvent(line)).toBe(false);
  });

  it('returns false for [DONE] marker', () => {
    const line = 'data: [DONE]';
    expect(isToolCallEvent(line)).toBe(false);
  });

  it('returns false for non-data line', () => {
    expect(isToolCallEvent('event: message')).toBe(false);
    expect(isToolCallEvent(': comment')).toBe(false);
    expect(isToolCallEvent('')).toBe(false);
    expect(isToolCallEvent('random text')).toBe(false);
  });

  it('returns false for invalid JSON data line', () => {
    expect(isToolCallEvent('data: {invalid json}')).toBe(false);
    expect(isToolCallEvent('data: ')).toBe(false);
  });

  it('returns false for line without "data: " prefix', () => {
    expect(isToolCallEvent('{"type":"tool_call"}')).toBe(false);
  });

  it('handles whitespace (trims line before checking)', () => {
    const line = '   data: {"type":"tool_call"}   ';
    expect(isToolCallEvent(line)).toBe(true);
  });

  it('is case-sensitive on "type" field', () => {
    expect(isToolCallEvent('data: {"type":"TOOL_CALL"}')).toBe(false);
    expect(isToolCallEvent('data: {"type":"Tool_Call"}')).toBe(false);
  });
});

// ============================================================
// extractTextFromLettaSSELine
// ============================================================

describe('extractTextFromLettaSSELine', () => {
  it('returns content for token event', () => {
    const line = 'data: {"type":"token","content":"hello world"}';
    expect(extractTextFromLettaSSELine(line)).toBe('hello world');
  });

  it('returns empty string for reasoning event', () => {
    const line = 'data: {"type":"reasoning","content":"thinking..."}';
    expect(extractTextFromLettaSSELine(line)).toBe('');
  });

  it('returns empty string for tool_call event', () => {
    const line = 'data: {"type":"tool_call","tool":"add_tokens"}';
    expect(extractTextFromLettaSSELine(line)).toBe('');
  });

  it('returns empty string for tool_result event', () => {
    const line = 'data: {"type":"tool_result","tool":"add_tokens"}';
    expect(extractTextFromLettaSSELine(line)).toBe('');
  });

  it('returns empty string for done event', () => {
    const line = 'data: {"type":"done"}';
    expect(extractTextFromLettaSSELine(line)).toBe('');
  });

  it('returns empty string for [DONE] marker', () => {
    expect(extractTextFromLettaSSELine('data: [DONE]')).toBe('');
  });

  it('returns empty string for non-data line', () => {
    expect(extractTextFromLettaSSELine('event: message')).toBe('');
    expect(extractTextFromLettaSSELine('')).toBe('');
    expect(extractTextFromLettaSSELine('random text')).toBe('');
  });

  it('returns empty string for invalid JSON', () => {
    expect(extractTextFromLettaSSELine('data: {invalid}')).toBe('');
    expect(extractTextFromLettaSSELine('data: ')).toBe('');
  });

  it('returns empty string when content is not a string (defensive)', () => {
    expect(extractTextFromLettaSSELine('data: {"type":"token","content":123}')).toBe('');
    expect(extractTextFromLettaSSELine('data: {"type":"token","content":null}')).toBe('');
    expect(extractTextFromLettaSSELine('data: {"type":"token","content":{}}')).toBe('');
  });

  it('returns empty string when type is not "token"', () => {
    expect(extractTextFromLettaSSELine('data: {"type":"other","content":"text"}')).toBe('');
  });

  it('handles whitespace (trims line)', () => {
    const line = '   data: {"type":"token","content":"hi"}   ';
    expect(extractTextFromLettaSSELine(line)).toBe('hi');
  });

  it('returns empty content string when content is empty', () => {
    expect(extractTextFromLettaSSELine('data: {"type":"token","content":""}')).toBe('');
  });

  it('preserves special characters in content', () => {
    const content = 'Hello\n  world\t"quoted" $55 \\n literal';
    const line = `data: ${JSON.stringify({ type: 'token', content })}`;
    expect(extractTextFromLettaSSELine(line)).toBe(content);
  });

  it('preserves unicode/emoji in content', () => {
    const content = 'Hello 世界 🌍 emoji';
    const line = `data: ${JSON.stringify({ type: 'token', content })}`;
    expect(extractTextFromLettaSSELine(line)).toBe(content);
  });
});

// ============================================================
// truncateAtSentence
// ============================================================

describe('truncateAtSentence', () => {
  it('returns text as-is when shorter than maxLen', () => {
    expect(truncateAtSentence('short text', 100)).toBe('short text');
  });

  it('returns text as-is when exactly maxLen', () => {
    expect(truncateAtSentence('12345', 5)).toBe('12345');
  });

  it('truncates at sentence boundary (period)', () => {
    const text = 'First sentence. Second sentence. Third.';
    expect(truncateAtSentence(text, 20)).toBe('First sentence.');
  });

  it('truncates at question mark boundary', () => {
    const text = 'What is this? More text follows here.';
    expect(truncateAtSentence(text, 15)).toBe('What is this?');
  });

  it('truncates at exclamation mark boundary', () => {
    const text = 'Wow! More text follows here and continues.';
    // bestEnd = 3 (the !). 3 > maxLen * 0.4 requires maxLen < 7.5.
    // Use maxLen=5: 3 > 5*0.4=2 → true → return text.substring(0, 4) = 'Wow!'
    expect(truncateAtSentence(text, 5)).toBe('Wow!');
  });

  it('prefers the latest sentence boundary within maxLen', () => {
    const text = 'One. Two. Three. Four. Five.';
    // maxLen=15 includes "One. Two. Three." but next period is at pos 18 (after "Four.")
    // lastIndexOf('.', 15) finds the period after "Three." at index 14
    const result = truncateAtSentence(text, 15);
    expect(result).toBe('One. Two. Three.');
  });

  it('falls back to space boundary when no sentence end in first 40%', () => {
    // No period in first 40% of maxLen — fall back to last space
    const text = 'word ' + 'a'.repeat(20) + ' more words here';
    const result = truncateAtSentence(text, 15);
    expect(result.endsWith('...')).toBe(true);
    expect(result.length).toBeLessThanOrEqual(20);
  });

  it('falls back to hard truncation when no good break point', () => {
    // No spaces, no sentence ends — hard truncate
    const text = 'abcdefghijklmnopqrstuvwxyz';
    const result = truncateAtSentence(text, 10);
    expect(result.endsWith('...')).toBe(true);
    expect(result.length).toBe(13); // 10 chars + "..."
  });

  it('does not add "..." when truncated at sentence boundary', () => {
    const text = 'First sentence. Second sentence.';
    const result = truncateAtSentence(text, 20);
    expect(result).not.toContain('...');
  });

  it('handles empty string', () => {
    expect(truncateAtSentence('', 100)).toBe('');
  });

  it('handles maxLen = 0 (edge case)', () => {
    // text.length > 0, maxLen = 0
    // bestEnd = max(-1, -1, -1) = -1, -1 > 0*0.4=0 is false
    // lastSpace = -1, -1 > 0 is false
    // return text.substring(0, 0) + '...' = '...'
    expect(truncateAtSentence('text', 0)).toBe('...');
  });

  it('handles text with no spaces (single long word)', () => {
    const text = 'supercalifragilisticexpialidocious';
    const result = truncateAtSentence(text, 10);
    expect(result.endsWith('...')).toBe(true);
  });

  it('preserves dollar signs in text', () => {
    const text = 'I saved $55 today. Then more text follows.';
    const result = truncateAtSentence(text, 20);
    expect(result).toContain('$55');
  });
});
