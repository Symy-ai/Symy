// 第24刀，自 route.ts:451-608 纯机械搬移
// （Letta 分发整段 try/catch 收拢 — 拆相位收官刀。
//   route 侧只剩 `const r = await dispatchLettaTurn(...); if (r) return r;` 一行调用。
//   原先暴露在 route 顶层的两个跨 try/catch 可变状态（流式成功 / 退款成功标志）
//   全部内部化，对外不可见。返回语义:
//     - 流式成功  → SSE Response（mergeCookiesOnResponse 包裹, Round 3 H3）
//     - 流式抛错  → catch 后自产 SSE 错误流 Response（BUG-188, 退款分文案 Round 120）
//     - 非流式成功 → JSON Response（reply/reasoning/toolCalls + 五个可选卡片字段）
//     - 非流式抛错 → null（唯一 null 情形: route 落回 P6 letta-unavailable 兜底，
//       与搬移前隐式跌出 isLettaConfigured 块的现状语义一致 — 方案 §3）
//   非流式审计落库（logAIBehavior + PostHog captureLLMGeneration）/ 401/403/429/5xx
//   错误分类日志 / catch 退款 / SSE 错误流 — 全段原样搬入，零行为改动。）
import { streamToAgent } from '@/lib/letta';
import { logger } from '@/lib/logger';
import { sendSSEData, closeSSE, SSE_HEADERS } from '@/lib/sse';
import { logAIBehavior } from '@/lib/ai-audit';
import { fireAndForgetSafely } from '@/lib/admin-audit';
import { captureLLMGeneration } from '@/lib/posthog-server';
import { buildSsePipeline } from './sse-pipeline';
import { processLettaResponse } from './letta-response';
import { type ChallengeContext } from './types';
import type { AuthenticatedClient } from '@/lib/supabase-api';
import type { CultivationStage } from '@/lib/cultivation';
import type { ReuseHint } from '@/lib/reuse-advisor';
import type { GreenAltCardData } from '@/types/green-alt-card';
import type { AltFootprintCardData } from '@/types/alt-footprint';
import type { MicroChallengeProposal } from '@/types/micro-challenge';
import type { GreenKnowledgeInjection } from './green-knowledge-context';

export interface LettaDispatchInput {
  /** 最后一条 user 消息原文（审计输入 / SSE 包装 / PostHog 采集用） */
  userContent: string;
  /** loadLettaTurnContext 产物: [Context:...] + <message> 组装后的完整 prompt */
  userContentWithStage: string;
  userId: string | undefined;
  locale: 'en' | 'zh';
  /** zod optional: undefined 与 false 同走非流式（原 route 内联 `if (stream)` 语义） */
  stream: boolean | undefined;
  impulseContext: { platform?: string; amount?: number; reasons?: string[]; time?: string } | undefined;
  validChallengeContext: ChallengeContext | undefined;
  /** per-user agent（route 已强制 per-user, 无全局 fallback） */
  targetAgentId: string;
  /** route 入口 Date.now() — PostHog latency 基准 */
  requestStartTime: number;
  mergeCookiesOnResponse: AuthenticatedClient['mergeCookiesOnResponse'];
  // ── 审计 context 字段（loadLettaTurnContext 产物）──
  lettaCultivationStage: CultivationStage;
  lettaUserHistory: string | undefined;
  // ── 卡片集合（loadLettaTurnContext 产物; 未命中为 null → SSE 包装直通 / JSON 字段省略）──
  greenAltCard: GreenAltCardData | null;
  reuseHint: ReuseHint | null;
  microChallenge: MicroChallengeProposal | null;
  greenKnowledge: GreenKnowledgeInjection;
  altFootprintCard: AltFootprintCardData | null;
  /** route req.signal — 客户端断开时同步取消 Letta 上游请求 */
  signal?: AbortSignal;
}

