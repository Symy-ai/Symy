/**
 * butterfly-machine-types — Type definitions extracted from butterfly-machine.ts
 *
 * 🔧 ARCH fix (2026-07-22): Extracted types to reduce butterfly-machine.ts
 *    from 813 to <800 lines. Types are pure declarations with no runtime
 *    code, safe to extract without behavior change.
 */

import type {
  ButterflySession,
  CreateSessionParams,
  ChoiceOption,
  StoryChapter,
  StoryTone,
  StoryOutline,
  IllustrationData,
  SceneIllustrationData,
  ChapterStartData,
  ChapterEndData,
  ChapterTextData,
  ChoicePromptData,
  OutlineData,
  StoryCompleteData,
  StoryErrorData,
} from '../../types';
import type { PreloadedChapterData } from './types';

// ============================================================
// 端点配置（替代 DEMO_API/API 常量，进 context 供 service 访问）
// ============================================================

export interface ButterflyEndpoints {
  session: string;
  story: string;
  choice: string;
  illustration: string;
  // 加 preloadBranch — actor 不再硬编码 URL
  preloadBranch: string;
}

// ============================================================
// Context — 唯一状态源（所有 useState + 状态镜像 refs 进此）
// ============================================================

export interface ButterflyMachineContext {
  // ── ui（替代 uiState）──
  isLoading: boolean;
  error: string | null;
  // 保留原始错误消息便于调试, error 是友好提示给用户
  errorDetail: string | null;
  outlineVisible: boolean;
  currentChapterIndex: number;

  // ── data ──
  session: ButterflySession | null;
  completedChapters: StoryChapter[];
  currentChapterInfo: {
    chapterIndex: number;
    title: string;
    tone: StoryTone;
    timeSpan: string;
    illustrationUrl?: string;
  } | null;
  streamingText: string;
  pendingChoice: {
    chapterIndex: number;
    prompt: string;
    options: ChoiceOption[];
  } | null;
  storyComplete: {
    finalTone: StoryTone;
    totalChapters: number;
    butterflyEffect: string;
  } | null;

  // ── illustration tracking（替代 clientIllustrationAttemptedRef/sceneIllustrationAttemptedRef/chapterSceneTriggeredRef）──
  clientIllustrationAttempted: number[];
  sceneIllustrationAttempted: string[];
  chapterSceneTriggered: number[];

  // 🔧 ARCH fix (Round 17 XState-H2 — polling actor multi-spawn 防护):
  //    旧代码每次 streaming.exit 都 spawn 新 polling actor, 旧 actor 不停止 → N 并发 polling。
  //    修复: 用 isPollingActive 标志, 已有 polling 时不重复 spawn。
  //    polling actor 完成时 (maxRetries 达到或所有插图已就绪) 会发 ILLUSTRATION_POLLING_DONE 清标志。
  isPollingActive: boolean;

  // ── illustration status（替代 generatingSceneIllustrations/regeneratingChapters useState）──
  generatingSceneIllustrations: string[];
  regeneratingChapters: number[];

  // ── preload cache（替代 preloadedChapterData/Branches/StoryComplete + refs + isPreloading）──
  preloadedChapterData: PreloadedChapterData | null;
  preloadedBranches: Record<string, {
    chapter: StoryChapter;
    outline: StoryOutline | null;
    choice: { chapterIndex: number; prompt: string; options: ChoiceOption[] } | null;
  }>;
  preloadedStoryComplete: {
    finalTone: StoryTone;
    totalChapters: number;
    butterflyEffect: string;
  } | null;
  isPreloading: boolean;

  // ── mode（替代 isDemo + endpoints 常量 + userIdRef）──
  isDemo: boolean;
  endpoints: ButterflyEndpoints;
  userId: string | null;

  // ── 主题（替代 isLight，service 生成 SVG 插图用）──
  isLight: boolean;

  // ── UI locale（streamStory 请求体带上，后端故事内容按此语言生成）──
  locale: string;

