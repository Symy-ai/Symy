/**
 * 🐘 batch68-c 按小时守护脉搏短路块（b137 拆解第五刀，自 route.ts 纯机械搬移）
 *
 * 用户问自己的小时级节奏 ("我什么时候最容易冲动 / my weakest shopping hour")
 * → 不调 Letta, canned 回复 + 脉搏卡 (aggregateGuardPulse 近 28 天 0-23 小时聚合,
 * 只读 health_events + profiles.timezone, 零 DDL)。只显示小时/次数/天数,
 * 无金额无碳数值, 看见节奏不是认罪。
 *
 * 返回 Response | null —— null = 未命中, route 继续下一块（链序不变）。
 */
import { NextResponse } from 'next/server';
import { logger } from '@/lib/logger';

interface GuardPulseBlockInput {
  userContent: string;
  locale: 'zh' | 'en';
  stream?: boolean;
  userId?: string | null;
  supabase: unknown;
  mergeCookies: (res: NextResponse) => NextResponse;
  mergeCookiesOnResponse: (res: Response) => Response;
  SSE_HEADERS: Record<string, string>;
}

export async function tryGuardPulseBlock(input: GuardPulseBlockInput): Promise<Response | null> {
  const { userContent, locale, stream = false, userId = null, supabase, mergeCookies, mergeCookiesOnResponse, SSE_HEADERS } = input;
  const { detectGuardPulseQuery } = await import('../guard-pulse-detector');
  if (!detectGuardPulseQuery(userContent)) return null;
  const { buildGuardPulseTurn, buildGuardPulseSseStream } = await import('../guard-pulse-turn');
  const { loadGuardPulseQueryData } = await import('../guard-pulse-context');
  const { events, timezone } = await loadGuardPulseQueryData({
    userId: userId ?? undefined,
    // SupabaseClient 运行时满足最小结构面 (与 factsStore 同款边界收窄)
    store: (supabase ?? undefined) as unknown as import('../guard-pulse-context').GuardPulseStore | undefined,
  });
  const pulseTurn = buildGuardPulseTurn({ userContent, locale, events, now: new Date(), timezone })!;
  logger.info('[Chat API] Guard pulse detected, returning guard pulse turn');
  if (stream) {
    return mergeCookiesOnResponse(
      new Response(buildGuardPulseSseStream(pulseTurn),
        { headers: { ...SSE_HEADERS } },
      ),
    );
  }
  return mergeCookies(
    NextResponse.json({
      reply: pulseTurn.reply,
      reasoning: undefined,
      toolCalls: undefined,
      guardPulseCard: pulseTurn.guardPulseCard,
    }),
  );
}
