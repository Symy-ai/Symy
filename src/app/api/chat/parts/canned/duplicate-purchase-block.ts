/**
 * 🐘 batch65-a 重复购买预检短路块（b137 拆解第七刀，自 route.ts 纯机械搬移）
 *
 * 明确问「还要不要再买 / 家里有没有」时, 先给决策卡再谈浏览比较;
 * 比通用买前求问更具体, 因此先判。
 *
 * 返回 Response | null —— null = 未命中, route 继续下一块（链序不变）。
 */
import { NextResponse } from 'next/server';
import { logger } from '@/lib/logger';

interface DuplicatePurchaseBlockInput {
  userContent: string;
  locale: 'zh' | 'en';
  stream?: boolean;
  mergeCookies: (res: NextResponse) => NextResponse;
  mergeCookiesOnResponse: (res: Response) => Response;
  SSE_HEADERS: Record<string, string>;
}

export async function tryDuplicatePurchaseBlock(input: DuplicatePurchaseBlockInput): Promise<Response | null> {
  const { userContent, locale, stream = false, mergeCookies, mergeCookiesOnResponse, SSE_HEADERS } = input;
  const { buildDuplicatePurchaseTurn, buildDuplicatePurchaseSseStream } = await import('../duplicate-purchase-turn');
  const duplicateTurn = buildDuplicatePurchaseTurn({ userContent, locale });
  if (!duplicateTurn) return null;
  logger.info('[Chat API] Duplicate-purchase precheck detected');
  if (stream) {
    return mergeCookiesOnResponse(
      new Response(buildDuplicatePurchaseSseStream(duplicateTurn), { headers: { ...SSE_HEADERS } }),
    );
  }
  return mergeCookies(
    NextResponse.json({
      reply: duplicateTurn.reply,
      reasoning: undefined,
      toolCalls: undefined,
      duplicatePrecheckCard: duplicateTurn.duplicatePrecheckCard,
    }),
  );
}
