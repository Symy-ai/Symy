/**
 * machine-actions — XState assign actions（完整重写，唯一状态源）
 *
 * 所有 setState 逻辑搬到此处，纯 assign（无副作用）。
 * 副作用（tryClientIllustration/preloadNextChapter/preloadBranch/generateSceneIllustrations）
 * 通过 spawn actor 实现（在 machine-services.ts），本文件不含副作用。
 *
 * 对照原 setXxx 调用点（详见每个 action 注释）
 *
 * 🔧 Round 80 F5: 提取 session/choice/error actions 到 machine-actions-session.ts
 *    (892 → ~530 lines, well under 800 limit).
 *    SessionActions 包含: submitChoice 系列, continuing 系列, loadActiveSession 系列,
 *    regenerateIllustration 结果, toggleOutline, error 系列.
 */

import { assign, type ActionFunction } from 'xstate';
import type { ButterflyMachineContext, ButterflyMachineEvent } from './butterfly-machine';
import type {
  StoryChapter,
} from '../../types';
import { IllustrationActions } from './machine-actions-illustration';
import { SessionActions } from './machine-actions-session';
import { getDemoChapterIllustrationUrl } from '../../lib/demo-content';

// ============================================================
// 辅助：typed assign wrapper
// 解决 XState v5 在 setup() 外定义 action 时 TEvent 推断为 EventObject 的问题
// ============================================================

/**
 * 通用 typed assign wrapper — 解决 XState v5 在 setup() 外定义 action 时
 * TEvent 推断为 EventObject 的问题。
 *
 * 设计：接收任意 assign-compatible 函数，cast 到正确的 ActionFunction 类型。
 * 运行时仍是 XState 标准 assign action，无副作用。
 */
// 🔧 架构优化 Round 70 (Finding 6): 改进 typedAssign 类型安全
//    旧代码: TFn extends (...args: any[]) => any — 接受任何函数, 无编译时检查
//    新代码: 明确的 ButterflyAssignFn 类型, 编译器验证返回值是 Partial<Context>
type ButterflyAssignFn = (params: {
  context: ButterflyMachineContext;
  event: ButterflyMachineEvent;
}) => Partial<ButterflyMachineContext> | Record<string, never>;

function typedAssign(
  fn: ButterflyAssignFn,
): ActionFunction<ButterflyMachineContext, ButterflyMachineEvent, ButterflyMachineEvent, undefined, never, never, never, never, ButterflyMachineEvent> {
  // XState v5 assign() 类型推断限制: actions 定义在 setup() 外时 TEvent 推断为 EventObject
  // 此处 cast 是已知限制, 长期方案是迁移到 setup({ actions }) pattern
  return assign(fn as Parameters<typeof assign>[0]) as unknown as ActionFunction<ButterflyMachineContext, ButterflyMachineEvent, ButterflyMachineEvent, undefined, never, never, never, never, ButterflyMachineEvent>;
}

/**
 * Object-form typed assign — 用于 `typedAssignObject({ key: value })` 形式（无函数）。
 * 同样 cast 到正确的 ActionFunction 类型。
 */
function typedAssignObject(
  obj: Partial<ButterflyMachineContext>,
): ActionFunction<ButterflyMachineContext, ButterflyMachineEvent, ButterflyMachineEvent, undefined, never, never, never, never, ButterflyMachineEvent> {
  return assign(obj as any) as unknown as ActionFunction<ButterflyMachineContext, ButterflyMachineEvent, ButterflyMachineEvent, undefined, never, never, never, never, ButterflyMachineEvent>;
}

// ============================================================
// Actions（纯 assign）
// ============================================================

