/**
 * 🐘 batch58-c 时段问句短路块（b137 拆解第二刀，自 route.ts 纯机械搬移）
 *
 * ("我晚上冲动买的多吗") — 复用 48-c aggregateImpulseWindows 的分桶统计
 * (次数/天数 only), canned 回复, 零金额零碳数值, 非羞辱框架 (看见规律不是认罪)。
 *
 * 返回 Response | null —— null = 未命中, route 继续下一块（链序不变）。
 */
import { NextResponse } from 'next/server';
import { logger } from '@/lib/logger';

interface ImpulseTimeBlockInput {
  userContent: string;
  locale: 'zh' | 'en';
  stream?: boolean;
  userId?: string | null;
  supabase: unknown;
  mergeCookies: (res: NextResponse) => NextResponse;
  mergeCookiesOnResponse: (res: Response) => Response;
  SSE_HEADERS: Record<string, string>;
}

export async function tryImpulseTimeQueryBlock(input: ImpulseTimeBlockInput): Promise<Response | null> {
  const { userContent, locale, stream = false, userId = null, supabase, mergeCookies, mergeCookiesOnResponse, SSE_HEADERS } = input;
  const { detectImpulseTimeQuery } = await import('../impulse-time-query-detector');
  if (!detectImpulseTimeQuery(userContent)) return null;
  const { buildImpulseTimeQueryTurn, buildImpulseTimeSseStream } = await import('../impulse-time-query-turn');
  const { loadSavingsQueryEvents } = await import('../savings-query-context');
  const events = await loadSavingsQueryEvents({
    userId: userId ?? undefined,
    store: (supabase ?? undefined) as unknown as import('../savings-query-context').SavingsQueryStore | undefined,
  });
  const turn = buildImpulseTimeQueryTurn({ userContent, locale, events, now: new Date() })!;
  logger.info('[Chat API] Impulse time query detected, returning impulse time turn');
  if (stream) {
    return mergeCookiesOnResponse(
      new Response(buildImpulseTimeSseStream(turn),
        { headers: { ...SSE_HEADERS } },
      ),
    );
  }
  return mergeCookies(
    NextResponse.json({
      reply: turn.reply,
      reasoning: undefined,
      toolCalls: undefined,
      impulseTimeCard: turn.impulseTimeCard,
    }),
  );
}
