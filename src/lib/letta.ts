/**
 * Letta Agent 客户端封装
 *
 * we=me 的 LLM 层接的是 Letta Agent（有状态/有记忆），
 * 不是普通的 OpenAI 兼容聊天 API。
 *
 * Agent 会自动维护对话历史和核心记忆（core memory blocks），
 * 所以每次发消息只需要发当前这条，不需要带上历史。
 *
 * Letta Agent 返回的消息类型:
 * - assistant_message: 给用户看的回复
 * - reasoning_message: Agent 内部推理（可选展示）
 * - tool_call_message / tool_return_message: Agent 调用工具
 * - stop_reason / usage_statistics: 元信息
 */

import 'server-only';
import Letta from '@letta-ai/letta-client';
import { logger } from '@/lib/logger';
import { warnMissingEnvOnce } from '@/lib/env-consumers';
// 🔧 A1 移植 (commerce-agents "UI 组件即工具"): 搜索卡片结构化通道的 executor 侧校验
import { extractSearchCardsFromContent } from '@/lib/structured-cards';
import {
  extractReasoning,
  extractToolCall,
  extractToolReturn,
  extractReasoningFromEvent,
  extractToolCallFromEvent,
  extractToolReturnFromEvent,
} from '@/lib/letta-message-helpers';

// ============================================================
// 配置
// ============================================================

const LETTA_API_KEY = process.env.LETTA_API_KEY || '';

/**
 * 是否已配置 Letta（优先使用 Letta Agent）
 * 只需要 API Key（per-user agent 模式，不再需要全局 AGENT_ID）
 */
export function isLettaConfigured(): boolean {
  if (!LETTA_API_KEY) warnMissingEnvOnce('Letta conversation and agent management');
  return !!LETTA_API_KEY;
}

// Singleton client
let _lettaClient: Letta | null = null;

function getLettaClient(): Letta {
  if (!_lettaClient) {
    _lettaClient = new Letta({
      apiKey: LETTA_API_KEY,
      environment: 'cloud', // https://api.letta.com
    });
  }
  return _lettaClient;
}

// ============================================================
// 类型
// ============================================================

/** 给前端用的简化消息 */
export interface LettaChatResponse {
  /** Agent 给用户的回复文本 */
  reply: string;
  /** Agent 内部推理（可选，前端可以折叠展示） */
  reasoning?: string;
  /** 本次对话 token 用量 */
  usage?: {
    promptTokens?: number;
    completionTokens?: number;
    totalTokens?: number;
    stepCount?: number;
  };
  /** 工具调用信息（用于监控和前端通知） */
  toolCalls?: Array<{
    name: string;
    /** Letta tool_call 唯一 ID — 用于精确配对 tool_call 和 tool_return (Round 19 H1-audit1) */
    toolCallId?: string;
    args?: Record<string, unknown>;
    result?: string;
  }>;
}

// ============================================================
// 发送消息给 Letta Agent（非流式）
// ============================================================

/**
 * 发送一条消息给 Letta Agent 并等待完整响应。
 *
 * 注意：Letta Agent 是有状态的，会自动记住对话历史，
 * 所以只需要发当前这条消息，不需要带上历史消息。
 *
 * 重要：不要对同一个 Agent 并发发消息，Agent 是串行处理的。
 * 前端应在等待响应时禁用发送按钮。
 */
