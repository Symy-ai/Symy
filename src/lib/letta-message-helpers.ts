/**
 * Letta Message Helpers — Letta SDK 消息字段的统一提取层
 *
 * 🔧 ARCH fix (Round 78 — Letta SDK 类型安全漏洞):
 *    旧代码: letta.ts 中 5+ 处 `as unknown as Record<string, unknown>` 访问 SDK 字段
 *    根因: Letta SDK 的 response.messages 是 union type (AssistantMessage | ReasoningMessage
 *          | ToolCallMessage | ToolReturnMessage | ...)。message_type 是可选字面量,
 *          TS narrowing 在某些 access pattern 下失效, 开发者被迫写 `as unknown as Record`。
 *          同样的 cast 重复 5 次, SDK 升级时容易漏改。
 *
 *    修复: 本模块提供 3 个提取器, 封装 SDK 类型知识:
 *      - extractReasoning(msg)   — 提取 reasoning text (handles reasoning/content fallback)
 *      - extractToolCall(msg)    — 提取 tool_call 详情 (name/id/args)
 *      - extractToolReturn(msg)  — 提取 tool_return 详情 (name/id/content)
 *
 *    架构收益:
 *      1. SDK 字段名变化只改一处 (如 reasoning → hidden_reasoning)
 *      2. tool_call_id 配对逻辑统一 (Round 19 H1-audit1 修复)
 *      3. tool arguments JSON.parse 失败的容错统一 (Round 19 BUG-29 修复)
 *      4. 业务代码只关心结构化结果, 不关心 SDK 字段名
 *
 * 用法:
 *   for (const msg of response.messages) {
 *     if (msg.message_type === 'reasoning_message') {
 *       const text = extractReasoning(msg);
 *       ...
 *     } else if (msg.message_type === 'tool_call_message') {
 *       const call = extractToolCall(msg);
 *       if (call) { ... }
 *     }
 *   }
 */

/**
 * 从 Letta ReasoningMessage 提取 reasoning 文本。
 *
 * SDK 类型声明 `reasoning: string` (必填), 但实际运行时:
 * - 部分 SDK 版本返回 `reasoning` 字段
 * - 部分 hidden_reasoning 场景返回 `hidden_reasoning` 字段
 * - 兜底: 尝试 `content` (兼容旧版 SDK)
 *
 * 替代: `(msg as unknown as Record<string, unknown>).reasoning || (msg as unknown as Record<string, unknown>).content`
 */
export function extractReasoning(
  msg: { reasoning?: unknown; hidden_reasoning?: unknown; content?: unknown },
): string {
  // 优先 reasoning (SDK 主字段), 然后 hidden_reasoning (redacted 场景), 最后 content (旧版兼容)
  // content 可能是 string / Array<{text}> / number / boolean / object
  //   - string → 直接用
  //   - Array/Object → 跳过 (无法安全转 reasoning text)
  //   - number/boolean → String() 转换 (defensive, 不丢失信息)
  let raw: unknown = msg.reasoning ?? msg.hidden_reasoning;
  if (raw === undefined || raw === null) {
    raw = msg.content;
    // Array/Object content 不能安全转 reasoning text (会得到 '[object Object]' 或类似)
    if (typeof raw === 'object') {
      raw = '';
    }
  }

  if (typeof raw === 'string') return raw;
  if (raw === null || raw === undefined || raw === '') return '';
  // number/boolean 等 primitive — String() 转换 (defensive)
  return String(raw);
}

/**
 * 从 Letta ToolCallMessage 提取结构化 tool_call 信息。
 *
 * SDK 字段 (ToolCallMessage):
 *   - msg.tool_call: ToolCall | ToolCallDelta  (deprecated 但仍存在)
 *     - ToolCall:      { arguments: string, name: string, tool_call_id: string }
 *     - ToolCallDelta: { arguments?: string|null, name?: string|null, tool_call_id?: string|null }
 *   - msg.tool_calls?: Array<ToolCall> | ToolCallDelta | null  (新 multi-tool 格式)
 *   - msg.name?: string | null  (top-level, 与 tool_call.name 一致)
 *
 * 注意:
 *   - arguments 是 JSON 字符串 (非对象), 需要 JSON.parse (Round 19 BUG-29 修复)
 *   - tool_call_id 是配对 tool_return 的唯一标识 (Round 19 H1-audit1 修复)
 *   - ToolCallDelta 字段可能为 null, 需防御性访问
 *
 * 替代:
 *   const msgAny = msg as unknown as Record<string, unknown>;
 *   const toolCall = msgAny.tool_call as Record<string, unknown> | undefined;
 *   // 手写 JSON.parse + tool_call_id 提取 (重复 5+ 处)
 */
export function extractToolCall(
  msg: {
    tool_call?:
      | {
          arguments?: string | Record<string, unknown> | null;
          name?: string | null;
          tool_call_id?: string | null;
          id?: string;
        }
      | null;
    name?: string | null;
  },
): {
  name: string;
  toolCallId?: string;
  args?: Record<string, unknown>;
} | null {
  // 优先用 tool_call (deprecated 但仍是主字段), fallback msg.name (top-level)
  const toolCall = msg.tool_call;
  const name = toolCall?.name || msg.name || '';
  if (!name) return null;

  // tool_call_id 优先 (Letta SDK 唯一标识), fallback id (旧版兼容)
  const toolCallId = toolCall?.tool_call_id || toolCall?.id || undefined;

  // arguments 可能是 JSON string 或 object (SDK 版本不同), 也可能为 null (ToolCallDelta)
  const rawArgs = toolCall?.arguments;
  let parsedArgs: Record<string, unknown> | undefined;
  if (typeof rawArgs === 'string') {
    try {
      parsedArgs = JSON.parse(rawArgs) as Record<string, unknown>;
    } catch {
      // JSON 解析失败 — 保留原始字符串作为 fallback, 不丢失信息
      parsedArgs = { _raw: rawArgs };
    }
  } else if (typeof rawArgs === 'object' && rawArgs !== null) {
    parsedArgs = rawArgs as Record<string, unknown>;
  }

  return { name, toolCallId, args: parsedArgs };
}

