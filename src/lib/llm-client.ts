/**
 * LLM 统一调用层
 *
 * 和 chat API 使用相同的 LLM 调用链路：
 * 1. LLM Gateway (OpenAI 兼容) — 优先，生产环境用
 * 2. z-ai-web-dev-sdk — fallback，沙箱开发用
 *
 * 任何需要 LLM 的功能（chat fallback、蝴蝶效应等）都应通过此模块调用，
 * 避免各自维护 SDK 配置逻辑。
 *
 * 修改门槛：同总则（详见 constitution.md §五）
 */

import { logger } from '@/lib/logger';
import {
  callZAIChatCompletion,
  callZAIChatCompletionStream,
  type ZAIChatMessage,
  type ZAIToolCall,
} from '@/lib/zai-sdk-types';

// ============================================================
// LLM 配置 — 和 chat route 共享
// ============================================================

const LLM_CONFIG = {
  gatewayUrl: process.env.LLM_GATEWAY_URL || '',
  gatewayKey: process.env.LLM_GATEWAY_KEY || '',
  model: process.env.LLM_HEAL_MODEL || 'gpt-4o-mini',
  temperature: parseFloat(process.env.LLM_TEMPERATURE || '0.7'),
  maxTokens: parseInt(process.env.LLM_MAX_TOKENS || '500', 10),
};

/** LLM Gateway 是否可用 */
export function isGatewayAvailable(): boolean {
  return !!(LLM_CONFIG.gatewayUrl && LLM_CONFIG.gatewayKey);
}

// ============================================================
// 类型定义
// ============================================================

export interface LLMMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface LLMCompletionOptions {
  temperature?: number;
  maxTokens?: number;
}

/** Function calling 相关类型（与 OpenAI API 兼容） */
export interface LLMTool {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}

export interface LLMToolCall {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string;
  };
}

export interface LLMCompletionWithToolsOptions extends LLMCompletionOptions {
  tools?: LLMTool[];
  toolChoice?: 'auto' | 'none' | { type: 'function'; function: { name: string } };
  /** 强制走 Gateway（true）或 ZAI（false）。不传则自动判断 */
  useGateway?: boolean;
}

export interface LLMCompletionResult {
  content: string;
  toolCalls?: LLMToolCall[];
}

// ============================================================
// 非流式调用（纯文本，无 tools）
// ============================================================

/**
 * 调用 LLM 生成文本（非流式，无 function calling）
 *
 * 优先 LLM Gateway，fallback 到 z-ai-sdk
 */
  // eslint-disable-next-line require-await -- async for API consistency
export async function createLLMCompletion(
  messages: LLMMessage[],
  options?: LLMCompletionOptions,
): Promise<string> {
  // 1. 优先 LLM Gateway
  if (isGatewayAvailable()) {
    return callGateway(messages, options);
  }

  // 2. Fallback: z-ai-sdk
  return callZAI(messages, options);
}

// ============================================================
// 非流式调用（支持 function calling）
// ============================================================

/**
 * 调用 LLM 生成文本（非流式，支持 function calling）
 *
 * 当 tools 非空时，返回值可能含 toolCalls。
 * 调用方负责执行工具后，再次调用本函数生成最终回复。
 *
 * @param useGateway 强制走 Gateway 或 ZAI。不传则自动判断（Gateway 优先）
 */
  // eslint-disable-next-line require-await -- async for API consistency
export async function createLLMCompletionWithTools(
  messages: LLMMessage[],
  options?: LLMCompletionWithToolsOptions,
): Promise<LLMCompletionResult> {
  const useGateway = options?.useGateway ?? isGatewayAvailable();

  if (useGateway) {
    return callGatewayWithTools(messages, options);
  }

  return callZAIWithTools(messages, options);
}

// ============================================================
// 流式调用
// ============================================================

/**
 * 调用 LLM 生成文本（流式）
 *
 * 优先 LLM Gateway，fallback 到 z-ai-sdk
 * 返回 ReadableStream<Uint8Array>（原始 SSE 流）
 */
  // eslint-disable-next-line require-await -- async for API consistency
export async function createLLMStream(
  messages: LLMMessage[],
  options?: LLMCompletionOptions,
): Promise<ReadableStream<Uint8Array>> {
  // 1. 优先 LLM Gateway
  if (isGatewayAvailable()) {
    return streamGateway(messages, options);
  }

  // 2. Fallback: z-ai-sdk
  return streamZAI(messages, options);
}

// ============================================================
// LLM Gateway 实现
// ============================================================

