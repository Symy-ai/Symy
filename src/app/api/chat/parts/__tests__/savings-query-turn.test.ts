/**
 * savings-query-turn 测试 (batch57-c)
 *
 * 覆盖验收:
 * 1. 有数据全字段: 卡上数字与既有聚合 lib (buildMonthlyStatement /
 *    weeklyGuardCompare / aggregateGuardStyleProfile) 输出逐一相等 —
 *    卡层不做第二遍计算
 * 2. 周界 Monday-start: 本周含周一、不含上周日 (与 weekly-guard-compare 对齐)
 * 3. 无数据窗: noData 引导态 (零事件 → 不显示 0 元假账, reply 走空窗话术)
 * 4. 金额红线: estSavedTotal 只在 private 字段; shareFace 结构 amount-free
 *    (无货币符号/金额), 三轨样本不足时 tracksAvailable=false 不造伪计数
 * 5. SSE 流: savings_query_card 事件在前, token 分块 + done 收尾
 */

import { describe, expect, it } from 'vitest';
import { buildSavingsQueryTurn, buildSavingsQuerySseStream, savingsQuerySseEvent } from '../savings-query-turn';
import type { SavingsQueryEvent } from '../savings-query-context';
import { weeklyGuardCompare } from '@/lib/weekly-guard-compare';
import { buildMonthlyStatement } from '@/lib/monthly-guard-statement';
import { aggregateGuardStyleProfile } from '@/lib/guard-style-profile';

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

/** 9 月窗事件: 拦截 3 胜 1 弃 + 转存 $100 + 替代/复用各 1 (三轨合计 ≥5 出聚合) */
function septemberEvents(): SavingsQueryEvent[] {
  const sep = (day: number) => new Date(2026, 8, day, 10, 0, 0).toISOString();
  return [
    event({ eventType: 'challenge_completed', triggerId: 'c1', createdAt: sep(2) }),
    event({ eventType: 'challenge_completed', triggerId: 'c2', createdAt: sep(3) }),
    event({ eventType: 'challenge_completed', triggerId: 'c3', createdAt: sep(4) }),
    event({ eventType: 'challenge_failed', triggerId: 'f1', createdAt: sep(5) }),
    event({
      eventType: 'challenge_reward',
      triggerSource: 'deposit_api',
      triggerId: 'r1',
      metadata: { source: 'deposit', amount: 100 },
      createdAt: sep(5),
    }),
    event({
      eventType: 'mindful_recovery',
      triggerId: 'green-alt-adoption:coffee_shop:2026-09-05',
      metadata: { kind: 'green_alt_adoption', estSaved: 15 },
      createdAt: sep(5),
    }),
    event({
      eventType: 'mindful_recovery',
      triggerId: 'reuse-adoption:tool_rental:2026-09-06',
      metadata: { kind: 'reuse_adoption', estSaved: 30 },
      createdAt: sep(6),
    }),
  ];
}

/** 与 turn 同款的窗口切片 (测试侧独立重放, 断言卡层与 lib 输出一致) */
function sliceByWindow(events: SavingsQueryEvent[], start: Date, end: Date): SavingsQueryEvent[] {
  return events.filter((e) => {
    const d = new Date(e.createdAt);
    return d >= start && d < end;
  });
}

