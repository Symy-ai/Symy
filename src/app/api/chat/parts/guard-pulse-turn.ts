/**
 * guard-pulse-turn — "我什么时候最容易冲动" 小时节奏问答轮 (服务端 part, batch68-c)
 *
 * 用户消息命中 guard-pulse-detector 时, 不调 Letta, 直接返回 canned 回复 +
 * 脉搏卡: 复用 lib/guard-pulse 的 aggregateGuardPulse (近 28 天 0-23 小时,
 * 用户本地时区), 只报小时/次数/天数 — 无金额无碳数值。框架是 "看见节奏,
 * 提前一步" 不是认罪: 样本不足 → guard_pulse_empty 引导态, 不造伪规律。
 */

import { detectGuardPulseQuery } from './guard-pulse-detector';
import { aggregateGuardPulse } from '@/lib/guard-pulse';
import { getElephantPhrase } from '@/lib/elephant-tone';
import type { GuardPulseCardData } from '@/types/guard-pulse';
import type { GuardPulseEvent } from './guard-pulse-context';

export interface GuardPulseTurn {
  reply: string;
  guardPulseCard: GuardPulseCardData;
}

export interface BuildGuardPulseTurnInput {
  userContent: string;
  locale: 'en' | 'zh';
  events: GuardPulseEvent[];
  /** 时间锚 (28 天窗口与小时分桶以本地时区计算); 测试注入固定值 */
  now: Date;
  /** 用户本地 IANA 时区 (profiles.timezone); 缺失/无效时聚合层回退运行时本地 */
  timezone?: string | null;
  /** 测试可注入 rng, 让话术轮换确定 */
  rng?: () => number;
}

/**
 * 命中脉搏问句轮时返回 {reply, guardPulseCard}, 否则 null。
 * 纯函数: 检测 + 既有聚合 lib 调用 (events 由调用方注入), 不读库不调外部服务。
 */
export function buildGuardPulseTurn(input: BuildGuardPulseTurnInput): GuardPulseTurn | null {
  if (!detectGuardPulseQuery(input.userContent)) return null;
  return buildGuardPulseTurnFromEvents(input);
}

export interface BuildGuardPulseTurnFromEventsInput {
  locale: 'en' | 'zh';
  events: GuardPulseEvent[];
  now: Date;
  timezone?: string | null;
  rng?: () => number;
}

export function buildGuardPulseTurnFromEvents(input: BuildGuardPulseTurnFromEventsInput): GuardPulseTurn {
  const { locale, events, now, timezone, rng } = input;
  const pulse = aggregateGuardPulse(events, now, timezone);
  const ok = pulse.status === 'ok';
  return {
    reply: getElephantPhrase(ok ? 'guard_pulse_welcome' : 'guard_pulse_empty', locale, undefined, rng),
    guardPulseCard: pulse,
  };
}

/** guard_pulse_card SSE 事件的 payload 形状 (consume-ai-stream 按 type 分发) */
export interface GuardPulseSseEvent {
  type: 'guard_pulse_card';
  guardPulseCard: GuardPulseCardData;
}

export function guardPulseSseEvent(card: GuardPulseCardData): GuardPulseSseEvent {
  return { type: 'guard_pulse_card', guardPulseCard: card };
}

/** 脉搏问答轮的 canned SSE 流: 先发卡事件, 再分块发回复, 最后 done (与 57-c/58-c/62-c 同构) */
export function buildGuardPulseSseStream(turn: GuardPulseTurn): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  const chunks = turn.reply.match(/.{1,15}/g) || [turn.reply];
  return new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(
        encoder.encode(`data: ${JSON.stringify(guardPulseSseEvent(turn.guardPulseCard))}\n\n`),
      );
      for (const chunk of chunks) {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'token', content: chunk })}\n\n`));
      }
      controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'done' })}\n\n`));
      controller.close();
    },
  });
}
