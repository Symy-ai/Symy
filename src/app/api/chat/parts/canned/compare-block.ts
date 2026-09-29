/**
 * 🐘 batch56-a 对比裁决短路块（b137 拆解第十刀，自 route.ts 纯机械搬移）
 *
 * 用户二选一求问 ("买A还是B / A vs B") → 不调 Letta 泛泛安利, 直接 canned
 * 迎接回复 + 对比裁决卡 (三行裁决 + 选 A/B chips, 点选后才落 health_events)。
 * 放在求问/反驳/承诺之后: 四流意图互斥 (detector 内排除更强意图)。
 *
 * 返回 Response | null —— null = 未命中, route 继续下一块（链序不变）。
 */
import { NextResponse } from 'next/server';
import { logger } from '@/lib/logger';

interface CompareBlockInput {
  userContent: string;
  locale: 'zh' | 'en';
  stream?: boolean;
  mergeCookies: (res: NextResponse) => NextResponse;
  mergeCookiesOnResponse: (res: Response) => Response;
  SSE_HEADERS: Record<string, string>;
}

export async function tryCompareBlock(input: CompareBlockInput): Promise<Response | null> {
  const { userContent, locale, stream = false, mergeCookies, mergeCookiesOnResponse, SSE_HEADERS } = input;
  const { buildCompareTurn, buildCompareSseStream } = await import('../compare-turn');
  const compareTurn = buildCompareTurn({ userContent, locale });
  if (!compareTurn) return null;
  logger.info('[Chat API] Compare intent detected, returning compare turn');
  if (stream) {
    return mergeCookiesOnResponse(
      new Response(buildCompareSseStream(compareTurn),
        { headers: { ...SSE_HEADERS } },
      ),
    );
  }
  return mergeCookies(
    NextResponse.json({
      reply: compareTurn.reply,
      reasoning: undefined,
      toolCalls: undefined,
      compareCard: compareTurn.compareCard,
    }),
  );
}
