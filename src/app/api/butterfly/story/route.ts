/**
 * POST /api/butterfly/story — 生成/继续剧情（SSE 流式）
 *
 * 工作流程：
 * 1. 获取会话和大纲
 * 2. 确定下一个要讲述的章节
 * 3. 流式生成章节内容
 * 4. 章节结束后，如果有选择，生成选择选项
 * 5. 所有章节讲完，发送 story_complete
 *
 * 🔧 2026-07-21: Migrated to withAuth HOF (was manual createAuthenticatedClient
 *    with mergeCookies/mergeCookiesOnResponse — now handled automatically by withAuth).
 *    withAuth supports both NextResponse and plain Response (for SSE streams).
 */

export const dynamic = 'force-dynamic';

import { withAuth } from '@/lib/with-auth';
import { handleStoryCompleteEarlyReturn } from './parts/early-return';
import { streamStoryChapter } from './parts/stream-chapter';
import { streamAllStory, getPreloadedChapter3 } from './parts/stream-all-story';
import { isStoryEngineReady } from '@/features/butterfly/lib/story-engine';
import { resolveStoryLocale } from '@/features/butterfly/lib/story-locale';
import { CHOICE_CHAPTER_INDICES } from '@/features/butterfly/lib/engine';
import { dbToSession } from '@/features/butterfly/lib/db-mappers';
import { logger } from '@/lib/logger';
import { SSE_HEADERS } from '@/lib/sse';
import { NextResponse } from 'next/server';
import type { ButterflySession } from '@/features/butterfly/types';
import { validateBody, isValidationError } from '@/lib/api-validation';
import { z } from 'zod';

// 🔧 2026-07-20 (P0 fix): letta/auto 非 reasoning 模式更快, 60s 足够
export const maxDuration = 60;

