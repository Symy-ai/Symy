/**
 * story-engine — 流式转换 + SSE 行解析辅助（从 story-engine.ts 抽出，C6 拆分）
 *
 * 纯函数/无状态闭包，行为零变化。
 */

import { logger } from '@/lib/logger';
import { cleanAgentReply } from './prompts';

/**
 * 将 Letta Agent 的 SSE 流转换为蝴蝶效应故事事件流
 *
 * Letta SSE 事件格式:
 * - data: {"type":"reasoning","content":"..."}  — Agent 内部推理
 * - data: {"type":"token","content":"..."}       — 回复 token
 * - data: {"type":"tool_call","tool":"..."}      — 工具调用
 * - data: {"type":"tool_result","tool":"..."}    — 工具结果
 * - data: {"type":"done"}                         — 结束
 *
 * 蝴蝶效应 SSE 事件格式:
 * - data: {"type":"chapter_text","data":{"chapterIndex":N,"text":"..."}}  — 章节文本
 * - data: {"type":"chapter_end","data":{"chapterIndex":N,"fullText":"..."}}  — 章节结束
 */
export function transformLettaStreamToStoryStream(
  lettaStream: ReadableStream<Uint8Array>,
  chapterIndex: number,
): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();
  // 🔧 2026-07-15 (ARCH-8 #2): 提升 reader 到 outer scope 供 cancel() 访问
  const reader = lettaStream.getReader();

  return new ReadableStream<Uint8Array>({
    async start(controller) {
      let fullText = '';
      let lineBuffer = ''; // 行缓冲 — 防止 SSE 事件跨 chunk 被截断

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          const chunk = decoder.decode(value, { stream: true });
          lineBuffer += chunk;

          // 按行分割，保留最后不完整的行
          const lines = lineBuffer.split('\n');
          lineBuffer = lines.pop() || '';

          for (const line of lines) {
            // 检查是否有工具调用事件
            if (isToolCallEvent(line)) {
              logger.warn('[Butterfly Engine] Tool call detected in stream — Agent may have violated the no-tool instruction');
              // 不中断流，但 cleanAgentReply 会在 chapter_end 时清理 fullText (Round 19 H2-audit2)
              continue;
            }

            const text = extractTextFromLettaSSELine(line);
            if (text) {
              fullText += text;
              const event = {
                type: 'chapter_text',
                data: { chapterIndex, text },
              };
              controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
            }
          }
        }

        // 处理剩余缓冲
        if (lineBuffer.trim()) {
          if (!isToolCallEvent(lineBuffer)) {
            const text = extractTextFromLettaSSELine(lineBuffer);
            if (text) {
              fullText += text;
              const event = {
                type: 'chapter_text',
                data: { chapterIndex, text },
              };
              controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
            }
          }
        }

        // 🔧 ARCH fix (Round 19 H2-audit2 — chapter_text raw vs chapter_end cleaned):
        //    旧代码仅在 toolCallDetected=true 时调 cleanAgentReply(fullText, 'prose')。
        //    但 AI 也可能在 assistant_message 内容里直接输出 ```json ... ``` 代码块
        //    (不调工具, 只是"展示工作"), 此时 toolCallDetected 保持 false,
        //    cleanAgentReply 不被调用 → fullText 包含 raw markdown 包装。
        //    根因修复: 总是调 cleanAgentReply, 确保 chapter_end fullText 与 UI 显示一致。
        //    (per-chunk 清理不可行 — regex 跨行匹配; chapter_end 时一次性清理即可)
        fullText = cleanAgentReply(fullText, 'prose');

        // 流结束 — 发送 chapter_end 事件
        const endEvent = {
          type: 'chapter_end',
          data: { chapterIndex, fullText },
        };
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(endEvent)}\n\n`));

        controller.close();
      } catch (err) {
        // M2 fix: 释放上游 reader，防止资源泄漏
        try { reader.cancel(); } catch { /* already cancelled */ }
        // 🔧 ARCH fix (Round 19 H3-audit2 — controller.enqueue after error can throw):
        //    旧代码: catch 块内裸调 controller.enqueue + controller.close。
        //    若 controller 已被上游 close (consumer disconnect / timeout),
        //    enqueue 抛 TypeError → unhandled promise rejection → Vercel serverless 日志告警。
        //    根因修复: 包 try-catch (与 letta.ts:329-336 一致)。
        try {
          const errorEvent = {
            type: 'error',
            data: { message: err instanceof Error ? err.message : 'Stream error' },
          };
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(errorEvent)}\n\n`));
        } catch { /* controller already closed — suppress */ }
        try { controller.close(); } catch { /* controller already closed — suppress */ }
      }
    },
    // 🔧 2026-07-15 (ARCH-8 #2 修复): 添加 cancel() — 客户端断开时中止上游 Letta 流
    //    旧代码无 cancel() → 客户端断开后, reader.read() 继续消费 lettaStream
    //    → LLM 继续生成 token ($ cost leak, $0.04-0.17/chapter)
    //    修复: cancel 上游 reader, 让 for-await 循环抛 AbortError 走 catch 优雅退出
    cancel() {
      try { reader.cancel(); } catch { /* reader may be locked or already cancelled */ }
    },
  });
}

