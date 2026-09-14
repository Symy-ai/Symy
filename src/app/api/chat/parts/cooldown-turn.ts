/**
 * cooldown-turn — 反驳降温轮 (服务端 part, batch48-b)
 *
 * 上一轮发过守护卡 (afterGuardCard) 且本轮命中反驳意图 (pushback-detector) 时,
 * 不再调 Letta (杜绝第二次拦截话术), 直接返回 canned 降温回复 + 冷静卡:
 *   - 降温话术取 elephant-tone 的 cooldown_stepback 场景 (firm/annoyed 两档)
 *   - 冷静卡 payload 只含品类 (零金额), 前端渲染倒计时 + 两个动作
 *
 * 与 reflection-detector 同路数: 命中即 canned reply 短路返回, 绿色守护开关由
 * 调用方判断 (guard-off 时调用方不调本文件 — 关了守护就没有反驳降温叙事)。
 */

import { detectPushback } from '@/lib/pushback-detector';
import { getElephantPhrase, type ElephantScene } from '@/lib/elephant-tone';
import { normalizeInterceptCategory } from '@/features/butterfly/green-alt-copy';
import type { CooldownCardData, CooldownCategory } from '@/types/cooldown';

const COOLDOWN_CATEGORIES: readonly CooldownCategory[] = ['electronics', 'clothing', 'beauty', 'home', 'food'];

/** 降温话术场景: firm = 平静退一步, annoyed = 用户不耐烦时更短更顺从 */
function cooldownScene(tone: 'firm' | 'annoyed'): ElephantScene {
  return tone === 'annoyed' ? 'cooldown_stepback_annoyed' : 'cooldown_stepback';
}

export interface CooldownTurn {
  reply: string;
  tone: 'firm' | 'annoyed';
  cooldownCard: CooldownCardData;
}

export interface BuildCooldownTurnInput {
  userContent: string;
  locale: 'en' | 'zh';
  /** 上一轮 assistant 消息是否带过守护卡 (green_alt / reuse_hint / micro_challenge) */
  afterGuardCard: boolean;
  /** 测试可注入 rng, 让话术轮换确定 */
  rng?: () => number;
}

/**
 * 命中降温轮时返回 {reply, cooldownCard}, 否则 null。
 * 纯函数: 检测 + 取词, 不读库不调外部服务。
 */
export function buildCooldownTurn(input: BuildCooldownTurnInput): CooldownTurn | null {
  const { userContent, locale, afterGuardCard, rng } = input;
  if (!afterGuardCard) return null;
  const pushback = detectPushback(userContent);
  if (!pushback) return null;

  const rawCategory = normalizeInterceptCategory(userContent);
  const category = COOLDOWN_CATEGORIES.find((c) => c === rawCategory) ?? null;

  return {
    reply: getElephantPhrase(cooldownScene(pushback.tone), locale, undefined, rng),
    tone: pushback.tone,
    cooldownCard: { category },
  };
}

/** cooldown_card SSE 事件的 payload 形状 (consume-ai-stream 按 type 分发) */
export interface CooldownSseEvent {
  type: 'cooldown_card';
  cooldownCard: CooldownCardData;
}

export function cooldownSseEvent(card: CooldownCardData): CooldownSseEvent {
  return { type: 'cooldown_card', cooldownCard: card };
}

/**
 * 降温轮的 canned SSE 流: 先发冷静卡事件 (卡片先渲染), 再分块发降温回复
 * (模拟 typing), 最后 done。与 reflection canned stream 同构。
 */
export function buildCooldownSseStream(turn: CooldownTurn): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  const chunks = turn.reply.match(/.{1,15}/g) || [turn.reply];
  return new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(
        encoder.encode(`data: ${JSON.stringify(cooldownSseEvent(turn.cooldownCard))}\n\n`),
      );
      for (const chunk of chunks) {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'token', content: chunk })}\n\n`));
      }
      controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'done' })}\n\n`));
      controller.close();
    },
  });
}
