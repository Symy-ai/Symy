/**
 * machine-services — XState invoke services + spawn actors + guards（完整实现，层面 c）
 *
 * 所有异步逻辑从 use-butterfly-session.ts 搬到此处。
 * services 用 fromPromise（invoke）/ fromCallback（streamStoryService）。
 * spawn actors 用 fromPromise（fire-and-forget，完成 send 事件更新 context）。
 *
 * ⚠️ 行为零变化：严格对照现有函数逻辑。
 */

import { fromPromise, fromCallback } from 'xstate';
// 🔧 ARCH fix (Round 12 XSTATE-15): ContinueResult / PreloadedChapterData 不再被使用 (死代码已删)
import type { ButterflyMachineContext, ButterflyMachineEvent, SubmitChoiceResult } from './butterfly-machine';
import type { ButterflySession } from '../../types';
import { generateIllustrationClient } from '../../lib/client-illustration-engine';
import { getDemoChapterIllustrationUrl } from '../../lib/demo-content';
import { buildChoicesMap } from './helpers';
import { logger } from '@/lib/logger';
// 🔧 ARCH fix (Round 62 — god component 拆分): 提取 service input 类型
import type {
  LoadActiveInput,
  GenerateOutlineInput,
  StreamStoryInput,
  SubmitChoiceInput,
  RegenerateInput,
} from './service-inputs';
// Re-export for backward compatibility (butterfly-machine.ts and others import from here)
export type {
  LoadActiveInput,
  GenerateOutlineInput,
  StreamStoryInput,
  SubmitChoiceInput,
  RegenerateInput,
  PreloadNextChapterInput,
  PreloadBranchInput,
  TryClientIllustrationInput,
  GenerateSceneIllustrationsInput,
  IllustrationPollingInput,
} from './service-inputs';

// ============================================================
// 🔧 ARCH fix (Round 13 BUG-8): AuthExpiredError — 401/403 特殊错误类
// 🔧 ARCH fix (Round 60 — 提取到独立文件避免循环依赖)
// ============================================================

import { AuthExpiredError } from './auth-expired-error';
export { AuthExpiredError };

// ============================================================
// Guards（完整实现）
// ============================================================

// 🔧 ARCH fix (Round 60 — god component 拆分): MachineGuards 已提取到 machine-guards.ts
// Re-export for backward compatibility (butterfly-machine.ts imports from here)
export { MachineGuards } from './machine-guards';

// ============================================================
// Service input 类型已提取到 service-inputs.ts (Round 62)
// ============================================================

// ============================================================
// Services（fromPromise / fromCallback）
// ============================================================

// ── loadActiveService：GET /api/butterfly/session 恢复进度 ──
// ← loadActiveSession line 1479-1542（只取数据获取部分，副作用由 spawn actors 处理）
export const loadActiveService = fromPromise<ButterflySession | null, LoadActiveInput>(async ({ input, signal }) => {
  // Demo mode / 无 user：直接返回 null（machine 进 idle）
  if (input.isDemo) return null;
  if (!input.userId) return null;

  try {
    // 🔧 2026-07-21 audit fix (agent-4 #5): 传 XState signal 给 fetch —
    //   machine 转换/actor stop 时自动 abort in-flight GET (与 generateOutlineService Round 40 fix 对齐)。
    const res = await fetch(input.endpoints.session, { signal });
    // 🔧 ARCH fix (Top-10 #7 — distinguish 404 from network error):
    //    旧代码: !res.ok → return null (与网络错误混同)
    //    问题: 404 (无活跃会话, 正常) 和 500 (服务器错误) 都返回 null → machine 进 idle
    //    → 用户可能创建重复会话, 或看不到错误提示。
    //    根因修复: 404 返回 null (正常), 5xx 抛错让 machine 进 error (显示错误)。
    if (res.status === 404) return null;
    // 🔧 ARCH fix (Round 13 BUG-8 — 401 auth expired 特殊处理):
    //    旧代码: 401/403 与 5xx 同走 throw Error → machine onError 静默进 idle, 无提示
    //    根因修复: 401/403 抛 AuthExpiredError, machine 路由到 assignAuthExpired + signOut
    if (res.status === 401 || res.status === 403) {
      throw new AuthExpiredError();
    }
    if (!res.ok) {
      throw new Error(`loadActiveService: HTTP ${res.status}`);
    }
    const { session: activeSession } = await res.json() as { session: ButterflySession | null };
    return activeSession || null;
  } catch (err) {
    // 🔧 2026-07-21 adversarial-review P2: actor stop 触发的 AbortError 是正常取消,
    //   不应记 WARN (否则每次用户离开页面都 logspam + 触发误告警)。signal.aborted ⟹ actor 已停 ⟹ 返回值被忽略。
    if (signal?.aborted) return null;
    // 网络错误也抛错 — 让用户知道服务器不可达
    logger.warn('[loadActiveService] Failed to load active session:', err);
    throw err;
  }
});

