/**
 * SSE Stream Helper — Butterfly story route 共享
 *
 * 提取自 src/app/api/butterfly/story/route.ts (Round 79 拆分)
 * 创建简单的 SSE 流, 发送单个事件后自动关闭。
 */

import type { StoryEvent } from '@/features/butterfly/types';
import { sendSSEData, closeSSE } from '@/lib/sse';

/**
 * 创建简单的 SSE 流（发送单个事件后关闭）。
 *
 * 用法:
 *   const stream = createSSEStream(async (send) => {
 *     send({ type: 'story_complete', data: { ... } });
 *   });
 *   return new Response(stream, { headers: SSE_HEADERS });
 */
export function createSSEStream(
  onTick: (send: (event: StoryEvent) => void) => Promise<void>,
): ReadableStream<Uint8Array> {
  return new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: StoryEvent) => {
        sendSSEData(controller, event);
      };
      await onTick(send);
      closeSSE(controller);
    },
  });
}
