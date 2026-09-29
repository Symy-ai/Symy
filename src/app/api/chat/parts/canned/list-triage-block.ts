/**
 * 🐘 batch57-a 清单分诊短路块（b137 拆解第十一刀，自 route.ts 纯机械搬移）
 *
 * 购物清单批量消息 ("周末要买这些：A、B、C、D") → 不调 Letta 泛泛安利,
 * 直接 canned 迎接回复 + 清单分诊卡 (逐条三态 + 就买/看替代/再想想 chips,
 * 点选后才落 health_events)。放在反驳/求问/承诺/对比之后: 五流意图互斥
 * (detector 内排除更强意图)。
 *
 * 返回 Response | null —— null = 未命中, route 继续下一块（链序不变）。
 */
import { NextResponse } from 'next/server';
import { logger } from '@/lib/logger';

interface ListTriageBlockInput {
  userContent: string;
  locale: 'zh' | 'en';
  stream?: boolean;
  guardScope?: import('@/lib/guard-scope').GuardScope | null;
  mergeCookies: (res: NextResponse) => NextResponse;
  mergeCookiesOnResponse: (res: Response) => Response;
  SSE_HEADERS: Record<string, string>;
}

export async function tryListTriageBlock(input: ListTriageBlockInput): Promise<Response | null> {
  const { userContent, locale, stream = false, guardScope, mergeCookies, mergeCookiesOnResponse, SSE_HEADERS } = input;
  const { buildListTriageTurn, buildListTriageSseStream } = await import('../list-triage-turn');
  const { defaultGuardScope } = await import('@/lib/guard-scope');
  const listTriageTurn = buildListTriageTurn({ userContent, locale, guardScope: guardScope ?? defaultGuardScope() });
  if (!listTriageTurn) return null;
  logger.info('[Chat API] Shopping list detected, returning list triage turn');
  if (stream) {
    return mergeCookiesOnResponse(
      new Response(buildListTriageSseStream(listTriageTurn),
        { headers: { ...SSE_HEADERS } },
      ),
    );
  }
  return mergeCookies(
    NextResponse.json({
      reply: listTriageTurn.reply,
      reasoning: undefined,
      toolCalls: undefined,
      listTriageCard: listTriageTurn.listTriageCard,
    }),
  );
}
