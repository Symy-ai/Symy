/**
 * category-query-turn 测试 (batch58-c)
 *
 * 覆盖验收:
 * 1. "这个月奶茶拦截几次" 命中 → 卡上该类计数与 aggregateCategoryGuardCounts
 *    输出逐一相等 (卡层不做第二遍计算)
 * 2. 窗外事件不计入 (时间窗切片)
 * 3. 无数据窗 → noData 引导态 (不造 0 结论)
 * 4. 红线: 卡上零金额零碳数值; 非问句 / 未命中品类 → null (回落 57-c)
 * 5. SSE 流: category_query_card 事件在前, token 分块 + done 收尾
 */

import { describe, expect, it } from 'vitest';
import { buildCategoryQueryTurn, buildCategoryQuerySseStream } from '../category-query-turn';
import type { SavingsQueryEvent } from '../savings-query-context';
import { aggregateCategoryGuardCounts } from '@/lib/category-guard-counts';

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

/** 9 月窗: food (奶茶) 拦截 3 + 替代 2 + 复用 1; clothing 拦截 1; 窗外 food 1 */
function septemberEvents(): SavingsQueryEvent[] {
  const sep = (day: number, hour = 10) => new Date(2026, 8, day, hour, 0, 0).toISOString();
  return [
    event({ eventType: 'challenge_completed', triggerId: 'm1', metadata: { category: 'food' }, createdAt: sep(2) }),
    event({ eventType: 'challenge_completed', triggerId: 'm2', metadata: { category: 'food' }, createdAt: sep(3) }),
    event({ eventType: 'challenge_failed', triggerId: 'm3', metadata: { category: 'food' }, createdAt: sep(4) }),
    event({ eventType: 'mindful_recovery', metadata: { kind: 'green_alt_adoption', category: 'food' }, createdAt: sep(5) }),
    event({ eventType: 'mindful_recovery', metadata: { kind: 'green_alt_adoption', category: 'food' }, createdAt: sep(6) }),
    event({ eventType: 'mindful_recovery', metadata: { kind: 'reuse_adoption', category: 'food' }, createdAt: sep(6) }),
    event({ eventType: 'challenge_completed', triggerId: 'c1', metadata: { category: 'clothing' }, createdAt: sep(5) }),
    // 窗外 (8 月): 不计入本月
    event({ eventType: 'challenge_completed', triggerId: 'aug', metadata: { category: 'food' }, createdAt: new Date(2026, 7, 15, 10).toISOString() }),
  ];
}

describe('buildCategoryQueryTurn — 有数据', () => {
  it('zh: "这个月奶茶拦截了几次" → food 计数与聚合 lib 输出相等', () => {
    const turn = buildCategoryQueryTurn({
      userContent: '这个月奶茶拦截了几次',
      locale: 'zh',
      events: septemberEvents(),
      now: NOW,
      rng: () => 0,
    });
    expect(turn).not.toBeNull();
    const card = turn!.categoryQueryCard;
    expect(card.status).toBe('ok');
    expect(card.window).toBe('thisMonth');
    expect(card.category).toBe('food');

    // 与聚合 lib 直接对账 (窗外事件已切片掉)
    const expected = aggregateCategoryGuardCounts(
      septemberEvents().filter((e) => new Date(e.createdAt) >= new Date(2026, 8, 1)),
      'food',
    );
    expect(card.intercepts).toBe(expected.intercepts);
    expect(card.altAdoptions).toBe(expected.altAdoptions);
    expect(card.reuseAdoptions).toBe(expected.reuseAdoptions);
    // 口径锚: food 拦截 3 (2 胜 1 弃) + 替代 2 + 复用 1
    expect(card.intercepts).toBe(3);
    expect(card.altAdoptions).toBe(2);
    expect(card.reuseAdoptions).toBe(1);
  });

  it('en: "how many times did I skip milk tea" → food, 窗外不计入', () => {
    const turn = buildCategoryQueryTurn({
      userContent: 'how many times did I skip milk tea this month',
      locale: 'en',
      events: septemberEvents(),
      now: NOW,
      rng: () => 0,
    });
    expect(turn).not.toBeNull();
    expect(turn!.categoryQueryCard.intercepts).toBe(3);
  });

  it('该类 0 计数但窗内有数据 → ok 态如实展示 0 (不造 noData)', () => {
    const turn = buildCategoryQueryTurn({
      userContent: '这个月电子产品拦截了几次',
      locale: 'zh',
      events: septemberEvents(),
      now: NOW,
      rng: () => 0,
    });
    expect(turn).not.toBeNull();
    const card = turn!.categoryQueryCard;
    expect(card.status).toBe('ok');
    expect(card.intercepts).toBe(0);
    expect(card.altAdoptions).toBe(0);
  });
});

describe('buildCategoryQueryTurn — 引导态与红线', () => {
  it('空窗 → noData + 引导话术', () => {
    const turn = buildCategoryQueryTurn({
      userContent: '这个月奶茶拦截了几次',
      locale: 'zh',
      events: [],
      now: NOW,
      rng: () => 0,
    });
    expect(turn).not.toBeNull();
    expect(turn!.categoryQueryCard.status).toBe('noData');
    expect(turn!.reply).toContain('开张');
  });

  it('卡上零金额零碳数值 (结构 amount-free)', () => {
    const turn = buildCategoryQueryTurn({
      userContent: '这个月奶茶拦截了几次',
      locale: 'zh',
      events: septemberEvents(),
      now: NOW,
      rng: () => 0,
    });
    expect(JSON.stringify(turn!.categoryQueryCard)).not.toMatch(/\$|amount|estSaved|carbon|kg/i);
  });

  it('非问句 / 未命中品类 → null (回落 57-c)', () => {
    expect(buildCategoryQueryTurn({ userContent: '今天天气不错', locale: 'zh', events: [], now: NOW })).toBeNull();
    expect(buildCategoryQueryTurn({ userContent: '这个月省了多少', locale: 'zh', events: [], now: NOW })).toBeNull();
  });
});

describe('category-query SSE', () => {
  it('canned 流先发卡事件再发 token + done (绝不经过 Letta)', async () => {
    const turn = buildCategoryQueryTurn({
      userContent: '这个月奶茶拦截了几次', locale: 'zh', events: septemberEvents(), now: NOW, rng: () => 0,
    })!;
    const text = await new Response(buildCategoryQuerySseStream(turn)).text();
    const events = text.trim().split('\n\n').map((line) => JSON.parse(line.replace(/^data: /, '')));
    expect(events[0].type).toBe('category_query_card');
    expect(events[0].categoryQueryCard.intercepts).toBe(3);
    const tokenTypes = events.slice(1, -1).map((e: { type: string }) => e.type);
    expect(tokenTypes.every((t) => t === 'token')).toBe(true);
    expect(events[events.length - 1].type).toBe('done');
  });
});