/**
 * 从 Letta ToolReturnMessage 提取结构化 tool_return 信息。
 *
 * 🔧 ARCH fix (Round 78 — 修复 tool_return 静默丢失 bug):
 *    旧代码: `msgAny.tool_call` 访问 — 但 ToolReturnMessage 没有 tool_call 字段!
 *    SDK 实际字段 (ToolReturnMessage):
 *      - msg.tool_call_id: string  (top-level, deprecated 但存在)
 *      - msg.tool_return: string   (top-level, deprecated 但存在, return content)
 *      - msg.name?: string | null  (top-level, tool name)
 *      - msg.tool_returns?: Array<ToolReturn> | null  (新 multi-tool 格式)
 *    没有 msg.tool_call 嵌套对象 → 旧代码 toolCall=undefined → toolName='' → 整个分支死代码!
 *    后果: tool_return content 从未传递给前端, 用户看不到工具执行结果。
 *
 * 修复: 用正确的 top-level 字段 (name + tool_call_id + tool_return),
 *       兼容旧代码尝试的 tool_call 嵌套 (defensive, 万一 SDK 回退)。
 *
 * 替代:
 *   const msgAny = msg as unknown as Record<string, unknown>;
 *   const toolCall = msgAny.tool_call as Record<string, unknown> | undefined;
 *   // ↑ BUG: ToolReturnMessage 没有 tool_call 字段, toolCall 永远 undefined
 */
export function extractToolReturn(
  msg: {
    // ✅ 正确的 SDK 字段 (ToolReturnMessage):
    name?: string | null;
    tool_call_id?: string;
    tool_return?: unknown; // string 或 array (multi-tool 时是数组)
    tool_returns?: Array<{
      tool_call_id?: string;
      tool_return?: unknown;
    }> | null;
    // 🛡️ Defensive: 旧 SDK 版本可能有 tool_call 嵌套 (实际上 ToolReturnMessage 没有, 但保留以防 SDK 回退)
    tool_call?: {
      name?: string | null;
      tool_call_id?: string | null;
      id?: string;
    } | null;
    content?: unknown;
  },
): {
  name: string;
  toolCallId?: string;
  content: string;
} | null {
  // 1. 优先用 top-level name (SDK ToolReturnMessage 的标准字段)
  //    Fallback: msg.tool_call?.name (defensive, 旧 SDK 版本)
  const name = msg.name || msg.tool_call?.name || '';
  if (!name) return null;

  // 2. tool_call_id: top-level 优先, fallback tool_call.tool_call_id
  const toolCallId = msg.tool_call_id || msg.tool_call?.tool_call_id || msg.tool_call?.id || undefined;

  // 3. content: 优先 tool_return (top-level, deprecated 但存在),
  //    fallback content (旧版 SDK 或 streaming 兼容),
  //    fallback tool_returns[0].tool_return (multi-tool 格式)
  const rawContent = msg.tool_return ?? msg.content ?? msg.tool_returns?.[0]?.tool_return;
  let content = '';
  if (typeof rawContent === 'string') {
    content = rawContent;
  } else if (Array.isArray(rawContent)) {
    // MCP 工具返回格式: [{type: 'text', text: '...'}]
    for (const part of rawContent) {
      if (
        typeof part === 'object' &&
        part !== null &&
        'text' in part &&
        typeof (part as Record<string, unknown>).text === 'string'
      ) {
        content += (part as Record<string, unknown>).text as string;
      }
    }
  }

  return { name, toolCallId, content };
}

/**
 * 从 Letta 流式 event 提取 reasoning 文本。
 *
 * 流式 event 类型与非流式 message 类似, 但字段访问模式不同 (event vs msg)。
 * 此函数复用 extractReasoning 的逻辑, 但接受流式 event 类型。
 *
 * 替代:
 *   const eventAny = event as unknown as Record<string, unknown>;
 *   const reasoningText = typeof eventAny.reasoning === 'string' ? eventAny.reasoning :
 *                         typeof eventAny.content === 'string' ? eventAny.content : '';
 */
export function extractReasoningFromEvent(
  event: { reasoning?: unknown; hidden_reasoning?: unknown; content?: unknown },
): string {
  return extractReasoning(event);
}

/**
 * 从 Letta 流式 event 提取 tool_call 详情。
 *
 * 流式 event 的 tool_call 字段结构与非流式 message 相同。
 */
export function extractToolCallFromEvent(
  event: {
    tool_call?:
      | {
          arguments?: string | Record<string, unknown> | null;
          name?: string | null;
          tool_call_id?: string | null;
          id?: string;
        }
      | null;
    name?: string | null;
  },
): { name: string; toolCallId?: string; args?: Record<string, unknown> } | null {
  return extractToolCall(event);
}

/**
 * 从 Letta 流式 event 提取 tool_return 详情。
 */
export function extractToolReturnFromEvent(
  event: {
    name?: string | null;
    tool_call_id?: string;
    tool_return?: unknown;
    tool_returns?: Array<{
      tool_call_id?: string;
      tool_return?: unknown;
    }> | null;
    tool_call?: {
      name?: string | null;
      tool_call_id?: string | null;
      id?: string;
    } | null;
    content?: unknown;
  },
): { name: string; toolCallId?: string; content: string } | null {
  return extractToolReturn(event);
}
