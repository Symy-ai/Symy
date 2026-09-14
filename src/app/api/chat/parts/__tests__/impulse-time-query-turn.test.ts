/**
 * impulse-time-query-turn 测试 (batch58-c)
 *
 * 覆盖验收:
 * 1. "我晚上冲动买的多吗" 命中 → 次数/总量与 aggregateImpulseWindows 分桶
 *    输出相等; 天数 = 该时段去重本地日期
 * 2. 样本不足 (<8) → insufficient 引导态 ("还没攒够数据"), 不造伪规律
 * 3. 红线: 卡上只有次数/天数/总量 — 零金额零碳数值; 非问句 → null
 * 4. SSE 流: impulse_time_card 事件在前, token 分块 + done 收尾
 */

import { describe, expect, it } from 'vitest';
import { buildImpulseTimeQueryTurn, buildImpulseTimeSseStream } from '../impulse-time-query-turn';
import type { SavingsQueryEvent } from '../savings-query-context';
import { aggregateImpulseWindows } from '@/lib/impulse-window';

/** 2026-09-08 周二 (本周 = 09-07 周一起) */
const NOW = new Date(2026, 8, 8, 12, 0, 0);

function event(partial: Partial<SavingsQueryEvent> & { createdAt: string }): SavingsQueryEvent {
  return {
    eventType: 'challenge_completed',
    triggerSource: null,
    triggerId: null,
    metadata: null,
    ...partial,
  };
}

/** 9 月窗: 晚间 (17:00–21:59) 6 次 (覆盖 3 天) + 深夜 2 次 = 8 条样本足额 */
function septemberEvents(): SavingsQueryEvent[] {
  const at = (day: number, hour: number) => new Date(2026, 8, day, hour, 0, 0).toISOString();
  return [
    event({ triggerId: 'e1', createdAt: at(1, 19) }),
    event({ triggerId: 'e2', createdAt: at(2, 20) }),
    event({ triggerId: 'e3', createdAt: at(2, 21) }),
    event({ triggerId: 'e4', createdAt: at(3, 18) }),
    event({ triggerId: 'e5', createdAt: at(3, 20) }),
    event({ triggerId: 'e6', createdAt: at(4, 19) }),
    event({ triggerId: 'n1', createdAt: at(4, 23) }),
    event({ triggerId: 'n2', createdAt: at(5, 1) }),
    // 窗外 (8 月): 不计入
    event({ triggerId: 'aug', createdAt: new Date(2026, 7, 15, 19).toISOString() }),
  ];
}

describe('buildImpulseTimeQueryTurn — 有数据', () => {
  it('zh: "我晚上冲动买的多吗" → 次数/总量与 aggregateImpulseWindows 相等, 天数去重', () => {
    const turn = buildImpulseTimeQueryTurn({
      userContent: '这个月我晚上冲动买的多吗',
      locale: 'zh',
      events: septemberEvents(),
      now: NOW,
      rng: () => 0,
    });
    expect(turn).not.toBeNull();
    const card = turn!.impulseTimeCard;
    expect(card.status).toBe('ok');
    expect(card.window).toBe('thisMonth');
    expect(card.impulseWindow).toBe('evening');

    const windowEvents = septemberEvents().filter((e) => new Date(e.createdAt) >= new Date(2026, 8, 1));
    const summary = aggregateImpulseWindows(windowEvents);
    expect(card.count).toBe(summary.counts.evening);
    expect(card.total).toBe(summary.total);
    // 口径锚: 晚间 6 次 (09-01/02/03/04 四天里 1/2/2/1 → 去重 4 天)
    expect(card.count).toBe(6);
    expect(card.days).toBe(4);
    expect(card.total).toBe(8);
  });

  it('en: "do I impulse shop late at night?" → lateNight 桶', () => {
    const turn = buildImpulseTimeQueryTurn({
      userContent: 'do I impulse shop late at night this month?',
      locale: 'en',
      events: septemberEvents(),
      now: NOW,
      rng: () => 0,
    });
    expect(turn).not.toBeNull();
    const card = turn!.impulseTimeCard;
    expect(card.impulseWindow).toBe('lateNight');
    expect(card.count).toBe(2);
    expect(card.days).toBe(2);
  });
});

describe('buildImpulseTimeQueryTurn — 引导态与红线', () => {
  it('样本不足 (<8) → insufficient 引导态, 不造伪规律', () => {
    const few = septemberEvents().slice(0, 5);
    const turn = buildImpulseTimeQueryTurn({
      userContent: '这个月我晚上冲动买的多吗',
      locale: 'zh',
      events: few,
      now: NOW,
      rng: () => 0,
    });
    expect(turn).not.toBeNull();
    expect(turn!.impulseTimeCard.status).toBe('insufficient');
    expect(turn!.reply).toContain('攒');
  });

  it('空事件 → insufficient (不是 ok 0 次)', () => {
    const turn = buildImpulseTimeQueryTurn({
      userContent: '我晚上冲动买的多吗', locale: 'zh', events: [], now: NOW, rng: () => 0,
    });
    expect(turn!.impulseTimeCard.status).toBe('insufficient');
  });

  it('卡上只有次数/天数/总量 — 零金额零碳数值', () => {
    const turn = buildImpulseTimeQueryTurn({
      userContent: '这个月我晚上冲动买的多吗', locale: 'zh', events: septemberEvents(), now: NOW, rng: () => 0,
    });
    expect(JSON.stringify(turn!.impulseTimeCard)).not.toMatch(/\$|amount|estSaved|carbon|kg/i);
  });

  it('非问句 / 无时段词 → null', () => {
    expect(buildImpulseTimeQueryTurn({ userContent: '今天天气不错', locale: 'zh', events: [], now: NOW })).toBeNull();
    expect(buildImpulseTimeQueryTurn({ userContent: '我冲动买的多吗', locale: 'zh', events: [], now: NOW })).toBeNull();
  });
});

describe('impulse-time SSE', () => {
  it('canned 流先发卡事件再发 token + done (绝不经过 Letta)', async () => {
    const turn = buildImpulseTimeQueryTurn({
      userContent: '这个月我晚上冲动买的多吗', locale: 'zh', events: septemberEvents(), now: NOW, rng: () => 0,
    })!;
    const text = await new Response(buildImpulseTimeSseStream(turn)).text();
    const events = text.trim().split('\n\n').map((line) => JSON.parse(line.replace(/^data: /, '')));
    expect(events[0].type).toBe('impulse_time_card');
    expect(events[0].impulseTimeCard.count).toBe(6);
    const tokenTypes = events.slice(1, -1).map((e: { type: string }) => e.type);
    expect(tokenTypes.every((t) => t === 'token')).toBe(true);
    expect(events[events.length - 1].type).toBe('done');
  });
});
