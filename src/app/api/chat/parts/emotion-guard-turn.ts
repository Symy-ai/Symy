/**
 * emotion-guard-turn — 情绪守护轮 (服务端 part, batch60-c)
 *
 * 用户带着情绪提起购买 (emotion-shopping-detector 共现命中) 时, 不把消息当
 * 普通购买挑战处理, 直接返回 canned 共情回复 + 情绪守护卡:
 *   - 共情话术取 elephant-tone 的 emotion_guard_welcome 场景 (先接住情绪,
 *     不评判不拦截, 选择权留给用户)
 *   - 守护卡 payload 只含稳定 mood id + 守护强度档位 (零金额零物品名),
 *     前端渲染三选项: 花钱安慰 (不评判) / 免费安抚 / 先等 10 分钟
 *
 * 与 cooldown-turn 同路数: 命中即 canned reply 短路返回。与既有更高优先级
 * 规则的互斥 (BNPL/绿色替代/数据问答) 在 detector 层完成; 路由层面本块排在
 * 数据问答之后、loadLettaTurnContext (通用购买预检) 之前, 链序由测试锁定。
 */

import { detectEmotionShopping } from './emotion-shopping-detector';
import { getElephantPhrase } from '@/lib/elephant-tone';
import { normalizeGuardIntensity } from '@/lib/guard-intensity';
import type { EmotionGuardCardData } from '@/types/emotion-guard';

export interface EmotionGuardTurn {
  reply: string;
  emotionGuardCard: EmotionGuardCardData;
}

export interface BuildEmotionGuardTurnInput {
  userContent: string;
  locale: 'en' | 'zh';
  /** 守护强度三档 (chat 请求 body.guardIntensity 原值, 缺失/损坏 → balanced) */
  guardIntensity?: unknown;
  /** 绿色守护开关 — 'off' 时绿色品类让路不生效 (detector 层消费) */
  greenPref?: 'on' | 'off';
  /** 测试可注入 rng, 让话术轮换确定 */
  rng?: () => number;
}

/**
 * 命中情绪守护轮时返回 {reply, emotionGuardCard}, 否则 null。
 * 纯函数: 检测 + 取词, 不读库不调外部服务。
 */
export function buildEmotionGuardTurn(input: BuildEmotionGuardTurnInput): EmotionGuardTurn | null {
  const { userContent, locale, guardIntensity, greenPref, rng } = input;
  const detection = detectEmotionShopping(userContent, { locale, greenPref });
  if (!detection) return null;

  return {
    reply: getElephantPhrase('emotion_guard_welcome', locale, undefined, rng),
    emotionGuardCard: {
      mood: detection.mood,
      intensity: normalizeGuardIntensity(guardIntensity),
    },
  };
}

/** emotion_guard_card SSE 事件的 payload 形状 (consume-ai-stream 按 type 分发) */
export interface EmotionGuardSseEvent {
  type: 'emotion_guard_card';
  emotionGuardCard: EmotionGuardCardData;
}

export function emotionGuardSseEvent(card: EmotionGuardCardData): EmotionGuardSseEvent {
  return { type: 'emotion_guard_card', emotionGuardCard: card };
}

/**
 * 情绪守护轮的 canned SSE 流: 先发守护卡事件 (卡片先渲染, 三选项在卡内),
 * 再分块发共情回复 (模拟 typing), 最后 done。与 cooldown canned stream 同构。
 */
export function buildEmotionGuardSseStream(turn: EmotionGuardTurn): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  const chunks = turn.reply.match(/.{1,15}/g) || [turn.reply];
  return new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(
        encoder.encode(`data: ${JSON.stringify(emotionGuardSseEvent(turn.emotionGuardCard))}\n\n`),
      );
      for (const chunk of chunks) {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'token', content: chunk })}\n\n`));
      }
      controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'done' })}\n\n`));
      controller.close();
    },
  });
}