export const POST = withAuth(async ({ supabase, user, request }) => {
  // 🔧 2026-07-15 (ARCH-2 #6 修复): Rate limiting on butterfly/story SSE (LLM cost)
  const { checkRateLimit } = await import('@/lib/distributed-lock');
  const { allowed: rateLimitAllowed } = await checkRateLimit(`butterfly-story:user:${user.id}`, 20, 60 * 60 * 1000);
  if (!rateLimitAllowed) {
    return NextResponse.json(
      { error: 'Rate limit exceeded. Maximum 20 story chapters per hour. Please try again later.' },
      { status: 429 },
    );
  }

  // 解析请求 + 验证
  const storySchema = z.object({
    sessionId: z.string().uuid('Invalid sessionId format'),
    isLight: z.boolean().optional(),
    locale: z.enum(['en', 'zh']).optional(),
  });
  const body = await validateBody(request, storySchema);
  if (isValidationError(body)) return body;

  const isLight = body.isLight === true;

  // 获取会话
  const _sessionRes = await supabase
    .from('butterfly_sessions')
    .select('*')
    .eq('id', body.sessionId)
    .eq('user_id', user.id)
    .maybeSingle();
  let sessionRow = _sessionRes.data;
  const dbError = _sessionRes.error;

  if (dbError || !sessionRow) {
    return NextResponse.json({ error: 'Session not found' }, { status: 404 });
  }

  let session: ButterflySession = dbToSession(sessionRow);

  // 🔧 2026-07-17: 查询用户 locale 用于生成对应语言的章节内容
  // 🔧 2026-09-14 (batch73-c): 请求体 UI locale 优先（profiles.locale 只在手动切语言时写入，
  //    浏览器检测的 zh 用户该列常为 NULL → 故事恒英文），profile.locale 降级兜底。
  const { data: profileRow } = await supabase
    .from('profiles')
    .select('locale')
    .eq('id', user.id)
    .maybeSingle();
  const userLocale = resolveStoryLocale(body.locale, profileRow?.locale);

  // 🔧 2026-07-15 (ARCH-3 #4 修复): Idempotency lock — 防止并发同 session 请求 2× LLM cost
  const { acquireLock, releaseLock } = await import('@/lib/distributed-lock');
  const storyLockKey = `butterfly-story:${body.sessionId}`;
  const lockAcquired = await acquireLock(storyLockKey, 120_000, true);
  if (!lockAcquired) {
    return NextResponse.json(
      { error: 'Story generation already in progress for this session. Please wait.' },
      { status: 409 },
    );
  }

  if (!session.outline) {
    await releaseLock(storyLockKey).catch(() => {});
    return NextResponse.json({ error: 'Session outline not ready yet' }, { status: 409 });
  }

  if (session.status !== 'active') {
    await releaseLock(storyLockKey).catch(() => {});
    return NextResponse.json({ error: 'Session is not active yet' }, { status: 409 });
  }

  if (!isStoryEngineReady()) {
    await releaseLock(storyLockKey).catch(() => {});
    return NextResponse.json(
      { error: 'Story engine is not available. Please try again later.' },
      { status: 503 },
    );
  }

  // C3 fix: 重新读取 updated_at，如果变化说明有并发修改
  const { data: freshRow } = await supabase
    .from('butterfly_sessions')
    .select('*')
    .eq('id', session.id)
    .eq('user_id', user.id)
    .maybeSingle();

  if (freshRow && freshRow.updated_at !== sessionRow.updated_at) {
    logger.info('[Butterfly API] Session updated since client read (updated_at changed), using latest version:', session.id);
    sessionRow = freshRow;
    session = dbToSession(sessionRow);
    if (session.status !== 'active') {
      await releaseLock(storyLockKey).catch(() => {});
      return NextResponse.json({ error: 'Session is not active' }, { status: 400 });
    }
    if (!session.outline) {
      await releaseLock(storyLockKey).catch(() => {});
      return NextResponse.json({ error: 'Session has no outline' }, { status: 400 });
    }
  }

  // 确定下一个要讲述的章节
  const nextChapterIndex = session.currentChapter + 1;
  const nextChapter = session.outline.chapters.find(
    (ch) => ch.index === nextChapterIndex,
  );

  // 🔧 2026-07-18: 检查是否有预加载的 CH3
  if (nextChapterIndex === 3 && session.currentChapter === 2) {
    const choice2 = session.choices.find(c => c.chapterIndex === 2 && c.selectedOption);

    if (choice2) {
      const preloaded = getPreloadedChapter3(session, choice2.selectedOption!);
      if (preloaded) {
        logger.info('[Butterfly Story] Using preloaded CH3 from session.context, option:', choice2.selectedOption);

        const stream = new ReadableStream<Uint8Array>({
          async start(controller) {
            try {
              const { sendSSEData } = await import('@/lib/sse');
              const { toJson } = await import('@/lib/json-helpers');
              const { completeStorySession } = await import('./parts/complete-story');

              sendSSEData(controller, {
                type: 'chapter_start',
                data: { chapterIndex: 3, title: preloaded.title, tone: 'twist', timeSpan: 'two days later' },
              });

              const chunks: string[] = [];
              for (let i = 0; i < preloaded.content.length; i += 50) {
                chunks.push(preloaded.content.substring(i, i + 50));
              }
              for (const chunk of chunks) {
                sendSSEData(controller, { type: 'chapter_text', data: { chapterIndex: 3, text: chunk } });
              }

              const ch3 = {
                index: 3, title: preloaded.title, content: preloaded.content,
                tone: 'twist' as const, timeSpan: 'two days later', hasChoice: false,
                createdAt: new Date().toISOString(),
              };
              // 🔧 P0 fix (2026-08-14): append_chapter RPC requires admin service (migration 075).
              const adminResult = await import('@/lib/supabase-admin').then(m => m.createAdminClient());
              const adminSupabase = adminResult.supabase;
              if (!adminSupabase) throw new Error('Admin client unavailable');
              const { error: appendErr } = await adminSupabase.rpc('append_chapter', {
                p_session_id: session.id,
                p_chapter: toJson(ch3),
                p_current_chapter: 3,
                p_choices: null,
              });
              // 🔧 ARCH fix (2026-07-22 P2 — unchecked RPC error):
              //    旧代码: 不检查 append_chapter 错误 → 章节未持久化但用户看到 "complete"
              //    修复: 检查错误, 如果失败, 发送 SSE error event
              if (appendErr) {
                logger.error('[Butterfly Story] append_chapter RPC failed for preloaded CH3:', appendErr.message);
                try {
                  const { sendSSEData } = await import('@/lib/sse');
                  sendSSEData(controller, { type: 'error', data: { message: 'Failed to save chapter 3' } });
                } catch { /* controller closed */ }
                return;
              }

              sendSSEData(controller, {
                type: 'chapter_end',
                data: { chapterIndex: 3, hasChoice: false, fullText: preloaded.content },
              });

              const summarySession = { ...session, chapters: [...session.chapters, ch3], currentChapter: 3 };
              const { storyCompleteData } = await completeStorySession({
                supabase, user, session, sessionRowUpdatedAt: sessionRow.updated_at,
                finalTone: 'twist',
                sessionForSummary: summarySession,
                choicesForAgentClear: session.choices,
              });

              sendSSEData(controller, { type: 'story_complete', data: storyCompleteData });
            } catch (err) {
              logger.error('[Butterfly Story] Preloaded CH3 stream error:', err);
              try {
                const { sendSSEData } = await import('@/lib/sse');
                sendSSEData(controller, { type: 'error', data: { message: 'Failed to send chapter 3' } });
              } catch { /* controller closed */ }
            } finally {
              await releaseLock(storyLockKey).catch(() => {});
              try { controller.close(); } catch { /* already closed */ }
            }
          },
        });

        return new Response(stream, { headers: { ...SSE_HEADERS } });
      }
    }
  }

  // 🔧 N28 fix: 强制确保 choice 章节的 hasChoice=true
  if (nextChapter && CHOICE_CHAPTER_INDICES.includes(nextChapter.index) && !nextChapter.hasChoice) {
    logger.warn('[Butterfly Story] Forcing hasChoice=true for chapter', nextChapter.index, '(was false in DB)');
    nextChapter.hasChoice = true;
  }

  if (!nextChapter) {
    const { response: earlyReturnResponse } = await handleStoryCompleteEarlyReturn({
      supabase,
      user,
      session,
      sessionRowUpdatedAt: sessionRow.updated_at,
    });
    return earlyReturnResponse;
  }

  // 检查该章节是否需要先等待选择
  const prevChapter = session.chapters.find(
    (ch) => ch.index === nextChapterIndex - 1,
  );
  if (prevChapter?.hasChoice) {
    const choiceForPrev = session.choices.find(
      (c) => c.chapterIndex === prevChapter.index,
    );
    if (choiceForPrev && !choiceForPrev.selectedOption) {
      const { data: retryRow } = await supabase
        .from('butterfly_sessions')
        .select('choices')
        .eq('id', session.id)
        .eq('user_id', user.id)
        .maybeSingle();
      if (retryRow) {
        const retryChoices = retryRow.choices as unknown;
        const retryChoice = Array.isArray(retryChoices)
          ? (retryChoices as Array<{ chapterIndex: number; selectedOption?: string }>).find(
              (c) => c.chapterIndex === prevChapter.index,
            )
          : undefined;
        if (retryChoice?.selectedOption) {
          logger.info('[Butterfly Story] Choice was submitted (retry read found selectedOption), proceeding with story generation');
          session.choices = Array.isArray(retryChoices)
            ? (retryChoices as ButterflySession['choices'])
            : session.choices;
        } else {
          logger.warn('[Butterfly Story] Choice not yet submitted, proceeding with default outline path');
        }
      }
    }
  }

  // ====== 开始流式讲述 ======

  const outline = session.outline;
  const decisionType = session.decisionType;
  const decisionDesc = session.decisionDescription;
  const isFirstChapter = session.currentChapter === 0;

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        if (isFirstChapter) {
          await streamAllStory({
            controller,
            supabase,
            user,
            session,
            signal: request.signal,
            locale: userLocale,
          });
        } else {
          await streamStoryChapter({
            controller,
            supabase,
            user,
            session,
            sessionRowUpdatedAt: sessionRow.updated_at,
            nextChapter: nextChapter!,
            isLight,
            isFirstChapter,
            outline: {
              version: outline.version,
              chapters: outline.chapters,
              endingHint: outline.endingHint,
            },
            decisionType,
            decisionDesc,
            signal: request.signal,
            locale: userLocale,
          });
        }
      } finally {
        await releaseLock(storyLockKey).catch(() => {});
      }
    },
  });

  return new Response(stream, {
    headers: { ...SSE_HEADERS },
  });
});
