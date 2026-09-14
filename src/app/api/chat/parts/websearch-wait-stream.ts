/**
 * websearch-wait-stream — SSE 流中段注入全网搜索等待话术 (batch72-a, route parts 层)
 *
 * Letta 原生流逐行透传; 遇到 symy_search 的 tool_result 事件命中 web fallback
 * 触发线 (货架单薄 <2 卡 + websearch 标记) 时, 紧跟该事件插入一条 canned token
 * 事件 — 用户先看到等待话术, 不等 LLM。tool_return 先于 assistant token 到达,
 * 中段拦截正好落在两者之间。每条流至多发一次 (LLM 可能多次搜索, 话术只报一次)。
 *
 * 定位红线: 包在 wrapStreamWithAudit 之外 (canned 词不计入审计 aiOutput),
 * 在 reuse/green 等预注入包装之内 (事件相对顺序 tool_result → 等待话术 → 原生事件)。
 */

import { isWebSearchFallbackResult, type WebSearchWaitTurn } from '@/lib/websearch-wait-turn';

/**
 * 包装 Letta SSE 流。等待话术由 buildWebSearchWaitTurn 在构建期校验 i18n key。
 */
export function withWebSearchWaitEvent(
  inner: ReadableStream<Uint8Array>,
  turn: WebSearchWaitTurn,
): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  const waitEvent = encoder.encode(`data: ${JSON.stringify({ type: 'token', content: turn.reply })}\n\n`);
  let reader: ReadableStreamDefaultReader<Uint8Array> | null = null;

  return new ReadableStream<Uint8Array>({
    async start(controller) {
      reader = inner.getReader();
      const decoder = new TextDecoder();
      let lineBuffer = '';
      let fired = false;

      // 命中触发线的完整行 → 返回等待话术事件 (在该行字节之后注入); 否则 null
      const injectAfterLine = (line: string): Uint8Array | null => {
        if (fired || !line.startsWith('data: ')) return null;
        let parsed: Record<string, unknown>;
        try {
          parsed = JSON.parse(line.slice(6).trim()) as Record<string, unknown>;
        } catch {
          return null; // safe to ignore: 非 JSON 行透传即可, 不参与判定
        }
        if (parsed?.type !== 'tool_result') return null;
        if (
          !isWebSearchFallbackResult({
            toolName: typeof parsed.tool === 'string' ? parsed.tool : '',
            content: typeof parsed.content === 'string' ? parsed.content : null,
            structuredCards: parsed.cards,
          })
        ) {
          return null;
        }
        fired = true;
        return waitEvent;
      };

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          // 逐行缓冲: 只有完整行才参与判定与转发, 不完整行等下一个 chunk 补齐
          lineBuffer += decoder.decode(value, { stream: true });
          const lines = lineBuffer.split('\n');
          lineBuffer = lines.pop() ?? '';
          for (const line of lines) {
            controller.enqueue(encoder.encode(line + '\n'));
            const inject = injectAfterLine(line);
            if (inject) controller.enqueue(inject);
          }
        }
        const tail = decoder.decode();
        if (lineBuffer || tail) controller.enqueue(encoder.encode(lineBuffer + tail));
        controller.close();
      } catch (err) {
        controller.error(err);
      }
    },
    cancel(reason) {
      return reader?.cancel(reason) ?? inner.cancel(reason);
    },
  });
}
