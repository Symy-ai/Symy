/**
 * 🐘 batch48-b 反驳降温短路块（b137 拆解第十三刀，自 route.ts 纯机械搬移）
 *
 * 上一轮发过守护卡 + 本轮命中反驳意图 → 不调 Letta (杜绝第二次拦截话术),
 * 直接 canned 降温回复 + 冷静卡。与守护卡同一开关: guard-off 时客户端不会渲染
 * 守护卡 → afterGuardCard 恒 false, 此处再挡一道。
 *
 * 返回 Response | null —— null = 未命中, route 继续下一块（链序不变）。
 */
import { NextResponse } from 'next/server';
import { logger } from '@/lib/logger';

interface CooldownBlockInput {
  userContent: string;
  locale: 'zh' | 'en';
  stream?: boolean;
  greenPref?: 'on' | 'off';
  afterGuardCard?: boolean;
  mergeCookies: (res: NextResponse) => NextResponse;
  mergeCookiesOnResponse: (res: Response) => Response;
  SSE_HEADERS: Record<string, string>;
}

export async function tryCooldownBlock(input: CooldownBlockInput): Promise<Response | null> {
  const { userContent, locale, stream = false, greenPref, afterGuardCard, mergeCookies, mergeCookiesOnResponse, SSE_HEADERS } = input;
  if (greenPref === 'off') return null;
  const { buildCooldownTurn, buildCooldownSseStream } = await import('../cooldown-turn');
  const cooldownTurn = buildCooldownTurn({ userContent, locale, afterGuardCard: afterGuardCard === true });
  if (!cooldownTurn) return null;
  logger.info('[Chat API] Pushback detected, returning cooldown turn');
  if (stream) {
    return mergeCookiesOnResponse(
      new Response(buildCooldownSseStream(cooldownTurn), {
        headers: { ...SSE_HEADERS },
      }),
    );
  }
  return mergeCookies(
    NextResponse.json({
      reply: cooldownTurn.reply,
      reasoning: undefined,
      toolCalls: undefined,
      cooldownCard: cooldownTurn.cooldownCard,
    }),
  );
}
