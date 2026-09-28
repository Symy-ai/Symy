/**
 * 🐘 batch57-c 问账短路块（b137 拆解第一刀，自 route.ts:667-710 纯机械搬移）
 *
 * 用户直接问账 ("这个月省了多少 / 上周守护了几次") → 不调 Letta (它看不到聚合数字,
 * 只能含糊或编造金额), 直接 canned 对账回复 + 问账卡 (数字全部来自既有聚合 lib,
 * 绝不经手 Letta)。
 * 放在购物类 detector 之后: 问账是提问不是购物意图, 互斥由 detector 内排除 +
 * 链序双保险。
 *
 * 返回 Response | null —— null = 未命中, route 继续下一块（链序不变）。
 */
import { NextResponse } from 'next/server';
import { logger } from '@/lib/logger';

interface SavingsQueryBlockInput {
  userContent: string;
  locale: 'zh' | 'en';
  stream?: boolean;
  userId?: string | null;
  supabase: unknown;
  mergeCookies: (res: NextResponse) => NextResponse;
  mergeCookiesOnResponse: (res: Response) => Response;
  SSE_HEADERS: Record<string, string>;
}

export async function trySavingsQueryBlock(input: SavingsQueryBlockInput): Promise<Response | null> {
  const { userContent, locale, stream = false, userId = null, supabase, mergeCookies, mergeCookiesOnResponse, SSE_HEADERS } = input;
  const { detectSavingsQuery } = await import('../savings-query-detector');
  if (!detectSavingsQuery(userContent)) return null;
  const { buildSavingsQueryTurn, buildSavingsQuerySseStream } = await import('../savings-query-turn');
  const { loadSavingsQueryEvents } = await import('../savings-query-context');
  const { getUserHourlyRate } = await import('@/lib/user-hourly-rate');
  const [events, hourlyRate] = await Promise.all([
    loadSavingsQueryEvents({
      userId: userId ?? undefined,
      // SupabaseClient 运行时满足最小结构面 (与 factsStore 同款边界收窄)
      store: (supabase ?? undefined) as unknown as import('../savings-query-context').SavingsQueryStore | undefined,
    }),
    userId ? getUserHourlyRate(userId).catch(() => 25) : Promise.resolve(25),
  ]);
  const savingsQueryTurn = buildSavingsQueryTurn({
    userContent,
    locale,
    events,
    now: new Date(),
    hourlyRate,
  });
  if (!savingsQueryTurn) return null;
  logger.info('[Chat API] Savings query detected, returning statement turn');
  if (stream) {
    return mergeCookiesOnResponse(
      new Response(buildSavingsQuerySseStream(savingsQueryTurn),
        { headers: { ...SSE_HEADERS } },
      ),
    );
  }
  return mergeCookies(
    NextResponse.json({
      reply: savingsQueryTurn.reply,
      reasoning: undefined,
      toolCalls: undefined,
      savingsQueryCard: savingsQueryTurn.savingsQueryCard,
    }),
  );
}