// ── generateOutlineService：POST /api/butterfly/session 创建+大纲 ──
// ← createSession line 1014-1029（只取 fetch 部分，streamStory 由 machine streaming 状态 invoke）
export const generateOutlineService = fromPromise<ButterflySession, GenerateOutlineInput>(async ({ input, signal }) => {
  // BUG-223: service 内也校验 user（双重保险）
  if (!input.isDemo && !input.userId) {
    throw new Error('User is null but not demo mode');
  }

  // 🔧 429 fix (Round 40): 用 XState v5 的 signal (actor stop 时自动 abort)
  //   旧代码: 无 AbortController → machine 转到 error 状态时 fetch 仍在运行 →
  //   服务端 lock (TTL 120s) 仍持有 → 用户点 Retry → 第二次 POST 拿不到 lock → 429。
  //   修复: 传 signal 给 fetch, actor stop 时自动 abort, 服务端 finally 释放 lock。
  const res = await fetch(input.endpoints.session, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input.params),
    signal,
  });

  if (!res.ok) {
    // 🔧 ARCH fix (Round 13 BUG-8): 401/403 抛 AuthExpiredError
    if (res.status === 401 || res.status === 403) {
      throw new AuthExpiredError();
    }
    let message = 'Failed to create session';
    try { const err = await res.json(); message = err.error || message; } catch { /* silent: non-critical operation */ }
    throw new Error(message);
  }

  const { session: newSession } = await res.json() as { session: ButterflySession };
  return newSession;
});

// ── regenerateService：重新生成插图 ──
// ← regenerateIllustration line 1705-1804
// 🔧 ARCH fix (Round 11 XSTATE-3 — 三层 try/catch 吞错 根因修复):
//    旧代码: server 失败 → fallback 客户端 → 客户端失败 → return { url: null } (不抛错)
//    machine onDone/onError 都 target 'complete' + assignRegenerateResult, 用户永远看不到错误。
//    根因修复: 区分"软失败"(server 200 但 illustrationUrl null, 走客户端 fallback) 与"硬失败"
//    (网络错误 / 客户端也失败)。硬失败抛错 → machine onError → 'complete' 状态 + assignRegenerateResult
//    需要区分 url=null (软) 与 error (硬), 由 assignRegenerateResult 决定是否提示用户。
export const regenerateService = fromPromise<{ chapterIndex: number; url: string | null; hardFailed?: boolean }, RegenerateInput>(async ({ input, signal }) => {
  const { session, chapterIndex, isDemo, endpoints } = input;
  if (!session) return { chapterIndex, url: null };

  // Demo: 用 preset CDN URL，绝不调 AI
  if (isDemo) {
    const url = getDemoChapterIllustrationUrl(chapterIndex);
    return { chapterIndex, url };
  }

  // 正常模式：调 illustration endpoint
  try {
    // 🔧 2026-07-21 audit fix (agent-4 #5): 传 signal, actor stop 时 abort (对齐 generateOutlineService)。
    const res = await fetch(endpoints.illustration, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId: session.id, chapterIndex }),
      signal,
    });

    if (res.ok) {
      const { illustrationUrl } = await res.json() as { illustrationUrl: string | null };
      if (illustrationUrl) return { chapterIndex, url: illustrationUrl };
    }

    // 服务端返回 null 或非 ok → 尝试客户端生成 (软失败 fallback)
    const chapter = session.chapters.find(ch => ch.index === chapterIndex);
    if (chapter) {
      const clientResult = await generateIllustrationClient({
        title: chapter.title,
        tone: chapter.tone,
        timeSpan: chapter.timeSpan,
        decisionDescription: session.decisionDescription,
        decisionType: session.decisionType,
        size: '136x238',
        // 🔧 Round 21 C2-XState: 用认证端点而非 demo endpoint
      });
      if (clientResult.success && clientResult.imageUrl) {
        return { chapterIndex, url: clientResult.imageUrl };
      }
    }
    // 服务端 + 客户端都失败 → 硬失败
    return { chapterIndex, url: null, hardFailed: true };
  } catch {
    // 网络错误 → 尝试客户端 (软失败 fallback)
    const chapter = session.chapters.find(ch => ch.index === chapterIndex);
    if (chapter) {
      try {
        const clientResult = await generateIllustrationClient({
          title: chapter.title,
          tone: chapter.tone,
          timeSpan: chapter.timeSpan,
          decisionDescription: session.decisionDescription,
          decisionType: session.decisionType,
          size: '136x238',
          // 🔧 Round 21 C2-XState: 用认证端点而非 demo endpoint
        });
        if (clientResult.success && clientResult.imageUrl) {
          return { chapterIndex, url: clientResult.imageUrl };
        }
      } catch {
        // 客户端也失败 → 硬失败
      }
    }
    return { chapterIndex, url: null, hardFailed: true };
  }
});

