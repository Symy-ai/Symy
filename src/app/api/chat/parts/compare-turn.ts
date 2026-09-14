/**
 * compare-turn — A vs B 对比裁决轮 (服务端 part, batch56-a)
 *
 * 用户消息命中 compare-detector ("买 iPad 还是安卓平板 / refurbished vs new")
 * 时, 不调 Letta (二选一需要的是裁决结构, 不是泛泛安利), 直接返回 canned 迎接
 * 回复 + 对比裁决卡:
 *   - 迎接话术取 elephant-tone 的 compare_welcome 场景 (帮做决定的绿色搭子)
 *   - 裁决卡 payload = 两侧对象原词 + 各侧 green-alt 词条命中 (suggestAlternative
 *     只读引用, 词条表不改); 双侧无据时卡面走中性引导, 不编造环保声明
 *
 * 与 commitment-turn 同路数: 命中即 canned reply 短路返回。互斥: 反驳 (48-b) /
 * 求问 (50-a) / 承诺 (53-a) 三流更强 (detector 内排除 + route 链序在后)。
 */

import { detectCompare } from '@/lib/compare-detector';
import { suggestAlternative } from '@/lib/green-alternatives';
import { getElephantPhrase } from '@/lib/elephant-tone';
import type { CompareCardData, CompareSideMatch } from '@/types/compare';

export interface CompareTurn {
  reply: string;
  compareCard: CompareCardData;
}

export interface BuildCompareTurnInput {
  userContent: string;
  locale: 'en' | 'zh';
  /** 测试可注入 rng, 让话术轮换确定 */
  rng?: () => number;
}

/** 单侧对象词的词条命中 → 卡面引用 (只摘 why/alternative/reuse, 不改词条) */
function matchSide(side: string, locale: 'en' | 'zh'): CompareSideMatch | null {
  const hit = suggestAlternative(side, locale);
  return hit ? { id: hit.id, why: hit.why, alternative: hit.alternative, reuse: hit.reuse } : null;
}

/**
 * 命中对比轮时返回 {reply, compareCard}, 否则 null。
 * 纯函数: 检测 + 词条查表, 不读库不调外部服务。
 */
export function buildCompareTurn(input: BuildCompareTurnInput): CompareTurn | null {
  const { userContent, locale, rng } = input;
  const intent = detectCompare(userContent);
  if (!intent) return null;

  return {
    reply: getElephantPhrase('compare_welcome', locale, undefined, rng),
    compareCard: {
      sideA: intent.sideA,
      sideB: intent.sideB,
      matchA: matchSide(intent.sideA, locale),
      matchB: matchSide(intent.sideB, locale),
    },
  };
}

/** compare_card SSE 事件的 payload 形状 (consume-ai-stream 按 type 分发) */
export interface CompareSseEvent {
  type: 'compare_card';
  compareCard: CompareCardData;
}

export function compareSseEvent(card: CompareCardData): CompareSseEvent {
  return { type: 'compare_card', compareCard: card };
}

/**
 * 对比轮的 canned SSE 流: 先发裁决卡事件 (卡片先渲染), 再分块发迎接回复
 * (模拟 typing), 最后 done。与 commitment canned stream 同构。
 */
export function buildCompareSseStream(turn: CompareTurn): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  const chunks = turn.reply.match(/.{1,15}/g) || [turn.reply];
  return new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(
        encoder.encode(`data: ${JSON.stringify(compareSseEvent(turn.compareCard))}\n\n`),
      );
      for (const chunk of chunks) {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'token', content: chunk })}\n\n`));
      }
      controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'done' })}\n\n`));
      controller.close();
    },
  });
}
