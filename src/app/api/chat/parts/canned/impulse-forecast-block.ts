/**
 * 🐘 batch62-c 冲动预报短路块（b137 拆解第四刀，自 route.ts 纯机械搬移）
 *
 * 用户往前问 ("下周容易冲动吗 / 这几天什么时候危险 / next week risk")
 * → 不调 Letta, canned 回复 + 预报卡 (forecastImpulseRisk 近 8 周同星期几规律,
 * 次数/天数/时段 only, 提前准备框架, 不承诺预测准确率)。同一块接住预报卡后的
 * 单日追问 ("那周六呢"): 客户端上行的 dataQueryContext kind='forecast' 为资格
 * 标记, 星期词由 detectForecastDayFollowUp 归一。
 *
 * 返回 Response | null —— null = 未命中, route 继续下一块（链序不变）。
 */
import { NextResponse } from 'next/server';
import { logger } from '@/lib/logger';

interface ImpulseForecastBlockInput {
  userContent: string;
  locale: 'zh' | 'en';
  stream?: boolean;
  userId?: string | null;
  supabase: unknown;
  /** 客户端上行的数据问答卡元数据 (forecast 资格标记) */
  dataQueryContext: { kind?: string } | null | undefined;
  mergeCookies: (res: NextResponse) => NextResponse;
  mergeCookiesOnResponse: (res: Response) => Response;
  SSE_HEADERS: Record<string, string>;
}

export async function tryImpulseForecastBlock(input: ImpulseForecastBlockInput): Promise<Response | null> {
  const { userContent, locale, stream = false, userId = null, supabase, dataQueryContext, mergeCookies, mergeCookiesOnResponse, SSE_HEADERS } = input;
  const { detectForecastQuery, detectForecastDayFollowUp } = await import('../impulse-forecast-detector');
  const isForecastQuery = detectForecastQuery(userContent);
  const forecastPrev = dataQueryContext?.kind === 'forecast';
  const forecastDay = forecastPrev && !isForecastQuery ? detectForecastDayFollowUp(userContent) : null;
  if (!isForecastQuery && forecastDay === null) return null;
  const { buildImpulseForecastTurn, buildImpulseForecastDayTurn, buildImpulseForecastSseStream } = await import('../impulse-forecast-turn');
  const { loadImpulseForecastEvents } = await import('../impulse-forecast-context');
  const events = await loadImpulseForecastEvents({
    userId: userId ?? undefined,
    // SupabaseClient 运行时满足最小结构面 (与 factsStore 同款边界收窄)
    store: (supabase ?? undefined) as unknown as import('../impulse-forecast-context').ImpulseForecastStore | undefined,
  });
  const now = new Date();
  const forecastTurn = forecastDay !== null
    ? buildImpulseForecastDayTurn({ day: forecastDay, locale, events, now })
    : buildImpulseForecastTurn({ userContent, locale, events, now })!;
  logger.info('[Chat API] Impulse forecast detected, returning forecast turn');
  if (stream) {
    return mergeCookiesOnResponse(
      new Response(buildImpulseForecastSseStream(forecastTurn),
        { headers: { ...SSE_HEADERS } },
      ),
    );
  }
  return mergeCookies(
    NextResponse.json({
      reply: forecastTurn.reply,
      reasoning: undefined,
      toolCalls: undefined,
      impulseForecastCard: forecastTurn.impulseForecastCard,
    }),
  );
}
