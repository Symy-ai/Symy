/**
 * butterfly-machine — XState 状态机定义（完整重写，唯一状态源）
 *
 * 范围：替代 use-butterfly-session.ts 所有 useState + 状态镜像 refs + handleSSEEvent +
 * createSession/streamStory/continueStory/submitChoice 的状态管理。
 *
 * 状态映射（替代 ButterflyUIState.phase）：
 *   idle              — 初始 / 无会话（entry invoke loadActiveService 恢复进度）
 *   generating_outline — 创建会话中（invoke generateOutlineService）
 *   streaming         — 章节流式播放（invoke streamStoryService callback）
 *   choosing          — 选择点（choice_prompt 到达，等用户 SUBMIT_CHOICE 或 CONTINUE）
 *   submitting_choice — 提交选择中（invoke submitChoiceService，4 分支）
 *   continuing        — 继续下一章中（invoke continueService，3 分支）
 *   complete          — 故事完成（story_complete 到达）
 *   regenerating      — 重新生成插图中（invoke regenerateService，完成后回原状态）
 *   error             — 出错
 *
 * ⚠️ 行为零变化：所有历史 BUG 修复在 guards/actions/services 里体现。
 */

import { setup, spawnChild, stopChild, enqueueActions, assign as xstateAssign, type ActorRefFrom } from 'xstate';
import { logger } from '@/lib/logger';
import { MachineActions } from './machine-actions';
// 🔧 ARCH fix (2026-07-22): Types extracted to separate file
import { initialContext, type ButterflyMachineContext, type ButterflyMachineEvent } from './butterfly-machine-types';
export type {
  ButterflyEndpoints,
  ButterflyMachineContext,
  ButterflyMachineEvent,
  ContinueResult,
  SubmitChoiceResult,
} from './butterfly-machine-types';
export { initialContext } from './butterfly-machine-types';
import {
  MachineGuards,
  loadActiveService,
  generateOutlineService,
  streamStoryService,
  // continueService 已删除 (死代码)
  submitChoiceService,
  regenerateService,
  preloadNextChapterActor,
  preloadBranchActor,
  tryClientIllustrationActor,
  generateSceneIllustrationsActor,
  illustrationPollingActor,
  type PreloadNextChapterInput,
  type PreloadBranchInput,
  type TryClientIllustrationInput,
  type GenerateSceneIllustrationsInput,
  type IllustrationPollingInput,
} from './machine-services';

// ============================================================
// Machine 定义
// ============================================================

/**
 * 完整状态机：context 唯一状态源，actions 纯 assign，services invoke，副作用 spawn。
 *
 * services 本轮为 stub（层面 c 实现），但 machine 结构完整。
 */
