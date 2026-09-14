/**
 * green-knowledge-context — 知识问答的词条检索注入 (SSE 事件包装 + Letta 上下文块)
 *
 * 用户在 chat 里问绿色知识 ("refurb 值得买吗") 时, 从 green-alternatives 词条库
 * 检索匹配词条 (green-knowledge-query), 把 why/options/reuseChannel 组装成
 * [GREEN KNOWLEDGE: ...] 上下文块注入 Letta prompt, 并给前端 green_knowledge
 * 事件 (来源 chip)。
 *
 * 与 green-alt-detect (购买拦截) 互斥语义: 购买意图在 green-knowledge-query 层
 * 已让位 (返回 null), 本 part 无需再判断。绿色守护开关 greenPref === 'off' →
 * 整体静默 (不检索, 零开销)。
 */

import { GREEN_ALTERNATIVES } from '@/lib/green-alternatives';
import type { GreenLocale } from '@/lib/green-alt-types';
import { matchGreenKnowledge, greenKnowledgeLabel } from '@/lib/green-knowledge-query';
import type { GreenKnowledgeCardData } from '@/types/green-knowledge';

export interface GreenKnowledgeInjection {
  /** 注入 Letta prompt 的 [GREEN KNOWLEDGE: ...] 块; 未命中为 null */
  contextBlock: string | null;
  /** 前端来源 chip payload; 未命中为 null */
  card: GreenKnowledgeCardData | null;
}

/**
 * 知识问答检索注入: 命中词条 → 上下文块 + chip payload; 未命中/开关关 → 双 null。
 * 纯同步函数, 不增加任何异步等待。
 */
export function buildGreenKnowledge(
  userContent: string,
  locale: GreenLocale,
  greenPref: 'on' | 'off' | undefined,
): GreenKnowledgeInjection {
  if (greenPref === 'off') return { contextBlock: null, card: null };
  const hitIds = matchGreenKnowledge(userContent);
  if (!hitIds) return { contextBlock: null, card: null };

  const entries = hitIds
    .map((id) => GREEN_ALTERNATIVES.find((entry) => entry.id === id))
    .filter((entry): entry is NonNullable<typeof entry> => Boolean(entry));

  const contextBlock = [
    `[GREEN KNOWLEDGE: The user asked a knowledge question about these topics. Answer based ONLY on the entry content below.`,
    ...entries.map((entry) => {
      const label = greenKnowledgeLabel(entry.id, locale);
      return `Entry "${label}" — why: ${entry.why[locale]} | greener options: ${entry.options[locale].join('; ')} | reuse channels: ${entry.reuseChannel[locale]}`;
    }),
    `INSTRUCTION: Ground your answer in these entries. Do NOT invent carbon footprint numbers or any specific quantitative environmental figures — qualitative statements only.]`,
  ].join('\n');

  const card: GreenKnowledgeCardData = {
    entries: entries.map((entry) => ({
      id: entry.id,
      label: greenKnowledgeLabel(entry.id, locale),
      why: entry.why[locale],
      options: [...entry.options[locale]],
      reuseChannel: entry.reuseChannel[locale],
    })),
  };
  return { contextBlock, card };
}

/** 前端 SSE green_knowledge 事件字节 (data: {...}\n\n) */
export function greenKnowledgeSseEvent(payload: GreenKnowledgeCardData): Uint8Array {
  const event = JSON.stringify({ type: 'green_knowledge', greenKnowledge: payload });
  return new TextEncoder().encode(`data: ${event}\n\n`);
}

/**
 * 命中时在流最前面注入 green_knowledge 事件, 之后逐字节透传 Letta 原始流;
 * 未命中原样返回 inner (零包装开销)。
 */
export function withGreenKnowledgeEvent(
  inner: ReadableStream<Uint8Array>,
  payload: GreenKnowledgeCardData | null,
): ReadableStream<Uint8Array> {
  if (!payload) return inner;
  const event = greenKnowledgeSseEvent(payload);
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
