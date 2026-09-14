/**
 * green-alt-detect — 非绿替代拦截→推荐的 API 侧预检 (纯函数 + SSE 事件包装)
 *
 * chat route 在发 Letta 前对用户消息做关键词预检 (green-alternatives 词库):
 * - 绿色守护开关 greenPref === 'off' → 整体静默 (不扫词库, 零开销)
 * - 未命中 → 返回 null, 响应不带 green_alt 标记 (零额外负载, 流原样透传)
 * - 命中 → 返回卡片 payload:
 *     流式路径在 SSE 流最前面注入 green_alt 事件 (前端 consumeAIStream 消费),
 *     非流式路径在 JSON 响应带 greenAlt 字段。
 *   Letta prompt 结构不动 — 卡片是路由层叠加, 不是 prompt 注入。
 */

import { suggestAlternativeWithPreference } from '@/lib/green-alt-preference-rank';
import type { GreenAltPreferenceState } from '@/lib/green-alt-preference';
import type { GreenLocale } from '@/lib/green-alt-types';
import type { GreenAltCardData } from '@/types/green-alt-card';

/**
 * 关键词预检: 命中则给绿色替代卡片 payload, 未命中/开关关 → null。
 * 纯函数, 同步返回 — 预检不增加任何异步等待。
 * 🐘 batch62-b: preferences 为最近一次调用解析出的拒绝偏好 (可选) —
 * 命中词条按冷却/降频重排 (不减员, 显式问起仍返回); 缺省时与基线完全一致。
 */
export function detectGreenAltCard(
  userContent: string,
  locale: GreenLocale,
  greenPref: 'on' | 'off' | undefined,
  preferences?: GreenAltPreferenceState | null,
): GreenAltCardData | null {
  if (greenPref === 'off') return null;
  const hit = suggestAlternativeWithPreference(userContent, locale, preferences ?? undefined);
  if (!hit) return null;
  return {
    id: hit.id,
    why: hit.why,
    options: [...hit.options],
    reuse: hit.reuse,
    reuseChannel: hit.reuseChannel,
  };
}

/** 前端 SSE green_alt 事件字节 (data: {...}\n\n) */
export function greenAltSseEvent(payload: GreenAltCardData): Uint8Array {
  const event = JSON.stringify({ type: 'green_alt', greenAlt: payload });
  return new TextEncoder().encode(`data: ${event}\n\n`);
}

/**
 * 命中时在流最前面注入 green_alt 事件, 之后逐字节透传 Letta 原始流;
 * 未命中原样返回 inner (零包装开销)。
 */
export function withGreenAltEvent(
  inner: ReadableStream<Uint8Array>,
  payload: GreenAltCardData | null,
): ReadableStream<Uint8Array> {
  if (!payload) return inner;

  const event = greenAltSseEvent(payload);
  return new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(event);
      const reader = inner.getReader();
      const pump = async () => {
        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            controller.enqueue(value);
          }
          controller.close();
        } catch (err) {
          controller.error(err);
        }
      };
      void pump();
    },
    cancel(reason) {
      return inner.cancel(reason);
    },
  });
}
