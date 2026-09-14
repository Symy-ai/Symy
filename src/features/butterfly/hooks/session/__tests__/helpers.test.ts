/**
 * Tests for session/helpers.ts — buildChoicesMap, mergeChaptersPreservingLocalIllustration
 *
 * 🔧 ARCH fix (Round 69 ARCH-DEEP-69): 测试覆盖率 — session/helpers 0 tests → 16 tests
 *
 * Verifies the pure helpers used by useButterflySession for building choice maps
 * and merging server chapters with local optimistic illustrations.
 */

import { describe, it, expect } from 'vitest';
import {
  buildChoicesMap,
  mergeChaptersPreservingLocalIllustration,
} from '../helpers';
import type { ButterflyChoice, StoryChapter } from '../../../types';

// ============================================================
// buildChoicesMap
// ============================================================

describe('buildChoicesMap', () => {
  it('returns empty object for undefined input', () => {
    expect(buildChoicesMap(undefined)).toEqual({});
  });

  it('returns empty object for empty array', () => {
    expect(buildChoicesMap([])).toEqual({});
  });

  it('maps chapterIndex → selectedOption for choices with selectedOption', () => {
    const choices: ButterflyChoice[] = [
      { id: 'c1', chapterIndex: 1, prompt: 'p1', options: [], selectedOption: 'A', createdAt: '', outlineRegenerated: false },
      { id: 'c2', chapterIndex: 2, prompt: 'p2', options: [], selectedOption: 'B', createdAt: '', outlineRegenerated: false },
    ];
    expect(buildChoicesMap(choices)).toEqual({ 1: 'A', 2: 'B' });
  });

  it('skips choices where selectedOption is null', () => {
    const choices: ButterflyChoice[] = [
      { id: 'c1', chapterIndex: 1, prompt: 'p1', options: [], selectedOption: 'A', createdAt: '', outlineRegenerated: false },
      { id: 'c2', chapterIndex: 2, prompt: 'p2', options: [], selectedOption: null, createdAt: '', outlineRegenerated: false },
    ];
    expect(buildChoicesMap(choices)).toEqual({ 1: 'A' });
  });

  it('skips choices where selectedOption is empty string', () => {
    const choices: ButterflyChoice[] = [
      { id: 'c1', chapterIndex: 1, prompt: 'p1', options: [], selectedOption: '', createdAt: '', outlineRegenerated: false },
    ];
    expect(buildChoicesMap(choices)).toEqual({});
  });

  it('handles all choices having null selectedOption', () => {
    const choices: ButterflyChoice[] = [
      { id: 'c1', chapterIndex: 1, prompt: 'p1', options: [], selectedOption: null, createdAt: '', outlineRegenerated: false },
      { id: 'c2', chapterIndex: 2, prompt: 'p2', options: [], selectedOption: null, createdAt: '', outlineRegenerated: false },
    ];
    expect(buildChoicesMap(choices)).toEqual({});
  });

  it('preserves the latest entry when duplicate chapterIndex exists', () => {
    const choices: ButterflyChoice[] = [
      { id: 'c1', chapterIndex: 1, prompt: 'p1', options: [], selectedOption: 'A', createdAt: '', outlineRegenerated: false },
      { id: 'c1b', chapterIndex: 1, prompt: 'p1b', options: [], selectedOption: 'B', createdAt: '', outlineRegenerated: false },
    ];
    // Both have selectedOption; last one wins (sequential iteration overwrites)
    expect(buildChoicesMap(choices)).toEqual({ 1: 'B' });
  });
});

// ============================================================
// mergeChaptersPreservingLocalIllustration
// ============================================================

