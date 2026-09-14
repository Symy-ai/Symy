/**
 * Stream Chapter — Main streaming flow for butterfly story
 *
 * 提取自 src/app/api/butterfly/story/route.ts (Round 81 拆分)
 *
 * 这是故事流式生成的核心逻辑:
 * 1. 发送大纲信息 (首次或更新)
 * 2. 发送章节开始事件
 * 3. 异步生成初始插图 (不阻塞)
 * 4. 流式生成章节内容 (带 retry)
 * 5. 保存章节到数据库 (RPC append_chapter)
 * 6. 生成选择选项 (如果有)
 * 7. 插图持久化 + 场景级插图
 * 8. 发送章节结束事件
 * 9. 如果是最后一章, 完成 session (总结 + status 更新 + Agent 记忆清理)
 *
 * 超时保护: 110s 总超时, 每次 retry 重置 timeout
 * AI-RETRY: 如果 AI 返回空内容 (0 chunks), 最多重试 2 次
 */

import type {
  ButterflySession,
  StoryChapter,
  ButterflyChoice,
  ChoiceOption,
  StoryEvent,
  OutlineData,
  ChapterStartData,
  ChapterEndData,
  ChoicePromptData,
  StoryErrorData,
  IllustrationData,
  IllustrationFailedData,
  SceneIllustrationData,
  StoryTone,
} from '@/features/butterfly/types';
import {
  streamChapterStory,
  generateChoiceOptions,
} from '@/features/butterfly/lib/story-engine';
import {
  generateIllustration,
  persistIllustrationUrl,
  generateSceneIllustrations,
  regenerateWithContent,
} from '@/features/butterfly/lib/illustration-engine';
import { toJson } from '@/lib/json-helpers';
import { logger } from '@/lib/logger';
import { fireAndForgetSafely } from '@/lib/admin-audit';
import { sendSSEData, closeSSE } from '@/lib/sse';
import { featureFlags } from '@/lib/feature-flags';
import { completeStorySession } from './complete-story';
import { createHealthEvent } from '@/lib/health-impact';
// 🔧 ARCH fix (2026-07-22): Types and constants extracted to separate file
import { STREAM_TIMEOUT_MS, MAX_STORY_RETRIES, type StreamChapterParams } from './stream-chapter-types';
export type { StreamChapterParams } from './stream-chapter-types';
export { STREAM_TIMEOUT_MS, MAX_STORY_RETRIES } from './stream-chapter-types';


/**
 * 流式生成并发送一个章节。
 *
 * 这是 ReadableStream start() 方法的实现, 负责完整的章节生成流程。
 * 调用方负责创建 ReadableStream 并在 start() 中调用此函数。
 */
