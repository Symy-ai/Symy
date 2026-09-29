/**
 * 🌱 batch68-a 绿色采纳后复盘 — 回答轮（b137 拆解第十六刀，自 route.ts 搬移）
 *
 * 选项点击 ("手头已有" 一类短句) 是明确回答, 不得被既有购买/问账 detector 截胡;
 * 自由文本回答经让位 gate (新购买/紧急/数据问句) 判定: 未让位 → 证据落账 +
 * 注入 Letta 收束; 让位 → 静默落回普通链路 (会话态客户端已消费, 不再追问 —
 * 温和结束)。收束文案零金额零碳数值。
 *
 * 双通道返回（非纯短路）：
 * - response 命中（选项点击 → closing turn）→ 直接短路返回
 * - answerContext（自由文本回答 → 复盘证据 prompt）→ 透传给 letta-turn-context 注入
 * - 两者皆 null → 未命中, route 继续下一块
 */
import { NextResponse } from 'next/server';
import { logger } from '@/lib/logger';

interface GreenAltRetroAnswerBlockInput {
  userContent: string;
  locale: 'zh' | 'en';
  stream?: boolean;
  userId?: string | null;
  supabase: unknown;
  greenAltRetroAnswer: { entryId: string; optionId?: string } | null | undefined;
  fireAndForgetSafely: (p: Promise<unknown>) => void;
  mergeCookies: (res: NextResponse) => NextResponse;
  mergeCookiesOnResponse: (res: Response) => Response;
  SSE_HEADERS: Record<string, string>;
}

export interface GreenAltRetroAnswerBlockResult {
  response: Response | null;
  answerContext: import('../green-alt-retro-context').GreenAltRetroAnswerPrompt | undefined;
}

export async function runGreenAltRetroAnswerBlock(input: GreenAltRetroAnswerBlockInput): Promise<GreenAltRetroAnswerBlockResult> {
  const { userContent, locale, stream = false, userId = null, supabase, greenAltRetroAnswer, fireAndForgetSafely, mergeCookies, mergeCookiesOnResponse, SSE_HEADERS } = input;
  const none: GreenAltRetroAnswerBlockResult = { response: null, answerContext: undefined };
  if (!greenAltRetroAnswer) return none;
  const { entryId, optionId } = greenAltRetroAnswer;
  if (optionId) {
    const { buildGreenAltRetroClosingTurn, buildGreenAltRetroClosingSseStream } = await import('../green-alt-retro-turn');
    const closingTurn = buildGreenAltRetroClosingTurn({ entryId, optionId: optionId as import('@/lib/green-alt-retro').GreenAltRetroOptionId, locale });
    if (!closingTurn) return none;
    if (userId && supabase) {
      const { recordGreenAltRetroEvent } = await import('../green-alt-retro-persist');
      fireAndForgetSafely(
        recordGreenAltRetroEvent({
          userId,
          store: supabase as unknown as import('../green-alt-retro-persist').GreenAltRetroPersistStore,
          entryId,
          reason: optionId as import('@/lib/green-alt-retro').GreenAltRetroReason,
        }),
      );
    }
    logger.info('[Chat API] Green-alt retro answer (option), returning closing turn');
    if (stream) {
      return { response: mergeCookiesOnResponse(new Response(buildGreenAltRetroClosingSseStream(closingTurn), { headers: { ...SSE_HEADERS } })), answerContext: undefined };
    }
    return { response: mergeCookies(NextResponse.json({ reply: closingTurn.reply, reasoning: undefined, toolCalls: undefined })), answerContext: undefined };
  }
  // 自由文本回答: 让位 gate
  const { shouldDeferGreenAltRetro } = await import('../green-alt-retro-gate');
  if (shouldDeferGreenAltRetro(userContent, locale)) return none; // 让位 (新购买/紧急/数据问句): 不当回答也不追问, 普通链路接管
  // 只存定性词与原话 (freeform), 回复回落 Letta 但必须注入结构化复盘证据
  const { sanitizeGreenAltRetroNote } = await import('@/lib/green-alt-retro');
  const note = sanitizeGreenAltRetroNote(userContent);
  if (userId && supabase) {
    const { recordGreenAltRetroEvent } = await import('../green-alt-retro-persist');
    fireAndForgetSafely(
      recordGreenAltRetroEvent({
        userId,
        store: supabase as unknown as import('../green-alt-retro-persist').GreenAltRetroPersistStore,
        entryId,
        reason: 'freeform',
        note,
      }),
    );
  }
  const { buildGreenAltRetroAnswerPrompt } = await import('../green-alt-retro-context');
  return { response: null, answerContext: buildGreenAltRetroAnswerPrompt({ entryId, note, locale }) };
}
