/**
 * ButterflyTab — 类型定义（从 butterfly-tab.tsx 抽出，C5 拆分）
 *
 * 纯类型，无运行时逻辑。行为零变化。
 */

import type { StoryTone } from '../../types';

export interface ButterflyTabProps {
  isDemo?: boolean;
  onAuthPrompt?: (feature: string) => void;
  /** 🔧 ARCH fix Round 78: Shared session ID from ?session= URL param — auto-opens this story */
  sharedSessionId?: string | null;
  /** Called after sharedSessionId is consumed (so it doesn't re-open on re-render) */
  onSharedSessionConsumed?: () => void;
  /** 🔧 Bug fix: 返回到 Buddy 页面 */
  onBack?: () => void;
}

export interface DemoScenePlayerProps {
  sceneText: string;
  sceneImageUrl: string;
  chapterIndex: number;
  chapterTitle: string;
  tone: StoryTone;
  timeSpan: string;
  sceneIndex: number;
  totalScenes: number;
  isLastSceneOfChapter: boolean;
  hasChoice: boolean;
  onAdvance: () => void;
  /** 是否正在流式接收章节内容（跳过打字机效果，直接显示文本） */
  isStreaming?: boolean;
  /** 是否为亮色模式 */
  isLight?: boolean;
  /** 台词框是否收起 */
  isDialogueCollapsed?: boolean;
  /** 切换台词框收起/展开 */
  onToggleDialogue?: () => void;
}
