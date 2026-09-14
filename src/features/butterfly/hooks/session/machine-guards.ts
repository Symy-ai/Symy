/**
 * machine-guards — XState v5 guards for butterfly machine
 *
 * 🔧 ARCH fix (Round 60 — machine-services.ts god component 拆分):
 *    从 machine-services.ts 提取 MachineGuards (~127 行)。
 *    machine-services.ts 从 1321 行 → ~1194 行。
 *
 * 高内聚低耦合: guards 逻辑内聚到此文件, machine-services 只 import。
 */

import type { ButterflyMachineContext, ButterflyMachineEvent } from './butterfly-machine';
import { AuthExpiredError } from './auth-expired-error';

export const MachineGuards = {
  // BUG-223: 非 demo 模式 user 不为 null
  canCreateSession: ({ context }: { context: ButterflyMachineContext }) => {
    if (context.isDemo) return true;
    return !!context.userId;
  },

  // BUG-250: 检查是否可以提交选择（session 存在 + 未做过选择）
  canSubmitChoice: ({ context, event }: { context: ButterflyMachineContext; event: ButterflyMachineEvent }) => {
    if (!context.session) return false;
    if (event.type !== 'SUBMIT_CHOICE') return false;
    const existingChoice = context.session.choices.find(c => c.chapterIndex === event.chapterIndex);
    if (existingChoice?.selectedOption) return false;
    return true;
  },

  // 仅 complete 允许 regenerate（machine 层已限制状态，此处校验 session 存在）
  canRegenerate: ({ context }: { context: ButterflyMachineContext }) => !!context.session,

  // V17: 活跃会话有未选 choice → choosing
  // ⚠️ XState v5 onDone: event.output 是 service 返回值
  // 🔧 P0 fix (player stuck restoring completed session):
  //   旧代码: 只检查 choices.find(c => !c.selectedOption), 不检查 session.status
  //   问题: 若 session.status='completed' 但有未选 choice (e.g. 最后一章有 choice 但故事已结束),
  //   activeSessionHasPendingChoice 返回 true → machine 进 choosing 而非 complete
  //   → player 卡在 choosing, isLoading 可能不正确, 按钮 disabled
  //   根因修复: 若 session.status='completed', 直接返回 false (让 activeSessionCompleted 接管)
  activeSessionHasPendingChoice: ({ event }: { event: any }) => {
    const session = event.output;
    if (!session) return false;
    // 🔧 P0 fix: completed session 不进 choosing (即使有未选 choice)
    if (session.status === 'completed') return false;
    return !!session.choices.find((c: any) => !c.selectedOption);
  },

  // V17: 活跃会话 status=completed → complete
  activeSessionCompleted: ({ event }: { event: any }) => {
    const session = event.output;
    if (!session) return false;
    return session.status === 'completed';
  },

  // V17: 活跃会话 status=active + 有 outline → streaming
  activeSessionStreaming: ({ event }: { event: any }) => {
    const session = event.output;
    if (!session) return false;
    return session.status === 'active' && !!session.outline;
  },

  // submitChoice preloaded 分支 → streaming（无 choice）
  // ⚠️ XState v5 onDone: event.output 是 SubmitChoiceResult
  isSubmitPreloadedStream: ({ event }: { event: any }) => {
    const result = event.output;
    if (!result || result.type !== 'preloaded') return false;
    return !result.choice;
  },

  // submitChoice preloaded 分支 → choosing（有 choice）
  isSubmitPreloadedChoice: ({ event }: { event: any }) => {
    const result = event.output;
    if (!result || result.type !== 'preloaded') return false;
    return !!result.choice;
  },

  // submitChoice stream 分支
  isSubmitStream: ({ event }: { event: any }) => {
    const result = event.output;
    return !!result && result.type === 'stream';
  },

  // submitChoice complete 分支（409 reload 发现已完成）
  isSubmitComplete: ({ event }: { event: any }) => {
    const result = event.output;
    return !!result && result.type === 'complete';
  },

  // continue preloaded 分支 → streaming（无 choice）— 用于 continuing always
  // 🔧 ARCH fix (Round 5 XState H4): 验证 preloadedChapterData 是下一章, 防止 stale 数据导致跳章/倒退
  hasPreloadedChapterData: ({ context }: { context: ButterflyMachineContext }) => {
    if (!context.preloadedChapterData || !context.session) return false;
    return context.preloadedChapterData.chapter.index === context.session.currentChapter + 1;
  },

  // continue fallback（!isPreloading）— 用于 continuing always
  isNotPreloading: ({ context }: { context: ButterflyMachineContext }) => !context.isPreloading,

  // 🔧 ARCH fix (Round 6 XState H6): RETRY guards
  hasSessionAndChapters: ({ context }: { context: ButterflyMachineContext }) =>
    !!context.session && context.completedChapters.length > 0,
  hasSessionNoChapters: ({ context }: { context: ButterflyMachineContext }) =>
    !!context.session && context.completedChapters.length === 0,

  // 🔧 ARCH fix (Round 11 C2 — submitChoice 失败后 RETRY 路由):
  //    若 pendingChoice 存在 (assignRestorePendingChoice 已恢复), RETRY 回 choosing 重新提交。
  hasPendingChoice: ({ context }: { context: ButterflyMachineContext }) => !!context.pendingChoice,

  // 🔧 ARCH fix (Round 13 BUG-8): 检查 onError event.error 是否为 AuthExpiredError
  isAuthExpiredError: ({ event }: { event: any }) => {
    const err = event?.error;
    return err instanceof AuthExpiredError || (err?.name === 'AuthExpiredError');
  },

  // 🔧 ARCH fix (Round 12 XSTATE-15): 删除 isContinuePreloadedStream/Choice/Stream 死代码 guards
  //    (CONTINUE_DONE event 永不产生, continuing 状态用 always/on PRELOAD_CHAPTER_DONE/after 8000)

  // 非 demo 模式（ILLUSTRATION_FAILED spawn tryClientIllustration 用）
  notDemo: ({ context }: { context: ButterflyMachineContext }) => !context.isDemo,

  // 缺图检查（currentChapterInfo 无 illustrationUrl）
  chapterHasNoIllustration: ({ context, event }: { context: ButterflyMachineContext; event: ButterflyMachineEvent }) => {
    if (event.type !== 'CHAPTER_END') return false;
    const info = context.currentChapterInfo;
    return !!(info && info.chapterIndex === event.data.chapterIndex && !info.illustrationUrl);
  },

  // !chapterSceneTriggered.has(idx)（generateSceneIllustrations 去重）
  chapterSceneNotTriggered: ({ context, event }: { context: ButterflyMachineContext; event: ButterflyMachineEvent }) => {
    if (event.type !== 'CHAPTER_END') return false;
    return !context.chapterSceneTriggered.includes(event.data.chapterIndex);
  },

  // !hasChoice && !sessionCompleted（preloadNextChapter spawn 条件）
  noChoiceAndSessionActive: ({ context, event }: { context: ButterflyMachineContext; event: ButterflyMachineEvent }) => {
    if (event.type !== 'CHAPTER_END') return false;
    if (event.data.hasChoice) return false;
    if (context.session?.status === 'completed') return false;
    return true;
  },

  // loadActive 副作用 spawn 条件：session 存在 && chapters 非空（疑点1）
  hasActiveSessionWithChapters: ({ context }: { context: ButterflyMachineContext }) => {
    return !!(context.session && context.completedChapters.length > 0);
  },

  // 🔧 2026-07-17 (speed fix): 后端一次生成 3 章完整内容, session 直接 completed
  //   检查 generateOutlineService onDone 返回的 session 是否已是 completed 状态
  //   + chapters 满 3 章 → 跳过 streaming, 直接进 complete 状态
  isSessionAlreadyComplete: ({ event }: { event: any }) => {
    const session = event?.output;
    if (!session) return false;
    return session.status === 'completed' && Array.isArray(session.chapters) && session.chapters.length >= 3;
  },
};

export type MachineGuards = typeof MachineGuards;
