/**
 * prepurchase-turn — 买前三问轮 (服务端 part, batch50-a)
 *
 * 用户主动求问 ("该买 X 吗") 命中 prepurchase-detect 时, 不调 Letta (泛泛建议
 * 无结构化引导), 直接返回 canned 迎接回复 + 三问决策卡:
 *   - 迎接话术取 elephant-tone 的 prepurchase_welcome 场景 (陪伴感: 陪你一起想清楚)
 *   - 决策卡 payload 只含物品主题 (识别不出为 null), 前端渲染三问 + 三选项
 *
 * 与 cooldown-turn 同路数: 命中即 canned reply 短路返回。区别: 本流是用户主动
 * 求问 (任何守护开关下都应答 — 用户来问就陪), 48-b 是拦截后的反驳降温。
 */

import { detectPrepurchaseIntent } from '@/lib/prepurchase-detect';
import { getElephantPhrase } from '@/lib/elephant-tone';
import type { PrepurchaseCardData } from '@/types/prepurchase';

export interface PrepurchaseTurn {
  reply: string;
  prepurchaseCard: PrepurchaseCardData;
}

export interface BuildPrepurchaseTurnInput {
  userContent: string;
  locale: 'en' | 'zh';
  /** 测试可注入 rng, 让话术轮换确定 */
  rng?: () => number;
}

/**
 * 命中买前三问轮时返回 {reply, prepurchaseCard}, 否则 null。
 * 纯函数: 检测 + 取词, 不读库不调外部服务。
 */
export function buildPrepurchaseTurn(input: BuildPrepurchaseTurnInput): PrepurchaseTurn | null {
  const { userContent, locale, rng } = input;
  const intent = detectPrepurchaseIntent(userContent);
  if (!intent) return null;

  return {
    reply: getElephantPhrase('prepurchase_welcome', locale, undefined, rng),
    prepurchaseCard: { subject: null },
  };
}

/** prepurchase_card SSE 事件的 payload 形状 (consume-ai-stream 按 type 分发) */
export interface PrepurchaseSseEvent {
  type: 'prepurchase_card';
  prepurchaseCard: PrepurchaseCardData;
}

export function prepurchaseSseEvent(card: PrepurchaseCardData): PrepurchaseSseEvent {
  return { type: 'prepurchase_card', prepurchaseCard: card };
}

/**
 * 三问轮的 canned SSE 流: 先发决策卡事件 (卡片先渲染, 三问在卡内逐条展开),
 * 再分块发迎接回复 (模拟 typing), 最后 done。与 cooldown canned stream 同构。
 */
export function buildPrepurchaseSseStream(turn: PrepurchaseTurn): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  const chunks = turn.reply.match(/.{1,15}/g) || [turn.reply];
  return new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(
        encoder.encode(`data: ${JSON.stringify(prepurchaseSseEvent(turn.prepurchaseCard))}\n\n`),
      );
      for (const chunk of chunks) {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'token', content: chunk })}\n\n`));
      }
      controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'done' })}\n\n`));
      controller.close();
    },
  });
}
