/**
 * 🐘 batch50-a 买前三问短路块（b137 拆解第八刀，自 route.ts 纯机械搬移）
 *
 * 用户主动求问 ("该买 X 吗") → 不调 Letta 泛泛建议, 直接 canned 迎接回复 +
 * 三问决策卡 (用户自己的问题, 守护开关不挡 — 与 48-b 反驳降温的被动拦截不同)。
 * 放在反驳降温之后: 两流意图互斥。
 *
 * 返回 Response | null —— null = 未命中, route 继续下一块（链序不变）。
 */
import { NextResponse } from 'next/server';
import { logger } from '@/lib/logger';

interface PrepurchaseBlockInput {
  userContent: string;
  locale: 'zh' | 'en';
  stream?: boolean;
  mergeCookies: (res: NextResponse) => NextResponse;
  mergeCookiesOnResponse: (res: Response) => Response;
  SSE_HEADERS: Record<string, string>;
}

export async function tryPrepurchaseBlock(input: PrepurchaseBlockInput): Promise<Response | null> {
  const { userContent, locale, stream = false, mergeCookies, mergeCookiesOnResponse, SSE_HEADERS } = input;
  const { buildPrepurchaseTurn, buildPrepurchaseSseStream } = await import('../prepurchase-turn');
  const prepurchaseTurn = buildPrepurchaseTurn({ userContent, locale });
  if (!prepurchaseTurn) return null;
  logger.info('[Chat API] Pre-purchase question detected, returning three-questions turn');
  if (stream) {
    return mergeCookiesOnResponse(
      new Response(buildPrepurchaseSseStream(prepurchaseTurn), {
        headers: { ...SSE_HEADERS },
      }),
    );
  }
  return mergeCookies(
    NextResponse.json({
      reply: prepurchaseTurn.reply,
      reasoning: undefined,
      toolCalls: undefined,
      prepurchaseCard: prepurchaseTurn.prepurchaseCard,
    }),
  );
}
