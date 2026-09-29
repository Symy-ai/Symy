/**
 * 🔧 P0-1 反思问题短路块（b137 拆解第十二刀，自 route.ts 纯机械搬移）
 *
 * 用户点击反思引导组件的问题后, 消息发给 Letta AI, 但 AI 的 persona
 * (mirror, 不问探究性问题) 与反思问题冲突, 导致 AI 60s 无响应.
 * 修复: 检测到反思问题时, 直接返回 canned reply (引导用户自己回答).
 *
 * 返回 Response | null —— null = 未命中, route 继续下一块（链序不变）。
 */
import { NextResponse } from 'next/server';
import { logger } from '@/lib/logger';

interface ReflectionBlockInput {
  userContent: string;
  locale: 'zh' | 'en';
  stream?: boolean;
  mergeCookies: (res: NextResponse) => NextResponse;
  mergeCookiesOnResponse: (res: Response) => Response;
  SSE_HEADERS: Record<string, string>;
}

export async function tryReflectionBlock(input: ReflectionBlockInput): Promise<Response | null> {
  const { userContent, locale, stream = false, mergeCookies, mergeCookiesOnResponse, SSE_HEADERS } = input;
  const { isReflectionQuestion, getReflectionCannedReply } = await import('../reflection-detector');
  if (!isReflectionQuestion(userContent)) return null;
  const cannedReply = getReflectionCannedReply(locale);
  logger.info('[Chat API] Reflection question detected, returning canned reply');

  if (stream) {
    // 流式模式: 通过 SSE 返回 canned reply
    const encoder = new TextEncoder();
    const cannedStream = new ReadableStream<Uint8Array>({
      start(controller) {
        // 分块发送 (模拟 typing 效果)
        const chunks = cannedReply.match(/.{1,15}/g) || [cannedReply];
        chunks.forEach((chunk) => {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'token', content: chunk })}\n\n`));
        });
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'done' })}\n\n`));
        controller.close();
      },
    });
    return mergeCookiesOnResponse(
      new Response(cannedStream, {
        headers: { ...SSE_HEADERS },
      }),
    );
  }
  // 非流式模式
  return mergeCookies(
    NextResponse.json({
      reply: cannedReply,
      reasoning: undefined,
      toolCalls: undefined,
    }),
  );
}
