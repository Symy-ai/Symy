/**
 * machine-actions-session — XState session/choice/error actions
 *
 * 🔧 Round 80 F5: 提取自 machine-actions.ts (was 892 lines, target <800).
 *    包含: submitChoice 系列 (start/preloaded/stream/complete),
 *          continuing 系列 (preloaded from context/event/stream from context),
 *          loadActiveSession 系列 (choosing/streaming/complete/noActive/authExpired),
 *          regenerateIllustration 结果, toggleOutline, error 系列 (setError/restorePendingChoice/clearError)
 *
 * 设计: 纯 assign (无副作用), 通过 typedAssign wrapper 保持类型安全.
 */

import { assign, type ActionFunction } from 'xstate';
import type { ButterflyMachineContext, ButterflyMachineEvent } from './butterfly-machine';
import type { StoryChapter } from '../../types';
import { mergeChaptersPreservingLocalIllustration } from './helpers';
// eslint-disable-next-line no-duplicate-imports
import { buildChoicesMap } from './helpers';
import { BUTTERFLY_EFFECT_FALLBACK } from './constants';

// 🔧 Round 80 F5: typedAssign wrapper (same pattern as machine-actions.ts + machine-actions-illustration.ts)
type ButterflyAssignFn = (params: {
  context: ButterflyMachineContext;
  event: ButterflyMachineEvent;
}) => Partial<ButterflyMachineContext> | Record<string, never>;

function typedAssign(
  fn: ButterflyAssignFn,
): ActionFunction<ButterflyMachineContext, ButterflyMachineEvent, ButterflyMachineEvent, undefined, never, never, never, never, ButterflyMachineEvent> {
  return assign(fn as Parameters<typeof assign>[0]) as unknown as ActionFunction<ButterflyMachineContext, ButterflyMachineEvent, ButterflyMachineEvent, undefined, never, never, never, never, ButterflyMachineEvent>;
}

function typedAssignObject(
  obj: Partial<ButterflyMachineContext>,
): ActionFunction<ButterflyMachineContext, ButterflyMachineEvent, ButterflyMachineEvent, undefined, never, never, never, never, ButterflyMachineEvent> {
  return assign(obj as Parameters<typeof assign>[0]) as unknown as ActionFunction<ButterflyMachineContext, ButterflyMachineEvent, ButterflyMachineEvent, undefined, never, never, never, never, ButterflyMachineEvent>;
}

