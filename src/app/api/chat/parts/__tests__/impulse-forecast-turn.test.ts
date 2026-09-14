/**
 * impulse-forecast-turn 测试 (batch62-c)
 *
 * 覆盖验收:
 * 1. 命中预报问句 → 卡数字与 forecastImpulseRisk 直算相等; 话术来自
 *    forecast_welcome/forecast_empty 场景
 * 2. 样本不足 → insufficient 引导态, 不造伪规律
 * 3. 单日追问轮: 重算同一份预报 + focusDay 标注; 整体不足时回复用引导态
 * 4. 红线: 卡上只有次数/天数/星期/时段 — 零金额零碳数值; 非预报问句 → null
 * 5. SSE 流: impulse_forecast_card 事件在前, token 分块 + done 收尾
 */

import { describe, expect, it } from 'vitest';
import {
  buildImpulseForecastTurn,
  buildImpulseForecastDayTurn,
  buildImpulseForecastSseStream,
} from '../impulse-forecast-turn';
import { forecastImpulseRisk } from '@/lib/impulse-forecast';
import type { ImpulseForecastEvent } from '../impulse-forecast-context';

/** 锚点: 2026-09-09 周三; 周三近 4 周事件 daysAgo 0/7/14/21 (weight 2), 周四铺底 */
const NOW = new Date(2026, 8, 9, 12, 0, 0);

function daysAgo(n: number, hour = 12): string {
  return new Date(2026, 8, 9 - n, hour, 0, 0).toISOString();
}

function ev(partial: Partial<ImpulseForecastEvent> & { createdAt: string }): ImpulseForecastEvent {
  return { eventType: 'challenge_completed', metadata: null, ...partial };
}

/** 8 条可读样本: 周三 4 近 (weight 8 → high) + 周四 4 旧 (weight 4 → medium) */
function enoughEvents(): ImpulseForecastEvent[] {
  return [
    ev({ createdAt: daysAgo(0), metadata: { category: 'beauty' } }),
    ev({ createdAt: daysAgo(7), metadata: { category: 'beauty' } }),
    ev({ createdAt: daysAgo(14), metadata: { category: 'beauty' } }),
    ev({ createdAt: daysAgo(21), metadata: { category: 'beauty' } }),
    ev({ createdAt: daysAgo(34, 19) }),
    ev({ createdAt: daysAgo(41, 19) }),
    ev({ createdAt: daysAgo(48, 19) }),
    ev({ createdAt: daysAgo(55, 19) }),
  ];
}

describe('buildImpulseForecastTurn — 命中', () => {
  it('zh: "下周容易冲动吗" → 卡与 forecastImpulseRisk 直算逐字段相等', () => {
    const turn = buildImpulseForecastTurn({
      userContent: '下周容易冲动吗',
      locale: 'zh',
      events: enoughEvents(),
      now: NOW,
      rng: () => 0,
    });
    expect(turn).not.toBeNull();
    const card = turn!.impulseForecastCard;
    const direct = forecastImpulseRisk(enoughEvents(), NOW);
    expect(card).toEqual(direct);
    expect(card.status).toBe('ok');
    expect(card.highDays).toBe(1); // 周三 weight 8
    expect(card.mediumDays).toBe(1); // 周四 weight 4
    expect(card.topCategory).toBe('beauty');
    expect(card.days).toHaveLength(7);
    expect(turn!.reply.length).toBeGreaterThan(0);
  });

  it('en: "next week risk" → ok 态', () => {
    const turn = buildImpulseForecastTurn({
      userContent: 'next week risk',
      locale: 'en',
      events: enoughEvents(),
      now: NOW,
      rng: () => 0,
    });
    expect(turn).not.toBeNull();
    expect(turn!.impulseForecastCard.status).toBe('ok');
  });
});