export async function sendToAgent(
  userMessage: string,
  impulseContext?: {
    platform?: string;
    amount?: number;
    reasons?: string[];
    time?: string;
  },
  userId?: string,
  agentId?: string,
  /** 🔧 batch92-c (D5): 可选中止信号 — 调用方超时后取消上游 HTTP 请求 (Letta SDK RequestOptions 支持 signal) */
  options?: { signal?: AbortSignal },
): Promise<LettaChatResponse> {
  const client = getLettaClient();

  // 🔧 ARCH fix: 移除全局 LETTA_AGENT_ID fallback — 强制 per-user agent
  //    旧代码: const targetAgentId = agentId || LETTA_AGENT_ID;
  //    现在: agentId 必须由调用方提供 (chat/route.ts 从 profiles.letta_agent_id 获取)
  if (!agentId) {
    throw new Error('No agent ID provided. Per-user agent is required.');
  }
  const targetAgentId = agentId;

  // 🔧 P1 fix (architecture-analysis-20260630 §4.3): 移除 context prefix 二次构建
  // 原因: chat/route.ts 已经构建了完整的 userContentWithStage
  //   [Context: user_id | cultivation_stage | locale | challenge | impulse]
  //   <user_history>...</user_history>
  //   <message>...</message>
  // 之前 letta.ts 又在前面加一层 [Context: user_id | Platform | Amount | ...]
  // 导致 AI 收到双层 context 头部, 信息部分冲突, 浪费 token, 维护成本高
  //
  // 调用方约定:
  // - chat/route.ts: 传入已构建的 userContentWithStage (含完整 context)
  // - story-engine.ts: 传入 raw prompt, AI 通过 memory_blocks 获取 user_id
  // - impulseContext/userId 参数保留向后兼容, 仅用于日志, 不再嵌入消息
  const messageContent = userMessage;

  // 🔧 Architecture refactor: 移除应用层 timeout — Vercel maxDuration=60 已硬兜底
  // 之前 30s timeout 唯一作用是触发 fallback chain，新架构信任 AI 完成响应
  // timeoutMs 参数保留向后兼容（蝴蝶效应仍传 30-45s）但已忽略

  // 🔧 2026-07-15 (ARCH-8 #8 修复): Stale agent_id 自动清理
  //    场景: Letta agent 被删除 (admin/Letta 清理) 但 profiles.letta_agent_id 还存着
  //    旧代码: client.agents.messages.create() 抛 404 → chat 永久失败
  //    修复: 捕获 404, 清除 profiles.letta_agent_id, 重新抛出 (chat route 会重试)
  let response;
  try {
    // 仅在有 signal 时透传第三参 — 既有调用方的请求形态保持不变
    const requestOptions = options?.signal ? { signal: options.signal } : undefined;
    response = await client.agents.messages.create(targetAgentId, {
      messages: [{ role: 'user', content: messageContent }],
    }, requestOptions);
  } catch (err: unknown) {
    // 检测 404 (agent not found) — 清除 stale agent_id
    const isNotFound = err instanceof Error && (
      err.message.includes('404') ||
      err.message.includes('not found') ||
      err.message.includes('does not exist') ||
      err.message.includes('Agent not found')
    );
    if (isNotFound && userId) {
      logger.warn(`[Letta] Agent ${targetAgentId} not found (stale). Clearing profiles.letta_agent_id for user ${userId}`);
      try {
        const { createAdminClient } = await import('@/lib/supabase-admin');
        const { supabase: adminClient } = createAdminClient();
        if (adminClient) {
          await adminClient
            .from('profiles')
            .update({ letta_agent_id: null })
            .eq('id', userId);
        }
      } catch {
        // Best-effort cleanup — don't mask the original error
      }
    }
    throw err;
  }

  // 从响应中提取 assistant_message（给用户看的）
  let reply = '';
  let reasoning = '';
  const toolCalls: Array<{ name: string; toolCallId?: string; args?: Record<string, unknown>; result?: string }> = [];

  for (const msg of response.messages) {
    if (msg.message_type === 'assistant_message') {
      // content 可以是 string 或 Array<{ text: string }>
      const content = msg.content;
      if (typeof content === 'string') {
        reply += content;
      } else if (Array.isArray(content)) {
        for (const part of content) {
          if ('text' in part && typeof part.text === 'string') {
            reply += part.text;
          }
        }
      }
    } else if (msg.message_type === 'reasoning_message') {
      // 🔧 ARCH fix (Round 78 — Letta SDK 类型安全):
      //    旧代码: 5+ 处 `as unknown as Record<string, unknown>` 访问 SDK 字段
      //    修复: 用 extractReasoning helper 统一字段访问 (reasoning/hidden_reasoning/content fallback)
      reasoning = extractReasoning(msg);
    } else if (msg.message_type === 'tool_call_message') {
      // 🔧 ARCH fix (Round 78): 用 extractToolCall helper 统一 SDK 字段访问
      //    封装: tool_call.arguments JSON.parse (BUG-29 fix) + tool_call_id 提取 (H1-audit1 fix)
      const call = extractToolCall(msg);
      if (call) {
        toolCalls.push({
          name: call.name,
          toolCallId: call.toolCallId,
          args: call.args,
        });
      }
    } else if (msg.message_type === 'tool_return_message') {
      // 🔧 ARCH fix (Round 78): 用 extractToolReturn helper 统一 SDK 字段访问
      //    封装: tool_call 字段提取 + content (string vs Array<{text}>) 解析
      const ret = extractToolReturn(msg);
      if (ret) {
        const { name: toolName, toolCallId, content: returnContent } = ret;
        // 🔧 ARCH fix (Round 19 H1-audit1): 按 tool_call_id 配对 (唯一), 而非按 name
        if (toolCallId) {
          const existing = toolCalls.find(tc => tc.toolCallId === toolCallId);
          if (existing) {
            existing.result = returnContent;
          } else {
            toolCalls.push({ name: toolName, toolCallId, result: returnContent });
          }
        } else if (toolName) {
          // Fallback: 无 tool_call_id (旧 SDK 版本) — 退回 name 配对
          // 用 findLast + !tc.result 找到第一个未配 result 的同名工具 (避免覆盖已配对的)
          const existing = toolCalls.findLast(tc => tc.name === toolName && !tc.result);
          if (existing) {
            existing.result = returnContent;
          } else {
            toolCalls.push({ name: toolName, result: returnContent });
          }
        }
      }
    }
  }

  // 如果 Agent 没有返回 assistant_message（不应该发生，但做 fallback）
  // 🔧 Mirror-mode refactor: fallback is a mirror reflection, not a probing question.
  //    Old: "I'm here for you. How are you feeling right now?" (comfort + probing — assistant mode)
  //    New: "I'm here." (mirror — present, no probing, no comfort)
  if (!reply) {
    reply = "I'm here.";
  }

  return {
    reply,
    reasoning: reasoning || undefined,
    toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
    usage: response.usage ? {
      promptTokens: response.usage.prompt_tokens,
      completionTokens: response.usage.completion_tokens,
      totalTokens: response.usage.total_tokens,
      stepCount: response.usage.step_count,
    } : undefined,
  };
}

