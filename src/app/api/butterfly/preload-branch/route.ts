/**
 * POST /api/butterfly/preload-branch — Generate a chapter preview for a specific choice WITHOUT persisting
 *
 * V19: Branch pre-loading endpoint
 *
 * This endpoint generates a chapter preview for a specific choice option
 * WITHOUT saving anything to the database. It:
 * 1. Reads the session from DB (read-only)
 * 2. Applies the virtual choice to a copy of the session
 * 3. Regenerates the outline with the virtual choice
 * 4. Generates the next chapter content via SSE
 * 5. Returns the chapter data
 * 6. Does NOT save anything to the database
 *
 * This is used for pre-loading both branches when a choice prompt appears,
 * so that the user's chosen branch is available instantly.
 *
 * 🔧 2026-07-21: Migrated to withAuth HOF (was manual createAuthenticatedClient
 *    with mergeCookies/mergeCookiesOnResponse — now handled automatically by withAuth).
 *    withAuth supports both NextResponse and plain Response (for SSE streams).
 */

export const dynamic = 'force-dynamic';

import { withAuth } from '@/lib/with-auth';
import {
  streamChapterStory,
  generateChoiceOptions,
  regenerateOutline,
  isStoryEngineReady,
} from '@/features/butterfly/lib/story-engine';
import { generateIllustration } from '@/features/butterfly/lib/illustration-engine';
import { dbToSession } from '@/features/butterfly/lib/db-mappers';
import type { ButterflyChoice } from '@/features/butterfly/types';
import { logger } from '@/lib/logger';
import { sendSSEData, closeSSE, SSE_HEADERS } from '@/lib/sse';
import { NextResponse } from 'next/server';
import { validateBody, isValidationError } from '@/lib/api-validation';
import { z } from 'zod';
// eslint-disable-next-line no-duplicate-imports
import type {
  ButterflySession,
  StoryEvent,
  ChapterStartData,
} from '@/features/butterfly/types';

// 🔧 BUG-245 fix: 添加 SSE 流超时保护，与 story 路由一致
const STREAM_TIMEOUT_MS = 55_000; // 55s，留 5s buffer

// 🔧 PM-NEW-44 fix: maxDuration=120 — regenerateOutline + streamChapterStory 调 LLM,
//    需要 30-60s, 但 Vercel 默认 10s 超时 → preload 永远失败。
export const maxDuration = 120;