async function callGateway(
  messages: LLMMessage[],
  options?: LLMCompletionOptions,
): Promise<string> {
  const url = `${LLM_CONFIG.gatewayUrl}/v1/chat/completions`;
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${LLM_CONFIG.gatewayKey}`,
    },
    body: JSON.stringify({
      model: LLM_CONFIG.model,
      messages,
      temperature: options?.temperature ?? LLM_CONFIG.temperature,
      max_tokens: options?.maxTokens ?? LLM_CONFIG.maxTokens,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`LLM Gateway error ${response.status}: ${errorText}`);
  }

  const data = await response.json();
  return data.choices?.[0]?.message?.content || '';
}

async function callGatewayWithTools(
  messages: LLMMessage[],
  options?: LLMCompletionWithToolsOptions,
): Promise<LLMCompletionResult> {
  const url = `${LLM_CONFIG.gatewayUrl}/v1/chat/completions`;
  const body: Record<string, unknown> = {
    model: LLM_CONFIG.model,
    messages,
    temperature: options?.temperature ?? LLM_CONFIG.temperature,
    max_tokens: options?.maxTokens ?? LLM_CONFIG.maxTokens,
  };

  if (options?.tools && options.tools.length > 0) {
    body.tools = options.tools;
    body.tool_choice = options.toolChoice || 'auto';
  }

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${LLM_CONFIG.gatewayKey}`,
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`LLM API error ${response.status}: ${errorText.substring(0, 200)}`);
  }

  const data = await response.json();
  const choice = data.choices?.[0];
  const message = choice?.message;

  return {
    content: message?.content || '',
    toolCalls: message?.tool_calls?.length > 0 ? message.tool_calls : undefined,
  };
}

async function streamGateway(
  messages: LLMMessage[],
  options?: LLMCompletionOptions,
): Promise<ReadableStream<Uint8Array>> {
  const url = `${LLM_CONFIG.gatewayUrl}/v1/chat/completions`;
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${LLM_CONFIG.gatewayKey}`,
    },
    body: JSON.stringify({
      model: LLM_CONFIG.model,
      messages,
      temperature: options?.temperature ?? LLM_CONFIG.temperature,
      max_tokens: options?.maxTokens ?? LLM_CONFIG.maxTokens,
      stream: true,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`LLM Gateway stream error ${response.status}: ${errorText}`);
  }

  if (!response.body) {
    throw new Error('LLM Gateway returned no body for stream');
  }

  return response.body;
}

// ============================================================
// z-ai-sdk 实现
// ============================================================

async function callZAI(
  messages: LLMMessage[],
  options?: LLMCompletionOptions,
): Promise<string> {
  try {
    // 🔧 ARCH fix (Round 78 — ZAI SDK `as any` 类型安全漏洞):
    //    旧代码: `(zai.chat.completions.create as any)({...})` — SDK 返回 any, 字段访问无类型检查
    //    修复: 用 callZAIChatCompletion typed wrapper, 返回 ZAIChatCompletionResponse
    const completion = await callZAIChatCompletion(messages, {
      temperature: options?.temperature ?? LLM_CONFIG.temperature,
      maxTokens: options?.maxTokens ?? LLM_CONFIG.maxTokens,
    });

    return completion.choices?.[0]?.message?.content || '';
  } catch (err) {
    logger.error('[LLM Client] z-ai-sdk call failed:', err instanceof Error ? err.message : err);
    throw err;
  }
}

async function callZAIWithTools(
  messages: LLMMessage[],
  options?: LLMCompletionWithToolsOptions,
): Promise<LLMCompletionResult> {
  try {
    // 🔧 ARCH fix (Round 78): 用 typed wrapper 替代 `as any`
    const completion = await callZAIChatCompletion(messages, {
      temperature: options?.temperature ?? LLM_CONFIG.temperature,
      maxTokens: options?.maxTokens ?? LLM_CONFIG.maxTokens,
      tools: options?.tools,
      toolChoice: options?.toolChoice,
    });

    const choice = completion.choices?.[0];
    const message: ZAIChatMessage | undefined = choice?.message;

    const toolCalls: ZAIToolCall[] | undefined = message?.tool_calls;
    const hasToolCalls = Array.isArray(toolCalls) && toolCalls.length > 0;

    return {
      content: message?.content || '',
      toolCalls: hasToolCalls ? toolCalls : undefined,
    };
  } catch (err) {
    logger.error('[LLM Client] z-ai-sdk call with tools failed:', err instanceof Error ? err.message : err);
    throw err;
  }
}

async function streamZAI(
  messages: LLMMessage[],
  options?: LLMCompletionOptions,
): Promise<ReadableStream<Uint8Array>> {
  try {
    // 🔧 ARCH fix (Round 78): 用 typed wrapper 替代 `as any`
    //    callZAIChatCompletionStream 返回 ReadableStream<Uint8Array> (raw SSE byte stream)
    return await callZAIChatCompletionStream(messages, {
      temperature: options?.temperature ?? LLM_CONFIG.temperature,
      maxTokens: options?.maxTokens ?? LLM_CONFIG.maxTokens,
    });
  } catch (err) {
    logger.error('[LLM Client] z-ai-sdk stream failed:', err instanceof Error ? err.message : err);
    throw err;
  }
}
