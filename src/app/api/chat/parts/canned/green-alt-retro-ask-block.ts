/**
 * 🌱 batch68-a 复盘追问轮短路块（b137 拆解第十五刀，自 route.ts 纯机械搬移）
 *
 * 上一轮采纳了绿色替代 (客户端会话态 pending 一次性上行) 且本轮不是新购买/
 * 紧急求助/数据问句/绿色替代再请求 → canned 承认 + 追问一次 (4 个非羞辱选项卡 +
 * 自由文本提示)。greenPref 'off' 整体静默; 让位时 pending 客户端已消费, 不顺延 —
 * 每条采纳只追问一次。
 *
 * 返回 Response | null —— null = 未命中, route 继续下一块（链序不变）。
 */
import { NextResponse } from 'next/server';
import { logger } from '@/lib/logger';

interface GreenAltRetroAskBlockInput {
  userContent: string;
  locale: 'zh' | 'en';
  stream?: boolean;
  greenAltRetroPending: { entryId: string } | null | undefined;
  greenPref?: 'on' | 'off';
  mergeCookies: (res: NextResponse) => NextResponse;
  mergeCookiesOnResponse: (res: Response) => Response;
  SSE_HEADERS: Record<string, string>;
}

export async function tryGreenAltRetroAskBlock(input: GreenAltRetroAskBlockInput): Promise<Response | null> {
  const { userContent, locale, stream = false, greenAltRetroPending, greenPref, mergeCookies, mergeCookiesOnResponse, SSE_HEADERS } = input;
  if (!greenAltRetroPending || greenPref === 'off') return null;
  const { shouldDeferGreenAltRetro } = await import('../green-alt-retro-gate');
  if (shouldDeferGreenAltRetro(userContent, locale)) return null;
  const { buildGreenAltRetroAskTurn, buildGreenAltRetroAskSseStream } = await import('../green-alt-retro-turn');
  const askTurn = buildGreenAltRetroAskTurn({ entryId: greenAltRetroPending.entryId, locale });
  if (!askTurn) return null;
  logger.info('[Chat API] Green-alt retro ask turn');
  if (stream) {
    return mergeCookiesOnResponse(
      new Response(buildGreenAltRetroAskSseStream(askTurn), { headers: { ...SSE_HEADERS } }),
    );
  }
  return mergeCookies(
    NextResponse.json({
      reply: askTurn.reply,
      reasoning: undefined,
      toolCalls: undefined,
      greenAltRetro: askTurn.greenAltRetro,
    }),
  );
}
