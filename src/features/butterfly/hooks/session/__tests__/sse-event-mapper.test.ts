/**
 * Tests for sse-event-mapper.ts — mapSSEEventToMachineEvent
 *
 * 🔧 ARCH fix (Round 66 ARCH-DEEP-66): 测试覆盖率 — sse-event-mapper 0 tests → 11 tests
 *
 * Verifies each SSE wire event type maps to the corresponding XState machine
 * event, and unknown types return null (silently dropped per contract).
 */

import { describe, it, expect } from 'vitest';
import { mapSSEEventToMachineEvent } from '../sse-event-mapper';

describe('mapSSEEventToMachineEvent', () => {
  it('maps chapter_start → CHAPTER_START', () => {
    const data = { chapterIndex: 1, title: 't', tone: 'hopeful', timeSpan: 'now' };
    expect(mapSSEEventToMachineEvent({ type: 'chapter_start', data })).toEqual({
      type: 'CHAPTER_START',
      data,
    });
  });

  it('maps chapter_text → CHAPTER_TEXT', () => {
    const data = { chapterIndex: 2, text: 'hello' };
    expect(mapSSEEventToMachineEvent({ type: 'chapter_text', data })).toEqual({
      type: 'CHAPTER_TEXT',
      data,
    });
  });

  it('maps chapter_end → CHAPTER_END', () => {
    const data = { chapterIndex: 3, hasChoice: true };
    expect(mapSSEEventToMachineEvent({ type: 'chapter_end', data })).toEqual({
      type: 'CHAPTER_END',
      data,
    });
  });

  it('maps choice_prompt → CHOICE_PROMPT', () => {
    const data = {
      chapterIndex: 1,
      prompt: 'pick one',
      options: [{ id: 'A', label: 'a', hint: 'h' }],
    };
    expect(mapSSEEventToMachineEvent({ type: 'choice_prompt', data })).toEqual({
      type: 'CHOICE_PROMPT',
      data,
    });
  });

  it('maps outline_updated → OUTLINE_UPDATED', () => {
    const data = { version: 2, chapters: [], endingHint: 'maybe' };
    expect(mapSSEEventToMachineEvent({ type: 'outline_updated', data })).toEqual({
      type: 'OUTLINE_UPDATED',
      data,
    });
  });

  it('maps illustration_generated → ILLUSTRATION_GENERATED', () => {
    const data = { chapterIndex: 1, illustrationUrl: 'https://x/y.png' };
    expect(
      mapSSEEventToMachineEvent({ type: 'illustration_generated', data }),
    ).toEqual({ type: 'ILLUSTRATION_GENERATED', data });
  });

  it('maps illustration_failed → ILLUSTRATION_FAILED', () => {
    const data = { chapterIndex: 1, reason: 'timeout' };
    expect(
      mapSSEEventToMachineEvent({ type: 'illustration_failed', data }),
    ).toEqual({ type: 'ILLUSTRATION_FAILED', data });
  });

  it('maps scene_illustration_generated → SCENE_ILLUSTRATION_GENERATED', () => {
    const data = { chapterIndex: 1, sceneIndex: 0, illustrationUrl: 'https://x/s.png' };
    expect(
      mapSSEEventToMachineEvent({ type: 'scene_illustration_generated', data }),
    ).toEqual({ type: 'SCENE_ILLUSTRATION_GENERATED', data });
  });

  it('maps story_complete → STORY_COMPLETE', () => {
    const data = {
      finalTone: 'hopeful',
      totalChapters: 5,
      butterflyEffect: 'effect text',
    };
    expect(mapSSEEventToMachineEvent({ type: 'story_complete', data })).toEqual({
      type: 'STORY_COMPLETE',
      data,
    });
  });

  it('maps error → STREAM_ERROR', () => {
    const data = { message: 'oops', code: 'E1' };
    expect(mapSSEEventToMachineEvent({ type: 'error', data })).toEqual({
      type: 'STREAM_ERROR',
      data,
    });
  });

  it('returns null for unknown event type', () => {
    expect(
      mapSSEEventToMachineEvent({ type: 'mystery_event', data: {} }),
    ).toBeNull();
  });
});
