/**
 * Tests for Butterfly Normal Player Reducer (player/reducer.ts)
 *
 * Covers:
 * - initialNormalPlayerState: default values
 * - normalPlayerReducer: all 16 action types + RESET_PLAYER + default
 */

import { describe, it, expect } from 'vitest';
import {
  normalPlayerReducer,
  initialNormalPlayerState,
  type NormalPlayerState,
} from '@/features/butterfly/hooks/player/reducer';

describe('initialNormalPlayerState', () => {
  it('has correct default values', () => {
    expect(initialNormalPlayerState.phase).toBe('idle');
    expect(initialNormalPlayerState.decisionType).toBeNull();
    expect(initialNormalPlayerState.decisionDescription).toBe('');
    expect(initialNormalPlayerState.currentChapterIndex).toBe(1);
    expect(initialNormalPlayerState.currentSceneIndex).toBe(0);
    expect(initialNormalPlayerState.completedChapters).toEqual([]);
    expect(initialNormalPlayerState.currentChoice).toBeNull();
    expect(initialNormalPlayerState.butterflyEffect).toBeNull();
    expect(initialNormalPlayerState.finalTone).toBeNull();
    expect(initialNormalPlayerState.choices).toEqual({});
    expect(initialNormalPlayerState.isLoading).toBe(false);
    expect(initialNormalPlayerState.error).toBeNull();
    expect(initialNormalPlayerState.isStreamingChapter).toBe(false);
    expect(initialNormalPlayerState.streamingChapterMeta).toBeNull();
  });
});

