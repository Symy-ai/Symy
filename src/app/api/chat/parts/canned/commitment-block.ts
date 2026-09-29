/**
 * 🐘 batch53-a 绿色承诺短路块（b137 拆解第九刀，自 route.ts 纯机械搬移）
 *
 * 用户主动口头承诺 ("这个月不买X") → 不调 Letta 泛泛鼓励, 直接 canned 迎接回复 +
 * 承诺登记卡 (确认后才落 health_events)。放在求问/反驳之后: 三流意图互斥
 * (detector 内排除)。
 *
 * 返回 Response | null —— null = 未命中, route 继续下一块（链序不变）。
 */
import { NextResponse } from 'next/server';
import { logger } from '@/lib/logger';

interface CommitmentBlockInput {
  userContent: string;
  locale: 'zh' | 'en';
  stream?: boolean;
  mergeCookies: (res: NextResponse) => NextResponse;
  mergeCookiesOnResponse: (res: Response) => Response;
  SSE_HEADERS: Record<string, string>;
}

export async function tryCommitmentBlock(input: CommitmentBlockInput): Promise<Response | null> {
  const { userContent, locale, stream = false, mergeCookies, mergeCookiesOnResponse, SSE_HEADERS } = input;
  const { buildCommitmentTurn, buildCommitmentSseStream } = await import('../commitment-turn');
  const commitmentTurn = buildCommitmentTurn({ userContent, locale });
  if (!commitmentTurn) return null;
  logger.info('[Chat API] Green commitment detected, returning commitment turn');
  if (stream) {
    return mergeCookiesOnResponse(
      new Response(buildCommitmentSseStream(commitmentTurn), {
        headers: { ...SSE_HEADERS },
      }),
    );
  }
  return mergeCookies(
    NextResponse.json({
      reply: commitmentTurn.reply,
      reasoning: undefined,
      toolCalls: undefined,
      commitmentCard: commitmentTurn.commitmentCard,
    }),
  );
}