describe('buildImpulseForecastTurn — 引导态与红线', () => {
  it('样本不足 → insufficient 引导态 (forecast_empty 场景), 卡恒 7 行', () => {
    const few = enoughEvents().slice(0, 4);
    const turn = buildImpulseForecastTurn({
      userContent: '下周容易冲动吗', locale: 'zh', events: few, now: NOW, rng: () => 0,
    });
    expect(turn).not.toBeNull();
    expect(turn!.impulseForecastCard.status).toBe('insufficient');
    expect(turn!.impulseForecastCard.days).toHaveLength(7);
    expect(turn!.reply).toContain('预报');
  });

  it('空事件 → insufficient', () => {
    const turn = buildImpulseForecastTurn({
      userContent: 'next week risk', locale: 'en', events: [], now: NOW, rng: () => 0,
    });
    expect(turn!.impulseForecastCard.status).toBe('insufficient');
  });

  it('卡结构零金额零碳数值 (次数/天数/星期/时段 only)', () => {
    const turn = buildImpulseForecastTurn({
      userContent: '下周容易冲动吗', locale: 'zh', events: enoughEvents(), now: NOW, rng: () => 0,
    });
    const s = JSON.stringify(turn!.impulseForecastCard);
    expect(s).not.toMatch(/\$|¥|€|£|amount|estSaved|percent|%|carbon|kg/i);
  });

  it('非预报问句 → null (不抢路由)', () => {
    expect(buildImpulseForecastTurn({ userContent: '今天天气不错', locale: 'zh', events: enoughEvents(), now: NOW })).toBeNull();
    expect(buildImpulseForecastTurn({ userContent: '这个月省了多少', locale: 'zh', events: enoughEvents(), now: NOW })).toBeNull();
  });
});

describe('buildImpulseForecastDayTurn — 单轮追问', () => {
  it('"那周六呢" (day=5) → 重算同一份预报, focusDay=5, 数字与直算相等', () => {
    const turn = buildImpulseForecastDayTurn({
      day: 5,
      locale: 'zh',
      events: enoughEvents(),
      now: NOW,
      rng: () => 0,
    });
    const card = turn.impulseForecastCard;
    expect(card.focusDay).toBe(5);
    const direct = forecastImpulseRisk(enoughEvents(), NOW);
    expect(card.status).toBe(direct.status);
    expect(card.days).toEqual(direct.days);
    // 聚焦日 = 周六 (2026-09-12): 无周三/周四样本 → insufficient 行
    const saturday = card.days[3]!;
    expect(saturday.dayKey).toBe('2026-8-12');
    expect(saturday.weekday).toBe(5);
    expect(saturday.level).toBe('insufficient');
  });

  it('整体样本不足时, 单日追问回复也用引导态 (不编造单日规律)', () => {
    const turn = buildImpulseForecastDayTurn({
      day: 5, locale: 'en', events: enoughEvents().slice(0, 2), now: NOW, rng: () => 0,
    });
    expect(turn.impulseForecastCard.status).toBe('insufficient');
    // rng=0 → forecast_empty en 首个变体: "…not an honest forecast…"
    expect(turn.reply).toContain('forecast');
  });
});

describe('impulse-forecast SSE', () => {
  it('canned 流先发卡事件再发 token + done (绝不经过 Letta)', async () => {
    const turn = buildImpulseForecastTurn({
      userContent: '下周容易冲动吗', locale: 'zh', events: enoughEvents(), now: NOW, rng: () => 0,
    })!;
    const text = await new Response(buildImpulseForecastSseStream(turn)).text();
    const events = text.trim().split('\n\n').map((line) => JSON.parse(line.replace(/^data: /, '')));
    expect(events[0].type).toBe('impulse_forecast_card');
    expect(events[0].impulseForecastCard.highDays).toBe(1);
    const tokenTypes = events.slice(1, -1).map((e: { type: string }) => e.type);
    expect(tokenTypes.every((t) => t === 'token')).toBe(true);
    expect(events[events.length - 1].type).toBe('done');
  });

  it('追问轮 SSE 卡带 focusDay', async () => {
    const turn = buildImpulseForecastDayTurn({ day: 5, locale: 'zh', events: enoughEvents(), now: NOW, rng: () => 0 });
    const text = await new Response(buildImpulseForecastSseStream(turn)).text();
    const first = JSON.parse(text.trim().split('\n\n')[0].replace(/^data: /, ''));
    expect(first.type).toBe('impulse_forecast_card');
    expect(first.impulseForecastCard.focusDay).toBe(5);
  });
});