/**
 * 检测 SSE 行是否是工具调用/工具结果事件
 */
export function isToolCallEvent(line: string): boolean {
  const trimmed = line.trim();
  if (!trimmed.startsWith('data: ')) return false;

  const data = trimmed.slice(6).trim();
  if (!data || data === '[DONE]') return false;

  try {
    const parsed = JSON.parse(data);
    return parsed.type === 'tool_call' || parsed.type === 'tool_result';
      // safe to ignore: non-critical background operation, error already logged
  } catch {
            // safe to ignore: non-critical background operation, error already logged
    return false;
  }
}

/**
 * 从 Letta SSE 行中提取文本内容
 *
 * 只提取 type=token 的事件（Agent 的实际回复文本），
 * 忽略 reasoning、tool_call、tool_result 等事件
 */
export function extractTextFromLettaSSELine(line: string): string {
  const trimmed = line.trim();

  // 标准 SSE 格式：data: {...}
  if (trimmed.startsWith('data: ')) {
    const data = trimmed.slice(6).trim();
    if (!data || data === '[DONE]') return '';

    try {
      const parsed = JSON.parse(data);

      // Letta Agent 的 token 事件 — 这是实际的回复文本
      if (parsed.type === 'token' && typeof parsed.content === 'string') {
        return parsed.content;
      }

      // 忽略其他事件类型（reasoning, tool_call, tool_result, done, error）
      return '';
      // safe to ignore: non-critical background operation, error already logged
    } catch {
              // safe to ignore: non-critical background operation, error already logged
      // JSON 解析失败 — 不是有效的 SSE 事件
      return '';
    }
  }

  // 非 SSE 格式的行 — 忽略
  return '';
}

/**
 * 在句子边界处截断文本（M6 fix: 避免在单词或句子中间截断）
 */
export function truncateAtSentence(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text;
  // 在 maxLen 范围内找最后一个句号/问号/感叹号
  const lastSentenceEnd = text.lastIndexOf('.', maxLen);
  const lastQuestion = text.lastIndexOf('?', maxLen);
  const lastExclaim = text.lastIndexOf('!', maxLen);
  const bestEnd = Math.max(lastSentenceEnd, lastQuestion, lastExclaim);
  // 如果找到了句子结束（且在前半段），在那里截断
  if (bestEnd > maxLen * 0.4) {
    return text.substring(0, bestEnd + 1);
  }
  // 否则，在最后一个空格处截断
  const lastSpace = text.lastIndexOf(' ', maxLen);
  if (lastSpace > maxLen * 0.4) {
    return text.substring(0, lastSpace) + '...';
  }
  return text.substring(0, maxLen) + '...';
}
