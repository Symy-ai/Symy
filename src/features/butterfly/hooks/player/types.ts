/**
 * useButterflyNormalPlayer — 类型定义（从 use-butterfly-normal-player.ts 抽出，C2 拆分）
 *
 * 纯类型，无运行时逻辑。行为零变化。
 * 类型与 Demo Player 完全一致（V27 同步）。
 */

import type {
  DecisionType,
  CreateSessionParams,
  StoryTone,
  StoryOutline,
  ChoiceOption,
} from '../../types';

/** 场景数据 */
export interface SceneData {
  text: string;
  imageUrl: string;
}

/** 章节数据（已分割为场景） */
export interface ChapterData {
  index: number;
  title: string;
  tone: StoryTone;
  timeSpan: string;
  hasChoice: boolean;
  scenes: SceneData[];
}

/** 播放阶段（V27: 与 Demo 完全一致，添加 chapterComplete） */
export type NormalPhase = 'idle' | 'playing' | 'choosing' | 'chapterComplete' | 'complete';

/** Hook返回值 */
export interface UseButterflyNormalPlayerReturn {
  phase: NormalPhase;
  decisionType: DecisionType | null;
  decisionDescription: string;
  outline: StoryOutline | null;
  sessionId?: string; // 🔧 2026-07-17: for share link
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
  /** 是否正在流式接收章节内容 */
  isStreamingChapter: boolean;
  /** 流式文本（仅 isStreamingChapter 时有值） */
  streamingText: string;
  start: (params: CreateSessionParams) => Promise<boolean>;
  advance: () => void;
  selectChoice: (optionId: string) => void;
  reset: () => void;
  /** V27: 从 chapterComplete 阶段推进到下一章节 */
  advanceToNextChapter: () => void;
  /** N74 fix: 跳转到指定章节（回看已完成的章节） */
  goToChapter: (chapterIndex: number) => void;
  /** 🔧 Bug 26 fix: 手动重试加载 choice 数据 (用户等不及 20s timeout 时主动触发) */
  retryChoice: () => void;
}
