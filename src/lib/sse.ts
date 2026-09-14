// ============================================================
// SSE (Server-Sent Events) 公共编码原语
// ============================================================
// 7 个 SSE 端点共用：chat / butterfly story / butterfly preload-branch /
// butterfly demo-story / mcp server / v1 chat completions / v1 openai chat completions
//
// 设计原则：只抽"真公共"的编码原语，不封装 ReadableStream 构造
// （各端点的 start/cancel/timeout/AbortController 逻辑差异大，强行统一会破坏语义）。
// 事件语义、心跳、超时、错误 payload 格式由各端点自行负责。
// ============================================================

import { logger } from '@/lib/logger';

/** 模块级共享 TextEncoder（无状态，可安全共享，避免每个端点各自 new） */
const encoder = new TextEncoder();

/** SSE 响应标准 headers（Content-Type / Cache-Control / Connection / X-Accel-Buffering 四件套） */
export const SSE_HEADERS = {
  'Content-Type': 'text/event-stream',
  'Cache-Control': 'no-cache',
  'Connection': 'keep-alive',
  // 🔧 ARCH fix (O3 — missing X-Accel-Buffering):
  //    Nginx (和 Vercel edge) 默认缓冲 SSE 响应, 破坏实时流式。
  //    X-Accel-Buffering: no 告诉 Nginx 不缓冲此响应。
  'X-Accel-Buffering': 'no',
} as const;

/**
 * 编码并 enqueue 一条 `data:` 事件。
 *
 * ⚠️ 双编码风险（最重要）— 调用约定：
 * - 传 **对象** → 内部 JSON.stringify（如 `sendSSEData(ctrl, {type:'error',...})`）
 * - 传 **字符串** → 原样拼接（如 `sendSSEData(ctrl, '[DONE]')`）
 * - ⛔ **绝不**传 `JSON.stringify(x)` 的结果（会被当字符串原样输出，带引号，造成双编码）
 *
 * 改造对应关系：
 * - `encoder.encode(`data: ${JSON.stringify(x)}\n\n`)` → `sendSSEData(ctrl, x)`  // x 是对象
 * - `encoder.encode('data: [DONE]\n\n')`              → `sendSSEData(ctrl, '[DONE]')`
 * - `encoder.encode(`data: ${someStr}\n\n`)`           → `sendSSEData(ctrl, someStr)`  // 已是字符串
 *
 * ⛔ 绝不用于转发原始 Uint8Array（如 chat/route.ts 的 token 转发），
 * 那是已编码字节流，直接 `controller.enqueue(value)`，用本函数会二次编码破坏流。
 */
export function sendSSEData(
  controller: ReadableStreamDefaultController<Uint8Array>,
  data: unknown,
): void {
  const payload = typeof data === 'string' ? data : JSON.stringify(data);
  controller.enqueue(encoder.encode(`data: ${payload}\n\n`));
}

/**
 * 编码并 enqueue 一条带 `event:` 字段的事件（mcp/server 的 ping 心跳用）。
 *
 * 输出格式（逐字节）：
 *   `event: <event>\ndata: <payload>\n\n`
 *
 * 其中 payload 同 sendSSEData 的字符串/对象规则。
 * mcp ping 调用：`sendSSEEvent(ctrl, 'ping', {})` → `event: ping\ndata: {}\n\n`
 */
export function sendSSEEvent(
  controller: ReadableStreamDefaultController<Uint8Array>,
  event: string,
  data: unknown,
): void {
  const payload = typeof data === 'string' ? data : JSON.stringify(data);
  controller.enqueue(encoder.encode(`event: ${event}\ndata: ${payload}\n\n`));
}

/**
 * 安全关闭 SSE 流。
 *
 * 仅吞 "流已关闭" 类异常（重复 close / controller 已被 cancel）。
 * 其他异常理论上不会从 close() 抛出，但保留 catch 以防边界情况。
 * 用 debug 级日志记录，便于排查（生产环境默认不输出 debug）。
 */
export function closeSSE(
  controller: ReadableStreamDefaultController<Uint8Array>,
): void {
  try {
    controller.close();
  } catch (err) {
    // 仅吞 "流已关闭" 类异常（重复 close / 已 cancel）
    logger.debug('[sse] closeSSE swallowed (stream likely already closed):', err);
  }
}