// ============================================================
// 流式发送（SSE）
// ============================================================

/**
 * 流式发送消息给 Letta Agent，返回 ReadableStream 供前端消费。
 *
 * 返回的 SSE 格式:
 * - data: {"type":"reasoning","content":"..."}     — Agent 内部推理
 * - data: {"type":"token","content":"..."}          — 回复 token
 * - data: {"type":"done"}                           — 结束
 */
export async function streamToAgent(
  userMessage: string,
  impulseContext?: {
    platform?: string;
    amount?: number;
    reasons?: string[];
    time?: string;
  },
  userId?: string,
  agentId?: string,  // 🔧 新增：per-user agent ID
): Promise<ReadableStream<Uint8Array>> {
  const client = getLettaClient();

  // 🔧 ARCH fix: 移除全局 LETTA_AGENT_ID fallback — 强制 per-user agent
  //    旧代码: const targetAgentId = agentId || LETTA_AGENT_ID;
  //    现在: agentId 必须由调用方提供 (chat/route.ts 从 profiles.letta_agent_id 获取)
  if (!agentId) {
    throw new Error('No agent ID provided. Per-user agent is required.');
  }
  const targetAgentId = agentId;

  // 🔧 P1 fix (architecture-analysis-20260630 §4.3): 移除 context prefix 二次构建
  // 原因同 sendToAgent — chat/route.ts 已构建完整 context, 此处直接用 userMessage
  // impulseContext/userId 参数保留向后兼容, 仅用于日志
  const messageContent = userMessage;

  // 🔧 Architecture refactor: 移除流式首字节 timeout — Vercel maxDuration=60 已硬兜底
  // 之前 40s timeout 触发 fallback chain，新架构信任 AI 完成响应
  const stream = await client.agents.messages.create(targetAgentId, {
    messages: [{ role: 'user', content: messageContent }],
    streaming: true,
    stream_tokens: true,
  });

  const encoder = new TextEncoder();

  // 将 Letta SDK Stream 转换为 ReadableStream
  // 🔧 ARCH fix (Round 3 SSE C1): 添加 cancel() 方法 — 客户端断开时中止上游 Letta HTTP 请求,
  //    防止 GLM token 继续生成 (成本泄漏)。Letta SDK Stream 有公开的 controller: AbortController。
  return new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        for await (const event of stream) {
          // 过滤出有用的消息类型
          if (event.message_type === 'reasoning_message') {
            // 🔧 ARCH fix (Round 78 — Letta SDK 类型安全):
            //    旧代码: 流式 `event as unknown as Record<string, unknown>` 5 处
            //    修复: 用 extractReasoningFromEvent helper 统一字段访问
            //    (Round 19 H2-audit1 fallback: reasoning → hidden_reasoning → content)
            const reasoningText = extractReasoningFromEvent(event);
            if (reasoningText) {
              controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'reasoning', content: reasoningText })}\n\n`));
            }
          } else if (event.message_type === 'assistant_message') {
            // 流式模式下 content 是增量 token
            const content = event.content;
            let text = '';
            if (typeof content === 'string') {
              text = content;
            } else if (Array.isArray(content)) {
              for (const part of content) {
                if ('text' in part && typeof part.text === 'string') {
                  text += part.text;
                }
              }
            }
            if (text) {
              controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'token', content: text })}\n\n`));
            }
          } else if (event.message_type === 'tool_call_message') {
            // Letta Agent 调用了 MCP 工具 → 通知前端（前端可展示奖励/惩罚通知）
            // 🔧 ARCH fix (Round 78): 用 extractToolCallFromEvent helper
            const call = extractToolCallFromEvent(event);
            if (call?.name) {
              controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'tool_call', tool: call.name })}\n\n`));
            }
          } else if (event.message_type === 'tool_return_message') {
            // 工具执行结果 → 通知前端刷新 buddy state + 显示通知
            // 🔧 ARCH fix (Round 78): 用 extractToolReturnFromEvent helper
            //    封装: tool_call name 提取 + content (string vs Array<{text}>) 解析
            const ret = extractToolReturnFromEvent(event);
            if (ret?.name) {
              // 🔧 A1 移植 (commerce-agents "UI 组件即工具", 2026-09-07): 搜索工具的卡片在
              //    executor 侧只解析一次并严格校验, 以结构化 cards 字段随事件下发;
              //    content 原样保留, 客户端无 cards 字段时仍走旧字符串解析 fallback (双轨)。
              const searchCards = extractSearchCardsFromContent(ret.name, ret.content);
              const payload: Record<string, unknown> = { type: 'tool_result', tool: ret.name, content: ret.content };
              if (searchCards.length) payload.cards = searchCards;
              controller.enqueue(encoder.encode(`data: ${JSON.stringify(payload)}\n\n`));
            }
          } else if (event.message_type === 'stop_reason') {
            // 流结束
          }
        }
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'done' })}\n\n`));
        controller.close();
      } catch (err) {
        // 🔧 ARCH fix (BUG-1): 透传真实错误信息给前端 (旧代码硬编码 "Stream interrupted")
        //    旧代码: catch 块发 {"type":"error","content":"Stream interrupted"} → 用户无从知晓真实原因
        //    根因修复: 提取 err.message / err.status, 发给前端
        const isAbort = err instanceof Error && (err.name === 'AbortError' || err.message.includes('abort'));
        if (isAbort) {
          // AbortError 是用户主动取消 (Give Up / 切 tab), 不需要显示错误
          logger.info('[Letta] Stream aborted by client');
        } else {
          logger.error('[Letta] Stream error:', err);
          const errMsg = err instanceof Error ? err.message : String(err);
          const errStatus = (err as { status?: number })?.status;
          const detail = errStatus ? ` (HTTP ${errStatus})` : '';
          try {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'error', content: `AI stream error${detail}: ${errMsg.substring(0, 200)}` })}\n\n`));
          } catch { /* controller already closed */ }
        }
        try { controller.close(); } catch { /* controller already closed */ }
      }
    },
    // 🔧 ARCH fix (Round 3 SSE C1): 客户端断开时调用, 中止上游 Letta HTTP 请求
    // 🔧 ARCH fix (Round 78): 移除 `as unknown as { controller: AbortController }` cast —
    //    SDK Stream 类已公开 controller: AbortController 字段, 直接访问即可
    cancel() {
      try {
        // Letta SDK Stream 有公开的 controller: AbortController
        // abort() 会让 for-await 循环抛出 AbortError, 走 catch 路径优雅退出
        stream.controller.abort();
      } catch {
        // stream 可能已结束, controller.abort() 抛错 — 忽略
      }
    },
  });
}