// ── continueService：DEAD CODE (Round 12 XSTATE-15 清理)
// 🔧 ARCH fix (Round 12 XSTATE-15): continuing 状态用 always/on PRELOAD_CHAPTER_DONE/after 8000,
//    不 invoke service。此 service 从未被调用 (grep actors map 内 continueService 注册但 continuing
//    状态无 invoke 字段)。isContinuePreloadedStream/Choice/Stream guards + CONTINUE_DONE event
//    全是死代码 (CONTINUE_DONE 永不产生)。
//    根因修复: 删除 continueService + ContinueInput + 相关 guards/actions (在 butterfly-machine.ts)。
//    保留 ContinueResult 类型 (submitChoiceService 仍用 stream 分支)。
//
// 历史代码 (保留供 git blame 追溯):
// export const continueService = fromPromise<ContinueResult, ContinueInput>(async ({ input }) => {
//   const { session, isDemo, isLight: _isLight, endpoints: _endpoints } = input;
//   if (!session) throw new Error('No session');
//   const demoOverride = isDemo ? { currentChapter: session.currentChapter, choices: buildChoicesMap(session.choices) } : undefined;
//   return { type: 'stream', session, demoOverride };
// });

// ── submitChoiceService：4 分支 ──
// ← submitChoice line 1195-1422
export const submitChoiceService = fromPromise<SubmitChoiceResult, SubmitChoiceInput>(async ({ input, signal }) => {
  const { session, chapterIndex, selectedOption, isDemo, isLight: _isLight, endpoints, preloadedBranches, pendingChoice } = input;
  if (!session) throw new Error('No session');

  // 分支 1：preloadedBranch 快路径
  const preloadedBranch = preloadedBranches[selectedOption];
  // 🔧 ARCH fix (Round 17 audit C1 — stale preloadedBranch 导致错误章节持久化):
  //    旧代码不验证 preloadedBranch.chapter.index === session.currentChapter + 1。
  //    若上一轮 choice prompt 的 preload (同 optionId 如 "A") 晚到, cachePreloadedBranch 缓存了
  //    stale 数据, submitChoiceService 用 stale chapter → session.currentChapter 被设为错误值。
  //    根因修复: 验证 chapter.index 是下一章, 否则 fall through 到 stream 分支。
  if (preloadedBranch && preloadedBranch.chapter.index === session.currentChapter + 1) {
    const { chapter, outline, choice } = preloadedBranch;

    // 应用预加载数据到 session（客户端构造 updatedSession）
    // 🔧 ARCH fix (Round 8 XState H11): 旧代码 .map() 不添加新 choice entry →
    //    若 session.choices 没有该 chapterIndex 的 entry, choice 不被记录。
    //    根因修复: 若不存在则 append。
    const existingChoiceIdx = session.choices.findIndex(c => c.chapterIndex === chapterIndex);
    const updatedChoices = existingChoiceIdx >= 0
      ? session.choices.map(c => c.chapterIndex === chapterIndex ? { ...c, selectedOption } : c)
      : [...session.choices, {
          id: `choice-${chapterIndex}-${Date.now()}`,
          chapterIndex,
          prompt: pendingChoice?.prompt || '',
          options: pendingChoice?.options || [],
          selectedOption,
          createdAt: new Date().toISOString(),
          outlineRegenerated: false,
        }];
    let updatedSession: ButterflySession = {
      ...session,
      chapters: session.chapters.some(c => c.index === chapter.index)
        ? session.chapters
        : [...session.chapters, chapter],
      currentChapter: chapter.index,
      outline: outline || session.outline,
      choices: updatedChoices,
    };

    // 非 demo: POST /api/butterfly/choice 持久化（V30: 必须等后端持久化）
    if (!isDemo) {
      try {
        const choiceRes = await fetch(endpoints.choice, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sessionId: session.id, chapterIndex, selectedOption }),
          signal, // 🔧 2026-07-21 audit fix (agent-4 #5): actor stop 时 abort, 对齐 generateOutlineService
        });
        // 🔧 ARCH fix (Round 11 XSTATE-4 + ADV-R11-3):
        //    旧代码 (XSTATE-4): choiceRes 非 ok 时静默用本地 updatedSession → 刷新后选择丢失。
        //    根因修复: 抛错让 machine 进 error 状态, RETRY 恢复 pendingChoice, 用户可重试。
        //    但 409 (choice already submitted) 例外 — 服务端幂等, 不算错误。
        //    ADV-R11-3 fix: 若不豁免 409, RETRY 又 409, 无限循环。
        //    409 时用本地 updatedSession 继续 (服务端已有该选择)。
        // 🔧 ARCH fix (Round 13 BUG-8 + ADV-R13-3): preloaded 分支也要检查 401
        if (choiceRes.status === 401 || choiceRes.status === 403) {
          throw new AuthExpiredError();
        }
        if (!choiceRes.ok && choiceRes.status !== 409) {
          let errMsg = `Choice POST failed: HTTP ${choiceRes.status}`;
          try {
            const errBody = await choiceRes.json() as { error?: string };
            if (errBody?.error) errMsg = errBody.error;
          } catch { /* non-JSON error */ }
          throw new Error(errMsg);
        }
        if (choiceRes.ok) {
          const { session: persistedSession } = await choiceRes.json() as { session: ButterflySession };
          if (persistedSession) {
            // 🔧 ARCH fix (C4 — preloaded chapter lost on reload):
            //    /api/butterfly/choice 只更新 choices + outline, 不写入 chapters 列。
            //    若直接用 persistedSession, preloaded 章节会从 session.chapters 丢失,
            //    页面刷新后 loadActiveSession 取不到 preloaded 章节, 章节永久丢失。
            //    根因修复: 若服务端 chapters 不含 preloaded 章节, 重新追加。
            //
            // 🔧 ARCH fix (Round 22 BUG-R22-C2 — persistedSession.currentChapter 覆盖本地 N+1):
            //    /api/butterfly/choice 不更新 current_chapter → persistedSession.currentChapter = N (用户刚做选择的章节)。
            //    若直接用 persistedSession, 本地 currentChapter=N+1 被覆盖回 N → machine 进 streaming
            //    → streamStoryService 重新生成章节 N+1 (浪费 LLM 调用 + UX 闪烁)。
            //    根因修复: 保留本地 currentChapter=chapter.index (N+1), 不被 persistedSession 覆盖。
            const hasPreloadedChapter = persistedSession.chapters?.some(c => c.index === chapter.index);
            updatedSession = hasPreloadedChapter
              ? { ...persistedSession, currentChapter: chapter.index }
              : {
                  ...persistedSession,
                  chapters: [...(persistedSession.chapters || []), chapter],
                  currentChapter: chapter.index,
                };
          }
        }
        // 409 时: 用本地 updatedSession (服务端已有该选择, 本地副本正确)
      } catch (err) {
        // 🔧 ARCH fix (Round 11 XSTATE-4): 不再吞错, 抛出让 machine 路由到 error 状态。
        // 之前: logger.warn(...) + 用本地 updatedSession (刷新后丢失选择)。
        // 现在: 抛错 → onError → error 状态 + RETRY action (Round 6 H6) → 用户可重试。
        // 区分: 抛错的是 fetch 自身抛的 (TypeError 网络错误) — 直接 rethrow
        //       或上面 choiceRes 非 ok 抛的 Error — 也 rethrow
        if (err instanceof Error) throw err;
        throw new Error(`Choice POST network error: ${String(err)}`);
      }
    }

    return { type: 'preloaded', session: updatedSession, chapter, choice, outline };
  }

  // 分支 2：demo 无 preloadedBranch
  if (isDemo) {
    const choicesMap: Record<number, string> = {};
    for (const c of session.choices) {
      if (c.selectedOption) choicesMap[c.chapterIndex] = c.selectedOption;
    }
    choicesMap[chapterIndex] = selectedOption;

    const updatedSession: ButterflySession = {
      ...session,
      choices: [...session.choices, {
        id: `choice-${chapterIndex}-${Date.now()}`,
        chapterIndex,
        prompt: pendingChoice?.prompt || '',
        options: pendingChoice?.options || [],
        selectedOption,
        createdAt: new Date().toISOString(),
        outlineRegenerated: false,
      }],
      currentChapter: chapterIndex,
    };

    return { type: 'stream', session: updatedSession, demoOverride: { currentChapter: chapterIndex, choices: choicesMap } };
  }

  // 分支 3 & 4：正常模式无 preloadedBranch
  const res = await fetch(endpoints.choice, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sessionId: session.id, chapterIndex, selectedOption }),
    signal, // 🔧 2026-07-21 audit fix (agent-4 #5): actor stop 时 abort
  });

  if (!res.ok) {
    // 分支 4：409 reload
    if (res.status === 409) {
      // 🔧 ARCH fix (Round 15 audit C1 — 409 non-preloaded 路径无限 RETRY 循环):
      //    旧代码: 若 session 未 completed 且 chapters.length <= chapterIndex (choice 已存但下一章未流式),
      //    fall through 到 throw → machine error → RETRY → choosing → 用户重提交 → 又 409 → 无限循环。
      //    根因修复: 409 = "choice already submitted" (服务端幂等)。若 reload 的 session 状态正常,
      //    不抛错 — 返回 'stream' 让 machine 进 streaming 重新流式生成下一章 (服务端会跳过已存的 choice)。
      //    只在 reload 本身失败 或 session 状态异常时才抛错。
      try {
        const sessionRes = await fetch(endpoints.session + '?sessionId=' + session.id, { signal }); // 🔧 2026-07-21 audit fix (agent-4 #5)
        if (sessionRes.ok) {
          const { session: refreshedSession } = await sessionRes.json() as { session: ButterflySession };

          // 已完成 → complete
          if (refreshedSession.status === 'completed') {
            return { type: 'complete', session: refreshedSession };
          }

          // 还有下一章 → stream (服务端会跳过已存的 choice, 直接流式下一章)
          if (refreshedSession.chapters.length > chapterIndex) {
            return { type: 'stream', session: refreshedSession };
          }

          // 🔧 Round 15 audit C1: choice 已存但下一章未流式 → 仍返回 stream,
          //    让 machine 进 streaming 重新请求流式 (服务端 story route 会处理)。
          //    旧代码这里 fall through 到 throw → 无限 RETRY 循环。
          return { type: 'stream', session: refreshedSession };
        }
      } catch {
        // reload 失败，抛错
      }
    }

    // 🔧 ARCH fix (Round 13 BUG-8): 401/403 抛 AuthExpiredError (409 已在上方处理)
    if (res.status === 401 || res.status === 403) {
      throw new AuthExpiredError();
    }

    let message = 'Failed to submit choice';
    try { const err = await res.json(); message = (err as { error?: string }).error || message; } catch { /* silent: non-critical operation */ }
    throw new Error(message);
  }

  // 分支 3：正常成功
  const { session: updatedSession } = await res.json() as { session: ButterflySession };
  return { type: 'stream', session: updatedSession };
});

