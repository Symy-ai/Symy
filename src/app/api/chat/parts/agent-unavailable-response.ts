// 第22刀，自 route.ts:451-476 纯机械搬移
// （no-agent 503 出口 — refundChallengeQuota 分文案 + SSE/JSON 双通道。
//   语义: route 已强制 per-user agent (无全局 fallback), agent 缺失即 503,
//   auth-provider.tsx 的 ensureAgentForUser 会在登录后自动创建 per-user agent。）
import { NextResponse } from 'next/server';
import { logger } from '@/lib/logger';
import { SSE_HEADERS } from '@/lib/sse';
import { type ChallengeContext } from './types';
import type { AuthenticatedClient } from '@/lib/supabase-api';

export async function buildAgentUnavailableResponse(input: {
  userId: string | undefined;
  validChallengeContext: ChallengeContext | undefined;
  /** zod optional: undefined 与 false 同走 JSON 通道 (原 route 内联 `if (stream)` 语义) */
  stream: boolean | undefined;
  mergeCookies: AuthenticatedClient['mergeCookies'];
  mergeCookiesOnResponse: AuthenticatedClient['mergeCookiesOnResponse'];
}): Promise<Response> {
  const { userId, validChallengeContext, stream, mergeCookies, mergeCookiesOnResponse } = input;
  logger.error('[Chat API] No per-user agent available for user:', userId);

  // 🔧 Round 112 P0-1b fix: AI 失败时退还 See it 额度
  //    challenge create 已经 increment 了 daily_see_it_count, AI 失败时必须 decrement
  //    否则用户额度被无效消耗 (5 left → 4 left → 3 left, 但没得到服务)
  // 🔧 Round 120 audit fix (AUDIT-2 P0 #3 + AUDIT-1 refactor #3):
  //    旧代码 catch + warn + 仍告诉用户 "refunded" → 退款失败时用户被欺骗
  //    新代码: 调用 refundChallengeQuota helper, 根据结果决定文案
  let refundSucceeded = false;
  if (userId && validChallengeContext) {
    const { refundChallengeQuota } = await import('./refund-challenge-quota');
    const refundResult = await refundChallengeQuota(userId);
    refundSucceeded = refundResult.refunded;
    if (!refundSucceeded) {
      logger.error('[Chat API] Refund FAILED for user (AI unavailable):', userId, refundResult.error);
    }
  }

  // 🔧 Round 120 audit fix: 退款失败时显示不同文案 (不再撒谎 "refunded")
  const refundMsg = validChallengeContext ? (refundSucceeded ? 'AI is still initializing. Your See-it was refunded — please try again in a moment.' : 'AI is still initializing. Please try again in a moment. (If your See-it quota was consumed, please contact support.)') : 'AI is still initializing. Please try again in a moment.';
  if (stream) {
    return mergeCookiesOnResponse(new Response(`data: ${JSON.stringify({ type: 'error', content: refundMsg })}\n\n`, { headers: { ...SSE_HEADERS } }));
  }
  return mergeCookies(NextResponse.json({ error: refundMsg }, { status: 503 }));
}
