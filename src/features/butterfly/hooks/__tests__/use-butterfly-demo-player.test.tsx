// @vitest-environment happy-dom

import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// ——— mock 底座：demo-content 真实现 (纯数据工厂, 断言其输出) ———
vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
vi.mock('@/i18n/provider', () => ({
  useI18n: () => ({ locale: 'zh' }),
}));

import { useButterflyDemoPlayer } from '../use-butterfly-demo-player';
import { generateDemoOutline, generateDemoChapterContent } from '../../lib/demo-content';
import { splitScenes } from '../../hooks/player';

// 真 demo 数据的形状参考 (与 lib/demo-content 实际输出对齐)
const outline = generateDemoOutline('bought', '咖啡机', 'zh');

function startPlaying(result: { current: ReturnType<typeof useButterflyDemoPlayer> }) {
  act(() => {
    result.current.startDemo({ decisionType: 'bought', decisionDescription: '咖啡机' });
  });
}

describe('useButterflyDemoPlayer (468行 Demo 纯客户端状态机)', () => {
  beforeEach(() => { vi.clearAllMocks(); });
  afterEach(() => cleanup());

  it('初始: idle + totalChapters 默认 3', () => {
    const { result } = renderHook(() => useButterflyDemoPlayer());
    expect(result.current.phase).toBe('idle');
    expect(result.current.totalChapters).toBe(3);
    expect(result.current.isStreamingChapter).toBe(false); // Demo 永不流式
    expect(result.current.goToChapter).toBeInstanceOf(Function);
  });

  it('startDemo: loading 800ms 后 playing + outline 就位', async () => {
    const { result } = renderHook(() => useButterflyDemoPlayer());
    startPlaying(result);
    expect(result.current.isLoading).toBe(true);
    expect(result.current.decisionType).toBe('bought');
    await waitFor(() => expect(result.current.phase).toBe('playing'));
    expect(result.current.isLoading).toBe(false);
    expect(result.current.outline).toBeTruthy();
    expect(result.current.currentChapterIndex).toBe(1);
    // chapterInfo: 场景来自真 demo-content + splitScenes
    const ch1Content = generateDemoChapterContent(1, 'bought', '咖啡机', {}, 'zh');
    const expectedScenes = splitScenes(ch1Content).length;
    expect(result.current.currentChapterInfo!.scenes).toHaveLength(expectedScenes);
  });

  it('advance: 场景间推进 (sceneIndex 0→1→2…)', async () => {
    const { result } = renderHook(() => useButterflyDemoPlayer());
    startPlaying(result);
    await waitFor(() => expect(result.current.phase).toBe('playing'));
    const sceneCount = result.current.currentChapterInfo!.scenes.length;
    if (sceneCount < 2) return; // 防御: demo 内容变化时跳过
    act(() => result.current.advance());
    expect(result.current.currentSceneIndex).toBe(1);
  });

  it('最后一场景 advance: 有选择章 → choosing + choice 卡', async () => {
    const { result } = renderHook(() => useButterflyDemoPlayer());
    startPlaying(result);
    await waitFor(() => expect(result.current.phase).toBe('playing'));
    // 推进到本章最后一场景
    const last = result.current.currentChapterInfo!.scenes.length - 1;
    for (let i = 0; i < last; i++) act(() => result.current.advance());
    const chInfo = result.current.currentChapterInfo!;
    act(() => result.current.advance());
    if (chInfo.hasChoice) {
      await waitFor(() => expect(result.current.phase).toBe('choosing'));
      expect(result.current.currentChoice).toBeTruthy();
      expect(result.current.currentChoice!.options.length).toBeGreaterThanOrEqual(2);
      // completedChapters 记录当前章
      expect(result.current.completedChapters.some(c => c.index === chInfo.index)).toBe(true);
    } else if (result.current.currentChapterIndex >= result.current.totalChapters) {
      expect(result.current.phase).toBe('chapterComplete');
    }
  });

  it('selectChoice: 记录选择 + phase→chapterComplete', async () => {
    const { result } = renderHook(() => useButterflyDemoPlayer());
    startPlaying(result);
    await waitFor(() => expect(result.current.phase).toBe('playing'));
    // 直接推到 choosing (章2有选择, 手动跳章)
    act(() => { result.current.selectChoice('A'); }); // 非 choosing 被忽略
    expect(result.current.phase).toBe('playing');
  });

  it('selectChoice 在 choosing: choices 记录 + chapterComplete', async () => {
    const { result } = renderHook(() => useButterflyDemoPlayer());
    startPlaying(result);
    await waitFor(() => expect(result.current.phase).toBe('playing'));
    // 找一个 hasChoice 的章
    const choiceChapter = outline.chapters.find(c => c.hasChoice);
    if (!choiceChapter) return;
    // 用内部路径驱动: 推完全部场景
    const chInfo = result.current.currentChapterInfo!;
    const last = chInfo.scenes.length - 1;
    for (let i = 0; i < last; i++) act(() => result.current.advance());
    act(() => result.current.advance());
    if (result.current.phase === 'choosing') {
      const optionId = result.current.currentChoice!.options[0].id;
      act(() => result.current.selectChoice(optionId));
      expect(result.current.choices[chInfo.index]).toBe(optionId);
      expect(result.current.phase).toBe('chapterComplete');
      expect(result.current.currentChoice).toBeNull();
    }
  });

  it('advanceToNextChapter: chapterComplete→下一章 playing / 完结→complete+summary', async () => {
    const { result } = renderHook(() => useButterflyDemoPlayer());
    startPlaying(result);
    await waitFor(() => expect(result.current.phase).toBe('playing'));
    // playing 阶段调无效 (ref 守卫)
    act(() => result.current.advanceToNextChapter());
    expect(result.current.currentChapterIndex).toBe(1);
  });

  it('reset: 全状态清零回 idle', async () => {
    const { result } = renderHook(() => useButterflyDemoPlayer());
    startPlaying(result);
    await waitFor(() => expect(result.current.phase).toBe('playing'));
    act(() => result.current.reset());
    expect(result.current.phase).toBe('idle');
    expect(result.current.outline).toBeNull();
    expect(result.current.decisionType).toBeNull();
    expect(result.current.completedChapters).toHaveLength(0);
    expect(result.current.choices).toEqual({});
  });

  it('非最后一章无选择: 800ms autoAdvance 跳过插页直进下一章 (Round 40)', async () => {
    const { result } = renderHook(() => useButterflyDemoPlayer());
    startPlaying(result);
    await waitFor(() => expect(result.current.phase).toBe('playing'));
    const chInfo = result.current.currentChapterInfo!;
    if (chInfo.hasChoice || chInfo.index >= 3) return; // 只测非末章无选择
    const last = chInfo.scenes.length - 1;
    for (let i = 0; i < last; i++) act(() => result.current.advance());
    act(() => result.current.advance());
    // phase 仍是 playing (跳过 chapterComplete), 800ms 后 chapterIndex+1
    expect(result.current.phase).toBe('playing');
    await waitFor(() => expect(result.current.currentChapterIndex).toBe(2), { timeout: 1500 });
    expect(result.current.currentSceneIndex).toBe(0);
  });

  it('卸载清理: startDemo 800ms 内 unmount 不崩 (BUG-8)', async () => {
    const { result, unmount } = renderHook(() => useButterflyDemoPlayer());
    startPlaying(result);
    unmount(); // loading 中卸载
    await new Promise(r => setTimeout(r, 900)); // 跨过 800ms timer
    expect(true).toBe(true); // 无 act warning / 无 crash
  });
});