export async function dispatchLettaTurn(input: LettaDispatchInput): Promise<Response | null> {
  const { userContent, userContentWithStage, userId, locale, stream, impulseContext, validChallengeContext, targetAgentId, requestStartTime, mergeCookiesOnResponse, lettaCultivationStage, lettaUserHistory, greenAltCard, reuseHint, microChallenge, greenKnowledge, altFootprintCard } = input;

  let lettaStreamSucceeded = false;
  let streamRefundSucceeded = false; // 🔧 Round 120: hoisted to outer scope for use in error message
  try {
    // 🚀 流式模式：前端请求 stream=true 时，使用 SSE 让用户更早看到首 token
    if (stream) {
      const innerStream = await streamToAgent(userContentWithStage, impulseContext, userId || undefined, targetAgentId, input.signal);
      // 🔧 拆相位第23刀 (2026-09-30): SSE 包装栈 (audit→websearch→reuse→green→
      //    knowledge→footprint→micro, 字节序核心) 拆出 parts/sse-pipeline.ts
      //    纯函数 (纯机械搬移, "谁后包装谁更靠前" 层序逐一保留)。
      const sseBody = buildSsePipeline({
        innerStream, userContent, userId, locale,
        impulseContext, validChallengeContext, targetAgentId,
        greenAltCard, reuseHint, microChallenge, greenKnowledge, altFootprintCard,
      });
      lettaStreamSucceeded = true;

      // 🔧 ARCH fix (Round 3 SSE H3): 用 mergeCookiesOnResponse 把刷新的 auth cookie 写回。
      //    旧代码直接返回 new Response(monitoredStream), 刷新的 cookie 丢失 → 长 SSE 后 401。
      // 🔁 复用优先: reuse_hint 预注入事件包在审计 wrapper 外层 — 事件落在 SSE 字节流最前,
      //    审计 wrapper (内层) 只认 token 事件不受影响; Letta 原生事件顺序不变。
      //    合流 (batch24-a): reuse 先包装、green 后包装 (谁后包装谁更靠前) →
      //    双命中时字节序 green_alt → reuse_hint → Letta 原生事件, 与卡片渲染顺序一致。
      const sseResponse = new Response(sseBody, {
        headers: { ...SSE_HEADERS },
      });
      return mergeCookiesOnResponse(sseResponse);
    }

    // 非流式模式（fallback / 旧版前端兼容）
    // 🔧 可用性 fix (2026-09-30, 病灶2 of "Symy is quiet" 间歇503):
    //    并发探针 2/3 挂 — Letta API 瞬态失败(429限流/5xx抖动/网络reset)时旧代码
    //    直接 catch → return null → route 落 503「AI 不可用」。病灶1(getUserAgentId
    //    DB查询)已修(85974d0); 本处是病灶2: Letta API 调用本身无重试。
    //    修法: 仅对可重试错误(429/5xx/网络类)退避 400ms 重试一次; 401/403/404 等
    //    确定性错误不重试(重试必然再挂, 白白加延迟)。流式路径不重试(SSE 已开流,
    //    重试会产生重复流, 由前端 Retry 按钮兜底)。
    const callNonStream = (): ReturnType<typeof processLettaResponse> =>
      processLettaResponse(userContentWithStage, impulseContext, userId || undefined, targetAgentId, validChallengeContext);
    const isRetryableLettaError = (e: unknown): boolean => {
      const status = (e as { status?: number }).status;
      if (status === 429 || (typeof status === 'number' && status >= 500)) return true;
      // 网络类瞬态: fetch 超时/连接reset/DNS 抖动 — SDK 常以无 status 的 Error 冒出
      const msg = e instanceof Error ? e.message : String(e);
      return /timeout|timed?\s*out|network|fetch failed|ECONNRESET|ECONNREFUSED|ETIMEDOUT|socket hang up|aborted/i.test(msg);
    };
    let testResult;
    try {
      testResult = await callNonStream();
    } catch (firstErr) {
      if (!isRetryableLettaError(firstErr)) throw firstErr;
      logger.warn('[Chat API] Letta transient failure (non-stream), retrying once after backoff:', firstErr instanceof Error ? firstErr.message : String(firstErr));
      await new Promise((resolve) => setTimeout(resolve, 400));
      testResult = await callNonStream(); // 再挂则落外层 catch (退款+分类日志照旧)
    }

    // 📋 AI 行为审计（道用四·减法 + 六·公开）— 异步写入，不阻塞响应
    // 🔧 ARCH fix (Round 22 BUG-R22-C1): 用 fireAndForgetSafely 防 Vercel kill 丢失审计日志
    if (userId) {
      const isChallenge = !!validChallengeContext;
      const auditAction = isChallenge ? 'challenge_judge' : 'tool_call';
      fireAndForgetSafely(
        logAIBehavior({
          userId,
          action: auditAction,
          userInput: userContent,
          aiOutput: testResult.reply,
          toolCalls: testResult.toolCalls?.map((tc) => ({
            name: tc.name,
            arguments: tc.args,
            result: tc.result,
            success: !!tc.result,
          })),
          context: {
            impulseContext,
            challengeContext: validChallengeContext,
            reasoning: testResult.reasoning,
            cultivationStage: lettaCultivationStage,
            ragContexts: lettaUserHistory ? lettaUserHistory.length : 0,
          },
          aiPath: 'letta',
          agentId: targetAgentId,
        }),
      );
    }

    // PostHog GenAI: capture LLM generation (non-stream)
    fireAndForgetSafely(
      captureLLMGeneration({
        distinctId: userId || 'guest',
        input: String(userContent).substring(0, 2000),
        output: String(testResult.reply).substring(0, 2000),
        model: 'letta-glm-5.2',
        latencyMs: Math.max(0, Date.now() - requestStartTime),
        properties: {
          $ai_trace_id: targetAgentId,
          mode: 'non-stream',
          hasChallenge: !!validChallengeContext,
        },
      }),
    );

    return Response.json({
      reply: testResult.reply,
      reasoning: testResult.reasoning,
      toolCalls: testResult.toolCalls,
      // 🌱 绿色替代卡片 (未命中为 null → 前端不渲染)
      greenAlt: greenAltCard ?? undefined,
      // 🔁 复用优先: 非流式 fallback 也带 reuseHint 字段 (未命中/守卫关闭时缺省)
      ...(reuseHint ? { reuseHint } : {}),
      // 🐞 batch46-b: 非流式 fallback 也带 microChallenge 字段 (未命中/守卫关闭时缺省)
      ...(microChallenge ? { microChallenge } : {}),
      // 📖 batch47-a: 非流式 fallback 也带 greenKnowledge 字段 (未命中/守卫关闭时缺省)
      ...(greenKnowledge.card ? { greenKnowledge: greenKnowledge.card } : {}),
      // 🐘 batch55-c: 非流式 fallback 也带 altFootprint 字段 (未命中/样本不足时缺省)
      ...(altFootprintCard ? { altFootprint: altFootprintCard } : {}),
    });
  } catch (lettaError: unknown) {
    // 🔧 架构优化 Round 69 (Finding 10): 错误分类 — 区分配置错误/限流/服务故障
    const errMsg = lettaError instanceof Error ? lettaError.message : String(lettaError);
    const errorStatus = (lettaError as { status?: number }).status;
    if (errorStatus === 401 || errorStatus === 403) {
      logger.error(`[Chat API] Letta auth error (${errorStatus}):`, errMsg);
    } else if (errorStatus === 429) {
      logger.warn(`[Chat API] Letta rate limited:`, errMsg);
    } else if (errorStatus && errorStatus >= 500) {
      logger.error(`[Chat API] Letta server error (${errorStatus}):`, errMsg);
    } else {
      logger.warn(`[Chat API] Letta agent failed:`, errMsg);
    }

    // 🔧 Round 115 P0 fix: AI 失败时退还 See it 额度 (与 no-agent 路径一致)
    //    challenge create 已经 increment 了 daily_see_it_count, AI 失败时必须 decrement
    // 🔧 Round 120 audit fix (AUDIT-2 P0 #3): 用 refundChallengeQuota helper, 根据结果决定文案
    if (userId && validChallengeContext) {
      const { refundChallengeQuota } = await import('./refund-challenge-quota');
      const refundResult = await refundChallengeQuota(userId);
      streamRefundSucceeded = refundResult.refunded;
      if (!streamRefundSucceeded) {
        logger.error('[Chat API] Refund FAILED (stream fail):', userId, refundResult.error);
      }
    }

    // PostHog GenAI: capture LLM error (non-stream)
    fireAndForgetSafely(
      captureLLMGeneration({
        distinctId: userId || 'guest',
        input: String(userContent).substring(0, 2000),
        output: '',
        model: 'letta-glm-5.2',
        latencyMs: Math.max(0, Date.now() - requestStartTime),
        isError: true,
        errorMessage: errMsg,
        properties: {
          $ai_trace_id: targetAgentId,
          mode: 'non-stream-error',
        },
      }),
    );
  }

  // 🔧 BUG-188 fix: 流式请求所有 Letta Agent 失败时，返回 SSE 错误而非 JSON
  if (stream && !lettaStreamSucceeded) {
    // 🔧 Round 120 audit fix: 退款失败时显示不同文案 (不再撒谎 "refunded")
    const streamErrMsg = validChallengeContext ? (streamRefundSucceeded ? 'AI service temporarily unavailable. Your See-it was refunded — please try again.' : 'AI service temporarily unavailable. Please try again. (If your See-it quota was consumed, please contact support.)') : 'AI service temporarily unavailable. Please try again.';
    const errorStream = new ReadableStream({
      start(ctrl) {
        sendSSEData(ctrl, { type: 'error', content: streamErrMsg });
        sendSSEData(ctrl, '[DONE]');
        closeSSE(ctrl);
      },
    });
    // 🔧 ARCH fix (Round 23 H4 — SSE fallback 缺 mergeCookiesOnResponse, token 刷新丢失):
    //    根因修复: 所有 Response 都用 mergeCookiesOnResponse 包裹。
    return mergeCookiesOnResponse(
      new Response(errorStream, {
        headers: {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
        },
      }),
    );
  }

  // 非流式 catch 后落到此处 → null（route 落 P6 letta-unavailable 兜底, 方案 §3 唯一 null 情形）
  return null;
}
