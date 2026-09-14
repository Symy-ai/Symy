/**
 * 非流式 Letta 响应处理。
 *
 * 职责：调 sendToAgent 并归一化返回结构（reply / reasoning / toolCalls）；
 * 工具调用与「挑战中但 AI 未调工具」仅记日志监控（compensation 已彻底移除，幂等性由
 * handler lock + DB dedup 保证）。
 *
 * 纯机械搬移自 route.ts batch26-c（行为逐字节等价，仅加 export）。
 */

import { sendToAgent } from '@/lib/letta';
import { logger } from '@/lib/logger';
import { type ChallengeContext } from './types';

/**
 * Process Letta Agent response (non-streaming).
 *
 * 🔧 Architecture refactor: compensation 已彻底移除。
 * AI 通过 MCP Server 自主调用工具，handler 内置 lock + DB dedup 保证幂等性。
 * 即使 AI 没调用工具，也不会再执行 regex-based 补偿 —— 这避免了重复写入和
 * timing-dependent bug。AI 漏调工具的情况通过 logAIBehavior 监控，靠 prompt 优化解决。
 */
export async function processLettaResponse(
  userMessage: string,
  impulseContext?: {
    platform?: string;
    amount?: number;
    reasons?: string[];
    time?: string;
  },
  userId?: string,
  agentId?: string,
  // 🔧 L4 fix: 移除未使用的 _supabase 参数 (compensation 已移除, 不再需要)
  challengeContext?: ChallengeContext,
): Promise<{
  reply: string;
  reasoning?: string;
  toolCalls?: Array<{
    name: string;
    args?: Record<string, unknown>;
    result?: string;
  }>;
}> {
  const result = await sendToAgent(userMessage, impulseContext, userId, agentId);

  if (result.toolCalls && result.toolCalls.length > 0) {
    logger.info(`[Chat API] Letta Agent called tools: ${result.toolCalls.map((tc) => tc.name).join(', ')}`);
  } else if (challengeContext) {
    // 仅记录日志用于监控，不再执行 compensation
    logger.info(`[Chat API] Non-streaming: Challenge active (${challengeContext.itemName} $${challengeContext.amount}) but AI didn't call tools — no compensation (by design)`);
  }

  return {
    reply: result.reply,
    reasoning: result.reasoning,
    toolCalls: result.toolCalls,
  };
}