export const butterflyMachine = setup({
  types: {
    context: {} as ButterflyMachineContext,
    events: {} as ButterflyMachineEvent,
    input: {} as Partial<ButterflyMachineContext>,
  },
  actions: {
    ...MachineActions,
    // stopIllustrationPolling — 停止 illustrationPollingActor
    //    旧代码无 id 无法 stopChild, RESET/CREATE_SESSION 时旧 actor 继续 fetch 120s。
    //    根因修复: enqueueActions + stopChild({id:'illustration-polling'})。
    //    若 actor 不存在 (未 spawn), stopChild 是 no-op (XState v5 安全)。
    stopIllustrationPolling: enqueueActions(({ enqueue }) => {
      // stopChild 接受 string id (XState v5 API)
      enqueue(stopChild('illustration-polling'));
    }),
    // ── spawn actions（enqueueActions + spawnChild，XState v5 标准）──
    // chapter_end 副作用：spawn tryClientIllustration（缺图+!demo）/ preloadNextChapter（!hasChoice+!completed，500ms 在 actor 内）/ generateSceneIllustrations（!triggered+fullText）
    spawnChapterEndSideEffects: enqueueActions(({ context, event, enqueue }) => {
      if (event.type !== 'CHAPTER_END') return;
      const endData = event.data;
      // assignChapterEnd 已把 currentChapterInfo 置 null,
      //    此处读 context.currentChapterInfo 得到 null → tryClientIllustration 永不触发。
      //    根因修复: 从 completedChapters (assignChapterEnd 已更新) 查找刚完成的章节。
      const chapter = context.completedChapters.find(c => c.index === endData.chapterIndex);

      // 🔧 ARCH fix (Round 22 BUG-R22-H5 — assignChapterEnd 不可恢复分支后仍 spawn preloadNextChapter → 跳章):
      //    旧代码不检查 chapter 是否存在 — 若 assignChapterEnd 走不可恢复分支 (chapter_start 漏 + 无 fullText),
      //    completedChapters 未添加新章节 → chapter === undefined → tryClientIllustration 跳过 (OK),
      //    但 preloadNextChapter 不检查 chapter → 仍 spawn → 为下一章预加载, 跳过失败的章节 N。
      //    根因修复: 若 chapter 不存在 (不可恢复分支), 不 spawn 任何副作用 (避免跳章)。
      //    注: assignChapterEnd 不可恢复分支已设 isLoading=false, 用户可 RETRY/RESET。
      if (!chapter) {
        logger.warn('[Butterfly Machine] spawnChapterEndSideEffects: chapter not found in completedChapters (assignChapterEnd unrecoverable branch), skipping all side effects for chapter', endData.chapterIndex);
        return;
      }

      // tryClientIllustration（缺图 + !demo）
      // 🔧 ARCH fix (Round 17 XState-H4 — double-spawn 去重):
      //    旧代码不检查 clientIllustrationAttempted → CHAPTER_END spawn 一次 +
      //    后续 ILLUSTRATION_FAILED 再 spawn 一次 → 2 并发 client AI 调用。
      //    修复: 检查 clientIllustrationAttempted, 已尝试过则跳过 + 标记。
      if (chapter && !chapter.illustrationUrl && !context.isDemo && context.session &&
          !context.clientIllustrationAttempted.includes(endData.chapterIndex)) {
        enqueue(xstateAssign({ clientIllustrationAttempted: [...context.clientIllustrationAttempted, endData.chapterIndex] }));
        enqueue(spawnChild('tryClientIllustrationActor', {
          input: {
            chapterIndex: endData.chapterIndex,
            title: chapter.title,
            tone: chapter.tone,
            timeSpan: chapter.timeSpan,
            decisionDescription: context.session.decisionDescription,
            decisionType: context.session.decisionType,
            // 传认证端点
          } as TryClientIllustrationInput,
        }));
      }

      // preloadNextChapter（!hasChoice && !completed && !isPreloading）— BUG-330 500ms 在 actor 内
      // 设置 isPreloading=true 防止并发 SSE 流
      if (!endData.hasChoice && context.session && context.session.status !== 'completed' && !context.isPreloading) {
        enqueue(spawnChild('preloadNextChapterActor', {
          input: {
            session: context.session,
            isDemo: context.isDemo,
            isLight: context.isLight,
            endpoints: context.endpoints,
          } as PreloadNextChapterInput,
        }));
        // 设置 isPreloading=true
        enqueue(xstateAssign({ isPreloading: true }));
      }

      // generateSceneIllustrations（!triggered && fullText）
      // 只在 demo 模式 spawn — non-demo 由服务端 SSE 处理
      //    (scene_illustration_generated 事件)。旧代码无 isDemo 检查 → non-demo 每章浪费一次
      //    actor spawn (actor body 立即 return, 无副作用, 但有 spawn 开销)。
      if (context.isDemo && endData.fullText && !context.chapterSceneTriggered.includes(endData.chapterIndex) && context.session) {
        enqueue(spawnChild('generateSceneIllustrationsActor', {
          input: {
            chapterIndex: endData.chapterIndex,
            chapterContent: endData.fullText,
            chapterTitle: chapter?.title || '',  // 用 chapter 而非 info
            tone: chapter?.tone || 'neutral',     // 正确的 tone
            decisionDescription: context.session.decisionDescription,
            isDemo: context.isDemo,
            // 传 endpoints, actor 不再硬编码 URL
            endpoints: context.endpoints,
          } as GenerateSceneIllustrationsInput,
        }));
      }
    }),
    // choice_prompt：为每个 option spawn preloadBranchActor
    spawnPreloadBranches: enqueueActions(({ context, event, enqueue }) => {
      if (event.type !== 'CHOICE_PROMPT' || !context.session) return;
      // 旧代码为每个选项 spawn 一个 actor → N 并发 SSE 流。
      //    根因修复: 限制最多 2 个并发 preload (前 2 个选项), 其他选项用户选择时 fallback 到 stream。
      // demo 模式不 spawn (actor 会立即 return null, 浪费创建)
      if (context.isDemo) return;
      const maxConcurrentPreloads = 2;
      const optionsToPreload = event.data.options.slice(0, maxConcurrentPreloads);
      for (const option of optionsToPreload) {
        enqueue(spawnChild('preloadBranchActor', {
          input: {
            session: context.session,
            optionId: option.id,
            isDemo: context.isDemo,
            isLight: context.isLight,
            // 传 endpoints, actor 不再硬编码 URL
            endpoints: context.endpoints,
          } as PreloadBranchInput,
        }));
      }
    }),
    // loading_active exit：spawn illustrationPolling（guard 在 action 内判断）
    spawnIllustrationPolling: enqueueActions(({ context, event, enqueue }) => {
      // 🔧 ARCH fix (Round 15 ADV-R14-4 — STREAM_AUTH_EXPIRED 不 spawn polling):
      //    signOut 即将发生, polling actor fetch 会立刻 401 → 浪费 5s + 噪音日志
      //    注意: 不能用 context.errorDetail 判断 — XState v5 顺序是 exit → transition,
      //    assignAuthExpired 在 exit 之后才运行, 此时 errorDetail 还是 null
      if (event.type === 'STREAM_AUTH_EXPIRED') return;
      // 🔧 ARCH fix (Round 17 XState-H2 — polling actor multi-spawn 防护):
      //    旧代码每次 exit 都 spawn 新 actor → 5 章故事 = 5 并发 polling × 24 polls = 120 冗余请求。
      //    修复: 若 isPollingActive 已 true, 不重复 spawn (旧 actor 仍在轮询)。
      if (context.isPollingActive) return;
      if (context.session && context.completedChapters.length > 0) {
        const chaptersWithoutIllustration = context.completedChapters.filter(ch => !ch.illustrationUrl);
        if (chaptersWithoutIllustration.length > 0) {
          // 标记 polling 已启动, 防止后续 exit 重复 spawn
          enqueue(xstateAssign({ isPollingActive: true }));
          enqueue(spawnChild('illustrationPollingActor', {
            input: {
              sessionId: context.session.id,
              currentChapters: context.completedChapters,
              endpoints: context.endpoints,
            } as IllustrationPollingInput,
            // 🔧 ARCH fix (Round 21 BUG-R21-H5 — illustrationPollingActor 无 id, RESET 后继续轮询 120s):
            //    旧代码无 id 参数 → 无法 stopChild({id}) → RESET/CREATE_SESSION 时旧 actor 不停止,
            //    继续每 5s fetch /api/butterfly/session?sessionId=旧ID × 24 次 (120s)。
            //    根因修复: 命名 id 'illustration-polling', resetContext 时 stopChild。
            id: 'illustration-polling',
          }));
        }
      }
    }),
    // ILLUSTRATION_FAILED 非 demo：spawn tryClientIllustrationActor
    spawnTryClientIllustrationOnFail: enqueueActions(({ context, event, enqueue }) => {
      if (event.type !== 'ILLUSTRATION_FAILED' || context.isDemo || !context.session) return;
      // 🔧 ARCH fix (Round 11 H1 — Round 5 C1 修复不完整):
      //    旧代码: const info = context.currentChapterInfo; if (info && info.chapterIndex === ...)
      //    问题: ILLUSTRATION_FAILED 通常在 chapter_end 之后到达 (SSE out-of-order)。
      //    assignChapterEnd 已把 currentChapterInfo 置 null → info === null → 永不 spawn
      //    tryClientIllustration → 缺图章节无 fallback, 用户永远看不到图。
      //    根因修复: 镜像 Round 5 C1 在 spawnChapterEndSideEffects 的模式 — 从 completedChapters
      //    查找章节, 用其 title/tone/timeSpan 作为 tryClientIllustration 的输入。
      const chapterIndex = event.data.chapterIndex;
      // 🔧 ARCH fix (Round 17 XState-H4 — tryClientIllustration double-spawn 去重):
      //    旧代码 CHAPTER_END spawn 一次 + ILLUSTRATION_FAILED 再 spawn 一次 → 2 并发 client AI 调用。
      //    修复: 检查 clientIllustrationAttempted 数组, 已尝试过则不重复 spawn。
      if (context.clientIllustrationAttempted.includes(chapterIndex)) return;
      const completedChapter = context.completedChapters.find(c => c.index === chapterIndex);
      if (completedChapter && !completedChapter.illustrationUrl) {
        // 标记已尝试, 防止后续 ILLUSTRATION_FAILED 重复 spawn
        enqueue(xstateAssign({ clientIllustrationAttempted: [...context.clientIllustrationAttempted, chapterIndex] }));
        enqueue(spawnChild('tryClientIllustrationActor', {
          input: {
            chapterIndex,
            title: completedChapter.title,
            tone: completedChapter.tone,
            timeSpan: completedChapter.timeSpan,
            decisionDescription: context.session.decisionDescription,
            decisionType: context.session.decisionType,
            // 传认证端点
          } as TryClientIllustrationInput,
        }));
      }
      // currentChapterInfo 仍可能在 streaming 中 (chapter_end 未到) — 保留旧路径作为 fallback
      const info = context.currentChapterInfo;
      if (!completedChapter && info && info.chapterIndex === chapterIndex) {
        // 同样标记已尝试
        enqueue(xstateAssign({ clientIllustrationAttempted: [...context.clientIllustrationAttempted, chapterIndex] }));
        enqueue(spawnChild('tryClientIllustrationActor', {
          input: {
            chapterIndex,
            title: info.title,
            tone: info.tone,
            timeSpan: info.timeSpan,
            decisionDescription: context.session.decisionDescription,
            decisionType: context.session.decisionType,
            // 传认证端点
          } as TryClientIllustrationInput,
        }));
      }
    }),
    // PRELOAD_NEXT_CHAPTER 事件：normal-player 主动调 preloadNextChapter → spawn actor（guard isNotPreloading 在 on 配置）
    spawnPreloadNextChapter: enqueueActions(({ context, enqueue }) => {
      if (!context.session || context.session.status === 'completed') return;
      enqueue(spawnChild('preloadNextChapterActor', {
        input: {
          session: context.session,
          isDemo: context.isDemo,
          isLight: context.isLight,
          endpoints: context.endpoints,
        } as PreloadNextChapterInput,
      }));
    }),
  },
  guards: MachineGuards,
  actors: {
    loadActiveService,
    generateOutlineService,
    streamStoryService,
    // continueService 已删除 (死代码, continuing 状态无 invoke)
    submitChoiceService,
    regenerateService,
    preloadNextChapterActor,
    preloadBranchActor,
    tryClientIllustrationActor,
    generateSceneIllustrationsActor,
    illustrationPollingActor,
  },
}).createMachine({
  id: 'butterfly',
  initial: 'idle',
  context: ({ input }) => ({ ...initialContext, ...input }),
  // BUG-002 fix: 所有状态都响应 CREATE_SESSION（用户随时可以创建新会话）
  // 先 resetContext 清旧数据，再 assignCreateSessionStart 进生成状态
  on: {
    CREATE_SESSION: {
      target: '.generating_outline',
      guard: 'canCreateSession',
      // 加 stopIllustrationPolling 在 resetContext 前
      //    旧代码只 resetContext (清 isPollingActive=false), 旧 illustrationPollingActor 不停止,
      //    继续每 5s fetch /api/butterfly/session?sessionId=旧ID × 24 次 (120s)。
      //    根因修复: stopChild({id:'illustration-polling'}) 显式停止旧 actor。
      actions: ['stopIllustrationPolling', 'resetContext', 'assignCreateSessionStart'],
    },
    // SYNC_CONTEXT 在所有状态都可接收 — 只更新 context, 不转换状态。
    SYNC_CONTEXT: { actions: 'assignSyncContext' },
    // CLEAR_PRELOADED_STORY_COMPLETE 事件之前从未被处理 →
    //    preloadedStoryComplete 在新故事中残留, 显示旧故事的 butterflyEffect/finalTone。
    CLEAR_PRELOADED_STORY_COMPLETE: { actions: 'clearPreloadedStoryComplete' },
    // polling actor 完成时清 isPollingActive, 允许下次 spawn
    ILLUSTRATION_POLLING_DONE: { actions: 'clearPollingActive' },
  },
  states: {
    // ── idle：初始 / 无会话 ──
    idle: {
      on: {
        LOAD_ACTIVE: 'loading_active',
        TOGGLE_OUTLINE: { actions: 'toggleOutline' },
      },
    },

    // ── loading_active：恢复进度（invoke loadActiveService）──
    loading_active: {
      invoke: {
        src: 'loadActiveService',
        input: ({ context }) => ({ userId: context.userId, isDemo: context.isDemo, endpoints: context.endpoints }),
        onDone: [
          // output = ButterflySession | null
          { target: 'choosing', guard: 'activeSessionHasPendingChoice', actions: 'assignActiveSessionChoosing' },
          { target: 'complete', guard: 'activeSessionCompleted', actions: 'assignActiveSessionComplete' },
          { target: 'streaming', guard: 'activeSessionStreaming', actions: 'assignActiveSessionStreaming' },
          { target: 'idle', actions: 'assignNoActiveSession' },
        ],
        onError: [
          // 401 auth expired → assignAuthExpired (触发 signOut)
          { target: 'idle', guard: 'isAuthExpiredError', actions: 'assignAuthExpired' },
          // 其他错误 (5xx/网络) → idle + assignNoActiveSession (仍静默, 但不误触发 signOut)
          { target: 'idle', actions: 'assignNoActiveSession' },
        ],
      },
      // 疑点1：exit spawn illustrationPolling（guard 在 action 内判断）
      exit: 'spawnIllustrationPolling',
    },

    // ── generating_outline：创建会话，等大纲生成 ──
    generating_outline: {
      invoke: {
        src: 'generateOutlineService',
        input: ({ context, event }) => ({ params: (event as Extract<ButterflyMachineEvent, { type: 'CREATE_SESSION' }>).params, userId: context.userId, isDemo: context.isDemo, endpoints: context.endpoints }),
        // 🔧 2026-07-17 (streaming fix): session 创建后总是进 streaming, LLM 流式生成在 story API
        onDone: { target: 'streaming', actions: 'assignCreatedSession' },
        onError: [
          // 401 → idle + assignAuthExpired (不进 error state, 避免误导)
          { target: 'idle', guard: 'isAuthExpiredError', actions: 'assignAuthExpired' },
          { target: 'error', actions: 'setError' },
        ],
      },
      on: {
        RESET: 'idle',
      },
    },

    // ── streaming：章节流式播放 ──
    streaming: {
      invoke: { src: 'streamStoryService', input: ({ context }) => ({ session: context.session, isDemo: context.isDemo, isLight: context.isLight, endpoints: context.endpoints, locale: context.locale, demoOverride: context.pendingDemoOverride }) },
      on: {
        CHAPTER_START: { actions: 'assignChapterStart' },
        CHAPTER_TEXT: { actions: 'appendChapterText' },
        // chapter_end：assign + markTriggered + spawn 副作用（tryClientIllustration 缺图 / preloadNextChapter 500ms / generateSceneIllustrations 去重）
        CHAPTER_END: {
          actions: ['assignChapterEnd', 'markChapterTriggered', 'spawnChapterEndSideEffects'],
        },
        CHOICE_PROMPT: { target: 'choosing', actions: ['assignChoicePrompt', 'spawnPreloadBranches'] },
        OUTLINE_UPDATED: { actions: 'assignOutlineUpdated' },
        ILLUSTRATION_GENERATED: { actions: 'assignIllustration' },
        ILLUSTRATION_FAILED: { actions: ['handleIllustrationFailed', 'spawnTryClientIllustrationOnFail'] },
        SCENE_ILLUSTRATION_GENERATED: { actions: 'assignSceneIllustration' },
        STORY_COMPLETE: { target: 'complete', actions: 'assignStoryComplete' },
        STREAM_ERROR: { target: 'error', actions: 'setError' },
        // 401/403 → idle + assignAuthExpired (触发 signOut)
        STREAM_AUTH_EXPIRED: { target: 'idle', actions: 'assignAuthExpired' },
        // 🔧 2026-07-15 P0 fix (Gacha UI stuck v3): streamStoryService 流自然结束时
        //   (reader.done=true), sendBack STREAM_DONE 让 machine 离开 streaming 状态.
        //   - 若已收到 story_complete → assignStoryComplete 已设 storyComplete → 已通过 STORY_COMPLETE
        //     transition 进 complete (streamStoryService 仍 invoke 因 SSE 流未结束). 此处 STREAM_DONE
        //     到达时 machine 已在 complete (streaming 已 exit), 事件被 complete 状态丢弃, OK.
        //   - 若未收到 story_complete (session 未完成, 用户下次需要恢复或继续) → STREAM_DONE 回 idle
        //     (loadActiveService 下次会重新检测 session, 进 choosing/streaming/complete 合适分支)
        //   修复 Gacha UI stuck: 用户进入 Gacha tab → LOAD_ACTIVE 恢复未完成 session → 进 streaming →
        //   streamStoryService 立即结束 (session 已生成完所有章节, 后端不再发新事件) →
        //   STREAM_DONE → idle → 用户点 See the other universe → CREATE_SESSION 正常处理.
        //   注意: 不用 hasStoryComplete guard 进 complete — STORY_COMPLETE 转换是同步的, 已经 target complete,
        //         streaming.exit 已触发. STREAM_DONE 到达时 machine 已离开 streaming, 此 handler 只处理
        //         "STORY_COMPLETE 未到达但 SSE 流结束" 的场景 → 一律 target idle 最安全.
        STREAM_DONE: { target: 'idle', actions: ['stopIllustrationPolling', 'resetContext'] },
        // spawn actor 完成回调（sendBack 事件）
        PRELOAD_NEXT_CHAPTER: { guard: 'isNotPreloading', actions: ['spawnPreloadNextChapter', 'assignIsPreloadingTrue'] },
        PRELOAD_CHAPTER_DONE: { actions: 'cachePreloadedChapter' },
        PRELOAD_BRANCH_DONE: { actions: 'cachePreloadedBranch' },
        PRELOAD_STORY_COMPLETE_DONE: { actions: 'cachePreloadedStoryComplete' },
        CLIENT_ILLU_DONE: { actions: 'assignClientIllustration' },
        SCENE_ILLU_DONE: { actions: 'assignSceneIllustrationDone' },
        ILLUSTRATION_POLLING_UPDATE: { actions: 'assignPollingUpdate' },
        // 用户动作
        TOGGLE_OUTLINE: { actions: 'toggleOutline' },
        // 🔧 ARCH fix (Round 12 audit C1 — streaming 状态丢弃 CONTINUE 事件):
        //    旧代码 streaming.on 无 CONTINUE handler → no-choice CHAPTER_END 后若 preloadNextChapter
        //    失败 (409/network/空), advanceToNextChapter() 发 CONTINUE → 静默丢弃 → 无限 spinner。
        //    修复: 加 CONTINUE: 'continuing'。continuing.always 会 fallback 到 stream 分支重新调 streamStoryService。
        CONTINUE: 'continuing',
        // 🔧 ARCH fix (H6 — RESET from streaming leaves stale context):
        // 加 stopIllustrationPolling 停止旧 polling actor
        RESET: { target: 'idle', actions: ['stopIllustrationPolling', 'resetContext'] },
      },
      // 合并 exit actions
      //    M1: clearPendingDemoOverride (从 entry 移到 exit, 让 invoke.input 先读到值)
      //    M9: spawnIllustrationPolling (新 session 不经过 loading_active 也能轮询)
      exit: ['clearPendingDemoOverride', 'resetIsLoading', 'spawnIllustrationPolling'],
    },

    // ── choosing：选择点，等用户 SUBMIT_CHOICE 或 CONTINUE ──
    choosing: {
      on: {
        SUBMIT_CHOICE: {
          target: 'submitting_choice',
          guard: 'canSubmitChoice',
          actions: 'assignSubmitChoiceStart',
        },
        CONTINUE: 'continuing',
        // spawn actor 完成回调（choosing 状态也接收，因为 preloadBranch 在 choosing 之前 spawn）
        PRELOAD_NEXT_CHAPTER: { guard: 'isNotPreloading', actions: ['spawnPreloadNextChapter', 'assignIsPreloadingTrue'] },
        PRELOAD_BRANCH_DONE: { actions: 'cachePreloadedBranch' },
        PRELOAD_CHAPTER_DONE: { actions: 'cachePreloadedChapter' },
        PRELOAD_STORY_COMPLETE_DONE: { actions: 'cachePreloadedStoryComplete' },
        CLIENT_ILLU_DONE: { actions: 'assignClientIllustration' },
        SCENE_ILLU_DONE: { actions: 'assignSceneIllustrationDone' },
        // 🔧 ARCH fix (Round 12 audit H6 — choosing 状态漏处理 ILLUSTRATION_POLLING_UPDATE):
        //    Round 11 XSTATE-2 给 submitting_choice/continuing/regenerating 加了此 handler,
        //    但漏了 choosing。polling actor 在 streaming.exit spawn, choosing 是 streaming 的
        //    后继状态, polling 事件到达 choosing 时被静默丢弃 → 用户在选择点看不到晚到的插图。
        ILLUSTRATION_POLLING_UPDATE: { actions: 'assignPollingUpdate' },
        TOGGLE_OUTLINE: { actions: 'toggleOutline' },
        // 同 streaming — RESET 调 resetContext
        RESET: { target: 'idle', actions: ['stopIllustrationPolling', 'resetContext'] },
      },
    },

    // ── submitting_choice：提交选择中（invoke submitChoiceService，4 分支）──
    submitting_choice: {
      invoke: {
        src: 'submitChoiceService',
        // assignSubmitChoiceStart 在 invoke.input 之前执行,
        //    已把 pendingChoice 置 null。用 savedPendingChoice fallback (assignSubmitChoiceStart 保存的副本)。
        input: ({ context, event }) => ({ session: context.session, chapterIndex: (event as Extract<ButterflyMachineEvent, { type: 'SUBMIT_CHOICE' }>).chapterIndex, selectedOption: (event as Extract<ButterflyMachineEvent, { type: 'SUBMIT_CHOICE' }>).selectedOption, isDemo: context.isDemo, isLight: context.isLight, endpoints: context.endpoints, preloadedBranches: context.preloadedBranches, pendingChoice: context.pendingChoice ?? context.savedPendingChoice }),
        onDone: [
          // output = SubmitChoiceResult
          { target: 'streaming', guard: 'isSubmitPreloadedStream', actions: 'assignSubmittedChoicePreloaded' },
          { target: 'choosing', guard: 'isSubmitPreloadedChoice', actions: 'assignSubmittedChoicePreloaded' },
          { target: 'streaming', guard: 'isSubmitStream', actions: 'assignSubmittedChoiceStream' },
          { target: 'complete', guard: 'isSubmitComplete', actions: 'assignSubmittedChoiceComplete' },
        ],
        onError: [
          // 401 → idle + assignAuthExpired
          { target: 'idle', guard: 'isAuthExpiredError', actions: 'assignAuthExpired' },
          { target: 'error', actions: 'setError' },
        ],
      },
      on: {
        // 同 streaming — RESET 调 resetContext
        RESET: { target: 'idle', actions: ['stopIllustrationPolling', 'resetContext'] },
        // 🔧 ARCH fix (Round 11 XSTATE-2 — submitting_choice 丢弃 spawn actor 事件 → isPreloading 卡 true):
        //    旧代码: submitting_choice 只声明 RESET, PRELOAD_CHAPTER_DONE / PRELOAD_BRANCH_DONE /
        //    ILLUSTRATION_POLLING_UPDATE / CLIENT_ILLU_DONE / SCENE_ILLU_DONE 全部静默丢弃。
        //    若 submitChoice 期间有 preload 完成, cachePreloadedChapter 不执行, isPreloading 永远 true
        //    → 下次 CONTINUE 直接走 stream 分支 (continuing.always isNotPreloading=false → 卡 continuing 8s)
        //    根因修复: 同 streaming/choosing, 接收这些事件但不转换状态。
        PRELOAD_NEXT_CHAPTER: { guard: 'isNotPreloading', actions: ['spawnPreloadNextChapter', 'assignIsPreloadingTrue'] },
        PRELOAD_CHAPTER_DONE: { actions: 'cachePreloadedChapter' },
        PRELOAD_BRANCH_DONE: { actions: 'cachePreloadedBranch' },
        PRELOAD_STORY_COMPLETE_DONE: { actions: 'cachePreloadedStoryComplete' },
        CLIENT_ILLU_DONE: { actions: 'assignClientIllustration' },
        SCENE_ILLU_DONE: { actions: 'assignSceneIllustrationDone' },
        ILLUSTRATION_POLLING_UPDATE: { actions: 'assignPollingUpdate' },
      },
    },

    // ── continuing：继续下一章（疑点4 方案C：不用 service，用 always/on/after）──
    continuing: {
      // always（transient）：进入时立即判断
      always: [
        // 有 preloadedChapterData → 应用数据 + 进 streaming/choosing
        {
          target: 'streaming',
          guard: 'hasPreloadedChapterData',
          actions: 'assignContinuedChapterPreloadedFromContext',
        },
        // !isPreloading → fallback stream
        {
          target: 'streaming',
          guard: 'isNotPreloading',
          actions: 'assignContinuedChapterStreamFromContext',
        },
        // 否则（isPreloading && !preloaded）→ 留 continuing 等
      ],
      on: {
        // 预加载完成 → 应用数据 + 进 streaming/choosing
        PRELOAD_CHAPTER_DONE: {
          target: 'streaming',
          actions: ['cachePreloadedChapter', 'assignContinuedChapterPreloadedFromEvent'],
        },
        // 同 streaming — RESET 调 resetContext
        RESET: { target: 'idle', actions: ['stopIllustrationPolling', 'resetContext'] },
        // 🔧 ARCH fix (Round 11 XSTATE-2 — continuing 丢弃其他 spawn actor 事件):
        //    同 submitting_choice, 需接收 PRELOAD_BRANCH_DONE / ILLUSTRATION_POLLING_UPDATE 等。
        PRELOAD_BRANCH_DONE: { actions: 'cachePreloadedBranch' },
        PRELOAD_STORY_COMPLETE_DONE: { actions: 'cachePreloadedStoryComplete' },
        CLIENT_ILLU_DONE: { actions: 'assignClientIllustration' },
        SCENE_ILLU_DONE: { actions: 'assignSceneIllustrationDone' },
        ILLUSTRATION_POLLING_UPDATE: { actions: 'assignPollingUpdate' },
      },
      // 8s 超时 fallback（原轮询 8s 超时）
      after: {
        8000: { target: 'streaming', actions: 'assignContinuedChapterStreamFromContext' },
      },
    },

    // ── complete：故事完成 ──
    complete: {
      on: {
        RESET: { target: 'idle', actions: ['stopIllustrationPolling', 'resetContext'] },
        REGENERATE_ILLUSTRATION: {
          target: 'regenerating',
          guard: 'canRegenerate',
          actions: 'pushRegenerating',
        },
      },
    },

    // ── regenerating：重新生成插图中 ──
    // 允许并发 REGENERATE_ILLUSTRATION —
    //    旧代码 regenerating 状态不处理此事件 → 用户快速点多个章节的"重新生成"只有第一个生效。
    //    根因修复: 在 regenerating 状态也接收 REGENERATE_ILLUSTRATION, 用 pushRegenerating 标记,
    //    用户回到 complete 后可再次触发 (XState invoke 一次只处理一个, 但至少不丢弃事件)。
    regenerating: {
      invoke: {
        src: 'regenerateService',
        input: ({ context, event }) => ({ session: context.session, chapterIndex: (event as Extract<ButterflyMachineEvent, { type: 'REGENERATE_ILLUSTRATION' }>).chapterIndex, isDemo: context.isDemo, endpoints: context.endpoints }),
        onDone: { target: 'complete', actions: 'assignRegenerateResult' },
        onError: { target: 'complete', actions: 'assignRegenerateResult' },
      },
      on: {
        // 允许在 regenerating 中接收新的 REGENERATE_ILLUSTRATION
        //    (会 push 到 regeneratingChapters, 用户回到 complete 后可再触发)
        REGENERATE_ILLUSTRATION: { guard: 'canRegenerate', actions: 'pushRegenerating' },
        RESET: { target: 'idle', actions: ['stopIllustrationPolling', 'resetContext'] },
        // 🔧 ARCH fix (Round 11 XSTATE-2 — regenerating 丢弃 spawn actor 事件):
        //    用户在 complete 状态点 REGENERATE_ILLUSTRATION 期间, illustrationPolling /
        //    tryClientIllustration / preloadBranch 等后台 actor 仍在跑, 它们 sendBack 的事件
        //    需要被接收, 否则 chapter 插图更新丢失。
        PRELOAD_NEXT_CHAPTER: { guard: 'isNotPreloading', actions: ['spawnPreloadNextChapter', 'assignIsPreloadingTrue'] },
        PRELOAD_CHAPTER_DONE: { actions: 'cachePreloadedChapter' },
        PRELOAD_BRANCH_DONE: { actions: 'cachePreloadedBranch' },
        PRELOAD_STORY_COMPLETE_DONE: { actions: 'cachePreloadedStoryComplete' },
        CLIENT_ILLU_DONE: { actions: 'assignClientIllustration' },
        SCENE_ILLU_DONE: { actions: 'assignSceneIllustrationDone' },
        ILLUSTRATION_POLLING_UPDATE: { actions: 'assignPollingUpdate' },
      },
    },

    // ── error：出错 ──
    // 添加 RETRY action — 旧代码只有 RESET (丢全部进度)。
    //    用户遇到网络错误不必从头开始, 可重试上一步操作。
    // submitChoice 失败时, pendingChoice 由 entry action 恢复,
    //    RETRY 应回 choosing 让用户重新提交 (而非 streaming — 否则用户需重看整章才能再选)。
    // 🔧 ARCH fix (Round 12 audit H7 — RETRY 到非 streaming 状态不清 error → error UI 残留):
    //    旧代码只有 assignRetryStream (streaming 路径) 清 error。choosing/generating_outline/idle
    //    路径无 actions → error 字段残留 → 用户看到恢复的 UI 上叠加 error 提示。
    //    修复: 所有 RETRY 路径都加 clearError action (新建)。
    error: {
      entry: 'assignRestorePendingChoice',
      on: {
        RESET: { target: 'idle', actions: ['stopIllustrationPolling', 'resetContext'] },
        // RETRY 回到出错前的状态 (用户不丢进度)
        //    需要 use-butterfly-session.ts 发送 RETRY 事件
        RETRY: [
          // 若 pendingChoice 存在 (submit 失败后已恢复) → 回 choosing 重新提交
          { target: 'choosing', guard: 'hasPendingChoice', actions: 'clearError' },
          // 若有 session 且 completedChapters 非空 → 回 streaming 继续
          { target: 'streaming', guard: 'hasSessionAndChapters', actions: 'assignRetryStream' },
          // 若有 session 但无 chapters → 回 streaming (非 generating_outline)
          //    旧代码: target='generating_outline' → invoke.input 读 event.params (RETRY 事件无 params)
          //    → generateOutlineService 发 undefined body → 400 → onError → RETRY → 无限循环
          //    根因修复: session 已有 outline (CREATE_SESSION_DONE 已触发), 回 streaming 重新流式第一章
          { target: 'streaming', guard: 'hasSessionNoChapters', actions: ['clearError', 'assignRetryStream'] },
          // 无 session → 回 idle (loadActive 失败)
          { target: 'idle', actions: 'clearError' },
        ],
      },
    },
  },
});

export type ButterflyMachineActor = ActorRefFrom<typeof butterflyMachine>;