  // ── H4 fix: submitChoice 错误时恢复 pendingChoice ──
  savedPendingChoice: {
    chapterIndex: number;
    prompt: string;
    options: ChoiceOption[];
  } | null;

  // ── demoOverride（疑点5：demo 模式 streamStory 的 currentChapter/choices 参数）──
  // submitChoiceService demo 分支 / demo continue 返回 demoOverride → assign 到 context
  // streamStoryService input 从 context.pendingDemoOverride 取，streaming entry/exit 清空
  pendingDemoOverride?: { currentChapter: number; choices: Record<number, string> };
}

export const initialContext: ButterflyMachineContext = {
  isLoading: false,
  error: null,
  errorDetail: null,
  outlineVisible: false,
  currentChapterIndex: 0,
  session: null,
  completedChapters: [],
  currentChapterInfo: null,
  streamingText: '',
  pendingChoice: null,
  storyComplete: null,
  clientIllustrationAttempted: [],
  sceneIllustrationAttempted: [],
  chapterSceneTriggered: [],
  isPollingActive: false,  // 🔧 Round 17 XState-H2
  generatingSceneIllustrations: [],
  regeneratingChapters: [],
  preloadedChapterData: null,
  preloadedBranches: {},
  preloadedStoryComplete: null,
  isPreloading: false,
  isDemo: false,
  endpoints: { session: '/api/butterfly/session', story: '/api/butterfly/story', choice: '/api/butterfly/choice', illustration: '/api/butterfly/illustration', preloadBranch: '/api/butterfly/preload-branch' },
  userId: null,
  isLight: false,
  locale: 'en',
  savedPendingChoice: null,
  pendingDemoOverride: undefined,
};

// ============================================================
// Events — 用户动作 + SSE 事件 + service 完成回调
// ============================================================

