/**
 * Tests for butterfly history helpers — extracted from butterfly-history-detail.tsx
 *
 * 🔧 ARCH fix (2026-07-21): These functions were extracted from the component
 *    to enable independent testing.
 */

import { describe, it, expect } from 'vitest';
import { extractScenes, getChoiceForChapter, getOptionLabel } from '../history-helpers';
import type { ButterflySession, StoryChapter, ButterflyChoice } from '../../types';

describe('extractScenes', () => {
  it('returns empty array for empty chapters', () => {
    expect(extractScenes([])).toEqual([]);
  });

  it('extracts scenes from a single chapter with one scene', () => {
    const chapters: StoryChapter[] = [{
      index: 1,
      title: 'Chapter 1',
      tone: 'neutral',
      timeSpan: '1 day',
      content: 'Scene text here.',
      illustrationUrl: 'https://example.com/img.jpg',
      sceneIllustrations: null,
    } as unknown as StoryChapter];

    const scenes = extractScenes(chapters);
    expect(scenes).toHaveLength(1);
    expect(scenes[0].chapterIndex).toBe(1);
    expect(scenes[0].chapterTitle).toBe('Chapter 1');
    expect(scenes[0].text).toBe('Scene text here.');
    expect(scenes[0].imageUrl).toBe('https://example.com/img.jpg');
    expect(scenes[0].sceneIndex).toBe(0);
    expect(scenes[0].totalScenes).toBe(1);
  });

  it('handles chapter with no illustration', () => {
    const chapters: StoryChapter[] = [{
      index: 1,
      title: 'Chapter 1',
      tone: 'neutral',
      timeSpan: '1 day',
      content: 'Scene text.',
      illustrationUrl: '',
      sceneIllustrations: null,
    } as unknown as StoryChapter];

    const scenes = extractScenes(chapters);
    expect(scenes[0].imageUrl).toBe('');
  });
});

describe('getChoiceForChapter', () => {
  it('returns null when no choice exists for the chapter', () => {
    const session = {
      choices: [],
    } as unknown as ButterflySession;
    expect(getChoiceForChapter(session, 1)).toBeNull();
  });

  it('returns null when choice exists but no option selected', () => {
    const session = {
      choices: [{
        chapterIndex: 1,
        selectedOption: null,
        options: [],
      }],
    } as unknown as unknown as ButterflySession;
    expect(getChoiceForChapter(session, 1)).toBeNull();
  });

  it('returns the choice when an option is selected', () => {
    const choice = {
      chapterIndex: 1,
      selectedOption: 'opt-a',
      options: [{ id: 'opt-a', label: 'Option A' }],
    };
    const session = {
      choices: [choice],
    } as unknown as unknown as ButterflySession;
    expect(getChoiceForChapter(session, 1)).toBe(choice);
  });
});

describe('getOptionLabel', () => {
  it('returns empty string for null optionId', () => {
    const choice = { options: [] } as unknown as ButterflyChoice;
    expect(getOptionLabel(choice, null)).toBe('');
  });

  it('returns the label for a known option', () => {
    const choice = {
      options: [
        { id: 'opt-a', label: 'Option A' },
        { id: 'opt-b', label: 'Option B' },
      ],
    } as unknown as unknown as ButterflyChoice;
    expect(getOptionLabel(choice, 'opt-a')).toBe('Option A');
    expect(getOptionLabel(choice, 'opt-b')).toBe('Option B');
  });

  it('returns the optionId as fallback for unknown option', () => {
    const choice = { options: [] } as unknown as ButterflyChoice;
    expect(getOptionLabel(choice, 'unknown-id')).toBe('unknown-id');
  });
});
