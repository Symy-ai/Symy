/**
 * ButterflyPlayer — 统一的 Player 接口
 *
 * Demo 和 Normal 模式的 player hook 都实现此接口,
 * butterfly-tab.tsx 只依赖此接口, 不关心具体实现.
 *
 * 这消除了 35 个 isDemo 三元分支.
 */

import type { DecisionType, StoryOutline, ChoiceOption, StoryTone, CreateSessionParams } from '../../types';
import type { SceneData, ChapterData } from './types';

export type ButterflyPhase = 'idle' | 'playing' | 'choosing' | 'chapterComplete' | 'complete';

export interface ButterflyPlayer {
  /** 当前阶段 */
  phase: ButterflyPhase;
  /** 决策类型 */
  decisionType: DecisionType | null;
  /** 决策描述 */
  decisionDescription: string;
  /** 大纲 */
  outline: StoryOutline | null;
  /** 🔧 2026-07-17: session ID (for share link) */
  sessionId?: string;
  /** 当前章节索引（1-3） */
  currentChapterIndex: number;
  /** 当前场景索引（0-based） */
  currentSceneIndex: number;
  /** 当前章节的所有场景 */
  currentScenes: SceneData[];
  /** 当前章节信息 */
  currentChapterInfo: ChapterData | null;
  /** 所有已完成的章节（用于完成页回顾） */
  completedChapters: ChapterData[];
  /** 当前选择提示 */
  currentChoice: { prompt: string; options: ChoiceOption[] } | null;
  /** 蝴蝶效应总结 */
  butterflyEffect: string | null;
  /** 最终基调 */
  finalTone: StoryTone | null;
  /** 总章节数 */
  totalChapters: number;
  /** 用户已做出的选择 */
  choices: Record<number, string>;
  /** 是否正在加载（初始创建时短暂为true） */
  isLoading: boolean;
  /** 错误信息 */
  error: string | null;
  /** 是否正在流式接收章节内容（仅 Normal 模式, Demo 返回 false） */
  isStreamingChapter: boolean;
  /** 流式文本（仅 isStreamingChapter 时有值, Demo 返回空字符串） */
  streamingText: string;
  /** 创建新会话. 返回 true=成功, false=失败 (🔧 P0-B fix: 让调用方判断是否扣减 gacha count) */
  start: (params: CreateSessionParams) => Promise<boolean>;
  /** 推进到下一场景 */
  advance: () => void;
  /** 选择选项 */
  selectChoice: (optionId: string) => void;
  /** 重置 */
  reset: () => void;
  /** V27: 从 chapterComplete 阶段推进到下一章节 */
  advanceToNextChapter: () => void;
  /** N74 fix: 跳转到指定章节（回看已完成的章节） */
  goToChapter: (chapterIndex: number) => void;
  /** 🔧 Bug 26 fix: 手动重试加载 choice 数据 (Demo 模式为 no-op) */
  retryChoice: () => void;
}

/**
 * 将 demo player 适配为 ButterflyPlayer 接口.
 * Demo player 的 startDemo → start, isStreamingChapter 固定 false.
 */
export function adaptDemoPlayer(demo: {
  phase: string;
  decisionType: DecisionType | null;
  decisionDescription: string;
  outline: StoryOutline | null;
  currentChapterIndex: number;
  currentSceneIndex: number;
  currentScenes: SceneData[];
  currentChapterInfo: ChapterData | null;
  completedChapters: ChapterData[];
  currentChoice: { prompt: string; options: ChoiceOption[] } | null;
  butterflyEffect: string | null;
  finalTone: StoryTone | null;
  totalChapters: number;
  choices: Record<number, string>;
  isLoading: boolean;
  error: string | null;
  startDemo: (params: CreateSessionParams) => void;
  advance: () => void;
  selectChoice: (optionId: string) => void;
  reset: () => void;
  advanceToNextChapter: () => void;
  goToChapter: (chapterIndex: number) => void;
}): ButterflyPlayer {
  return {
    phase: demo.phase as ButterflyPhase,
    decisionType: demo.decisionType,
    decisionDescription: demo.decisionDescription,
    outline: demo.outline,
    currentChapterIndex: demo.currentChapterIndex,
    currentSceneIndex: demo.currentSceneIndex,
    currentScenes: demo.currentScenes,
    currentChapterInfo: demo.currentChapterInfo,
    completedChapters: demo.completedChapters,
    currentChoice: demo.currentChoice,
    butterflyEffect: demo.butterflyEffect,
    finalTone: demo.finalTone,
    totalChapters: demo.totalChapters,
    choices: demo.choices,
    isLoading: demo.isLoading,
    error: demo.error,
    isStreamingChapter: false, // Demo 模式不流式
    streamingText: '', // Demo 模式无流式文本
  // eslint-disable-next-line require-await -- async for API consistency
    start: async (params: CreateSessionParams) => { demo.startDemo(params); return true; },
    advance: demo.advance,
    selectChoice: demo.selectChoice,
    reset: demo.reset,
    advanceToNextChapter: demo.advanceToNextChapter,
    goToChapter: demo.goToChapter,
    retryChoice: () => { /* Demo 模式 choice 是同步的, 无需 retry */ },
  };
}
