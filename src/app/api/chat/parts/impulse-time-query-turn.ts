/**
 * impulse-time-query-turn — "我晚上冲动买的多吗" 时段问答轮 (服务端 part, batch58-c)
 *
 * 用户消息命中 impulse-time-query-detector 时, 不调 Letta, 直接返回 canned
 * 回复 + 时段统计卡: 复用 48-c aggregateImpulseWindows 的分桶 (本地时区),
 * 只报次数/天数/总量 — 无金额无碳数值, 非羞辱框架 (看见规律不是认罪)。
 * 样本 < MIN_SAMPLE_SIZE → insufficient 引导态 ("这周还没攒够数据"), 不造伪结论。
 */

import { detectImpulseTimeQuery } from './impulse-time-query-detector';
import { sliceEventsByQueryWindow } from './query-window-range';
import { aggregateImpulseWindows, isDateInWindow } from '@/lib/impulse-window';
import { getElephantPhrase } from '@/lib/elephant-tone';
import type { ImpulseTimeCardData } from '@/types/dimension-query';
import type { SavingsQueryEvent } from './savings-query-context';

export interface ImpulseTimeQueryTurn {
  reply: string;
  impulseTimeCard: ImpulseTimeCardData;
}

export interface BuildImpulseTimeQueryTurnInput {
  userContent: string;
  locale: 'en' | 'zh';
  events: SavingsQueryEvent[];
  /** 时间锚 (周界/月界/小时分桶以本地时区计算); 测试注入固定值 */
  now: Date;
  /** 测试可注入 rng, 让话术轮换确定 */
  rng?: () => number;
}

/** 该时段覆盖的天数 — 去重本地日期 (只数日子, 不碰金额) */
function countDaysInWindow(events: SavingsQueryEvent[], impulseWindow: ImpulseTimeCardData['impulseWindow']): number {
  const days = new Set<string>();
  for (const e of events) {
    const d = new Date(e.createdAt);
    if (!Number.isFinite(d.getTime())) continue;
    if (!isDateInWindow(d, impulseWindow)) continue;
    days.add(`${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`);
  }
  return days.size;
}

/**
 * 命中时段问句轮时返回 {reply, impulseTimeCard}, 否则 null。
 * 纯函数: 检测 + 既有聚合 lib 调用 (events 由调用方注入), 不读库不调外部服务。
 */
export function buildImpulseTimeQueryTurn(input: BuildImpulseTimeQueryTurnInput): ImpulseTimeQueryTurn | null {
  const intent = detectImpulseTimeQuery(input.userContent);
  if (!intent) return null;
  return buildImpulseTimeQueryTurnFromIntent({ ...input, window: intent.window, impulseWindow: intent.impulseWindow });
}

/** intent 直入变体 (batch59-c 追问跟随复用: 窗口/时段来自上文解析而非字符串检测) */
export interface BuildImpulseTimeQueryTurnFromIntentInput {
  window: ImpulseTimeCardData['window'];
  impulseWindow: ImpulseTimeCardData['impulseWindow'];
  locale: 'en' | 'zh';
  events: SavingsQueryEvent[];
  /** 时间锚 (周界/月界/小时分桶以本地时区计算); 测试注入固定值 */
  now: Date;
  /** 测试可注入 rng, 让话术轮换确定 */
  rng?: () => number;
}

export function buildImpulseTimeQueryTurnFromIntent(input: BuildImpulseTimeQueryTurnFromIntentInput): ImpulseTimeQueryTurn {
  const { window, impulseWindow, locale, events, now, rng } = input;

  const windowEvents = sliceEventsByQueryWindow(events, window, now);
  const summary = aggregateImpulseWindows(windowEvents);
  const ok = summary.status === 'ok';

  return {
    reply: getElephantPhrase(ok ? 'impulse_query_welcome' : 'impulse_query_empty', locale, undefined, rng),
    impulseTimeCard: {
      window,
      impulseWindow,
      status: ok ? 'ok' : 'insufficient',
      count: summary.counts[impulseWindow],
      days: countDaysInWindow(windowEvents, impulseWindow),
      total: summary.total,
    },
  };
}

/** impulse_time_card SSE 事件的 payload 形状 (consume-ai-stream 按 type 分发) */
export interface ImpulseTimeSseEvent {
  type: 'impulse_time_card';
  impulseTimeCard: ImpulseTimeCardData;
}

export function impulseTimeSseEvent(card: ImpulseTimeCardData): ImpulseTimeSseEvent {
  return { type: 'impulse_time_card', impulseTimeCard: card };
}

/** 时段问答轮的 canned SSE 流: 先发卡事件, 再分块发回复, 最后 done (与 57-c 同构) */
export function buildImpulseTimeSseStream(turn: ImpulseTimeQueryTurn): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  const chunks = turn.reply.match(/.{1,15}/g) || [turn.reply];
  return new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(
        encoder.encode(`data: ${JSON.stringify(impulseTimeSseEvent(turn.impulseTimeCard))}\n\n`),
      );
      for (const chunk of chunks) {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'token', content: chunk })}\n\n`));
      }
      controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'done' })}\n\n`));
      controller.close();
    },
  });
}
