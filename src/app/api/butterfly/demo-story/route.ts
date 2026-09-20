/**
 * POST /api/butterfly/demo-story — 演示模式的故事流式 API
 *
 * 不需要认证、不需要 Letta Agent、不需要 Supabase
 * 使用预置的故事内容 + 预置 CDN 插图 URL（绝不调 AI 生成图片）
 *
 * SSE 事件格式与 /api/butterfly/story 完全一致
 *
 * V13 fix: 支持从请求体获取所有数据，不再依赖内存 session store
 * V14 fix: 每次只流式输出一个章节，然后关闭SSE流
 *          用户需要手动点击"继续"才能请求下一章
 *          这样用户有时间阅读剧情文字和看图片
 */

import { generateDemoOutline, generateDemoChapterContent, generateDemoChoice, generateDemoSummary, getDemoChapterIllustrationUrl } from '@/features/butterfly/lib/demo-content';
import { getDemoSession } from '@/features/butterfly/lib/demo-session-store';
import { sanitizeDemoChoices, sanitizeDemoDescription } from '@/features/butterfly/lib/demo-story-guard';
import { logger } from '@/lib/logger';
import { sendSSEData, closeSSE, SSE_HEADERS } from '@/lib/sse';
import { NextRequest, NextResponse } from 'next/server';
import { checkRateLimit } from '@/lib/distributed-lock';
import { createHash } from 'crypto';
import { z } from 'zod';
import type {
  StoryEvent,
  StoryTone,
  DecisionType,
  OutlineData,
  ChapterStartData,
  ChapterEndData,
  ChoicePromptData,
  StoryCompleteData,
  IllustrationData,
} from '@/features/butterfly/types';