// ── streamStoryService：SSE callback（最难）──
// ← streamStory line 794-985 + handleSSEEvent line 501-788
// 持有 _chapterText/pendingIllustrationUpdates/pendingIllustrationFailures 缓冲（service 内闭包）
// 每事件 sendBack({type, data}) 回机器，chapter_end 带 illustrationUrl
// onCleanup: abort SSE
// 🔧 ARCH fix (Round 12 XSTATE-11): receive 已删除 (死代码), 从参数解构中移除
export const streamStoryService = fromCallback<ButterflyMachineEvent, StreamStoryInput>(({ input, sendBack }) => {
  if (!input.session) {
    sendBack({ type: 'STREAM_ERROR', data: { message: 'No session' } });
    return () => {};
  }

  const abortController = new AbortController();
  let _chapterText = '';  // 当前章节累积文本
  const pendingIllustrationUpdates = new Map<number, string>();  // H3 fix: 缓冲 illustration_generated
  const pendingIllustrationFailures = new Set<number>();  // 缓冲 illustration_failed

  // 启动 SSE fetch（async IIFE）
  (async () => {
    try {
      const body = input.isDemo ? {
        sessionId: input.session!.id,
        decisionType: input.session!.decisionType,
        decisionDescription: input.session!.decisionDescription,
        currentChapter: input.demoOverride?.currentChapter ?? input.session!.currentChapter ?? 0,
        choices: input.demoOverride?.choices ?? buildChoicesMap(input.session!.choices),
        isLight: input.isLight,
        locale: input.locale,
      } : { sessionId: input.session!.id, isLight: input.isLight, locale: input.locale };

      const response = await fetch(input.endpoints.story, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: abortController.signal,
      });

      if (!response.ok) {
        // 🔧 ARCH fix (Round 14 ADV-R13-4): 401/403 → STREAM_AUTH_EXPIRED, 触发 assignAuthExpired + signOut
        //    (与 loadActiveService/generateOutlineService/submitChoiceService 三服务对齐)
        //    fromCallback 不能 throw, 只能 sendBack 新事件
        if (response.status === 401 || response.status === 403) {
          sendBack({ type: 'STREAM_AUTH_EXPIRED' });
          return;
        }
        let message = 'Story generation failed';
        try { const err = await response.json(); message = err.error || message; } catch { /* silent: non-critical operation */ }
        sendBack({ type: 'STREAM_ERROR', data: { message } });
        return;
      }

      const contentType = response.headers.get('content-type') || '';
      if (!input.isDemo && !contentType.includes('text/event-stream')) {
        sendBack({ type: 'STREAM_ERROR', data: { message: 'Expected SSE response' } });
        return;
      }

      const reader = response.body?.getReader();
      if (!reader) {
        sendBack({ type: 'STREAM_ERROR', data: { message: 'No response body' } });
        return;
      }

      const decoder = new TextDecoder();
      let buffer = '';
      let chunkCount = 0;

      // 🔧 2026-07-15 (ARCH-11 #9 修复): idle timeout — 150s 无数据则中止流
      //    旧代码: while(true) reader.read() 无超时 → AI 卡住时永久 loading
      //    修复: Promise.race reader.read() + idle timer (与 chat consume-ai-stream 一致)
      const STREAM_IDLE_TIMEOUT_MS = 150_000;
      let idleTimer: ReturnType<typeof setTimeout> | null = null;

      const readWithTimeout = (): Promise<{ done: boolean; value?: Uint8Array }> => {
        return new Promise((resolve) => {
          idleTimer = setTimeout(() => {
            logger.warn('[streamStoryService] idle timeout — no data for 150s, aborting stream');
            resolve({ done: true });
          }, STREAM_IDLE_TIMEOUT_MS);
          reader!.read().then((result) => {
            if (idleTimer) clearTimeout(idleTimer);
            resolve(result);
          }).catch(() => {
            if (idleTimer) clearTimeout(idleTimer);
            resolve({ done: true });
          });
        });
      };

      while (true) {
        const { done, value } = await readWithTimeout();
        if (done) {
          logger.info('[streamStoryService] reader.done=true, stream ended. chunks read:', chunkCount);
          break;
        }
        chunkCount++;
        const decoded = decoder.decode(value, { stream: true });
        logger.info('[streamStoryService] chunk', chunkCount, 'len:', decoded.length, 'preview:', decoded.substring(0, 100));
        buffer += decoded;
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const data = line.slice(6).trim();
          if (!data || data === '[DONE]') continue;

          try {
            const event = JSON.parse(data) as { type: string; data: unknown };

            // 追踪流式文本（chapter_text 累积）
            if (event.type === 'chapter_text') {
              const textData = event.data as { chapterIndex: number; text: string };
              _chapterText += textData.text;
            }

            // 🔧 ARCH fix (Round 5 XState H10): chapter_start 时重置 _chapterText
            //    旧代码只在 chapter_end 时重置 → 若 chapter_end 被漏掉 (SSE 断连/服务端 bug),
            //    _chapterText 跨章节累积 → 下一章 fullText 含上一章文本 (故事混乱)。
            if (event.type === 'chapter_start') {
              _chapterText = '';
            }

            // 缓冲 illustration_generated
            if (event.type === 'illustration_generated') {
              const illustrationData = event.data as { chapterIndex: number; illustrationUrl: string };
              pendingIllustrationUpdates.set(illustrationData.chapterIndex, illustrationData.illustrationUrl);
            }

            // 缓冲 illustration_failed
            if (event.type === 'illustration_failed') {
              const failedData = event.data as { chapterIndex: number; reason: string };
              pendingIllustrationFailures.add(failedData.chapterIndex);
            }

            // chapter_end：带缓冲的 illustrationUrl
            if (event.type === 'chapter_end') {
              const endData = event.data as { chapterIndex: number; hasChoice: boolean; fullText?: string };
              const bufferedIllustrationUrl = pendingIllustrationUpdates.get(endData.chapterIndex);
              pendingIllustrationUpdates.delete(endData.chapterIndex);
              pendingIllustrationFailures.delete(endData.chapterIndex);

              sendBack({
                type: 'CHAPTER_END',
                data: endData,
                illustrationUrl: bufferedIllustrationUrl,
              });
              _chapterText = '';  // 重置为下一章
              continue;  // 不再 send 普通 CHAPTER_END
            }

            // 其他事件：直接 sendBack（type 对齐 machine event）
            const machineEvent = mapSSEEventToMachineEvent(event);
            if (machineEvent) {
              sendBack(machineEvent);
            }
          } catch {
            // 解析失败，跳过
          }
        }
      }

      // 处理剩余 buffer
      // 🔧 ARCH fix (Round 10 XState M5): 旧代码只处理一个事件 (整个 buffer 当作一个 JSON)
      //    若 buffer 含多个 data: 行 (如 `data: {event1}\ndata: {event2}`), event2 被丢弃。
      //    根因修复: 按 \n 分割, 逐行处理。
      if (buffer.trim()) {
        const remainingLines = buffer.split('\n');
        for (const line of remainingLines) {
          if (!line.startsWith('data: ')) continue;
          const data = line.slice(6).trim();
          if (!data || data === '[DONE]') continue;
          try {
            const event = JSON.parse(data) as { type: string; data: unknown };
            const machineEvent = mapSSEEventToMachineEvent(event);
            if (machineEvent) sendBack(machineEvent);
          } catch {
            // 解析失败，跳过
          }
        }
      }
      // 🔧 2026-07-15 P0 fix (Gacha UI stuck v3, architecture-level):
      //   XState v5 fromCallback actor 完成时不会自动 transition。SSE 流自然结束 (reader.done=true)
      //   时必须显式 sendBack STREAM_DONE, 否则 machine 永远停留在 streaming 状态, isLoading=true,
      //   下次 CREATE_SESSION 无法正常处理 (Gacha UI 卡死).
      //   machine 接收 STREAM_DONE 后, 根据 hasStoryComplete guard 决定进 complete 或 idle.
      logger.info('[streamStoryService] SSE stream ended naturally, sending STREAM_DONE');
      sendBack({ type: 'STREAM_DONE' });
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        // 🔧 NEW-AU fix: 静默处理 AbortError (不再 logger.info, 减少控制台噪音)
        // 🔧 2026-07-15 P0 fix: AbortError 也要 sendBack STREAM_DONE, 否则 RESET 时 machine 仍卡在 streaming
        //   (虽然 RESET 本身 target idle 会 transition, 但 invoke actor 没 cleanup, 内存泄漏)
        //   实际 RESET 的 target idle 已经处理 transition, 这里 return 即可, 不需 STREAM_DONE
        return;
      }
      logger.error('[streamStoryService] stream error:', err);
      sendBack({ type: 'STREAM_ERROR', data: { message: err instanceof Error ? err.message : 'Stream error' } });
    }
  })();

  // 🔧 ARCH fix (Round 12 XSTATE-11 — 删除 receive 死代码):
  //    旧代码 receive((event) => { if (event.type === 'STREAM_ERROR' || event.type === 'RESET') abortController.abort(); })
  //    全代码库 grep 无 sendTo 调用 → receive 永远不会被触发。
  //    STREAM_ERROR 是 actor 自己 sendBack 的 (不会回到 receive),
  //    RESET 由 machine 转换状态触发 cleanup (下方 return) 完成 abort, receive 完全冗余。
  //    根因修复: 直接删除 receive 块。若未来需要中途取消流, 应在 machine 加 CANCEL_STREAM 事件 +
  //    spawnChild 时存 actor ref 到 context, 然后 sendTo(actorRef, { type: 'CANCEL_STREAM' })。

  // onCleanup: abort SSE（machine 离开 streaming 时调用）
  return () => {
    logger.info('[streamStoryService] cleanup called, aborting SSE');
    abortController.abort();
  };
});

