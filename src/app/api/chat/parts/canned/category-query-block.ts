/**
 * 🐘 batch58-c 分类问句短路块（b137 拆解第三刀，自 route.ts 纯机械搬移）
 *
 * ("这个月奶茶拦截了几次") — 57-c 问账的维度细化: 品类词归一到五类之一才命中,
 * 否则回落下方 57-c 月度总答。canned 分类对账卡 (拦截/替代/复用计数,
 * resolveGuardCategory 同口径), 零金额。
 *
 * 返回 Response | null —— null = 未命中, route 继续下一块（链序不变）。
 */
import { NextResponse } from 'next/server';
import { logger } from '@/lib/logger';

interface CategoryQueryBlockInput {
  userContent: string;
  locale: 'zh' | 'en';
  stream?: boolean;
  userId?: string | null;
  supabase: unknown;
  mergeCookies: (res: NextResponse) => NextResponse;
  mergeCookiesOnResponse: (res: Response) => Response;
  SSE_HEADERS: Record<string, string>;
}

export async function tryCategoryQueryBlock(input: CategoryQueryBlockInput): Promise<Response | null> {
  const { userContent, locale, stream = false, userId = null, supabase, mergeCookies, mergeCookiesOnResponse, SSE_HEADERS } = input;
  const { detectCategoryQuery } = await import('../category-query-detector');
  if (!detectCategoryQuery(userContent)) return null;
  const { buildCategoryQueryTurn, buildCategoryQuerySseStream } = await import('../category-query-turn');
  const { loadSavingsQueryEvents } = await import('../savings-query-context');
  const events = await loadSavingsQueryEvents({
    userId: userId ?? undefined,
    // SupabaseClient 运行时满足最小结构面 (与 factsStore 同款边界收窄)
    store: (supabase ?? undefined) as unknown as import('../savings-query-context').SavingsQueryStore | undefined,
  });
  const turn = buildCategoryQueryTurn({ userContent, locale, events, now: new Date() })!;
  logger.info('[Chat API] Category query detected, returning category turn');
  if (stream) {
    return mergeCookiesOnResponse(
      new Response(buildCategoryQuerySseStream(turn),
        { headers: { ...SSE_HEADERS } },
      ),
    );
  }
  return mergeCookies(
    NextResponse.json({
      reply: turn.reply,
      reasoning: undefined,
      toolCalls: undefined,
      categoryQueryCard: turn.categoryQueryCard,
    }),
  );
}
