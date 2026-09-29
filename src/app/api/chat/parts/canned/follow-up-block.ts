/**
 * 🐘 batch59-c 追问跟随短路块（b137 拆解第十四刀，自 route.ts 纯机械搬移）
 *
 * 数据问答之后的短追问 ("那上个月呢" / "那外卖呢") → 用客户端上行的最近数据
 * 问答卡元数据 (内存级会话态) 重算, 数字全部复用 57-c/58-c 聚合。
 * 无上文 (dataQueryContext 缺失/形状不全) 回落普通检测链, 绝不拿空窗口算数。
 *
 * 返回 Response | null —— null = 未命中, route 继续下一块（链序不变）。
 */
import { NextResponse } from 'next/server';
import { logger } from '@/lib/logger';

interface FollowUpBlockInput {
  userContent: string;
  locale: 'zh' | 'en';
  stream?: boolean;
  userId?: string | null;
  supabase: unknown;
  dataQueryContext: unknown;
  mergeCookies: (res: NextResponse) => NextResponse;
  mergeCookiesOnResponse: (res: Response) => Response;
  SSE_HEADERS: Record<string, string>;
}

export async function tryFollowUpBlock(input: FollowUpBlockInput): Promise<Response | null> {
  const { userContent, locale, stream = false, userId = null, supabase, dataQueryContext, mergeCookies, mergeCookiesOnResponse, SSE_HEADERS } = input;
  const { detectFollowUpQuery, resolveFollowUpContext } = await import('../follow-up-query');
  const followUpIntent = detectFollowUpQuery(userContent);
  const resolved = followUpIntent ? resolveFollowUpContext((dataQueryContext as never) ?? null, followUpIntent) : null;
  if (!resolved) return null;
  const { buildFollowUpTurn, buildFollowUpSseStream } = await import('../follow-up-turn');
  const { loadSavingsQueryEvents } = await import('../savings-query-context');
  const { getUserHourlyRate } = await import('@/lib/user-hourly-rate');
  const [events, hourlyRate] = await Promise.all([
    loadSavingsQueryEvents({
      userId: userId ?? undefined,
      store: (supabase ?? undefined) as unknown as import('../savings-query-context').SavingsQueryStore | undefined,
    }),
    userId ? getUserHourlyRate(userId).catch(() => 25) : Promise.resolve(25),
  ]);
  const followUpTurn = buildFollowUpTurn({ resolved, locale, events, now: new Date(), hourlyRate });
  logger.info('[Chat API] Follow-up query detected, returning follow-up turn');
  if (stream) {
    return mergeCookiesOnResponse(
      new Response(buildFollowUpSseStream(followUpTurn),
        { headers: { ...SSE_HEADERS } },
      ),
    );
  }
  return mergeCookies(
    NextResponse.json({
      reply: followUpTurn.reply,
      reasoning: undefined,
      toolCalls: undefined,
      ...(followUpTurn.savingsQueryCard ? { savingsQueryCard: followUpTurn.savingsQueryCard } : {}),
      ...(followUpTurn.categoryQueryCard ? { categoryQueryCard: followUpTurn.categoryQueryCard } : {}),
      ...(followUpTurn.impulseTimeCard ? { impulseTimeCard: followUpTurn.impulseTimeCard } : {}),
    }),
  );
}