/**
 * SSE event → machine event 映射
 * chapter_end 已在主逻辑特殊处理（带 illustrationUrl），此处不处理
 *
 * 🔧 ARCH fix (C5 — chapter_end dropped in leftover buffer):
 *    旧代码注释说"chapter_end 已在主逻辑特殊处理" — 但 leftover buffer 路径（流结束时
 *    未终止的 data: {...} 行）也走此函数。chapter_end 落入 default → 返回 null → 事件丢弃。
 *    结果: currentChapterInfo 不清, completedChapters 不更新, isLoading 卡住, player 卡死。
 *    根因修复: 添加 case 'chapter_end', illustrationUrl 留 undefined (assignChapterEnd 会
 *    fallback 到 currentChapterInfo.illustrationUrl)。
 */
// 🔧 ARCH fix (Round 64): mapSSEEventToMachineEvent 已提取到 sse-event-mapper.ts
import { mapSSEEventToMachineEvent } from './sse-event-mapper';

// ============================================================
// Spawn Actors（fire-and-forget，完成 send 事件更新 context）
// ============================================================

// ── preload actors 已提取到 preload-actors.ts (Round 64) ──
import { preloadNextChapterActor, preloadBranchActor } from './preload-actors';
export { preloadNextChapterActor, preloadBranchActor };