describe('buildSavingsQueryTurn — 有数据全字段', () => {
  it('本月窗: 数字与 buildMonthlyStatement / 三轨聚合输出逐一相等', () => {
    const turn = buildSavingsQueryTurn({
      userContent: '我这个月省了多少钱',
      locale: 'zh',
      events: septemberEvents(),
      now: NOW,
      hourlyRate: 25,
      rng: () => 0,
    });
    expect(turn).not.toBeNull();
    const card = turn!.savingsQueryCard;
    expect(card.status).toBe('ok');
    expect(card.window).toBe('thisMonth');

    const windowEvents = sliceByWindow(septemberEvents(), new Date(2026, 8, 1), new Date(2026, 9, 1));
    const statement = buildMonthlyStatement(windowEvents, { monthKey: '2026-09', hourlyRate: 25, locale: 'zh' });
    expect(card.intercepts).toBe(statement.public.intercepts);
    expect(card.passRate).toBe(statement.public.passRate);
    expect(card.hoursReclaimed).toBe(statement.public.hoursReclaimed);
    expect(card.private.estSavedTotal).toBe(statement.private.guardedAmount);
    expect(card.trackCounts).toEqual(aggregateGuardStyleProfile(windowEvents).trackCounts);
    expect(card.tracksAvailable).toBe(true);
    // 口径锚: 4 轮拦截 3 胜 + 转存 $100 → 4 小时
    expect(card.intercepts).toBe(4);
    expect(card.passRate).toBe(0.75);
    expect(card.private.estSavedTotal).toBe(100);
    expect(card.hoursReclaimed).toBe(4);
    expect(card.hoursLabel).toBe('4.0 小时');
    // amount-free 分享面: 次数 + 自由小时, 无货币符号
    expect(card.shareFace.zh).toBe('本月 6 次守护、挽回 4.0 小时 自由时间');
    expect(card.shareFace.en).not.toMatch(/\$|100/);
  });

  it('上周窗: 数字与 weeklyGuardCompare 输出相等', () => {
    // 8/31 周一 – 9/6 周日 (上周): 只有 9 月头几天的事件
    const turn = buildSavingsQueryTurn({
      userContent: '上周守护了几次',
      locale: 'en',
      events: septemberEvents(),
      now: NOW,
      hourlyRate: 25,
      rng: () => 0,
    });
    expect(turn).not.toBeNull();
    const card = turn!.savingsQueryCard;
    const windowEvents = sliceByWindow(septemberEvents(), new Date(2026, 7, 31), new Date(2026, 8, 7));
    const weekly = weeklyGuardCompare(windowEvents, NOW, 25);
    expect(card.intercepts).toBe(weekly.lastWeek.intercepts);
    expect(card.passRate).toBe(weekly.lastWeek.passRate);
    expect(card.hoursReclaimed).toBe(weekly.lastWeek.hoursReclaimed);
    expect(card.private.estSavedTotal).toBe(weekly.lastWeek.guardedAmount);
  });

  it('周界 Monday-start: 周一事件归本周, 周日事件归上周 (与 weekly-guard-compare 对齐)', () => {
    // 09-07 周一 / 09-06 周日 各一条拦截
    const events = [
      event({ eventType: 'challenge_completed', triggerId: 'mon', createdAt: new Date(2026, 8, 7, 9).toISOString() }),
      event({ eventType: 'challenge_completed', triggerId: 'sun', createdAt: new Date(2026, 8, 6, 9).toISOString() }),
    ];
    const thisWeek = buildSavingsQueryTurn({
      userContent: '这周省了多少', locale: 'zh', events, now: NOW, hourlyRate: 25,
    })!;
    const lastWeek = buildSavingsQueryTurn({
      userContent: '上周省了多少', locale: 'zh', events, now: NOW, hourlyRate: 25,
    })!;
    expect(thisWeek.savingsQueryCard.intercepts).toBe(1);
    expect(lastWeek.savingsQueryCard.intercepts).toBe(1);
    // 三轨 <5 样本: 不渲染三轨行 (tracksAvailable=false), 但拦截/小时照实展示
    expect(thisWeek.savingsQueryCard.tracksAvailable).toBe(false);
    expect(thisWeek.savingsQueryCard.shareFace.zh).toContain('1 次守护');
  });
});

describe('buildSavingsQueryTurn — 无数据引导态', () => {
  it('空窗: noData + 空窗话术, 不显示 0 元假账', () => {
    const turn = buildSavingsQueryTurn({
      userContent: '这个月省了多少',
      locale: 'zh',
      events: [],
      now: NOW,
      hourlyRate: 25,
      rng: () => 0,
    });
    expect(turn).not.toBeNull();
    expect(turn!.savingsQueryCard.status).toBe('noData');
    // 引导态 reply 取空窗场景 (含 "开张" 引导语), 不是对账开场
    expect(turn!.reply).toContain('开张');
  });
});

describe('buildSavingsQueryTurn — 红线', () => {
  it('金额只在 private 字段, 分享面结构 amount-free', () => {
    const turn = buildSavingsQueryTurn({
      userContent: '本月省了多少', locale: 'zh', events: septemberEvents(), now: NOW, hourlyRate: 25,
    })!;
    const card = turn.savingsQueryCard;
    expect(card.private.estSavedTotal).toBe(100);
    const share = JSON.stringify(card.shareFace);
    expect(share).not.toMatch(/\$|100|amount|Saved/i);
  });

  it('非问账输入 → null', () => {
    expect(buildSavingsQueryTurn({
      userContent: '今天天气不错', locale: 'zh', events: [], now: NOW, hourlyRate: 25,
    })).toBeNull();
  });
});

describe('savings-query SSE', () => {
  it('savingsQuerySseEvent 形状', () => {
    const turn = buildSavingsQueryTurn({
      userContent: '本月省了多少', locale: 'zh', events: septemberEvents(), now: NOW, hourlyRate: 25, rng: () => 0,
    })!;
    expect(savingsQuerySseEvent(turn.savingsQueryCard).type).toBe('savings_query_card');
  });

  it('canned 流先发卡事件再发 token + done (绝不经过 Letta)', async () => {
    const turn = buildSavingsQueryTurn({
      userContent: '本月省了多少', locale: 'zh', events: septemberEvents(), now: NOW, hourlyRate: 25, rng: () => 0,
    })!;
    const text = await new Response(buildSavingsQuerySseStream(turn)).text();
    const events = text.trim().split('\n\n').map((line) => JSON.parse(line.replace(/^data: /, '')));
    expect(events[0].type).toBe('savings_query_card');
    expect(events[0].savingsQueryCard.intercepts).toBe(4);
    const tokenTypes = events.slice(1, -1).map((e: { type: string }) => e.type);
    expect(tokenTypes.every((t) => t === 'token')).toBe(true);
    expect(events[events.length - 1].type).toBe('done');
  });
});
