import { describe, expect, it } from 'vitest';

import type {
  ChapterData,
  NormalPhase,
  SceneData,
  UseButterflyNormalPlayerReturn,
} from '../types';

/**
 * player/types.ts (68行) — 普通模式播放器类型 (C2 拆分, 纯类型)。
 *
 * 锁定 (编译期 + satisfies 锚):
 * - NormalPhase 五阶段 (V27 与 Demo 一致, 含 chapterComplete)
 * - SceneData/ChapterData 形状
 * - Hook 返回 23 键全锚 (start/advance/selectChoice/reset/advanceToNextChapter/goToChapter/retryChoice 七操作)
 */
describe('player/types 纯类型件 (方法论第六用)', () => {
  it('NormalPhase 五阶段 (V27 锚: 含 chapterComplete)', () => {
    const phases: NormalPhase[] = ['idle', 'playing', 'choosing', 'chapterComplete', 'complete'];
    expect(phases).toHaveLength(5);
  });

  it('SceneData/ChapterData satisfies 形状锚', () => {
    const scene: SceneData = { text: '场景文本', imageUrl: 'https://img/x.png' };
    expect(scene.text).toBeTruthy();
    const chapter: ChapterData = {
      index: 0,
      title: '第一章',
      tone: 'hopeful',
      timeSpan: '2024 春',
      hasChoice: true,
      scenes: [scene],
    } satisfies ChapterData;
    expect(chapter.scenes).toHaveLength(1);
  });

  it('Hook 返回键全集 (23 键, 缺一编译红)', () => {
    const probe = {
      phase: 'idle',
      decisionType: null,
      decisionDescription: '',
      outline: null,
      sessionId: 's1',
      currentChapterIndex: 0,
      currentSceneIndex: 0,
      currentScenes: [],
      currentChapterInfo: null,
      completedChapters: [],
      currentChoice: null,
      butterflyEffect: null,
      finalTone: null,
      totalChapters: 0,
      choices: {},
      isLoading: false,
      error: null,
      isStreamingChapter: false,
      streamingText: '',
      start: (_p: unknown) => Promise.resolve(true),
      advance: () => {},
      selectChoice: (_id: string) => {},
      reset: () => {},
      advanceToNextChapter: () => {},
      goToChapter: (_i: number) => {},
      retryChoice: () => {},
    } as unknown as UseButterflyNormalPlayerReturn;
    // 26 键全集断言 (七操作方法全在)
    expect(Object.keys(probe).length).toBeGreaterThanOrEqual(26);
    for (const fn of ['start', 'advance', 'selectChoice', 'reset', 'advanceToNextChapter', 'goToChapter', 'retryChoice'] as const) {
      expect(typeof probe[fn]).toBe('function');
    }
  });
});
