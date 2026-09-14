/**
 * commitment-turn — 绿色承诺登记轮 (服务端 part, batch53-a)
 *
 * 用户消息命中 commitment-detector ("这个月不买咖啡 / 先忍 30 天不买游戏") 时,
 * 不调 Letta (口头承诺需要的是登记结构, 不是泛泛鼓励), 直接返回 canned 迎接
 * 回复 + 承诺登记卡:
 *   - 迎接话术取 elephant-tone 的 commitment_welcome 场景 (郑重收下, 不说教)
 *   - 登记卡 payload 只含对象原词 + 默认时长, 确认与改时长都在卡内完成
 *
 * 与 prepurchase-turn 同路数: 命中即 canned reply 短路返回。区别: 本流是
 * 用户主动承诺 (第一人称陈述句), 与求问 (50-a) / 反驳 (48-b) 意图互斥
 * (互斥由 commitment-detector 的排除模式保证)。
 */

import { detectCommitment } from '@/lib/commitment-detector';
import { getElephantPhrase } from '@/lib/elephant-tone';
import type { CommitmentCardData } from '@/types/commitment';

export interface CommitmentTurn {
  reply: string;
  commitmentCard: CommitmentCardData;
}

export interface BuildCommitmentTurnInput {
  userContent: string;
  locale: 'en' | 'zh';
  /** 测试可注入 rng, 让话术轮换确定 */
  rng?: () => number;
}

/**
 * 命中承诺轮时返回 {reply, commitmentCard}, 否则 null。
 * 纯函数: 检测 + 取词, 不读库不调外部服务。
 */
export function buildCommitmentTurn(input: BuildCommitmentTurnInput): CommitmentTurn | null {
  const { userContent, locale, rng } = input;
  const intent = detectCommitment(userContent);
  if (!intent) return null;

  return {
    reply: getElephantPhrase('commitment_welcome', locale, undefined, rng),
    commitmentCard: { subject: intent.subject, durationKind: intent.durationKind, days: intent.days },
  };
}

/** commitment_card SSE 事件的 payload 形状 (consume-ai-stream 按 type 分发) */
export interface CommitmentSseEvent {
  type: 'commitment_card';
  commitmentCard: CommitmentCardData;
}

export function commitmentSseEvent(card: CommitmentCardData): CommitmentSseEvent {
  return { type: 'commitment_card', commitmentCard: card };
}

/**
 * 承诺轮的 canned SSE 流: 先发登记卡事件 (卡片先渲染), 再分块发迎接回复
 * (模拟 typing), 最后 done。与 prepurchase canned stream 同构。
 */
export function buildCommitmentSseStream(turn: CommitmentTurn): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  const chunks = turn.reply.match(/.{1,15}/g) || [turn.reply];
  return new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(
        encoder.encode(`data: ${JSON.stringify(commitmentSseEvent(turn.commitmentCard))}\n\n`),
      );
      for (const chunk of chunks) {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'token', content: chunk })}\n\n`));
      }
      controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'done' })}\n\n`));
      controller.close();
    },
  });
}
