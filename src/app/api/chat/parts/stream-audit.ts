/**
 * SSE 审计流包装。
 *
 * 职责：透传 Letta SSE 字节流（不动任何字节），旁路跟踪 accumulatedReply / tokenCount，
 * 流结束时写 logAIBehavior 审计 + PostHog GenAI 采集；错误路径同口径采集后关闭流。
 *
 * 纯机械搬移自 route.ts batch26-c（行为逐字节等价，仅加 export）。
 */

import { logger } from '@/lib/logger';
import { closeSSE } from '@/lib/sse';
import { logAIBehavior } from '@/lib/ai-audit';
import { fireAndForgetSafely } from '@/lib/admin-audit';
import { captureLLMGeneration } from '@/lib/posthog-server';
import { type ChallengeContext } from './types';

/**
 * 🔄 Audit Stream Wrapper (refactored)
 *
 * 🔧 Architecture refactor: noDataTimeout 和 compensation 已彻底移除。
 *
 * 新架构原则:
 * 1. AI 通过 MCP Server (symy.ai/api/mcp) 自主调用工具，是唯一写入 buddy_state 的路径
 * 2. Handler 内置 lock (isToolCallInProgress) + DB dedup (trigger_id) 保证幂等性
 *    即使 AI 重试或并发调用，也不会重复写入
 * 3. AI 任何时候回复都不应该有 bug —— 流可以自然结束，无需注入 fallback 消息
 * 4. AI 漏调工具的情况通过 logAIBehavior 监控，靠 prompt 优化解决，不靠 regex 猜
 * 5. Vercel 60s maxDuration 是唯一硬性超时，由 POST handler 的 Promise.race 兜底
 *
 * 此 wrapper 只做:
 *   - 透传 SSE 数据（不动任何字节）
 *   - 跟踪 accumulatedReply 用于审计日志
 *   - 流结束时写 logAIBehavior
 */
export function wrapStreamWithAudit(
  innerStream: ReadableStream<Uint8Array>,
  userMessage: string,
  userId: string | undefined,
  impulseContext?: {
    platform?: string;
    amount?: number;
    reasons?: string[];
    time?: string;
  },
  challengeContext?: ChallengeContext,
  agentId?: string,
): ReadableStream<Uint8Array> {
  let accumulatedReply = '';
  let tokenCount = 0;
  const startTime = Date.now();
  // 🔧 ARCH fix (Round 3 SSE C2): hoist reader 到外层, cancel() 可访问
  let reader: ReadableStreamDefaultReader<Uint8Array> | null = null;

  return new ReadableStream<Uint8Array>({
    async start(controller) {
      reader = innerStream.getReader();
      const decoder = new TextDecoder();

      try {
        let lineBuffer = ''; // 🔧 ARCH fix (Round 18 H6): 实际实现 lineBuffer (旧代码注释说已加但未实现)
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          const chunk = decoder.decode(value, { stream: true });

          // Track AI's text response (for audit log)
          // 🔧 ARCH fix (Round 18 H6): 用 lineBuffer 防跨 chunk 的 SSE 事件丢失
          lineBuffer += chunk;
          const lines = lineBuffer.split('\n');
          lineBuffer = lines.pop() || ''; // 保留最后不完整的行
          for (const line of lines) {
            if (!line.startsWith('data: ')) continue;
            const data = line.slice(6).trim();
            if (!data || data === '[DONE]') continue;
            try {
              const parsed = JSON.parse(data);
              if (parsed.type === 'token' && parsed.content) {
                accumulatedReply += parsed.content;
                tokenCount++;
              }
            } catch {
              /* ignore parse errors */
            }
          }

          // 透传原始字节，不做任何修改
          controller.enqueue(value);
        }

        // 📋 AI 行为审计 — 异步写入，不阻塞 controller.close()
        // 🔧 ARCH fix (Round 22 BUG-R22-C1): 用 fireAndForgetSafely 防 Vercel kill 丢失审计日志
        //    旧代码 .catch(() => {}) fire-and-forget → Vercel 杀函数后 INSERT 未完成 → 审计日志丢失。
        //    根因修复: 用 waitUntil(@vercel/functions) 延长函数生命周期 (与 admin-audit.ts 一致)。
        if (userId) {
          const isChallenge = !!challengeContext;
          const auditAction = isChallenge ? 'challenge_judge' : 'tool_call';

          fireAndForgetSafely(
            logAIBehavior({
              userId,
              action: auditAction,
              userInput: userMessage,
              aiOutput: accumulatedReply,
              context: {
                impulseContext,
                challengeContext,
              },
              aiPath: 'letta',
            }),
          );
        }

        // PostHog GenAI: capture LLM generation (streaming)
        fireAndForgetSafely(
          captureLLMGeneration({
            distinctId: userId || 'guest',
            input: userMessage.substring(0, 2000),
            output: accumulatedReply.substring(0, 2000),
            model: 'letta-glm-5.2',
            latencyMs: Date.now() - startTime,
            completionTokens: tokenCount,
            properties: {
              $ai_trace_id: agentId || 'unknown',
              mode: 'stream',
              hasChallenge: !!challengeContext,
            },
          }),
        );

        closeSSE(controller);
      } catch (err) {
        logger.error('[Chat API] Stream wrapper error:', err);

        // PostHog GenAI: capture LLM error (streaming)
        fireAndForgetSafely(
          captureLLMGeneration({
            distinctId: userId || 'guest',
            input: userMessage.substring(0, 2000),
            output: accumulatedReply.substring(0, 2000) || '',
            model: 'letta-glm-5.2',
            latencyMs: Date.now() - startTime,
            isError: true,
            errorMessage: err instanceof Error ? err.message : String(err),
            properties: {
              $ai_trace_id: agentId || 'unknown',
              mode: 'stream-error',
            },
          }),
        );

        try {
          if (reader) await reader.cancel();
        } catch {
          /* silent: non-critical operation */
        }
        closeSSE(controller);
      }
    },
    // 🔧 ARCH fix (Round 3 SSE C2): 用 hoisted reader.cancel() 替代 innerStream.cancel()。
    //    旧代码 innerStream.cancel() 在 locked stream 上 reject TypeError → 上游从不取消。
    //    reader.cancel() 在 locked stream 上正常工作, 且传播到 innerStream 的 cancel() (SSE C1 fix)。
    async cancel() {
      try {
        if (reader) await reader.cancel();
      } catch {
        /* silent: may already be closed */
      }
    },
  });
}
