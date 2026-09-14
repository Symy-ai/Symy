/**
 * useButterflySession — 类型定义（从 use-butterfly-session.ts 抽出，C1 拆分）
 *
 * 纯类型，无运行时逻辑。行为零变化。
 */

import type {
  ButterflySession,
  CreateSessionParams,
  ButterflyUIState,
  ChoiceOption,
  StoryChapter,
  StoryTone,
  StoryOutline,
} from '../../types';

// BUG-330 (N9): 预加载章节数据类型（移到组件外部避免类型推断为 never）
export type PreloadedChapterData = {
  chapter: StoryChapter;
  choice: { chapterIndex: number; prompt: string; options: ChoiceOption[] } | null;
  outline: StoryOutline | null;
  illustrationUrl: string | null;
};

export interface UseButterflySessionReturn {
  session: ButterflySession | null;
  uiState: ButterflyUIState;
  streamingText: string;
  currentChapterInfo: { chapterIndex: number; title: string; tone: StoryTone; timeSpan: string; illustrationUrl?: string } | null;
  pendingChoice: { chapterIndex: number; prompt: string; options: ChoiceOption[] } | null;
  storyComplete: { finalTone: StoryTone; totalChapters: number; butterflyEffect: string } | null;
  completedChapters: StoryChapter[];
  outlineVisible: boolean;
  createSession: (params: CreateSessionParams) => Promise<void>;
  continueStory: () => Promise<void>;
  submitChoice: (chapterIndex: number, selectedOption: string) => Promise<void>;
  toggleOutline: () => void;
  reset: () => void;
  loadActiveSession: () => Promise<void>;
  /** 重新生成指定章节的插图 */
  regenerateIllustration: (chapterIndex: number) => Promise<string | null>;
  /** 正在重新生成插图的章节索引集合 */
  regeneratingChapters: Set<number>;
  /** 正在生成场景插图的标记（"chapterIndex-sceneIndex"） */
  generatingSceneIllustrations: Set<string>;
  /** V4: 流式输出期间，当前章节的场景插图（sceneIndex → 图片URL数组） */
  streamingSceneIllustrations?: Record<number, string[]>;
  /** V19: Pre-loaded next chapter data (instant display when user advances) */
  preloadedChapterData: PreloadedChapterData | null;
  /** V19: Whether pre-loading is in progress */
  isPreloading: boolean;
  /** V19: Pre-loaded branch data keyed by choice option ID */
  preloadedBranches: Record<string, {
    chapter: StoryChapter;
    outline: StoryOutline | null;
    choice: { chapterIndex: number; prompt: string; options: ChoiceOption[] } | null;
  }>;
  /** V19: Pre-load next chapter in background */
  preloadNextChapter: () => Promise<void>;
  /** V32: Story complete data captured during preloading (not triggered prematurely) */
  preloadedStoryComplete: { finalTone: StoryTone; totalChapters: number; butterflyEffect: string } | null;
  /** V32: Clear preloaded story complete data after consumption */
  clearPreloadedStoryComplete: () => void;
  /** 🔧 Round 6 H6: Retry from error state — no progress lost */
  retry: () => void;
  /** 🔧 Round 28: Current user ID (null if demo/not logged in) */
  userId: string | null;
}