describe('normalPlayerReducer', () => {
  it('SET_PHASE updates phase', () => {
    const result = normalPlayerReducer(initialNormalPlayerState, { type: 'SET_PHASE', payload: 'playing' });
    expect(result.phase).toBe('playing');
  });

  it('SET_PHASE to chapterComplete', () => {
    const result = normalPlayerReducer(initialNormalPlayerState, { type: 'SET_PHASE', payload: 'chapterComplete' });
    expect(result.phase).toBe('chapterComplete');
  });

  it('SET_PHASE to complete', () => {
    const result = normalPlayerReducer(initialNormalPlayerState, { type: 'SET_PHASE', payload: 'complete' });
    expect(result.phase).toBe('complete');
  });

  it('SET_DECISION_TYPE updates decisionType', () => {
    const result = normalPlayerReducer(initialNormalPlayerState, { type: 'SET_DECISION_TYPE', payload: 'bought' });
    expect(result.decisionType).toBe('bought');
  });

  it('SET_DECISION_TYPE to null', () => {
    const state = { ...initialNormalPlayerState, decisionType: 'resisted' as const };
    const result = normalPlayerReducer(state, { type: 'SET_DECISION_TYPE', payload: null });
    expect(result.decisionType).toBeNull();
  });

  it('SET_DECISION_DESCRIPTION updates description', () => {
    const result = normalPlayerReducer(initialNormalPlayerState, { type: 'SET_DECISION_DESCRIPTION', payload: 'A $200 jacket' });
    expect(result.decisionDescription).toBe('A $200 jacket');
  });

  it('SET_CURRENT_CHAPTER_INDEX updates index', () => {
    const result = normalPlayerReducer(initialNormalPlayerState, { type: 'SET_CURRENT_CHAPTER_INDEX', payload: 3 });
    expect(result.currentChapterIndex).toBe(3);
  });

  it('SET_CURRENT_SCENE_INDEX updates index', () => {
    const result = normalPlayerReducer(initialNormalPlayerState, { type: 'SET_CURRENT_SCENE_INDEX', payload: 2 });
    expect(result.currentSceneIndex).toBe(2);
  });

  it('SET_COMPLETED_CHAPTERS updates chapters', () => {
    const chapters = [{ index: 1, title: 'Ch1', tone: 'hopeful' as const, timeSpan: '1 day', hasChoice: false, scenes: [] }];
    const result = normalPlayerReducer(initialNormalPlayerState, { type: 'SET_COMPLETED_CHAPTERS', payload: chapters });
    expect(result.completedChapters).toBe(chapters);
  });

  it('UPDATE_COMPLETED_CHAPTERS uses updater function', () => {
    const state = { ...initialNormalPlayerState, completedChapters: [{ index: 1, title: 'Ch1', tone: 'hopeful' as const, timeSpan: '', hasChoice: false, scenes: [] }] };
    const result = normalPlayerReducer(state, {
      type: 'UPDATE_COMPLETED_CHAPTERS',
      payload: (prev) => [...prev, { index: 2, title: 'Ch2', tone: 'dark' as const, timeSpan: '', hasChoice: false, scenes: [] }],
    });
    expect(result.completedChapters).toHaveLength(2);
    expect(result.completedChapters[1].title).toBe('Ch2');
  });

  it('SET_CURRENT_CHOICE updates choice', () => {
    const choice = { prompt: 'Which path?', options: [{ id: 'A', label: 'Path A', hint: '' }] };
    const result = normalPlayerReducer(initialNormalPlayerState, { type: 'SET_CURRENT_CHOICE', payload: choice });
    expect(result.currentChoice).toBe(choice);
  });

  it('SET_CURRENT_CHOICE to null', () => {
    const state = { ...initialNormalPlayerState, currentChoice: { prompt: 'test', options: [] } };
    const result = normalPlayerReducer(state, { type: 'SET_CURRENT_CHOICE', payload: null });
    expect(result.currentChoice).toBeNull();
  });

  it('SET_BUTTERFLY_EFFECT updates effect', () => {
    const result = normalPlayerReducer(initialNormalPlayerState, { type: 'SET_BUTTERFLY_EFFECT', payload: 'The butterfly effect...' });
    expect(result.butterflyEffect).toBe('The butterfly effect...');
  });

  it('SET_FINAL_TONE updates tone', () => {
    const result = normalPlayerReducer(initialNormalPlayerState, { type: 'SET_FINAL_TONE', payload: 'twist' });
    expect(result.finalTone).toBe('twist');
  });

  it('SET_CHOICES updates choices', () => {
    const choices = { 2: 'A', 4: 'B' };
    const result = normalPlayerReducer(initialNormalPlayerState, { type: 'SET_CHOICES', payload: choices });
    expect(result.choices).toBe(choices);
  });

  it('UPDATE_CHOICES uses updater function', () => {
    const state = { ...initialNormalPlayerState, choices: { 2: 'A' } };
    const result = normalPlayerReducer(state, {
      type: 'UPDATE_CHOICES',
      payload: (prev) => ({ ...prev, 4: 'B' }),
    });
    expect(result.choices).toEqual({ 2: 'A', 4: 'B' });
  });

  it('SET_IS_LOADING updates loading', () => {
    const result = normalPlayerReducer(initialNormalPlayerState, { type: 'SET_IS_LOADING', payload: true });
    expect(result.isLoading).toBe(true);
  });

  it('SET_ERROR updates error', () => {
    const result = normalPlayerReducer(initialNormalPlayerState, { type: 'SET_ERROR', payload: 'Network error' });
    expect(result.error).toBe('Network error');
  });

  it('SET_ERROR to null', () => {
    const state = { ...initialNormalPlayerState, error: 'Some error' };
    const result = normalPlayerReducer(state, { type: 'SET_ERROR', payload: null });
    expect(result.error).toBeNull();
  });

  it('SET_IS_STREAMING_CHAPTER updates streaming', () => {
    const result = normalPlayerReducer(initialNormalPlayerState, { type: 'SET_IS_STREAMING_CHAPTER', payload: true });
    expect(result.isStreamingChapter).toBe(true);
  });

  it('SET_STREAMING_CHAPTER_META updates meta', () => {
    const meta = { index: 1, title: 'Ch1', tone: 'hopeful' as const, timeSpan: '1 day', illustrationUrl: 'https://example.com/img.png' };
    const result = normalPlayerReducer(initialNormalPlayerState, { type: 'SET_STREAMING_CHAPTER_META', payload: meta });
    expect(result.streamingChapterMeta).toBe(meta);
  });

  it('SET_STREAMING_CHAPTER_META to null', () => {
    const state = { ...initialNormalPlayerState, streamingChapterMeta: { index: 1, title: 'Ch1', tone: 'hopeful' as const, timeSpan: '', illustrationUrl: '' } };
    const result = normalPlayerReducer(state, { type: 'SET_STREAMING_CHAPTER_META', payload: null });
    expect(result.streamingChapterMeta).toBeNull();
  });

  it('RESET_PLAYER returns to initial state', () => {
    const modifiedState: NormalPlayerState = {
      phase: 'complete',
      decisionType: 'bought',
      decisionDescription: 'test',
      currentChapterIndex: 5,
      currentSceneIndex: 3,
      completedChapters: [{ index: 1, title: 'Ch1', tone: 'hopeful', timeSpan: '', hasChoice: false, scenes: [] }],
      currentChoice: { prompt: 'test', options: [] },
      butterflyEffect: 'effect',
      finalTone: 'twist',
      choices: { 2: 'A' },
      isLoading: true,
      error: 'error',
      isStreamingChapter: true,
      streamingChapterMeta: { index: 1, title: 'Ch1', tone: 'hopeful', timeSpan: '', illustrationUrl: '' },
    };
    const result = normalPlayerReducer(modifiedState, { type: 'RESET_PLAYER' });
    expect(result).toEqual(initialNormalPlayerState);
  });

  it('returns state unchanged for unknown action type', () => {
    const result = normalPlayerReducer(initialNormalPlayerState, { type: 'UNKNOWN' as never, payload: null });
    expect(result).toBe(initialNormalPlayerState);
  });

  it('does not mutate original state (immutability)', () => {
    const original = { ...initialNormalPlayerState, phase: 'idle' as const };
    const result = normalPlayerReducer(original, { type: 'SET_PHASE', payload: 'playing' });
    expect(original.phase).toBe('idle');
    expect(result.phase).toBe('playing');
    expect(result).not.toBe(original);
  });
});