export const MachineActions = {
  // ── createSession 开始 ──
  // ← createSession line 1007-1012
  // 🔧 FIX-TS: 用 typedAssign 替代 assign，绕过 XState v5 _out_TEvent 推断问题
  // （action 不引用 event 时 TEvent 默认为 EventObject，setup() 类型检查失败）
  assignCreateSessionStart: typedAssign(() => ({
    isLoading: true,
    error: null,
    streamingText: '',
    currentChapterInfo: null,
    pendingChoice: null,
    storyComplete: null,
    completedChapters: [],
    // 重置插图 tracking（新建会话）
    clientIllustrationAttempted: [],
    sceneIllustrationAttempted: [],
    chapterSceneTriggered: [],
    // 重置预加载
    preloadedChapterData: null,
    preloadedBranches: {},
    preloadedStoryComplete: null,
    isPreloading: false,
  })),

  // ── createSession 完成，收到 session ──
  // ← createSession line 1029-1032 (setSession + setUIState streaming)
  // ⚠️ XState v5 onDone: event.output 是 service 返回值
  assignCreatedSession: typedAssign(({ event }: any) => {
    // 🔧 ARCH fix (Round 8 AUDIT-3 P0 #4): XState v5 onDone 事件是 DoneInvokeEvent,
    // 不是 ButterflyMachineEvent。typedAssign 的类型擦除是已知 XState v5 限制。
    // 长期方案: 升级到 XState v6 (推断改进) 或用 setup() pattern 重新组织 machine。
    const session = event.output;
    if (!session) return {};
    return {
      session,
      isLoading: true,  // streaming 状态等 streamStoryService
    };
  }),

  // 🔧 2026-07-17 (speed fix): 后端一次生成 3 章, session 已 completed
  //   直接把 session + chapters 填入 context, 跳过 streaming
  assignCompleteStorySession: typedAssign(({ event }: any) => {
    const session = event.output;
    if (!session) return {};
    return {
      session,
      completedChapters: session.chapters || [],
      isLoading: false,
    };
  }),

  // ── outline_generated ──
  // 🔧 ARCH fix (Round 17 audit #14 — assignOutline 是死代码, 已删除):
  //    旧代码定义了 assignOutline action 处理 OUTLINE_GENERATED 事件,
  //    但 machine 任何 state 的 on: 都没引用此事件 → 永远不会触发。
  //    outline 实际通过 assignCreatedSession (CREATE_SESSION 响应) +
  //    assignOutlineUpdated (OUTLINE_UPDATED 事件) 更新。
  //    根因修复: 删除 assignOutline action (machine-services.ts 也删除 case 'outline_generated')。

  // ── chapter_start ──
  // ← handleSSEEvent line 519-536
  assignChapterStart: typedAssign(({ context, event }) => {
    if (event.type !== 'CHAPTER_START') return {};
    const startData = event.data;
    // Demo: 预置 CDN URL；正常: 空字符串等 AI 生成
    const illustrationUrl = context.isDemo
      ? getDemoChapterIllustrationUrl(startData.chapterIndex)
      : '';
    return {
      currentChapterInfo: {
        chapterIndex: startData.chapterIndex,
        title: startData.title,
        tone: startData.tone,
        timeSpan: startData.timeSpan,
        illustrationUrl,
      },
      streamingText: '',
      isLoading: true,  // FIX: 每个新章节开始重置 isLoading=true
    };
  }),

  // ── chapter_text ──
  // ← handleSSEEvent line 539-541
  appendChapterText: typedAssign(({ context, event }) => {
    if (event.type !== 'CHAPTER_TEXT') return {};
    return {
      streamingText: context.streamingText + event.data.text,
    };
  }),

  // ── chapter_end（合并 streamStory 内联 + handleSSEEvent）──
  // ← streamStory line 877-958（StoryChapter 构造 + setCompletedChapters + setSession）
  //   + handleSSEEvent line 545-615（清 streamingText + currentChapterInfo(null) + session.currentChapter + isLoading=false 无选择时）
  assignChapterEnd: typedAssign(({ context, event }) => {
    if (event.type !== 'CHAPTER_END') return {};
    const endData = event.data;
    const info = context.currentChapterInfo;

    // 构造 StoryChapter（用 context.streamingText + event.illustrationUrl 缓冲）
    let updatedCompletedChapters = context.completedChapters;
    let updatedSession = context.session;

    if (info && info.chapterIndex === endData.chapterIndex) {
      const illustrationUrl = event.illustrationUrl || info.illustrationUrl;
      const newChapter: StoryChapter = {
        index: endData.chapterIndex,
        // 🔧 P1-2 fix: 优先用 endData.title (流式期间 chapter_start 的 title 可能为空, 解析后 chapter_end 补充)
        title: (endData as { title?: string }).title || info.title,
        content: endData.fullText || context.streamingText,
        tone: info.tone,
        timeSpan: info.timeSpan,
        hasChoice: endData.hasChoice,
        illustrationUrl,
        createdAt: new Date().toISOString(),
      };
      // M15 fix: 去重，防止重复添加
      if (!updatedCompletedChapters.some((c: StoryChapter) => c.index === newChapter.index)) {
        updatedCompletedChapters = [...updatedCompletedChapters, newChapter];
      }
      // S1 fix: 同步更新 session.chapters
      if (updatedSession) {
        updatedSession = {
          ...updatedSession,
          chapters: updatedSession.chapters.some((c: StoryChapter) => c.index === newChapter.index)
            ? updatedSession.chapters
            : [...updatedSession.chapters, newChapter],
          currentChapter: endData.chapterIndex,
        };
      }
    } else {
      // 🔧 ARCH fix (Round 11 C3 — info null/mismatched 时不应从 stale streamingText 构造章节):
      //    旧代码 (Round 8 H7): 用 endData.fullText || context.streamingText 构造 fallback 章节。
      //    问题: 若 chapter_start 被漏掉 (SSE 事件丢失 / out-of-order), streamingText 仍持有
      //    上一章节的累积文本 (assignChapterStart 未清空) → fallback 构造的"新章节"内容是上一章的副本。
      //    该伪造章节被写入 completedChapters + session.chapters → 静默内容损坏, 用户看到重复内容。
      //    根因修复:
      //    - 若 endData.fullText 存在 (服务端发了完整文本), 用它构造章节 (服务端是 source of truth)。
      //    - 若 endData.fullText 缺失/为空, 这是不可恢复的错误 (chapter_start 漏掉 + 没有完整文本)
      //      → 不构造章节, emit STREAM_ERROR 让用户重试, 而非用 stale streamingText 伪造。
      if (endData.fullText && endData.fullText.trim().length > 0) {
        const newChapter: StoryChapter = {
          index: endData.chapterIndex,
          title: info?.title || `Chapter ${endData.chapterIndex}`,
          content: endData.fullText,
          tone: info?.tone || 'neutral',
          timeSpan: info?.timeSpan || '',
          hasChoice: endData.hasChoice,
          illustrationUrl: info?.illustrationUrl || event.illustrationUrl,
          createdAt: new Date().toISOString(),
        };
        if (!updatedCompletedChapters.some((c: StoryChapter) => c.index === newChapter.index)) {
          updatedCompletedChapters = [...updatedCompletedChapters, newChapter];
        }
        if (updatedSession) {
          updatedSession = {
            ...updatedSession,
            chapters: updatedSession.chapters.some((c: StoryChapter) => c.index === newChapter.index)
              ? updatedSession.chapters
              : [...updatedSession.chapters, newChapter],
            currentChapter: endData.chapterIndex,
          };
        }
        // chapter_start 漏掉但 fullText 在 — 服务器是 source of truth, 章节内容正确, 只是元数据缺失。
        // 未来若加 monitoring, 可在此 spawn 一个 logger actor 记录 SSE 丢事件。
      } else {
        // 不可恢复 — 不伪造章节 (避免用 stale streamingText 写入重复内容), 也不清 streamingText
        // (用户至少能看到流式内容)。下次 chapter_end 或 RESET 时会清掉 streamingText。
        // 未写入 completedChapters → 用户重试时 streamStoryService 会重发 chapter_start/end。
        //
        // 🔧 ARCH fix (Round 17 audit #11 — assignChapterEnd 清 streamingText 矛盾内联注释):
        //    旧代码: 注释说"也不清 streamingText", 但 return 块的 streamingText: '' 无条件清空
        //    → 用户丢失 streamed 内容, 与注释矛盾。
        //    根因修复: 在不可恢复分支设置 shouldClearStreamingText=false, 保留 streamed 内容供用户查看。
        //
        // 🔧 ARCH fix (Round 22 BUG-R22-C3 — 不可恢复分支不 emit STREAM_ERROR → 用户卡死无错误提示):
        //    旧代码注释 "未来可改为通过专门的 action 抛 STREAM_ERROR, 但当前 assign action 不支持 emit 事件"
        //    — 这是对 XState v5 API 的误解 (raise() + enqueueActions 支持 emit), 但实际不需要 emit。
        //    根因修复: 直接在 assign 中设 error + errorDetail 字段, machine 的 error 状态 UI 会显示。
        //    spawnChapterEndSideEffects 检查 chapter 不存在时 return (Round 22 H5), 不 spawn 副作用。
        //    用户看到 error 提示, 可 RETRY/RESET, 不会卡死。
        return {
          completedChapters: updatedCompletedChapters,
          session: updatedSession,
          streamingText: context.streamingText,  // 🔧 Round 17 #11: 保留 streamed 内容
          currentChapterInfo: null,
          isLoading: false,  // 不可恢复 → 停 loading 让用户重试
          // 🔧 Round 22 C3: 设 error 让 UI 显示错误提示 (而非静默卡死)
          // 🔧 ARCH fix (Round 23 C4 — 旧代码用 'stream_error' 内部代码, UI 直接显示给用户):
          //    根因修复: 用用户友好的错误消息。
          error: 'Chapter content could not be loaded. Please retry or start a new story.',
          errorDetail: `Chapter ${endData.chapterIndex} content unavailable (chapter_start missed and no fullText). Please retry or reset.`,
        };
      }
    }

    return {
      completedChapters: updatedCompletedChapters,
      session: updatedSession,
      streamingText: '',  // 清空流式文本 (正常路径 — 章节已写入 completedChapters)
      currentChapterInfo: null,  // V14: 清空，StoryViewer 切换到已完成章节视图
      isLoading: endData.hasChoice ? context.isLoading : false,  // V14: 无选择时停 isLoading
    };
  }),

  // ── choice_prompt ──
  // ← handleSSEEvent line 619-632（preloadBranch 副作用在 machine services spawn，此处只 assign）
  assignChoicePrompt: typedAssign(({ event }) => {
    if (event.type !== 'CHOICE_PROMPT') return {};
    const choiceData = event.data;
    return {
      pendingChoice: {
        chapterIndex: choiceData.chapterIndex,
        prompt: choiceData.prompt,
        options: choiceData.options,
      },
      isLoading: false,  // choosing 状态
    };
  }),

  // ── outline_updated ──
  // ← handleSSEEvent line 635-646
  assignOutlineUpdated: typedAssign(({ context, event }) => {
    if (event.type !== 'OUTLINE_UPDATED') return {};
    const updatedOutline = event.data;
    return {
      session: context.session ? {
        ...context.session,
        outline: context.session.outline ? {
          ...context.session.outline,
          chapters: updatedOutline.chapters,
          endingHint: updatedOutline.endingHint,
          version: updatedOutline.version,
        } : context.session.outline,
      } : context.session,
    };
  }),

  // ── illustration_generated ──
  // ← handleSSEEvent line 649-676
  assignIllustration: typedAssign(({ context, event }) => {
    if (event.type !== 'ILLUSTRATION_GENERATED') return {};
    const illustrationData = event.data;
    return {
      completedChapters: context.completedChapters.map((ch: StoryChapter) =>
        ch.index === illustrationData.chapterIndex
          ? { ...ch, illustrationUrl: illustrationData.illustrationUrl }
          : ch
      ),
      session: context.session ? {
        ...context.session,
        chapters: context.session.chapters.map((ch: StoryChapter) =>
          ch.index === illustrationData.chapterIndex
            ? { ...ch, illustrationUrl: illustrationData.illustrationUrl }
            : ch
        ),
      } : context.session,
      currentChapterInfo: context.currentChapterInfo && context.currentChapterInfo.chapterIndex === illustrationData.chapterIndex
        ? { ...context.currentChapterInfo, illustrationUrl: illustrationData.illustrationUrl }
        : context.currentChapterInfo,
    };
  }),

  // ── illustration_failed ──
  // ← handleSSEEvent line 680-722
  // Demo: 用 preset CDN URL；非 demo: spawn tryClientIllustration（spawn 在 service 层，此处只 assign demo 分支）
  // ⚠️ 非 demo 的 spawn tryClientIllustration 由 machine 的 action 数组里第二个 action 触发（在 streaming 状态的 on ILLUSTRATION_FAILED）
  // 但 XState v5 action 不支持 spawn（spawn 在 actors 里），所以非 demo 的 tryClientIllustration 通过 streamStoryService 或独立 spawn actor 处理
  // 本 action 只处理 demo 分支的 preset URL assign
  handleIllustrationFailed: typedAssign(({ context, event }) => {
    if (event.type !== 'ILLUSTRATION_FAILED') return {};
    const failedData = event.data;

    // Demo: 用 preset CDN URL（绝不调 AI）
    if (context.isDemo) {
      const presetUrl = getDemoChapterIllustrationUrl(failedData.chapterIndex);
      if (presetUrl) {
        return {
          currentChapterInfo: context.currentChapterInfo && context.currentChapterInfo.chapterIndex === failedData.chapterIndex
            ? { ...context.currentChapterInfo, illustrationUrl: presetUrl }
            : context.currentChapterInfo,
          completedChapters: context.completedChapters.map((ch: StoryChapter) =>
            ch.index === failedData.chapterIndex
              ? { ...ch, illustrationUrl: presetUrl }
              : ch
          ),
        };
      }
    }
    // 非 demo: 不 assign，spawn tryClientIllustration 由 machine 配置（通过 actors 配置的 callback）
    // ⚠️ 本轮（层面 a+b）暂不实现 spawn，层面 c 补
    return {};
  }),

  // ── scene_illustration_generated ──
  // ← handleSSEEvent line 726-760
  assignSceneIllustration: typedAssign(({ context, event }) => {
    if (event.type !== 'SCENE_ILLUSTRATION_GENERATED') return {};
    const sceneData = event.data;
    return {
      completedChapters: context.completedChapters.map((ch: StoryChapter) => {
        if (ch.index !== sceneData.chapterIndex) return ch;
        const existing = ch.sceneIllustrations || {};
        return {
          ...ch,
          sceneIllustrations: {
            ...existing,
            [sceneData.sceneIndex]: [sceneData.illustrationUrl],
          },
        };
      }),
      session: context.session ? {
        ...context.session,
        chapters: context.session.chapters.map((ch: StoryChapter) => {
          if (ch.index !== sceneData.chapterIndex) return ch;
          const existing = ch.sceneIllustrations || {};
          return {
            ...ch,
            sceneIllustrations: {
              ...existing,
              [sceneData.sceneIndex]: [sceneData.illustrationUrl],
            },
          };
        }),
      } : context.session,
    };
  }),

  // ── story_complete ──
  // ← handleSSEEvent line 764-773
  assignStoryComplete: typedAssign(({ context, event }) => {
    if (event.type !== 'STORY_COMPLETE') return {};
    const completeData = event.data;
    return {
      storyComplete: {
        finalTone: completeData.finalTone,
        totalChapters: completeData.totalChapters,
        butterflyEffect: completeData.butterflyEffect,
      },
      session: context.session ? { ...context.session, status: 'completed' as const } : context.session,
      isLoading: false,
    };
  }),

  // ── streamStory E2 fix: 流结束重置 isLoading ──
  // ← streamStory line 981
  resetIsLoading: typedAssign(({ context }) => ({
    isLoading: context.isLoading ? false : context.isLoading,
  })),

  // ── reset ──
  // ← reset line 1552-1583
  resetContext: typedAssign(() => ({
    session: null,
    isLoading: false,
    error: null,
    errorDetail: null,
    outlineVisible: false,
    currentChapterIndex: 0,
    streamingText: '',
    currentChapterInfo: null,
    pendingChoice: null,
    storyComplete: null,
    completedChapters: [],
    clientIllustrationAttempted: [],
    sceneIllustrationAttempted: [],
    chapterSceneTriggered: [],
    isPollingActive: false,  // 🔧 Round 17 XState-H2: reset 时也清 polling 标志
    regeneratingChapters: [],
    generatingSceneIllustrations: [],
    preloadedChapterData: null,
    preloadedBranches: {},
    preloadedStoryComplete: null,
    isPreloading: false,
    savedPendingChoice: null,
    pendingDemoOverride: undefined,
  })),

  // ── sync context (C3 fix) ──
  // useMachine input 只在 mount 时用, 后续 user?.id / isLight / endpoints 变化不自动同步。
  // useEffect 监听变化时发 SYNC_CONTEXT 事件, 此 action 更新 context。
  assignSyncContext: typedAssign(({ event }) => {
    if (event.type !== 'SYNC_CONTEXT') return {};
    return {
      userId: event.userId,
      isLight: event.isLight,
      endpoints: event.endpoints,
      locale: event.locale,
    };
  }),

  // ── preload cache 更新 ──
  // ← preloadNextChapter setPreloadedChapterData
  cachePreloadedChapter: typedAssign(({ context, event }) => {
    if (event.type !== 'PRELOAD_CHAPTER_DONE' || !event.data) return {};
    // 🔧 ARCH fix (Round 22 BUG-R22-M1 — cachePreloadedChapter 不验证 chapter.index):
    //    cachePreloadedBranch (line 825-839) 验证 event.data.chapter.index === session.currentChapter + 1,
    //    stale 时丢弃。cachePreloadedChapter 不验证, 无条件缓存。
    //    虽然 hasPreloadedChapterData guard 在 continuing.always 会拦截 stale 数据,
    //    但 preloadedChapterData 占用 context 字段直到下次清空, 理论上有 stale 应用风险。
    //    根因修复: 与 cachePreloadedBranch 对齐, 验证 chapter.index, stale 时丢弃 (但仍清 isPreloading)。
    if (!context.session || event.data.chapter.index !== context.session.currentChapter + 1) {
      // stale preload — 丢弃数据, 但清 isPreloading 让下次能重新 spawn
      return { isPreloading: false };
    }
    return {
      preloadedChapterData: event.data,
      isPreloading: false,  // 预加载完成
    };
  }),

  // PRELOAD_NEXT_CHAPTER 事件：标记 isPreloading=true（防重复 spawn）
  assignIsPreloadingTrue: typedAssignObject({
    isPreloading: true,
  }),

  // 预加载完成/取消：标记 isPreloading=false
  assignIsPreloadingFalse: typedAssignObject({
    isPreloading: false,
  }),

  // 🔧 ARCH fix (Round 6 XState H6): RETRY 从 error 状态恢复到 streaming
  //    清除 error, 重新进入 streaming (streamStoryService 会用 context.session 继续流式)
  // 🔧 ARCH fix (Round 11 H2 — 不清 preloadedBranches 导致 stale 数据污染下次 submit):
  //    旧代码: 只清 error/isLoading/streamingText/isPreloading/preloadedChapterData。
  //    问题: 若 submitChoice 失败 (preloaded 分支), preloadedBranches 仍持有旧章节。
  //    用户点 RETRY → 回 choosing → 重新 submit 同一 option → cachePreloadedBranch 命中
  //    旧 preloadedBranch → 显示上一次失败点的章节内容 (而非新选择应到的章节)。
  //    根因修复: 清 preloadedBranches, 让下次 submit 走 stream 分支重新生成。
  assignRetryStream: typedAssign(({ context: _context }) => ({
    error: null,
    errorDetail: null,
    isLoading: true,
    streamingText: '',
    isPreloading: false,
    preloadedChapterData: null,
    preloadedBranches: {},
    // 🔧 ARCH fix (Round 17 audit H3 — 不清 illustration arrays 导致 RETRY 后章节永久缺图):
    clientIllustrationAttempted: [],
    sceneIllustrationAttempted: [],
    chapterSceneTriggered: [],
  })),

  // ← preloadBranch setPreloadedBranches
  cachePreloadedBranch: typedAssign(({ context, event }) => {
    if (event.type !== 'PRELOAD_BRANCH_DONE' || !event.data) return {};
    // 🔧 ARCH fix (Round 17 audit C1 — 不验证 chapter.index 导致 stale preloadedBranch 污染):
    //    旧代码无条件缓存, 即使 preload 是上一轮 choice prompt 的延迟结果 (同 optionId)。
    //    根因修复: 只缓存 chapter.index === session.currentChapter + 1 的 preload (当前选择点)。
    if (!context.session || event.data.chapter.index !== context.session.currentChapter + 1) {
      return {};  // stale preload — 丢弃
    }
    return {
      preloadedBranches: {
        ...context.preloadedBranches,
        [event.optionId]: event.data,
      },
    };
  }),

  // ← preloadNextChapter setPreloadedStoryComplete
  cachePreloadedStoryComplete: typedAssign(({ event }) => {
    if (event.type !== 'PRELOAD_STORY_COMPLETE_DONE' || !event.data) return {};
    return {
      preloadedStoryComplete: event.data,
    };
  }),

  // ← clearPreloadedStoryComplete
  clearPreloadedStoryComplete: typedAssignObject({
    preloadedStoryComplete: null,
  }),

  // 🔧 Round 80 F5: Session/choice/error actions extracted to machine-actions-session.ts
  ...SessionActions,
  // 🔧 Illustration tracking actions (already extracted in Round 4)
  ...IllustrationActions,
};

// 类型导出：用于 butterfly-machine.ts 的 setup actions 字段类型对齐
export type MachineActions = typeof MachineActions;
