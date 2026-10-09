import { describe, expect, it } from 'vitest';

import type { ButterflyTabProps, DemoScenePlayerProps } from '../types';

/**
 * tab/types.ts (40行) — ButterflyTab 类型 (C5, 第十五用)。
 *
 * 锁定:
 * - ButterflyTabProps 六键 (全可选, Round 78 sharedSession 双件)
 * - DemoScenePlayerProps 十九键 (场景双+推进+流式+亮色+台词三件)
 */
describe('tab/types 纯类型件第十五用', () => {
  it('ButterflyTabProps 六键全可选', () => {
    const minimal = {} satisfies ButterflyTabProps;
    expect(Object.keys(minimal)).toHaveLength(0);
    const full = {
      isDemo: true,
      onAuthPrompt: (_f: string) => {},
      sharedSessionId: 's1', // Round 78
      onSharedSessionConsumed: () => {},
      onBack: () => {},
    } satisfies ButterflyTabProps;
    expect(Object.keys(full)).toHaveLength(5);
  });

  it('DemoScenePlayerProps satisfies 全键', () => {
    const probe = {
      sceneText: '文本',
      sceneImageUrl: 'https://i/x.png',
      chapterIndex: 1,
      chapterTitle: '标题',
      tone: 'hopeful',
      timeSpan: '2024',
      sceneIndex: 0,
      totalScenes: 3,
      isLastSceneOfChapter: false,
      hasChoice: true,
      onAdvance: () => {},
      isStreaming: false,
      isLight: true,
      isDialogueCollapsed: false,
      onToggleDialogue: () => {},
    } satisfies DemoScenePlayerProps;
    expect(Object.keys(probe)).toHaveLength(15);
    expect(probe.tone).toBe('hopeful');
  });
});
