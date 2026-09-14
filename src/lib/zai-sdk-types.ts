/**
 * ZAI SDK Typed Wrappers — ZAI SDK 响应的统一类型层
 *
 * 🔧 ARCH fix (Round 78 — ZAI SDK `as any` 类型安全漏洞):
 *    旧代码: llm-client.ts 中 3 处 `(zai.chat.completions.create as any)({...})`
 *    根因: ZAI SDK 的 `chat.completions.create: (body) => Promise<any>`
 *          返回类型是 any, 任何字段访问都不报错。开发者用 `as any` 绕过调用签名,
 *          但响应仍是 any — 字段名拼错 (choise vs choice) 不会编译报错。
 *
 *    修复: 本模块定义 ZAI SDK 响应的 typed interface, 并提供 typed 调用函数:
 *      - ZAIChatCompletionResponse — 非流式响应类型 (choices/message/content/tool_calls)
 *      - callZAIChatCompletion(messages, options) — 返回 typed response
 *      - callZAIChatCompletionStream(messages, options) — 返回 typed stream
 *
 *    架构收益:
 *      1. 字段名拼错编译报错 (choices vs choise)
 *      2. tool_calls 类型完整 (id/type/function.name/function.arguments)
 *      3. SDK 响应形状变化时, 改一处 interface 即可发现所有 break
 *      4. 业务代码不直接调 SDK, 只调 typed wrapper
 *
 * 用法:
 *   import { callZAIChatCompletion } from '@/lib/zai-sdk-types';
 *
 *   const completion = await callZAIChatCompletion(messages, { temperature: 0.7 });
 *   const text = completion.choices[0]?.message?.content ?? '';
 */

import { createZAIClient } from '@/lib/z-ai-config';

// ============================================================
// ZAI SDK Response Types (镜像 OpenAI Chat Completion API)
// ============================================================

export interface ZAIToolCall {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string; // JSON string, 调用方需 JSON.parse
  };
}

export interface ZAIChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string | null;
  tool_calls?: ZAIToolCall[];
}

export interface ZAIChatChoice {
  index: number;
  message: ZAIChatMessage;
  finish_reason: 'stop' | 'length' | 'tool_calls' | 'content_filter' | null;
}

export interface ZAIChatCompletionResponse {
  id: string;
  object: 'chat.completion';
  created: number;
  model: string;
  choices: ZAIChatChoice[];
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

export interface ZAIChatCompletionChunk {
  id: string;
  object: 'chat.completion.chunk';
  created: number;
  model: string;
  choices: Array<{
    index: number;
    delta: {
      role?: ZAIChatMessage['role'];
      content?: string | null;
      tool_calls?: ZAIToolCall[];
    };
    finish_reason: 'stop' | 'length' | 'tool_calls' | 'content_filter' | null;
  }>;
}

// ============================================================
// Typed Call Functions
// ============================================================

export interface ZAICallOptions {
  temperature?: number;
  maxTokens?: number;
  tools?: Array<{
    type: 'function';
    function: {
      name: string;
      description: string;
      parameters: Record<string, unknown>;
    };
  }>;
  toolChoice?: 'auto' | 'none' | { type: 'function'; function: { name: string } };
}

/**
 * 调用 ZAI SDK chat.completions.create, 返回 typed response。
 *
 * 替代:
 *   const completion = await (zai.chat.completions.create as any)({ ... });
 *   const text = completion.choices?.[0]?.message?.content || '';  // any access, no type check
 *
 * 现在:
 *   const completion = await callZAIChatCompletion(messages, { temperature: 0.7 });
 *   const text = completion.choices[0]?.message?.content ?? '';  // typed, type-checked
 */
export async function callZAIChatCompletion(
  messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>,
  options?: ZAICallOptions,
): Promise<ZAIChatCompletionResponse> {
  const zai = await createZAIClient();

  // SDK 返回 any, 这里做单点 cast (集中类型断言, 业务代码无需重复)
  const params: Record<string, unknown> = {
    messages,
    temperature: options?.temperature,
    max_tokens: options?.maxTokens,
  };

  if (options?.tools && options.tools.length > 0) {
    params.tools = options.tools;
    params.tool_choice = options.toolChoice || 'auto';
  }

  // SDK 签名是 (body: CreateChatCompletionBody) => Promise<any>,
  // body 类型有 model?: string, [key: string]: any, 所以我们的 params 兼容。
  // 返回值 any → cast 到 typed response (单点 cast, 集中管理)
  return (await zai.chat.completions.create(
    params as Parameters<typeof zai.chat.completions.create>[0],
  )) as unknown as ZAIChatCompletionResponse;
}

/**
 * 调用 ZAI SDK chat.completions.create with stream=true, 返回 raw SSE byte stream。
 *
 * 🔧 ARCH fix (Round 78): SDK 实现里, 当 stream=true 且响应是 SSE 时, 返回 response.body
 *    (ReadableStream<Uint8Array>), 不是 AsyncIterable<chunk>。
 *    旧代码用 `as any` 调用, 返回类型是 any, 调用方无法知道实际是 byte stream。
 *
 * 替代:
 *   const stream = await (zai.chat.completions.create as any)({ ..., stream: true });
 *   // stream 类型是 any, 实际是 ReadableStream<Uint8Array> | null
 *
 * 现在:
 *   const stream = await callZAIChatCompletionStream(messages, { temperature: 0.7 });
 *   // stream 类型是 ReadableStream<Uint8Array>, 类型安全
 *
 * 调用方需自己解析 SSE 事件 (data: ...\n\n), 见 consume-ai-stream.ts
 */
export async function callZAIChatCompletionStream(
  messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>,
  options?: ZAICallOptions,
): Promise<ReadableStream<Uint8Array>> {
  const zai = await createZAIClient();

  const params: Record<string, unknown> = {
    messages,
    temperature: options?.temperature,
    max_tokens: options?.maxTokens,
    stream: true,
  };

  // SDK 返回 any (实际是 ReadableStream<Uint8Array> | null, 见 z-ai-web-dev-sdk 源码),
  // cast 到 typed ReadableStream<Uint8Array>。若 SDK 返回 null (罕见), 抛错让调用方处理。
  const stream = await zai.chat.completions.create(
    params as Parameters<typeof zai.chat.completions.create>[0],
  );
  if (!stream) {
    throw new Error('[zai-sdk-types] ZAI SDK returned null stream');
  }
  return stream as unknown as ReadableStream<Uint8Array>;
}