// ── Illustration actors 已提取到 illustration-actors.ts (Round 62) ──
// Re-export for backward compatibility (butterfly-machine.ts imports from here)
import { tryClientIllustrationActor, generateSceneIllustrationsActor, illustrationPollingActor } from './illustration-actors';
export { tryClientIllustrationActor, generateSceneIllustrationsActor, illustrationPollingActor };

// ============================================================
// MachineServices 类型 — 用于 butterfly-machine.ts 的 setup actors 字段
// ============================================================

export interface MachineServices {
  loadActiveService: typeof loadActiveService;
  generateOutlineService: typeof generateOutlineService;
  streamStoryService: typeof streamStoryService;
  // 🔧 ARCH fix (Round 12 XSTATE-15): continueService 已删除 (死代码)
  submitChoiceService: typeof submitChoiceService;
  regenerateService: typeof regenerateService;
  preloadNextChapterActor: typeof preloadNextChapterActor;
  preloadBranchActor: typeof preloadBranchActor;
  tryClientIllustrationActor: typeof tryClientIllustrationActor;
  generateSceneIllustrationsActor: typeof generateSceneIllustrationsActor;
  illustrationPollingActor: typeof illustrationPollingActor;
}

// 防止未使用警告
export type { ButterflyMachineContext, ButterflyMachineEvent };
