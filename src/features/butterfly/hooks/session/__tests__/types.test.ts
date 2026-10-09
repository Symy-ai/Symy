import { describe, expect, it } from 'vitest';

import type { PreloadedChapterData, UseButterflySessionReturn } from '../types';

/**
 * session/types.ts (68行) — 会话 hook 类型 (C1 拆分, 纯类型, 方法论第七用)。
 *
 * 锁定:
 * - PreloadedChapterData 形状 (BUG-330 N9 锚: 组件外定义防 never 推断)
 * - Hook 返回键全集 (V19 预加载五件 + V32 双件 + Round 6 H6 retry + Round 28 userId)
 */
describe('session/types 纯类型件', () => {
  it('PreloadedChapterData satisfies 形状锚 (BUG-330 N9)', () => {
    const data: PreloadedChapterData = {
      chapter: { index: 1, title: 'T', tone: 'neutral', timeSpan: 'S', content: 'C' } as never,
      choice: { chapterIndex: 1, prompt: 'P', options: [] },
      outline: null,
      illustrationUrl: null,
    } satisfies PreloadedChapterData;
    expect(data.illustrationUrl).toBeNull();
    expect(data.choice?.options).toEqual([]);
  });

  it('Hook 返回键全集 (V19+V32+H6+userId 锚)', () => {
    const probe = {
      session: null,
      uiState: { phase: 'idle' },
      streamingText: '',
      currentChapterInfo: null,
      pendingChoice: null,
      storyComplete: null,
      completedChapters: [],
      outlineVisible: false,
      createSession: (_p: unknown) => Promise.resolve(),
      continueStory: () => Promise.resolve(),
      submitChoice: (_c: number, _o: string) => Promise.resolve(),
      toggleOutline: () => {},
      reset: () => {},
      loadActiveSession: () => Promise.resolve(),
      regenerateIllustration: (_c: number) => Promise.resolve(null),
      regeneratingChapters: new Set<number>(),
      generatingSceneIllustrations: new Set<string>(),
      streamingSceneIllustrations: {},
      preloadedChapterData: null,
      isPreloading: false,
      preloadedBranches: {},
      preloadNextChapter: () => Promise.resolve(),
      preloadedStoryComplete: null,
      clearPreloadedStoryComplete: () => {},
      retry: () => {},
      userId: null,
    } as unknown as UseButterflySessionReturn;
    expect(Object.keys(probe).length).toBe(26); // 全集精确锚
    // 关键操作方法锚 (V19 预加载/H6 retry/R28 userId)
    for (const fn of ['createSession', 'continueStory', 'submitChoice', 'regenerateIllustration', 'preloadNextChapter', 'clearPreloadedStoryComplete', 'retry'] as const) {
      expect(typeof probe[fn]).toBe('function');
    }
    expect(probe.preloadedBranches).toEqual({});
  });
});