export const POST = withAuth(async ({ supabase, user, request }) => {
  // 🔧 2026-07-15 (ARCH-2 #7 修复): Rate limiting on butterfly/preload-branch (LLM cost)
  //    preload-branch 运行 2-3 个 LLM 流 (regenerateOutline + streamChapterStory + generateChoiceOptions)
  //    比 story 更贵, 限制更严: 10/hour
  const { checkRateLimit } = await import('@/lib/distributed-lock');
  const { allowed: rateLimitAllowed } = await checkRateLimit(`butterfly-preload:user:${user.id}`, 10, 60 * 60 * 1000);
  if (!rateLimitAllowed) {
    return NextResponse.json(
      { error: 'Rate limit exceeded. Maximum 10 branch previews per hour.' },
      { status: 429 }
    );
  }

  // 🔧 ARCH fix (Round 6 AUDIT-3 P0 #1): 用 zod 替代手写 validation (含 UUID + range)
  const preloadSchema = z.object({
    sessionId: z.string().uuid('Invalid sessionId format'),
    chapterIndex: z.number().int().min(1, 'chapterIndex must be a number between 1 and 100').max(100),
    selectedOption: z.string().min(1).max(10, 'Invalid selectedOption (max 10 characters)'),
    isLight: z.boolean().optional(),
  });
  const body = await validateBody(request, preloadSchema);
  if (isValidationError(body)) return body;

  if (!isStoryEngineReady()) {
    return NextResponse.json(
      { error: 'Story engine not available' },
      { status: 503 }
    );
  }

  // Read session (read-only, no updates)
  // 🔧 架构优化 (2026-06-30): .single() → .maybeSingle() + error 检查
  // .single() 在无结果时抛 PGRST116 error, .maybeSingle() 返回 null
  const { data: sessionRow, error: sessionError } = await supabase
    .from('butterfly_sessions')
    .select('*')
    .eq('id', body.sessionId)
    .eq('user_id', user.id)
    .maybeSingle();

  if (sessionError) {
    return NextResponse.json({ error: 'Failed to fetch session' }, { status: 500 });
  }

  if (!sessionRow) {
    return NextResponse.json({ error: 'Session not found' }, { status: 404 });
  }

  const session: ButterflySession = dbToSession(sessionRow);

  try {
    // Step 1: Create a virtual session with the selected choice applied
    const virtualSession: ButterflySession = {
      ...session,
      choices: session.choices.map((c: ButterflyChoice) =>
        c.chapterIndex === body.chapterIndex
          ? { ...c, selectedOption: body.selectedOption } as ButterflyChoice
          : c
      ),
    };

    // Step 2: Regenerate the outline with the virtual choice
    const newOutline = await regenerateOutline(
      virtualSession,
      body.selectedOption!,
      user.id,
    );

    // Step 3: Find the next chapter in the new outline
    const nextChapterIndex = session.currentChapter + 1;
    const nextChapter = newOutline.chapters.find(ch => ch.index === nextChapterIndex);

    if (!nextChapter) {
      return NextResponse.json({ error: 'No next chapter' }, { status: 404 });
    }

    // Step 4: Generate the chapter content via SSE stream
    const isLight = body.isLight === true; // BUG-318 fix: 严格验证 boolean

    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        const send = (event: StoryEvent) => {
          try {
            sendSSEData(controller, event);
          } catch {
            // controller may be closed
          }
        };

        // 🔧 BUG-245 fix: SSE 流超时保护
        let upstreamReader: ReadableStreamDefaultReader<Uint8Array> | null = null;
        let timedOut = false;
        const timeoutId = setTimeout(() => {
          timedOut = true;
          logger.warn('[Butterfly Preload] Stream timeout, closing + cancelling upstream reader');
          send({ type: 'error', data: { message: 'Stream timeout' } });
          if (upstreamReader) {
            try { upstreamReader.cancel().catch((e: unknown) => logger.warn('[Butterfly Preload] reader.cancel failed on timeout:', e instanceof Error ? e.message : String(e))); } catch { /* reader may be locked */ }
          }
          closeSSE(controller);
        }, STREAM_TIMEOUT_MS);

        // 🔧 2026-07-15 (ARCH-4 #13 修复): 客户端断开时取消上游 LLM 流
        const onClientAbort = () => {
          logger.info('[Butterfly Preload] Client disconnected, cancelling upstream LLM stream');
          clearTimeout(timeoutId);
          if (upstreamReader) {
            try { upstreamReader.cancel().catch(() => {}); } catch { /* reader may be locked */ }
          }
          closeSSE(controller);
        };
        request.signal.addEventListener('abort', onClientAbort);

        try {
          // Send updated outline
          send({
            type: 'outline_updated',
            data: {
              version: newOutline.version,
              chapters: newOutline.chapters,
              endingHint: newOutline.endingHint,
            },
          });

          // Send chapter start
          send({
            type: 'chapter_start',
            data: {
              chapterIndex: nextChapter.index,
              title: nextChapter.title,
              tone: nextChapter.tone,
              timeSpan: nextChapter.timeSpan,
            } satisfies ChapterStartData,
          });

          // Generate illustration (async, non-blocking)
          const illustrationPromise = generateIllustration({
            sessionId: session.id,
            chapterIndex: nextChapter.index,
            title: nextChapter.title,
            tone: nextChapter.tone,
            timeSpan: nextChapter.timeSpan,
            decisionDescription: session.decisionDescription,
            decisionType: session.decisionType,
            isLight,
          });

          illustrationPromise.then(url => {
            if (url) {
              try {
                sendSSEData(controller, {
                  type: 'illustration_generated',
                  data: { chapterIndex: nextChapter.index, illustrationUrl: url },
                });
              } catch { /* controller may be closed */ }
            }
          }).catch((e: unknown) => {
            // safe to ignore: non-critical background operation, error already logged
            logger.warn('[Butterfly Preload] Illustration generation failed (non-blocking):', e instanceof Error ? e.message : String(e));
          });

          // Stream chapter text
          const prevChapterContent = session.chapters.length > 0
            ? session.chapters[session.chapters.length - 1]?.content
            : undefined;

          const storyStream = await streamChapterStory(
            nextChapter,
            session.decisionType,
            session.decisionDescription,
            prevChapterContent,
            user.id,
          );

          let fullText = '';
          const reader = storyStream.getReader();
          upstreamReader = reader;
          const decoder = new TextDecoder();
          let lineBuffer = '';

          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            lineBuffer += decoder.decode(value, { stream: true });
            const lines = lineBuffer.split('\n');
            lineBuffer = lines.pop() || '';

            for (const line of lines) {
              if (!line.startsWith('data: ')) continue;
              const data = line.slice(6).trim();
              if (!data || data === '[DONE]') continue;

              try {
                const event = JSON.parse(data);
                if (event.type === 'chapter_text') {
                  send(event);
                  fullText += (event.data as { text: string }).text;
                } else if (event.type === 'chapter_end') {
                  const endData = event.data as { fullText?: string };
                  if (endData.fullText) fullText = endData.fullText;
                }
              } catch { /* skip */ }
            }
          }

          // Send chapter end
          if (timedOut) {
            clearTimeout(timeoutId);
            return;
          }
          send({
            type: 'chapter_end',
            data: {
              chapterIndex: nextChapter.index,
              hasChoice: nextChapter.hasChoice,
              fullText,
            },
          });

          // Generate choice if applicable
          if (nextChapter.hasChoice && !timedOut) {
            try {
              const choiceData = await generateChoiceOptions(
                nextChapter,
                fullText,
                session.decisionType,
                user.id,
              );
              if (timedOut) {
                clearTimeout(timeoutId);
                return;
              }
              send({
                type: 'choice_prompt',
                data: {
                  chapterIndex: nextChapter.index,
                  prompt: choiceData.prompt,
                  options: choiceData.options,
                },
              });
            } catch (err) {
              // safe to ignore: non-critical background operation, error already logged
              logger.warn('[Butterfly Preload] Choice generation failed — sending error (not injecting fake options):', err);
              send({
                type: 'error',
                data: {
                  chapterIndex: nextChapter.index,
                  message: 'Failed to generate choice options. Please retry.',
                  recoverable: true,
                },
              });
            }
          }

          closeSSE(controller);
          clearTimeout(timeoutId);
        } catch (err) {
          // safe to ignore: non-critical background operation, error already logged
          logger.warn('[Butterfly Preload] Branch preview failed:', err);
          send({
            type: 'error',
            data: { message: err instanceof Error ? err.message : 'Preview generation failed' },
          });
          closeSSE(controller);
          clearTimeout(timeoutId);
        } finally {
          // 🔧 2026-07-15 (ARCH-4 #13): 清理 abort 事件监听器防止泄漏
          request.signal.removeEventListener('abort', onClientAbort);
        }
      },
    });

    // SSE response — withAuth auto-merges cookies for both NextResponse and Response
    return new Response(stream, {
      headers: { ...SSE_HEADERS },
    });
  } catch (err) {
    // safe to ignore: returns 500 to client; error is logged for debugging
    logger.warn('[Butterfly Preload] Branch preview failed:', err);
    return NextResponse.json({ error: 'Preview generation failed' }, { status: 500 });
  }
});