export async function streamStoryChapter(
  params: StreamChapterParams,
): Promise<void> {
  const {
    controller,
    supabase,
    user,
    session,
    sessionRowUpdatedAt,
    nextChapter,
    isLight,
    isFirstChapter,
    outline,
    decisionType,
    decisionDesc,
    signal,
  } = params;

  const send = (event: StoryEvent) => {
    sendSSEData(controller, event);
  };

  // 超时保护 — 同时取消 LLM 流
  let activeReader: ReadableStreamDefaultReader<Uint8Array> | null = null;
  let timedOut = false; // H1 fix: 防止 double-close 竞争
  let streamClosed = false; // V2 fix: 防止 controller.enqueue 在 controller.close() 之后
  // 🔧 ARCH fix (Round 2 H3): timeout 改为 let (retry 时重置)
  let timeout = setTimeout(() => {
    timedOut = true;
    streamClosed = true;
    activeReader?.cancel();
    try {
      sendSSEData(controller, {
        type: 'error',
        data: { message: 'Story generation timed out' } satisfies StoryErrorData,
      });
      controller.close();
    } catch { /* controller already closed */ }
  }, STREAM_TIMEOUT_MS);

  // 🔧 ARCH fix Round 73 (Finding 8.4): AbortController threading.
  // When the client disconnects, `signal` fires. We cancel the active Letta stream
  // reader, which cascades to the inner stream's cancel() → Letta HTTP abort →
  // stops GLM token generation (cost leak prevention).
  let clientAborted = false;
  if (signal) {
    if (signal.aborted) {
      clientAborted = true;
    } else {
      signal.addEventListener('abort', () => {
        clientAborted = true;
        timedOut = true; // treat like timeout — exit read loop
        streamClosed = true;
        activeReader?.cancel();
        try { controller.close(); } catch { /* already closed */ }
        logger.info('[Story API] Client disconnected, aborted upstream Letta stream');
      }, { once: true });
    }
  }

  try {
    // 1. 发送大纲信息
    if (isFirstChapter) {
      // 首次发送完整大纲
      send({
        type: 'outline_generated',
        data: {
          version: outline.version,
          chapters: outline.chapters,
          endingHint: outline.endingHint,
        } satisfies OutlineData,
      });
    } else if (outline.version > 1) {
      // C4 fix: 大纲被选择重新生成过，发送更新事件
      send({
        type: 'outline_updated',
        data: {
          version: outline.version,
          chapters: outline.chapters,
          endingHint: outline.endingHint,
        } satisfies OutlineData,
      });
    }

    // 2. 发送章节开始事件
    send({
      type: 'chapter_start',
      data: {
        chapterIndex: nextChapter.index,
        title: nextChapter.title,
        tone: nextChapter.tone,
        timeSpan: nextChapter.timeSpan,
      } satisfies ChapterStartData,
    });

    // 2.5 异步生成初始插图（不阻塞故事流）
    // 使用 generateIllustration（不自动持久化），持久化由路由统一管理
    // 注意：此时章节内容还未生成，插图基于标题生成
    // 如果初始生成失败，章节文本完成后会用内容重新生成（见步骤 6.5）

    // 🔧 ARCH fix (2026-07-21): Replaced `(false as boolean)` dead-code pattern with
    //    a proper feature flag. Set BUTTERFLY_ILLUSTRATION_ENABLED=true to re-enable.
    //    Old pattern was confusing (dead code), not configurable, and bypassed TS checks.
    const illustrationPromise = featureFlags.butterflyIllustrationEnabled ? generateIllustration({
      sessionId: session.id,
      chapterIndex: nextChapter.index,
      title: nextChapter.title,
      tone: nextChapter.tone,
      timeSpan: nextChapter.timeSpan,
      decisionDescription: decisionDesc,
      decisionType,
      isLight,
    }) : Promise.resolve(null as string | null);
    // 初始插图就绪后立即发送 SSE 事件
    // V2: 失败时发送 illustration_failed 事件，让前端触发客户端 fallback
    illustrationPromise.then((url) => {
      if (timedOut || streamClosed) return;

      try {
        if (url) {
          sendSSEData(controller, {
            type: 'illustration_generated',
            data: {
              chapterIndex: nextChapter.index,
              illustrationUrl: url,
            } satisfies IllustrationData,
          });
        } else {
          // 服务端插图生成失败 — 通知前端，让客户端尝试
          sendSSEData(controller, {
            type: 'illustration_failed',
            data: {
              chapterIndex: nextChapter.index,
              reason: 'api_error',
            } satisfies IllustrationFailedData,
          });
        }
      } catch {
        // controller may be closed
      }
    }).catch(() => {
      // 插图生成抛异常 — 通知前端
      if (!timedOut && !streamClosed) {
        try {
          sendSSEData(controller, {
            type: 'illustration_failed',
            data: {
              chapterIndex: nextChapter.index,
              reason: 'network',
            } satisfies IllustrationFailedData,
          });
        } catch {
          // controller may be closed
        }
      }
    });

    // 3. 获取前一个章节的内容（用于上下文衔接）
    const prevChapterContent = session.chapters.length > 0
      ? session.chapters[session.chapters.length - 1]?.content
      : undefined;

    // 4. 流式生成章节内容（通过 Letta Agent，自动记忆章节内容）
    // V38: 传入 session.context（用户真实数据）让故事更身临其境
    let _storyRetryCount = 0;
    let storyStream: ReadableStream<Uint8Array>;

    // 故事生成循环 (带 retry)
    story_generation: for (let attempt = 0; attempt <= MAX_STORY_RETRIES; attempt++) {
      // 🔧 ARCH fix (Round 2 H3 — retry doesn't reset timeout):
      //    旧代码 timeout 在循环外设置一次 (110s), 第一次 attempt 耗 100s 后 timeout 触发,
      //    retry 只有 10s → retry 永远不可能成功。
      //    根因修复: 每次 attempt 重置 timeout (fresh 110s)。
      //    注意: 保留外层 timeout 作为总兜底 (防 retry 累积超时)。
      clearTimeout(timeout);
      timeout = setTimeout(() => {
        timedOut = true;
        streamClosed = true;
        activeReader?.cancel();
        try {
          sendSSEData(controller, {
            type: 'error',
            data: { message: 'Story generation timed out' } satisfies StoryErrorData,
          });
          controller.close();
        } catch { /* controller already closed */ }
      }, STREAM_TIMEOUT_MS);

      storyStream = await streamChapterStory(
        nextChapter,
        decisionType,
        decisionDesc,
        prevChapterContent,
        user.id,
        session.context || undefined,
        params.locale,
      );

      let fullChapterText = '';
      const reader = storyStream.getReader();
      activeReader = reader; // C4 fix: 让超时能取消流
      const decoder = new TextDecoder();
      let lineBuffer = ''; // C1 fix: 行缓冲防止 SSE 事件跨 chunk 被截断
      let storyChunkCount = 0;

      // 🔧 2026-07-17 (bug1 fix): 分隔符缓冲区 — 防止 ===CHAPTER N=== 被拆分到多个 chunk
      //   旧代码: 对每个 chapter_text 事件单独 regex 替换, 但分隔符可能跨 chunk 拆分
      //   修复: 累积文本到 delimBuffer, 搜索完整分隔符后再发送安全部分
      let delimBuffer = '';
      const DELIM_PATTERN = /={3,}\s*(?:CHAPTER\s+\d+\s*:\s*.+?|BUTTERFLY\s+EFFECT)\s*={3,}/gi;
      const DELIM_SAFE_MARGIN = 50; // 保留最后 50 字符防止不完整分隔符

      // 辅助: 处理一段文本, 清理分隔符, 返回可安全发送的部分 + 保留在 buffer 的部分
      const processDelimBuffer = (isFinal: boolean): string => {
        if (isFinal) {
          // 最终 flush: 清除所有分隔符, 发送全部
          const cleaned = delimBuffer.replace(DELIM_PATTERN, '');
          delimBuffer = '';
          return cleaned;
        }
        // 非最终: 先尝试清除完整分隔符
        delimBuffer = delimBuffer.replace(DELIM_PATTERN, '');
        // 保留最后 DELIM_SAFE_MARGIN 字符 (可能是不完整分隔符前缀)
        if (delimBuffer.length <= DELIM_SAFE_MARGIN) {
          return ''; // 太短, 全部保留在 buffer
        }
        const safeText = delimBuffer.substring(0, delimBuffer.length - DELIM_SAFE_MARGIN);
        delimBuffer = delimBuffer.substring(delimBuffer.length - DELIM_SAFE_MARGIN);
        return safeText;
      };

      while (true) {
        if (timedOut) break; // H1 fix: 超时后优雅退出循环
        if (clientAborted) break; // 🔧 ARCH fix Round 73: client disconnected
        const { done, value } = await reader.read();
        if (done) {
          logger.info('[Story API] storyStream done. chunks:', storyChunkCount, 'fullText length:', fullChapterText.length);
          break;
        }
        storyChunkCount++;
        const storyChunk = decoder.decode(value, { stream: true });
        logger.info('[Story API] storyStream chunk', storyChunkCount, 'preview:', storyChunk.substring(0, 120));
        lineBuffer += storyChunk;

        // 按行分割，保留最后不完整的行
        const lines = lineBuffer.split('\n');
        lineBuffer = lines.pop() || '';

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const data = line.slice(6).trim();
          if (!data || data === '[DONE]') continue;

          try {
            const event = JSON.parse(data) as StoryEvent;

            if (event.type === 'chapter_text') {
              const textData = event.data as { text: string };
              // 🔧 2026-07-17 (bug1 fix): 用缓冲区方法清理分隔符
              //   累积文本到 delimBuffer, 只发送安全部分 (去掉完整分隔符 + 保留 50 字符防截断)
              delimBuffer += textData.text;
              const safeText = processDelimBuffer(false);
              if (safeText) {
                send({
                  type: 'chapter_text',
                  data: { ...textData, text: safeText },
                });
                fullChapterText += safeText;
              }
            } else if (event.type === 'chapter_end') {
              // 🔧 2026-07-17 (bug1 fix): 最终 flush 缓冲区, 清除所有分隔符
              const finalText = processDelimBuffer(true);
              if (finalText) {
                send({
                  type: 'chapter_text',
                  data: { chapterIndex: nextChapter.index, text: finalText },
                });
                fullChapterText += finalText;
              }
              // 内部流的章节结束 — 优先使用清理后的 fullText（可能移除了工具结果文本）
              const endData = event.data as { fullText?: string };
              if (endData.fullText) {
                // 🔧 2026-07-17 fix: 清理 chapter_end 的 fullText 也去掉分隔符
                fullChapterText = endData.fullText
                  .replace(DELIM_PATTERN, '')
                  .trim();
              }
            }
          } catch {
            // 解析失败，跳过
          }
        }
      }

      // 处理剩余缓冲
      if (!timedOut && lineBuffer.trim().startsWith('data: ')) {
        const data = lineBuffer.trim().slice(6).trim();
        if (data && data !== '[DONE]') {
          try {
            const event = JSON.parse(data) as StoryEvent;
            if (event.type === 'chapter_text') {
              const textData = event.data as { text: string };
              delimBuffer += textData.text;
              const safeText = processDelimBuffer(false);
              if (safeText) {
                send({ type: 'chapter_text', data: { ...textData, text: safeText } });
                fullChapterText += safeText;
              }
            }
          } catch {
            // 解析失败，跳过
          }
        }
      }

      // 🔧 2026-07-17 (bug1 fix): 流结束后, 最终 flush delimBuffer
      if (!timedOut && delimBuffer) {
        const finalText = processDelimBuffer(true);
        if (finalText) {
          send({ type: 'chapter_text', data: { chapterIndex: nextChapter.index, text: finalText } });
          fullChapterText += finalText;
        }
      }

      // 超时保护：如果超时了，controller 已被关闭，不要继续保存或发送
      if (timedOut) {
        clearTimeout(timeout);
        return; // controller 已被 timeout handler 关闭
      }
      // 🔧 ARCH fix Round 73: client disconnected — don't continue saving/illustrating
      if (clientAborted) {
        clearTimeout(timeout);
        return;
      }

      // 5. 保存章节到数据库
      const newChapter: StoryChapter = {
        index: nextChapter.index,
        title: nextChapter.title,
        content: fullChapterText,
        tone: nextChapter.tone,
        timeSpan: nextChapter.timeSpan,
        hasChoice: nextChapter.hasChoice,
        createdAt: new Date().toISOString(),
      };

      // 🔧 2026-07-17 (bug3 fix): 章节流式结束后重置 timeout, 给 choice 生成留足够时间
      //   旧代码: 110s timeout 在流式开始时设置, 如果章节生成耗 95s + choice 生成 20s = 115s > 110s
      //          → timeout 在 choice 生成期间触发 → choice_prompt 永远不发 → 用户卡在第二章
      //   修复: 章节流结束后, 清除旧 timeout, 设置新的 30s timeout (只给 choice 生成用)
      clearTimeout(timeout);
      timeout = setTimeout(() => {
        timedOut = true;
        streamClosed = true;
        try {
          sendSSEData(controller, {
            type: 'error',
            data: { message: 'Choice generation timed out' } satisfies StoryErrorData,
          });
          controller.close();
        } catch { /* controller already closed */ }
      }, 15_000); // 15s for choice generation (letta/auto 非 reasoning 模式更快)

      // H6 fix: 检查章节是否已存在，防止重复添加
      const alreadyExists = session.chapters.some(c => c.index === nextChapter.index);
      const updatedChapters = alreadyExists ? session.chapters : [...session.chapters, newChapter];
      const updatedCurrentChapter = nextChapter.index;

      // 6. 如果这个章节有选择，生成选择选项
      let newChoice: ButterflyChoice | null = null;
      if (nextChapter.hasChoice) {
        try {
          // 🔧 N69 fix: 给 choice 生成加 20s 超时（原来 45s 太长，用户等不到就卡死）
          // 超时后用默认选择 fallback，让故事能继续推进
          // 🔧 FIX: 清理未触发的 timeout timer, 防止泄漏
          let choiceTimer: ReturnType<typeof setTimeout> | null = null;
          const choiceData = await Promise.race([
            generateChoiceOptions(
              nextChapter,
              fullChapterText,
              decisionType,
              user.id,
              session.context || undefined,
            ).then(result => {
              if (choiceTimer) clearTimeout(choiceTimer);
              return result;
            }).catch(err => {
              if (choiceTimer) clearTimeout(choiceTimer);
              throw err;
            }),
            new Promise<{ prompt: string; options: ChoiceOption[] }>((_, reject) => {
              choiceTimer = setTimeout(() => reject(new Error('Choice generation timeout (10s)')), 10_000);
            }),
          ]);

          newChoice = {
            id: `choice-${nextChapter.index}-${Date.now()}`,
            chapterIndex: nextChapter.index,
            prompt: choiceData.prompt,
            options: choiceData.options,
            selectedOption: null,
            createdAt: new Date().toISOString(),
            outlineRegenerated: false,
          };
        } catch (err) {
          logger.warn('[Butterfly API] Choice generation failed:', err);
          // 降级：使用默认选择
          newChoice = {
            id: `choice-${nextChapter.index}-${Date.now()}`,
            chapterIndex: nextChapter.index,
            prompt: 'Which path do you take?',
            options: [
              { id: 'A', label: 'The familiar path', hint: 'Safety has its own cost.' },
              { id: 'B', label: 'The uncharted path', hint: 'The unknown holds both treasure and danger.' },
            ],
            selectedOption: null,
            createdAt: new Date().toISOString(),
            outlineRegenerated: false,
          };
        }
      }

      const updatedChoices = newChoice
        ? [...session.choices, newChoice]
        : session.choices;

      // 🔧 409 根因修复: 用 RPC append_chapter 原子追加章节, 消除 read-modify-write。
      //   新代码: RPC append_chapter 用 FOR UPDATE + || 原子追加, 天然不冲突
      // 🔧 ARCH fix (Round 48 REVIEW-A-1 — retry 路径传错章节根因修复):
      //    Round 47 用 find(ch => ch.index === targetChapterIndex) 查找, 但 alreadyExists=true 时
      //    updatedChapters 不含 newChapter → find 返回旧章节 → 传错。
      //    根因修复: 始终传 newChapter (RPC 内部用 FOR UPDATE + jsonb_set 处理已存在情况)。
      const newChapterForRpc = newChapter;
      // 🔧 P0 fix (2026-08-14): append_chapter RPC requires admin service (migration 075).
      const adminResult = await import('@/lib/supabase-admin').then(m => m.createAdminClient());
      const adminSupabase = adminResult.supabase;
      if (!adminSupabase) throw new Error('Admin client unavailable');
      const { data: rpcResult, error: rpcError } = await adminSupabase
        .rpc('append_chapter', {
          p_session_id: session.id,
          p_chapter: toJson(newChapterForRpc),
          p_current_chapter: updatedCurrentChapter,
          p_choices: updatedChoices.length > session.choices.length ? toJson(updatedChoices) : null,
        });

      if (rpcError || !rpcResult || (rpcResult as { success?: boolean }).success === false) {
        logger.error('[Butterfly API] RPC append_chapter failed:', rpcError?.message);
        send({
          type: 'error',
          data: { message: 'Failed to save chapter. Please refresh and try again.' } satisfies StoryErrorData,
        });
        clearTimeout(timeout);
        streamClosed = true;
        controller.close();
        return;
      }

      // 6.5 插图持久化 + 内容驱动重生成（仅当初始插图失败时）
      //
      // C1 fix: 将 persistIllustrationUrl 延迟到章节保存完成之后，
      // 避免乐观锁冲突导致章节内容丢失。
      //
      // 流程：
      // - 初始插图成功 → 持久化 URL（使用更新后的 updated_at），不重生成
      // - 初始插图失败 → 章节文本完成后用 LLM 提取场景重生成
      //
      // H5 fix: 提取共享的重生成逻辑，避免代码重复
      // 并确保所有异步 handler 都有 .catch() 防止 unhandled rejection
      const handleIllustrationResult = async (url: string | null) => {
        if (timedOut || streamClosed) return;

        if (url) {
          // 初始插图成功 — 持久化 URL 到数据库
          // C1 fix: 使用 updatedRow.updated_at（章节保存后的新时间戳），
          // 而非 sessionRow.updated_at（可能已被章节保存更新过）
          try {
            const persisted = await persistIllustrationUrl(session.id, nextChapter.index, url);
            // 🔧 ARCH fix (Round 11 M5): await 后再检查 streamClosed
            //    旧代码只在函数入口检查, await 期间流可能已关闭 → persist 写入已关闭的 session
            if (timedOut || streamClosed) return;
            if (persisted) {
              logger.info('[Butterfly Story] Illustration URL persisted for chapter', nextChapter.index);
            } else {
              logger.warn('[Butterfly Story] Failed to persist illustration URL for chapter', nextChapter.index, '- will retry on next session load');
            }
      // safe to ignore: non-critical background operation, error already logged
          } catch (err) {
                          // safe to ignore: non-critical background operation, error already logged
            logger.warn('[Butterfly Story] Failed to persist illustration URL:', err);
          }
        } else if (fullChapterText.length > 100 && featureFlags.butterflyIllustrationEnabled) {
          // 初始插图失败但有章节内容 — 用内容驱动重生成
          // 🔧 ARCH fix (2026-07-21): Replaced commented-out dead code with feature-flag-gated
          //    live code. Set BUTTERFLY_ILLUSTRATION_ENABLED=true to re-enable.
          logger.info('[Butterfly Story] Initial illustration failed, trying content-driven regeneration for chapter', nextChapter.index);
          try {
            const newUrl = await regenerateWithContent(
              session.id,
              nextChapter.index,
              nextChapter.title,
              nextChapter.tone,
              nextChapter.timeSpan,
              decisionDesc,
              decisionType,
              fullChapterText,
            );
            if (newUrl && !timedOut && !streamClosed) {
              sendSSEData(controller, {
                type: 'illustration_generated',
                data: {
                  chapterIndex: nextChapter.index,
                  illustrationUrl: newUrl,
                } satisfies IllustrationData,
              });
              logger.info('[Butterfly Story] Content-driven illustration generated for chapter', nextChapter.index);
            }
          } catch {
            // 优雅降级 — 重生成失败不影响故事
          }
        }
      };

      // C1 fix: 在章节保存成功之后再处理插图持久化/重生成
      // 这样 persistIllustrationUrl 读取的 updated_at 是章节保存后的最新值
      // 🔧 ARCH fix (Round 21 BUG-R21-H7 — illustrationPromise.then 持久化是 fire-and-forget):
      //    旧代码: illustrationPromise.then(handleIllustrationResult).catch(...)
      //    — 浮动 Promise, start() 不 await, Vercel 可能在 persist 完成前杀函数
      //    → 插图 URL 偶尔不持久化 → 用户刷新后插图消失 → 下次 GET 触发 backfill 重新生成 (烧 OpenAI 钱)
      //    根因修复: 用 waitUntil (Vercel) 延长函数生命周期; fallback 到 fire-and-forget。
      const illustrationPersistPromise = illustrationPromise.then(handleIllustrationResult).catch(() => handleIllustrationResult(null));
      // 🔧 ARCH fix (Round 5 AUDIT-1 M-2): 用共享 fireAndForgetSafely 替代重复的 waitUntil 模式
      fireAndForgetSafely(illustrationPersistPromise);

      // V21: 场景级插图生成 — 章节文本完成后，为每个场景生成独立插图
      // 使用 ||| 分割章节文本为场景，每个场景独立生成 AI 插图
      // 不阻塞主流程（异步），通过 SSE 事件通知前端每个场景的插图
      if (fullChapterText.length > 50) {
        const sceneTexts = fullChapterText.split('|||').map(s => s.trim()).filter(s => s.length > 0);

        if (sceneTexts.length > 1) {
          // 多场景 — 异步生成每个场景的独立插图
          // 🔧 ARCH fix (Round 21 BUG-R21-H8 — generateSceneIllustrations fire-and-forget):
          //    旧代码不 await 也不用 waitUntil → Vercel 杀函数后部分 scene URL 不持久化
          //    → 下次 GET 看到 sceneIllustrations 不完整 → 可能触发 backfill。
          //    根因修复: 用 waitUntil (Vercel) 延长函数生命周期。

          // 🔧 ARCH fix (2026-07-21): Replaced `(false as boolean)` dead-code pattern with
          //    feature flag. Set BUTTERFLY_ILLUSTRATION_ENABLED=true to re-enable.
          const sceneIllustrationPromise = featureFlags.butterflyIllustrationEnabled ? generateSceneIllustrations({
            sessionId: session.id,
            chapterIndex: nextChapter.index,
            chapterTitle: nextChapter.title,
            tone: nextChapter.tone,
            decisionDescription: decisionDesc,
            decisionType,
            isLight,
            sceneTexts,
            onSceneGenerated: (sceneIdx, imageUrl) => {
              if (timedOut || streamClosed) return;
              try {
                sendSSEData(controller, {
                  type: 'scene_illustration_generated',
                  data: {
                    chapterIndex: nextChapter.index,
                    sceneIndex: sceneIdx,
                    illustrationUrl: imageUrl,
                  } satisfies SceneIllustrationData,
                });
              } catch {
                // controller may be closed
              }
            },
          }).catch(err => {
            logger.warn('[Butterfly Story] Scene illustration generation failed:', err instanceof Error ? err.message : err);
          }) : Promise.resolve();
          // 🔧 ARCH fix (Round 5 AUDIT-1 M-2): 用共享 fireAndForgetSafely 替代重复的 waitUntil 模式
          fireAndForgetSafely(sceneIllustrationPromise);
        }
      }

      // 7. 发送章节结束事件（包含清理后的 fullText）
      // N53 fix: 如果 fullChapterText 为空（GLM-5.2 限流/超时/空响应），重试或发 error
      // 🔧 FIX: 只在 "完全没收到任何 chunk" 时才重试
      //   如果已经发送过 chapter_text 事件 (storyChunkCount > 0), 说明流有内容但不完整
      //   → 不重试 (否则客户端会看到部分文本后又从头开始, 造成文本混乱)
      if (!fullChapterText.trim() && storyChunkCount === 0) {
        // 🔧 AI-RETRY fix: 如果还有重试次数, 重新生成
        if (attempt < MAX_STORY_RETRIES) {
          _storyRetryCount++;
          logger.warn(`[Butterfly Story] AI returned empty response (0 chunks), retrying (${attempt + 1}/${MAX_STORY_RETRIES})`);
          // 🔧 ARCH fix (Round 3 SSE C6): 用 reader.cancel() 替代 releaseLock()。
          //    releaseLock() 只释放锁, 不取消上游流 → 孤儿 storyStream 继续生成 GLM token (成本泄漏)。
          //    reader.cancel() 既释放锁又取消流, 传播到 streamToAgent 的 cancel() (SSE C1 fix) 中止 Letta HTTP。
          try { await reader.cancel(); } catch { /* silent: already cancelled */ }
          activeReader = null;
          continue story_generation; // 重试
        }
        // 重试耗尽, 发 error
        send({
          type: 'error',
          data: {
            message: 'Story generation failed — AI model returned empty response after retries. Please try again.',
          } satisfies StoryErrorData,
        });
        try { controller.close(); streamClosed = true; } catch { /* already closed */ }
        clearTimeout(timeout);
        return;
      }

      send({
        type: 'chapter_end',
        data: {
          chapterIndex: nextChapter.index,
          hasChoice: nextChapter.hasChoice,
          fullText: fullChapterText,
        } satisfies ChapterEndData,
      });

      // 🔧 P1-4 fix: 即时奖励 — 每章看完给 token 奖励（fire-and-forget）
      //  章 1: +5 tokens, 章 2: +10 tokens, 章 3: +15 tokens (在 completeStorySession 中给)
      if (nextChapter.index < outline.chapters.length) {
        const chapterReward = nextChapter.index === 1 ? 5 : 10;
        fireAndForgetSafely(
          createHealthEvent({
            userId: user.id,
            eventType: 'butterfly_chapter_viewed',
            description: `Chapter ${nextChapter.index} viewed. +${chapterReward} tokens.`,
            tokenOverride: chapterReward,
            metadata: { sessionId: session.id, chapterIndex: nextChapter.index },
            triggerSource: 'butterfly_story',
            triggerId: `bf-ch${nextChapter.index}:${session.id}`,
          }).then(() => {
            logger.info(`[Butterfly Story] Chapter ${nextChapter.index} reward: +${chapterReward} tokens`, { sessionId: session.id, userId: user.id });
          }).catch((err) => {
            logger.warn(`[Butterfly Story] Chapter ${nextChapter.index} reward failed (non-blocking):`, err);
          }),
        );
      }

      // 8. 如果有选择，发送选择事件
      if (newChoice) {
        send({
          type: 'choice_prompt',
          data: {
            chapterIndex: nextChapter.index,
            prompt: newChoice.prompt,
            options: newChoice.options,
          } satisfies ChoicePromptData,
        });
      }

      // 9. 检查是否是最后一章
      const isLastChapter = nextChapter.index >= outline.chapters.length;
      if (isLastChapter) {
        // 🔧 ARCH fix (Round 79): 用共享 completeStorySession helper (与早返回路径共用)
        //    消除重复: 总结生成 + status 更新 + Agent 记忆清理
        const summarySession: ButterflySession = {
          ...session,
          chapters: updatedChapters,
          choices: updatedChoices,
          currentChapter: updatedCurrentChapter,
        };
        const { storyCompleteData } = await completeStorySession({
          supabase,
          user,
          session,
          sessionRowUpdatedAt,
          finalTone: nextChapter.tone as StoryTone,
          sessionForSummary: summarySession,
          choicesForAgentClear: updatedChoices,
        });

        send({
          type: 'story_complete',
          data: storyCompleteData,
        });
      }

      clearTimeout(timeout);
      streamClosed = true;
      closeSSE(controller);
      break story_generation; // 🔧 AI-RETRY: 成功完成, 跳出重试循环
      } // end story_generation for loop
  } catch (err) {
    clearTimeout(timeout);
    logger.error('[Butterfly API] Story stream error:', err);
    // 🔧 ARCH fix (Round 31 AUDIT-6 MEDIUM-2): send() may throw if controller was closed by timeout
    //    旧代码: send() in catch block without try-catch → unhandled rejection
    //    根因修复: wrap send() in try-catch, ignore if controller already closed
    try {
      if (!streamClosed) {
        send({
          type: 'error',
          data: {
            message: err instanceof Error ? err.message : 'Unknown error',
          } satisfies StoryErrorData,
        });
      }
    } catch {
      // controller already closed by timeout — can't send error event
    }
    streamClosed = true;
    closeSSE(controller);
  }
}