export const SessionActions = {
  // ── submitChoice 开始 ──
  // ← submitChoice line 1207-1208 / 1292-1293
  // H4 fix: 保存 pendingChoice 以便错误时恢复
  assignSubmitChoiceStart: typedAssign(({ context }) => ({
    savedPendingChoice: context.pendingChoice,
    pendingChoice: null,
    isLoading: true,
  })),

  // ── submitChoice preloaded 分支结果 ──
  // ← submitChoice line 1218-1253
  // ⚠️ XState v5 onDone: event.output 是 SubmitChoiceResult
  assignSubmittedChoicePreloaded: typedAssign(({ context, event }: { context: ButterflyMachineContext; event: ButterflyMachineEvent }) => {
    const result = (event as { output?: { type: string; session: ButterflyMachineContext['session']; chapter?: unknown; choice?: ButterflyMachineContext['pendingChoice']; outline?: unknown } }).output;
    if (!result || result.type !== 'preloaded') return {};
    const { session, choice } = result;
    // 🔧 ARCH fix (C1 — skipped preloaded chapter):
    //    旧代码设置 currentChapterInfo = chapter.index → 触发 normal player 的 chapter_start effect
    //    (phaseRef === 'chapterComplete' → shouldRespond=true) → transitionPhase('playing') +
    //    SET_STREAMING_CHAPTER_META。然后 machine 进入 streaming 状态, streamStoryService 流式生成
    //    下一章, chapter_start 覆盖 preloaded 章节的显示 → 用户永远看不到 preloaded 章节内容。
    //    根因修复: 不设置 currentChapterInfo (与 assignContinuedChapterPreloaded V31 模式一致)。
    //    preloaded 章节已由 normal-player.selectChoice 添加到 player.completedChapters 并显示为
    //    completed chapter。machine 自然过渡: 有 choice → choosing, 无 choice → streaming(下一章)。
    return {
      session,
      // 🔧 ARCH fix (Round 13 BUG-7): merge 模式保留本地 optimistic 插图
      completedChapters: mergeChaptersPreservingLocalIllustration(session?.chapters || [], context.completedChapters),
      // V31/C1: 不设置 currentChapterInfo
      pendingChoice: choice,
      preloadedBranches: {},  // 清空
      preloadedChapterData: null,
      isLoading: false,
      savedPendingChoice: null,  // 成功后清空
    };
  }),

  // ── submitChoice stream 分支结果 ──
  // ← submitChoice line 1319/1402
  assignSubmittedChoiceStream: typedAssign(({ context, event }: { context: ButterflyMachineContext; event: ButterflyMachineEvent }) => {
    const result = (event as { output?: { type: string; session: ButterflyMachineContext['session']; demoOverride?: ButterflyMachineContext['pendingDemoOverride'] } }).output;
    if (!result || result.type !== 'stream') return {};
    const { session, demoOverride } = result;
    // 🔧 ARCH fix (C2 — stale preloadedBranches):
    //    旧代码不清 preloadedBranches → 上一轮 choice prompt 的 preload 数据残留,
    //    下一轮 choice prompt 的 preload 尚未完成时, submitChoiceService 会用 stale 数据。
    //    根因修复: 与 assignSubmittedChoicePreloaded 一致, 清空 preloadedBranches。
    return {
      session,
      // 🔧 ARCH fix (Round 13 BUG-7): merge 模式 (替代 length>0 三元, helper 自动处理空数组)
      completedChapters: mergeChaptersPreservingLocalIllustration(session?.chapters || [], context.completedChapters),
      streamingText: '',
      pendingChoice: null,
      preloadedBranches: {},  // 🔧 C2 fix: 清空, 防止 stale 分支数据污染下一轮
      // 🔧 ARCH fix (Round 8 XState M2): 清空 preloadedChapterData, 防止 stale 数据在下次 continue 时重新应用
      preloadedChapterData: null,
      isLoading: true,  // streaming 状态
      savedPendingChoice: null,  // 成功后清空
      pendingDemoOverride: demoOverride,  // 疑点5：demo 模式传 demoOverride 给 streamStoryService
    };
  }),

  // ── submitChoice complete 分支结果（409 reload 发现已完成）──
  // ← submitChoice line 1374
  assignSubmittedChoiceComplete: typedAssign(({ context, event }: { context: ButterflyMachineContext; event: ButterflyMachineEvent }) => {
    const result = (event as { output?: { type: string; session: NonNullable<ButterflyMachineContext['session']> } }).output;
    if (!result || result.type !== 'complete') return {};
    // 🔧 ARCH fix (C2 — stale preloadedBranches): 同 assignSubmittedChoiceStream
    // 🔧 ARCH fix (Round 12 audit C3 — 缺 storyComplete 导致 player 卡在 choosing):
    //    旧代码不设 storyComplete → normal-player 的 storyComplete effect 不触发 → player phase
    //    停在 choosing。对比 assignActiveSessionComplete (line 594) 正确设置了 storyComplete。
    //    修复: 从 result.session 提取 finalTone/butterflyEffect, 构造 storyComplete 对象。
    const lastOutlineChapter = result.session.outline?.chapters.slice(-1)[0];
    return {
      session: result.session,
      // 🔧 ARCH fix (Round 13 BUG-7): merge 模式保留本地 optimistic 插图
      completedChapters: mergeChaptersPreservingLocalIllustration(result.session.chapters, context.completedChapters),
      storyComplete: {
        finalTone: result.session.finalTone || lastOutlineChapter?.tone || 'twist',
        totalChapters: result.session.chapters.length,
        butterflyEffect: result.session.butterflyEffect || BUTTERFLY_EFFECT_FALLBACK,
      },
      preloadedBranches: {},  // 🔧 C2 fix: 清空
      isLoading: false,
      savedPendingChoice: null,  // 成功后清空
    };
  }),

  // ── continuing 状态：从 context.preloadedChapterData 应用数据（always 路径）──
  // 疑点4 方案C：continuing 不用 service，用 always 读 context
  assignContinuedChapterPreloadedFromContext: typedAssign(({ context }) => {
    const preloaded = context.preloadedChapterData;
    if (!preloaded || !context.session) return {};
    const { chapter, choice, outline } = preloaded;
    // 🔧 ARCH fix (Round 12 XSTATE-18): choices 去重 — 若已有同 chapterIndex 的 choice, 不重复 append
    const existingChoice = choice ? context.session.choices.find((c: import('../../types').ButterflyChoice) => c.chapterIndex === choice.chapterIndex) : null;
    const updatedChoices = choice
      ? (existingChoice
          ? context.session.choices.map((c: import('../../types').ButterflyChoice) => c.chapterIndex === choice.chapterIndex ? { ...c, prompt: choice.prompt, options: choice.options } : c)
          : [...context.session.choices, {
              id: `choice-${chapter.index}-${Date.now()}`,
              chapterIndex: choice.chapterIndex,
              prompt: choice.prompt,
              options: choice.options,
              selectedOption: null,
              createdAt: new Date().toISOString(),
              outlineRegenerated: false,
            }])
      : context.session.choices;
    return {
      session: {
        ...context.session,
        chapters: context.session.chapters.some((c: StoryChapter) => c.index === chapter.index)
          ? context.session.chapters
          : [...context.session.chapters, chapter],
        currentChapter: chapter.index,
        outline: outline || context.session.outline,
        choices: updatedChoices,
      },
      completedChapters: (() => {
        const updated = context.completedChapters;
        return updated.some((c: StoryChapter) => c.index === chapter.index) ? updated : [...updated, chapter];
      })(),
      pendingChoice: choice,
      preloadedChapterData: null,  // 清空
      isLoading: choice ? false : context.isLoading,
    };
  }),

  // ── continuing 状态：从 event.data（PRELOAD_CHAPTER_DONE）应用数据 ──
  assignContinuedChapterPreloadedFromEvent: typedAssign(({ context, event }) => {
    if (event.type !== 'PRELOAD_CHAPTER_DONE' || !event.data || !context.session) return {};
    const preloaded = event.data;
    const { chapter, choice, outline } = preloaded;
    // 🔧 ARCH fix (Round 12 XSTATE-18): choices 去重 (同 FromContext)
    const existingChoice = choice ? context.session.choices.find((c: import('../../types').ButterflyChoice) => c.chapterIndex === choice.chapterIndex) : null;
    const updatedChoices = choice
      ? (existingChoice
          ? context.session.choices.map((c: import('../../types').ButterflyChoice) => c.chapterIndex === choice.chapterIndex ? { ...c, prompt: choice.prompt, options: choice.options } : c)
          : [...context.session.choices, {
              id: `choice-${chapter.index}-${Date.now()}`,
              chapterIndex: choice.chapterIndex,
              prompt: choice.prompt,
              options: choice.options,
              selectedOption: null,
              createdAt: new Date().toISOString(),
              outlineRegenerated: false,
            }])
      : context.session.choices;
    return {
      session: {
        ...context.session,
        chapters: context.session.chapters.some((c: StoryChapter) => c.index === chapter.index)
          ? context.session.chapters
          : [...context.session.chapters, chapter],
        currentChapter: chapter.index,
        outline: outline || context.session.outline,
        choices: updatedChoices,
      },
      completedChapters: (() => {
        const updated = context.completedChapters;
        return updated.some((c: StoryChapter) => c.index === chapter.index) ? updated : [...updated, chapter];
      })(),
      pendingChoice: choice,
      preloadedChapterData: null,
      isLoading: choice ? false : context.isLoading,
    };
  }),

  // ── continuing 状态：fallback stream（从 context 构造）──
  // 🔧 ARCH fix (Round 5 XState H2): 重置 isPreloading=false, 防止 8s timeout 后 isPreloading 永远卡 true
  assignContinuedChapterStreamFromContext: typedAssign(({ context }) => {
    if (!context.session) return {};
    return {
      streamingText: '',
      isPreloading: false,  // 🔧 Round 5 H2: reset on fallback
      preloadedChapterData: null,  // 🔧 Round 5 H3: also clear on fallback
      pendingChoice: null,
      isLoading: true,  // streaming 状态
      pendingDemoOverride: context.isDemo ? {
        currentChapter: context.session.currentChapter,
        choices: buildChoicesMap(context.session.choices),
      } : undefined,
    };
  }),

  // ── loadActiveSession 进度恢复 ──
  // ← loadActiveSession line 1494-1501（有 pending choice → choosing）
  // ⚠️ XState v5 onDone: event.output 是 ButterflySession | null
  assignActiveSessionChoosing: typedAssign(({ context, event }: { context: ButterflyMachineContext; event: ButterflyMachineEvent }) => {
    const activeSession = (event as { output?: NonNullable<ButterflyMachineContext['session']> | null }).output;
    if (!activeSession) return {};
    const pendingChoiceForSession = activeSession.choices.find((c: { selectedOption: unknown }) => !c.selectedOption);
    return {
      session: activeSession,
      // 🔧 ARCH fix (Round 13 BUG-7): merge 模式保留本地 optimistic 插图
      completedChapters: mergeChaptersPreservingLocalIllustration(activeSession.chapters, context.completedChapters),
      pendingChoice: pendingChoiceForSession ? {
        chapterIndex: pendingChoiceForSession.chapterIndex,
        prompt: pendingChoiceForSession.prompt,
        options: pendingChoiceForSession.options,
      } : null,
      isLoading: false,
    };
  }),

  // ← loadActiveSession line 1502-1508（status=active → streaming）
  assignActiveSessionStreaming: typedAssign(({ context, event }: { context: ButterflyMachineContext; event: ButterflyMachineEvent }) => {
    const activeSession = (event as { output?: NonNullable<ButterflyMachineContext['session']> | null }).output;
    if (!activeSession) return {};
    return {
      session: activeSession,
      // 🔧 ARCH fix (Round 13 BUG-7+9): merge 模式保留本地 optimistic 插图
      completedChapters: mergeChaptersPreservingLocalIllustration(activeSession.chapters, context.completedChapters),
      // 🔧 ARCH fix (Round 13 BUG-9 3b): 兜底重置 streamingText (防 stale 文本残留)
      streamingText: '',
      isLoading: false,
    };
  }),

  // ← loadActiveSession line 1509-1516（status=completed → complete）
  assignActiveSessionComplete: typedAssign(({ context, event }: { context: ButterflyMachineContext; event: ButterflyMachineEvent }) => {
    const activeSession = (event as { output?: NonNullable<ButterflyMachineContext['session']> | null }).output;
    if (!activeSession) return {};
    const lastOutlineChapter = activeSession.outline?.chapters.slice(-1)[0];
    return {
      session: activeSession,
      // 🔧 ARCH fix (Round 13 BUG-7): merge 模式保留本地 optimistic 插图
      completedChapters: mergeChaptersPreservingLocalIllustration(activeSession.chapters, context.completedChapters),
      storyComplete: {
        finalTone: activeSession.finalTone || lastOutlineChapter?.tone || 'twist',
        totalChapters: activeSession.chapters.length,
        butterflyEffect: activeSession.butterflyEffect || BUTTERFLY_EFFECT_FALLBACK,
      },
      isLoading: false,
    };
  }),

  // ← loadActiveSession 无活跃会话
  assignNoActiveSession: typedAssign(() => ({})),

  // 🔧 ARCH fix (Round 13 BUG-8): 401 auth expired — 设 error + errorDetail, 触发 signOut effect
  assignAuthExpired: typedAssignObject({
    error: 'Your session has expired. Please sign in again.',
    errorDetail: 'AUTH_EXPIRED_401',
    isLoading: false,
  }),

  // ── regenerateIllustration 结果 ──
  // ← regenerateIllustration 结果（setCompletedChapters/setSession）
  // ⚠️ XState v5 onDone: event.output 是 { chapterIndex, url, hardFailed? }
  assignRegenerateResult: typedAssign(({ context, event }: { context: ButterflyMachineContext; event: ButterflyMachineEvent }) => {
    const output = (event as { output?: { chapterIndex: number; url: string | null; hardFailed?: boolean } }).output;
    const { chapterIndex, url, hardFailed } = output || { chapterIndex: 0, url: null, hardFailed: false };
    if (!url) {
      // 🔧 ARCH fix (Round 10 XState M6): 旧代码失败时只移除标记, 无错误提示
      //    → 用户不知道重新生成失败了, 以为还在加载。
      //    根因修复: 设置 error 字段 (UI 可显示 toast), 仍移除标记让 spinner 停止。
      // 🔧 ARCH fix (Round 12 ADV-R11-4): 区分软失败与硬失败。
      //    - 软失败 (hardFailed=false): 服务端返回 null illustrationUrl (AI 暂时不可用),
      //      客户端 fallback 也未生成 (例如用户网络慢)。不报错 — 章节已有 illustrationUrl
      //      或会显示 gradient placeholder, 不破坏 UX。重试可恢复。
      //    - 硬失败 (hardFailed=true): 网络错误 / 服务端 500 / 客户端生成抛异常。
      //      报错让用户知道需检查网络后重试。
      const newContext: Record<string, unknown> = {
        regeneratingChapters: context.regeneratingChapters.filter((i: number) => i !== chapterIndex),
      };
      if (hardFailed) {
        newContext.error = `Illustration regeneration failed for chapter ${chapterIndex}. Please check your network and try again.`;
      }
      // 软失败: 仅移除 spinner, 不报错 (章节已有图或显示 placeholder)
      return newContext;
    }
    return {
      completedChapters: context.completedChapters.map((ch: StoryChapter) =>
        ch.index === chapterIndex ? { ...ch, illustrationUrl: url } : ch
      ),
      session: context.session ? {
        ...context.session,
        chapters: context.session.chapters.map((ch: StoryChapter) =>
          ch.index === chapterIndex ? { ...ch, illustrationUrl: url } : ch
        ),
      } : context.session,
      regeneratingChapters: context.regeneratingChapters.filter((i: number) => i !== chapterIndex),
    };
  }),

  // ── toggleOutline ──
  // ← toggleOutline line 1548-1550
  toggleOutline: typedAssign(({ context }) => ({
    outlineVisible: !context.outlineVisible,
  })),

  // 疑点5：streaming entry 清空 pendingDemoOverride（用完清）
  clearPendingDemoOverride: typedAssignObject({
    pendingDemoOverride: undefined,
  }),

  // ── 错误处理 ──
  setError: typedAssign(({ event }: { context: ButterflyMachineContext; event: ButterflyMachineEvent }) => {
    // STREAM_ERROR 事件（streamStoryService sendBack）
    if (event.type === 'STREAM_ERROR') {
      // 🔧 ARCH fix (Round 11 H7): 同时保留原始消息便于 ops 调试
      return { error: (event as { data: { message: string } }).data.message, errorDetail: (event as { data: { message: string } }).data.message, isLoading: false };
    }
    // 🔧 NEW-B fix: onError 事件 — 显示友好错误提示而非 "Unknown error"
    // XState onError 事件的 event.error 是抛出的 Error 对象
    const err = (event as { error?: { message?: string } | string }).error;
    const rawMsg = typeof err === 'string' ? err : err?.message || '';
    // 🔧 ARCH fix (Round 11 H7): 旧代码 substring 匹配后丢弃 rawMsg → 生产 bug 不可调试。
    //    例如 GLM-5.2 429 "Failed to generate story outline: GLM-5.2 rate limit (429)"
    //    被替换为 "AI service is temporarily unavailable", ops 看不到真实原因。
    //    根因修复: 保留 rawMsg 到 errorDetail 字段 (供日志/monitoring), error 字段仍显示友好提示。

    // 如果错误消息包含 "Failed to generate story outline" 或 "AI service" 等关键词
    // 显示更友好的提示
    let friendlyMsg: string;
    if (rawMsg.includes('Failed to generate story outline') || rawMsg.includes('Story engine')) {
      friendlyMsg = 'AI service is temporarily unavailable. Please try again in a moment.';
    } else if (rawMsg.includes('Failed to create session')) {
      friendlyMsg = 'Failed to create story session. Please try again.';
    } else if (rawMsg.includes('Failed to fetch') || rawMsg.includes('NetworkError')) {
      friendlyMsg = 'Network connection issue. Please check your internet and try again.';
    } else if (rawMsg) {
      friendlyMsg = rawMsg;
    } else {
      friendlyMsg = 'AI service is temporarily unavailable. Please try again in a moment.';
    }
    return { error: friendlyMsg, errorDetail: rawMsg, isLoading: false };
  }),

  // H4 fix: submitChoice 错误时恢复 pendingChoice
  assignRestorePendingChoice: typedAssign(({ context }) => ({
    pendingChoice: context.savedPendingChoice,
    savedPendingChoice: null,
  })),

  // 🔧 ARCH fix (Round 12 audit H7): RETRY 到非 streaming 状态时清 error + errorDetail
  //    旧代码只有 assignRetryStream 清 error, choosing/generating_outline/idle 路径不清 → error UI 残留。
  clearError: typedAssignObject({
    error: null,
    errorDetail: null,
  }),
};
