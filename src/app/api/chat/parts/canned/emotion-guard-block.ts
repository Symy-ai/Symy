/**
 * 🐘 batch60-c 情绪守护短路块（b137 拆解第六刀，自 route.ts 纯机械搬移）
 *
 * 带着情绪提起购买 ("今天好累，想买点东西哄自己") → 不当普通购买挑战,
 * canned 共情回复 + 三选项守护卡 (花钱安慰/免费安抚/先等 10 分钟, 选择权在用户)。
 * 排位红线: 数据问答 (59-c/58-c/57-c) 在前优先; 通用购买预检在后 —
 * BNPL/绿色品类/问答形态由 detector 内让路, 链序由 source-order 测试锁定;
 * 高风险语义 detector 内排除, 自然降级通用聊天。
 *
 * 返回 Response | null —— null = 未命中, route 继续下一块（链序不变）。
 */
import { NextResponse } from 'next/server';
import { logger } from '@/lib/logger';

interface EmotionGuardBlockInput {
  userContent: string;
  locale: 'zh' | 'en';
  stream?: boolean;
  guardIntensity?: string;
  greenPref?: 'on' | 'off';
  suppressGuardCards: boolean;
  mergeCookies: (res: NextResponse) => NextResponse;
  mergeCookiesOnResponse: (res: Response) => Response;
  SSE_HEADERS: Record<string, string>;
}

export async function tryEmotionGuardBlock(input: EmotionGuardBlockInput): Promise<Response | null> {
  const { userContent, locale, stream = false, guardIntensity, greenPref, suppressGuardCards, mergeCookies, mergeCookiesOnResponse, SSE_HEADERS } = input;
  if (suppressGuardCards) return null;
  const { buildEmotionGuardTurn, buildEmotionGuardSseStream } = await import('../emotion-guard-turn');
  const emotionGuardTurn = buildEmotionGuardTurn({ userContent, locale, guardIntensity, greenPref });
  if (!emotionGuardTurn) return null;
  logger.info('[Chat API] Emotion shopping detected, returning emotion guard turn');
  if (stream) {
    return mergeCookiesOnResponse(
      new Response(buildEmotionGuardSseStream(emotionGuardTurn),
        { headers: { ...SSE_HEADERS } },
      ),
    );
  }
  return mergeCookies(
    NextResponse.json({
      reply: emotionGuardTurn.reply,
      reasoning: undefined,
      toolCalls: undefined,
      emotionGuardCard: emotionGuardTurn.emotionGuardCard,
    }),
  );
}