describe('mergeChaptersPreservingLocalIllustration', () => {
  const baseChapter = (overrides: Partial<StoryChapter>): StoryChapter => ({
    index: 1,
    title: 'T',
    content: 'C',
    tone: 'neutral',
    timeSpan: 'now',
    hasChoice: false,
    createdAt: '',
    ...overrides,
  });

  it('returns server chapters when localChapters is empty', () => {
    const server = [baseChapter({ index: 1, title: 's1' })];
    const merged = mergeChaptersPreservingLocalIllustration(server, []);
    expect(merged).toEqual(server);
  });

  it('returns local chapters when serverChapters is empty', () => {
    const local = [baseChapter({ index: 1, title: 'l1' })];
    const merged = mergeChaptersPreservingLocalIllustration([], local);
    expect(merged).toEqual(local);
  });

  it('preserves local illustrationUrl when server has none', () => {
    const server = [baseChapter({ index: 1, illustrationUrl: undefined })];
    const local = [baseChapter({ index: 1, illustrationUrl: 'data:local-blob' })];
    const merged = mergeChaptersPreservingLocalIllustration(server, local);
    expect(merged[0].illustrationUrl).toBe('data:local-blob');
  });

  it('uses server illustrationUrl when server has one (server is source of truth)', () => {
    const server = [baseChapter({ index: 1, illustrationUrl: 'https://x/server.png' })];
    const local = [baseChapter({ index: 1, illustrationUrl: 'data:local-blob' })];
    const merged = mergeChaptersPreservingLocalIllustration(server, local);
    expect(merged[0].illustrationUrl).toBe('https://x/server.png');
  });

  it('preserves server chapter content/title/tone (story is source of truth)', () => {
    const server = [baseChapter({ index: 1, title: 'server-title', content: 'server-content', tone: 'dark' })];
    const local = [baseChapter({ index: 1, title: 'local-title', content: 'local-content', tone: 'twist' })];
    const merged = mergeChaptersPreservingLocalIllustration(server, local);
    expect(merged[0].title).toBe('server-title');
    expect(merged[0].content).toBe('server-content');
    expect(merged[0].tone).toBe('dark');
  });

  it('appends local-only chapters (preloaded but not yet on server)', () => {
    const server = [baseChapter({ index: 1 })];
    const local = [baseChapter({ index: 1 }), baseChapter({ index: 2, title: 'preloaded' })];
    const merged = mergeChaptersPreservingLocalIllustration(server, local);
    expect(merged).toHaveLength(2);
    expect(merged[1].index).toBe(2);
    expect(merged[1].title).toBe('preloaded');
  });

  it('sorts merged chapters by index ascending', () => {
    const server = [baseChapter({ index: 3 }), baseChapter({ index: 1 })];
    const local = [baseChapter({ index: 2 }), baseChapter({ index: 4 })];
    const merged = mergeChaptersPreservingLocalIllustration(server, local);
    expect(merged.map(c => c.index)).toEqual([1, 2, 3, 4]);
  });

  it('merges sceneIllustrations: keeps server scenes, fills missing from local', () => {
    const server = [baseChapter({
      index: 1,
      sceneIllustrations: { 0: ['server-s0.png'] },
    })];
    const local = [baseChapter({
      index: 1,
      sceneIllustrations: { 0: ['local-s0.png'], 1: ['local-s1.png'] },
    })];
    const merged = mergeChaptersPreservingLocalIllustration(server, local);
    expect(merged[0].sceneIllustrations).toEqual({
      0: ['server-s0.png'],  // server wins
      1: ['local-s1.png'],   // local fills missing
    });
  });

  it('uses local sceneIllustrations when server scene is empty', () => {
    const server = [baseChapter({
      index: 1,
      sceneIllustrations: { 0: [] },  // empty
    })];
    const local = [baseChapter({
      index: 1,
      sceneIllustrations: { 0: ['local-s0.png'] },
    })];
    const merged = mergeChaptersPreservingLocalIllustration(server, local);
    expect(merged[0].sceneIllustrations?.[0]).toEqual(['local-s0.png']);
  });

  it('dedupes by server chapter index — local-only duplicates are not added', () => {
    const server = [baseChapter({ index: 1, title: 'server-1' })];
    const local = [baseChapter({ index: 1, title: 'local-1' })];  // same index, will be merged not appended
    const merged = mergeChaptersPreservingLocalIllustration(server, local);
    expect(merged).toHaveLength(1);
    expect(merged[0].title).toBe('server-1');  // server wins for content
  });
});
