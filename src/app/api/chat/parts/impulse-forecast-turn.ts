/**
 * impulse-forecast-turn — "下周容易冲动吗" 预报问答轮 (服务端 part, batch62-c)
 *
 * 用户消息命中 impulse-forecast-detector 时, 不调 Letta, 直接返回 canned
 * 回复 + 预报卡: 复用 lib/impulse-forecast 的 forecastImpulseRisk (近 8 周
 * 同星期几规律, 本地时区), 只报次数/天数/星期/时段 — 无金额无碳数值。
 * 框架是 "提前准备" 不是预测: 样本不足 → forecast_empty 引导态, 不造伪规律。
 *
 * 单轮追问: buildImpulseForecastDayTurn 接住 "那周六呢" — 重算同一份预报,
 * 卡上标 focusDay 高亮该日, 不新建任何会话态或守护机制。
 */

import { detectForecastQuery, type ForecastDayIndex } from './impulse-forecast-detector';
import { forecastImpulseRisk } from '@/lib/impulse-forecast';
import { getElephantPhrase } from '@/lib/elephant-tone';
import type { ImpulseForecastCardData } from '@/types/impulse-forecast';
import type { ImpulseForecastEvent } from './impulse-forecast-context';

export interface ImpulseForecastTurn {
  reply: string;
  impulseForecastCard: ImpulseForecastCardData;
}

export interface BuildImpulseForecastTurnInput {
  userContent: string;
  locale: 'en' | 'zh';
  events: ImpulseForecastEvent[];
  /** 时间锚 (今天=day 0, 星期序/时段分桶以本地时区计算); 测试注入固定值 */
  now: Date;
  /** 测试可注入 rng, 让话术轮换确定 */
  rng?: () => number;
}

/**
 * 命中预报问句轮时返回 {reply, impulseForecastCard}, 否则 null。
 * 纯函数: 检测 + 既有聚合 lib 调用 (events 由调用方注入), 不读库不调外部服务。
 */
export function buildImpulseForecastTurn(input: BuildImpulseForecastTurnInput): ImpulseForecastTurn | null {
  if (!detectForecastQuery(input.userContent)) return null;
  return buildImpulseForecastTurnFromEvents({ locale: input.locale, events: input.events, now: input.now, rng: input.rng });
}

export interface BuildImpulseForecastTurnFromEventsInput {
  locale: 'en' | 'zh';
  events: ImpulseForecastEvent[];
  now: Date;
  rng?: () => number;
}

export function buildImpulseForecastTurnFromEvents(input: BuildImpulseForecastTurnFromEventsInput): ImpulseForecastTurn {
  const { locale, events, now, rng } = input;
  const forecast = forecastImpulseRisk(events, now);
  const ok = forecast.status === 'ok';
  return {
    reply: getElephantPhrase(ok ? 'forecast_welcome' : 'forecast_empty', locale, undefined, rng),
    impulseForecastCard: forecast,
  };
}

export interface BuildImpulseForecastDayTurnInput {
  /** 聚焦日 (0-6, Monday=0), 来自 detectForecastDayFollowUp */
  day: ForecastDayIndex;
  locale: 'en' | 'zh';
  events: ImpulseForecastEvent[];
  now: Date;
  rng?: () => number;
}

/**
 * 单日追问轮 ("那周六呢"): 数字仍全部来自 forecastImpulseRisk 重算
 * (与 59-c 同约定 — 卡元数据只传维度, 数字不走上行通道), 卡带 focusDay
 * 供前端高亮。整体样本不足时回复用引导态, 卡照常 insufficient。
 */
export function buildImpulseForecastDayTurn(input: BuildImpulseForecastDayTurnInput): ImpulseForecastTurn {
  const { day, locale, events, now, rng } = input;
  const forecast = forecastImpulseRisk(events, now);
  const ok = forecast.status === 'ok';
  return {
    reply: getElephantPhrase(ok ? 'forecast_day_followup' : 'forecast_empty', locale, undefined, rng),
    impulseForecastCard: { ...forecast, focusDay: day },
  };
}

/** impulse_forecast_card SSE 事件的 payload 形状 (consume-ai-stream 按 type 分发) */
export interface ImpulseForecastSseEvent {
  type: 'impulse_forecast_card';
  impulseForecastCard: ImpulseForecastCardData;
}

export function impulseForecastSseEvent(card: ImpulseForecastCardData): ImpulseForecastSseEvent {
  return { type: 'impulse_forecast_card', impulseForecastCard: card };
}

/** 预报问答轮的 canned SSE 流: 先发卡事件, 再分块发回复, 最后 done (与 57-c/58-c 同构) */
export function buildImpulseForecastSseStream(turn: ImpulseForecastTurn): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  const chunks = turn.reply.match(/.{1,15}/g) || [turn.reply];
  return new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(
        encoder.encode(`data: ${JSON.stringify(impulseForecastSseEvent(turn.impulseForecastCard))}\n\n`),
      );
      for (const chunk of chunks) {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'token', content: chunk })}\n\n`));
      }
      controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'done' })}\n\n`));
      controller.close();
    },
  });
}