// 🔧 ARCH fix (Round 12 API-9): 加 maxDuration 防止 Vercel 60s 杀函数
//    旧代码: STREAM_TIMEOUT_MS=120s 但 Vercel hobby plan 60s 杀函数 → 用户看到 stream 中断
//    根因修复: maxDuration=60 (Vercel hobby max), STREAM_TIMEOUT_MS=55s (留 5s buffer)
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  // 🔧 架构优化 Round 69 (Finding 9): Demo route rate limiting — 防止 DoS
  // 🔒 wool v6 §十二.4 D7-①: 限流键禁止 'unknown' 共享桶（一个用户生成 → 全员 429）。
  //    分桶: 有 IP 按 IP; 无 IP 按 UA 哈希（不同浏览器天然分桶）; 两者皆无（零身份信号）
  //    放行 — demo 为纯静态预置内容零成本, 与 checkRateLimit env 缺失时 fail-open 同语义。
  const clientIp = req.headers.get('x-vercel-forwarded-for')?.split(',').pop()?.trim() ||
    req.headers.get('x-forwarded-for')?.split(',').pop()?.trim() || '';
  const userAgent = req.headers.get('user-agent')?.trim() || '';
  const rateLimitKey = clientIp
    ? `demo-story:ip:${clientIp}`
    : userAgent
      ? `demo-story:ua:${createHash('sha256').update(userAgent).digest('hex').slice(0, 32)}`
      : null;
  if (rateLimitKey) {
    const rateLimit = await checkRateLimit(rateLimitKey, 20, 60 * 60 * 1000); // 20/hour
    if (!rateLimit.allowed) {
      return NextResponse.json({ error: 'Rate limit exceeded. Try again later.' }, { status: 429 });
    }
  }

  // 🔧 ARCH fix (Round 6 AUDIT-3 P0 #1): 用 zod 替代手写 validation
  //    注意: demo-story 接受空 body (fallback {}), 不能用 validateBody (会拒 invalid JSON)
  // 🔧 2026-07-17 (task 1 fix): 加 'considering' 到 enum (与 session/route.ts 对齐)
  const demoStorySchema = z.object({
    sessionId: z.string().max(100).optional(),
    decisionType: z.enum(['bought', 'resisted', 'considering']).optional(),
    decisionDescription: z.string().max(1000).optional(),
    currentChapter: z.number().int().min(0).max(99).optional(),
    choices: z.record(z.string(), z.string().max(50)).optional(),
    locale: z.enum(['en', 'zh']).optional(),
  }).passthrough();
  let body;
  try {
    const raw = await req.json();
    body = demoStorySchema.parse(raw);
  } catch (err) {
    // 🔧 架构优化: 区分 JSON 解析错误 (可接受 fallback) 和 Schema 验证错误 (应 400)
    if (err instanceof SyntaxError) {
      // JSON 解析失败 — 接受空 body (demo-story 设计允许)
      body = {};
    } else if (err instanceof z.ZodError) {
      // Schema 验证失败 — 返回 400 (旧代码静默吞错, 客户端无信号)
      return NextResponse.json(
        { error: 'Validation failed', details: err.issues },
        { status: 400 }
      );
    } else {
      body = {};
    }
  }

  // V13: 优先从内存 store 获取，fallback 到请求体数据
  const sessionId = body.sessionId;
  const memSession = sessionId ? getDemoSession(sessionId) : null;

  const decisionType: DecisionType = memSession?.decisionType || body.decisionType || 'bought';
  // 🔒 wool v6 §十二.4 D7-③: decisionDescription 是唯一直接插值进大纲/章节文本的客户端字段,
  //    进模板前过既有 fencing sanitize
  const decisionDescription: string = sanitizeDemoDescription(
    memSession?.decisionDescription || body.decisionDescription || '',
  );
  const rawStartChapter: number = memSession?.currentChapter ?? body.currentChapter ?? 0;

  // 合并选择记录
  const rawChoices: Record<string, string> = {};
  if (memSession) {
    for (const choice of memSession.choices) {
      if (choice.selectedOption) {
        rawChoices[String(choice.chapterIndex)] = choice.selectedOption;
      }
    }
  }
  if (body.choices) {
    Object.assign(rawChoices, body.choices);
  }
  // 🔒 D7-③: session 与 body 两来源统一收口, 进章节内容模板前过既有 fencing sanitize
  const choices: Record<number, string> = sanitizeDemoChoices(rawChoices);

  if (!decisionDescription) {
    return new Response(
      JSON.stringify({ error: 'decisionDescription is required (pass in body or create session first)' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } },
    );
  }

  // 生成大纲 — locale 由请求体传入（缺省 en，保持旧调用兼容）
  const locale = body.locale || 'en';
  const outline = generateDemoOutline(decisionType, decisionDescription, locale);

  // 🔒 wool v6 §十二.4 D7-②: 不信任客户端跳章 — startChapter 钳进章节范围。
  //    旧代码 ≥ 最大章 index 的请求 find 不到下一章 → 跳过全部内容一键直达结局。
  //    demo-choice 的 chapterIndex 0..10 还可投毒 session 进度, 故对 session/body
  //    两来源统一钳到 [0, 最大章 index-1]: 越界请求落在最后一章实体内容。
  const maxChapterIndex = outline.chapters[outline.chapters.length - 1]?.index ?? 0;
  const startChapter: number = Math.max(0, Math.min(rawStartChapter, maxChapterIndex - 1));

  const STREAM_TIMEOUT_MS = 55_000; // 🔧 ARCH fix (Round 12 API-9): 120s → 55s, 与 Vercel maxDuration 60s 配合

  // 🔧 ARCH fix (Round 25 MEDIUM-3): clientDisconnected + timeout 在 start/cancel 间共享
  let clientDisconnected = false;
  let streamTimeout: ReturnType<typeof setTimeout> | null = null;

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: StoryEvent) => {
        try {
          sendSSEData(controller, event);
        } catch {
          // controller may be closed
        }
      };

      let timedOut = false;

      const timeout = setTimeout(() => {
        timedOut = true;
        try {
          sendSSEData(controller, {
            type: 'error',
            data: { message: 'Demo story generation timed out' },
          });
          closeSSE(controller);
        } catch { /* already closed */ }
      }, STREAM_TIMEOUT_MS);
      streamTimeout = timeout;

      try {
        // V14: 确定接下来要播放的章节（只取下一个章节）
        const nextChapterOutline = outline.chapters.find(ch => ch.index > startChapter);

        if (!nextChapterOutline) {
          // 所有章节已讲完，发送总结
          const summary = generateDemoSummary(decisionType, decisionDescription, locale);
          const finalTone: StoryTone = outline.chapters[outline.chapters.length - 1]?.tone || 'twist';

          send({
            type: 'story_complete',
            data: {
              finalTone,
              totalChapters: outline.chapters.length,
              butterflyEffect: summary,
            } satisfies StoryCompleteData,
          });

          clearTimeout(timeout);
          closeSSE(controller);
          return;
        }

        // 发送大纲（首次或更新后）
        if (startChapter === 0) {
          send({
            type: 'outline_generated',
            data: {
              version: outline.version,
              chapters: outline.chapters,
              endingHint: outline.endingHint,
            } satisfies OutlineData,
          });
        } else {
          // 选择后大纲可能有更新
          send({
            type: 'outline_updated',
            data: {
              version: outline.version + 1,
              chapters: outline.chapters,
              endingHint: outline.endingHint,
            } satisfies OutlineData,
          });
        }

        // ===== 只流式输出当前这一个章节 =====

        // 发送章节开始事件
        send({
          type: 'chapter_start',
          data: {
            chapterIndex: nextChapterOutline.index,
            title: nextChapterOutline.title,
            tone: nextChapterOutline.tone,
            timeSpan: nextChapterOutline.timeSpan,
          } satisfies ChapterStartData,
        });

        // Demo 模式：使用预置 CDN 图片 URL（绝不调 AI 生成）
        const illustrationUrl = getDemoChapterIllustrationUrl(nextChapterOutline.index);
        if (illustrationUrl) {
          send({
            type: 'illustration_generated',
            data: {
              chapterIndex: nextChapterOutline.index,
              illustrationUrl,
            } satisfies IllustrationData,
          });
          logger.info('[Butterfly Demo] Pre-set illustration sent for chapter', nextChapterOutline.index);
        }

        // 流式发送章节文本 — 按场景（|||分隔）逐场景发送
        const chapterContent = generateDemoChapterContent(
          nextChapterOutline.index,
          decisionType,
          decisionDescription,
          choices,
          locale,
        );

        // 按 ||| 分割场景，逐场景流式输出
        const scenes = chapterContent.split('|||').map(s => s.trim()).filter(s => s.length > 0);
        let accumulatedText = '';

        for (let sceneIdx = 0; sceneIdx < scenes.length; sceneIdx++) {
          if (timedOut || clientDisconnected) break;

          const sceneContent = scenes[sceneIdx];

          // 将场景文本分成小块，模拟流式打字机效果
          const words = sceneContent.split(/(\s+)/);
          const CHUNK_SIZE = 3;
          const CHUNK_DELAY = 35; // 35ms per chunk

          for (let i = 0; i < words.length; i += CHUNK_SIZE) {
            if (timedOut || clientDisconnected) break;

            const chunk = words.slice(i, i + CHUNK_SIZE).join('');
            accumulatedText += chunk;

            send({
              type: 'chapter_text',
              data: {
                chapterIndex: nextChapterOutline.index,
                text: chunk,
              },
            });

            if (i + CHUNK_SIZE < words.length) {
              await new Promise(resolve => setTimeout(resolve, CHUNK_DELAY));
            }
          }

          // 场景间停顿 1.5 秒，让用户有时间阅读文字和看图片
          if (sceneIdx < scenes.length - 1) {
            const separator = '|||';
            accumulatedText += separator;
            send({
              type: 'chapter_text',
              data: {
                chapterIndex: nextChapterOutline.index,
                text: separator,
              },
            });
            await new Promise(resolve => setTimeout(resolve, 1500));
          }
        }

        // 发送章节结束事件
        send({
          type: 'chapter_end',
          data: {
            chapterIndex: nextChapterOutline.index,
            hasChoice: nextChapterOutline.hasChoice,
            fullText: accumulatedText,
          } satisfies ChapterEndData,
        });

        // V14: 无论有没有选择，都关闭SSE流
        // 前端会根据 hasChoice 决定显示选择项还是"继续"按钮
        // 如果有选择，发送选择事件
        if (nextChapterOutline.hasChoice) {
          const choiceData = generateDemoChoice(
            nextChapterOutline.index,
            decisionType,
            decisionDescription,
            locale,
          );

          send({
            type: 'choice_prompt',
            data: {
              chapterIndex: nextChapterOutline.index,
              prompt: choiceData.prompt,
              options: choiceData.options,
            } satisfies ChoicePromptData,
          });
        }

        // V14: 关闭SSE流 — 前端会等待用户操作后才请求下一章
        clearTimeout(timeout);
        closeSSE(controller);
      } catch (err) {
        clearTimeout(timeout);
        logger.error('[Butterfly Demo] Story stream error:', err);
        send({
          type: 'error',
          data: { message: err instanceof Error ? err.message : 'Unknown error' },
        });
        closeSSE(controller);
      }
    },
    // 🔧 Round 25 MEDIUM-3: 客户端断开时设 flag, 让流式循环跳出
    cancel() {
      clientDisconnected = true;
      if (streamTimeout) clearTimeout(streamTimeout);
      logger.info('[Butterfly Demo] Client disconnected, stopping stream');
    },
  });

  return new Response(stream, {
    headers: { ...SSE_HEADERS },
  });
}