export type ButterflyMachineEvent =
  // ── 用户动作 ──
  | { type: 'CREATE_SESSION'; params: CreateSessionParams }
  | { type: 'CONTINUE' }
  | { type: 'SUBMIT_CHOICE'; chapterIndex: number; selectedOption: string }
  | { type: 'TOGGLE_OUTLINE' }
  | { type: 'RESET' }
  | { type: 'REGENERATE_ILLUSTRATION'; chapterIndex: number }
  | { type: 'LOAD_ACTIVE' }
  | { type: 'CLEAR_PRELOADED_STORY_COMPLETE' }
  | { type: 'PRELOAD_NEXT_CHAPTER' }
  // RETRY 事件 — 从 error 状态恢复
  | { type: 'RETRY' }
  // 🔧 ARCH fix (C3 — useMachine input not synced after mount):
  //    XState v5 useMachine input 只用于初始化 context。user 登录后/主题切换后,
  //    context.userId/isLight 不更新 → canCreateSession guard 返回 false → 用户无法创建会话。
  //    根因修复: 新增 SYNC_CONTEXT 事件, useEffect 监听变化时发送, action 更新 context。
  | { type: 'SYNC_CONTEXT'; userId: string | null; isLight: boolean; endpoints: ButterflyEndpoints; locale: string }

  // ── SSE 事件（streamStoryService send）──
  // 🔧 ARCH fix (Round 17 audit #14 — OUTLINE_GENERATED 死代码, 已删除事件声明):
  //    旧代码声明了此事件类型, machine-services.ts 也发送它, 但所有 state 的 on: 都不接收。
  //    根因修复: 删除事件声明 + 删除发送代码 (machine-services.ts) + 删除 assignOutline action (machine-actions.ts)。
  //    outline 实际通过 CREATE_SESSION 响应 (assignCreatedSession) + OUTLINE_UPDATED 事件 (assignOutlineUpdated) 更新。
  | { type: 'CHAPTER_START'; data: ChapterStartData }
  | { type: 'CHAPTER_TEXT'; data: ChapterTextData }
  | { type: 'CHAPTER_END'; data: ChapterEndData; illustrationUrl?: string }
  | { type: 'CHOICE_PROMPT'; data: ChoicePromptData }
  | { type: 'OUTLINE_UPDATED'; data: OutlineData }
  | { type: 'ILLUSTRATION_GENERATED'; data: IllustrationData }
  | { type: 'ILLUSTRATION_FAILED'; data: { chapterIndex: number; reason: string } }
  | { type: 'SCENE_ILLUSTRATION_GENERATED'; data: SceneIllustrationData }
  | { type: 'STORY_COMPLETE'; data: StoryCompleteData }
  | { type: 'STREAM_ERROR'; data: StoryErrorData }
  // 401/403 专用, 触发 assignAuthExpired + signOut
  | { type: 'STREAM_AUTH_EXPIRED' }
  // 🔧 2026-07-15 P0 fix (Gacha UI stuck v3, architecture-level):
  //   XState v5 fromCallback actor 完成时不会自动 transition — streamStoryService 的 SSE 流
  //   自然结束 (reader.done=true) 时, machine 仍停留在 streaming 状态, isLoading 永远 true.
  //   下次用户点 "See the other universe" 时, machine 在 streaming 接收 CREATE_SESSION,
  //   全局 on.CREATE_SESSION 应该处理 (target generating_outline + resetContext), 但实际未生效
  //   (可能 XState v5 在 invoke actor 仍 active 时, parent state 不响应 raise events).
  //   根因修复: streamStoryService 流结束时 sendBack STREAM_DONE, machine 显式 transition
  //   到 idle (无 story_complete) 或 complete (有 story_complete), 释放 invoke actor.
  | { type: 'STREAM_DONE' }

  // ── service 完成回调 ──
  | { type: 'CREATE_SESSION_DONE'; session: ButterflySession }
  // CONTINUE_DONE 已删除 (continueService 是死代码, 永不产生)
  | { type: 'SUBMIT_CHOICE_DONE'; result: SubmitChoiceResult }
  | { type: 'LOAD_ACTIVE_DONE'; session: ButterflySession | null }
  | { type: 'REGENERATE_DONE'; chapterIndex: number; url: string | null }
  | { type: 'PRELOAD_CHAPTER_DONE'; data: PreloadedChapterData | null }
  | { type: 'PRELOAD_BRANCH_DONE'; optionId: string; data: { chapter: StoryChapter; outline: StoryOutline | null; choice: { chapterIndex: number; prompt: string; options: ChoiceOption[] } | null } | null }
  | { type: 'PRELOAD_STORY_COMPLETE_DONE'; data: { finalTone: StoryTone; totalChapters: number; butterflyEffect: string } | null }
  | { type: 'CLIENT_ILLU_DONE'; chapterIndex: number; url: string | null }
  | { type: 'SCENE_ILLU_DONE'; chapterIndex: number; sceneIndex: number; url: string | null }
  | { type: 'ILLUSTRATION_POLLING_UPDATE'; chapters: StoryChapter[] }
  // polling actor 完成时发此事件, 清 isPollingActive 标志
  | { type: 'ILLUSTRATION_POLLING_DONE' };

// ── service 返回值类型 ──

/** continueService 返回值：3 分支 */
export type ContinueResult =
  | { type: 'preloaded'; session: ButterflySession; chapter: StoryChapter; choice: { chapterIndex: number; prompt: string; options: ChoiceOption[] } | null; outline: StoryOutline | null }
  | { type: 'stream'; session: ButterflySession; demoOverride?: { currentChapter: number; choices: Record<number, string> } };

/** submitChoiceService 返回值：4 分支 */
export type SubmitChoiceResult =
  | { type: 'preloaded'; session: ButterflySession; chapter: StoryChapter; choice: { chapterIndex: number; prompt: string; options: ChoiceOption[] } | null; outline: StoryOutline | null }
  | { type: 'stream'; session: ButterflySession; demoOverride?: { currentChapter: number; choices: Record<number, string> } }
  | { type: 'complete'; session: ButterflySession };

