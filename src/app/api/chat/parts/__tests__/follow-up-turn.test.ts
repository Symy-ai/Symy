/**
 * follow-up-turn 测试 (batch59-c)
 *
 * 覆盖验收:
 * 1. 时间追问 (savings 轨道): 卡窗口换成 lastMonth, 数字与 57-c 既有
 *    buildSavingsQueryTurnFromWindow (内部仍是既有聚合 lib) 逐字段相等
 * 2. 维度切换追问: category/impulse 卡计数与 aggregateCategoryGuardCounts /
 *    aggregateImpulseWindows 直接对账 — 本层零新算术路径
 * 3. 空窗 honest degrade: noData/insufficient, 不编数字
 * 4. 红线: category/impulse 卡零金额字段; savings 金额只在 private;
 *    shareFace 结构上 amount-free; 掀卡话术出自 elephant-tone (庆祝措辞锁)
 * 5. SSE 流: 卡事件在前 (按轨道选事件类型), token 分块 + done 收尾
 */

import { describe, expect, it } from 'vitest';
import { buildFollowUpTurn, buildFollowUpSseStream } from '../follow-up-turn';
import { buildSavingsQueryTurnFromWindow } from '../savings-query-turn';
import { sliceEventsByQueryWindow } from '../query-window-range';
import { aggregateCategoryGuardCounts } from '@/lib/category-guard-counts';
import { aggregateImpulseWindows } from '@/lib/impulse-window';
import { getElephantPhrase } from '@/lib/elephant-tone';
import type { ResolvedFollowUp } from '../follow-up-query';
import type { SavingsQueryEvent } from '../savings-query-context';

/** 2026-09-09 周三 (本周 = 09-07 周一起) */
const NOW = new Date(2026, 8, 9, 12, 0, 0);

function event(partial: Partial<SavingsQueryEvent> & { createdAt: string }): SavingsQueryEvent {
  return {
    eventType: 'challenge_completed',
    triggerSource: null,
    triggerId: null,
    metadata: null,
    ...partial,
  };
}

/** 9 月窗 food 拦截 2 + 替代 1; 8 月窗 (lastMonth) food 拦截 1 */
function mixedEvents(): SavingsQueryEvent[] {
  const sep = (day: number, hour = 10) => new Date(2026, 8, day, hour, 0, 0).toISOString();
  const aug = (day: number, hour = 22) => new Date(2026, 7, day, hour, 0, 0).toISOString();
  return [
    event({ eventType: 'challenge_completed', triggerId: 'm1', metadata: { category: 'food' }, createdAt: sep(2) }),
    event({ eventType: 'challenge_failed', triggerId: 'm2', metadata: { category: 'food' }, createdAt: sep(3) }),
    event({ eventType: 'mindful_recovery', metadata: { kind: 'green_alt_adoption', category: 'food' }, createdAt: sep(5) }),
    // lastMonth (8 月) 窗: 深夜冲动 1 次
    event({ eventType: 'challenge_failed', triggerId: 'aug1', metadata: { category: 'food' }, createdAt: aug(15) }),
  ];
}

describe('buildFollowUpTurn — 时间追问 (savings 轨道继承维度换窗口)', () => {
  it('resolved savings/lastMonth → 卡与 57-c intent 型 builder 逐字段相等', () => {
    const resolved: ResolvedFollowUp = { kind: 'savings', window: 'lastMonth' };
    const turn = buildFollowUpTurn({ resolved, locale: 'zh', events: mixedEvents(), now: NOW, hourlyRate: 25, rng: () => 0 });
    expect(turn.savingsQueryCard).toBeDefined();

    const expected = buildSavingsQueryTurnFromWindow({ window: 'lastMonth', locale: 'zh', events: mixedEvents(), now: NOW, hourlyRate: 25, rng: () => 0 });
    // 卡逐字段相等 (数字全部来自 57-c 既有聚合路径)
    expect(turn.savingsQueryCard).toEqual(expected.savingsQueryCard);
    expect(turn.savingsQueryCard!.window).toBe('lastMonth');
    expect(turn.savingsQueryCard!.status).toBe('ok');
    // 掀卡话术出自 elephant-tone followup 变体 (庆祝措辞锁)
    expect(turn.reply).toBe(getElephantPhrase('followup_query_welcome', 'zh', undefined, () => 0));
  });
});

describe('buildFollowUpTurn — 维度切换追问 (继承窗口换维度)', () => {
  it('resolved category/thisMonth+food → 计数与 aggregateCategoryGuardCounts 对账', () => {
    const resolved: ResolvedFollowUp = { kind: 'category', window: 'thisMonth', category: 'food' };
    const turn = buildFollowUpTurn({ resolved, locale: 'zh', events: mixedEvents(), now: NOW, rng: () => 0 });
    const card = turn.categoryQueryCard!;
    expect(card).toBeDefined();
    expect(card.window).toBe('thisMonth');
    expect(card.status).toBe('ok');

    const expected = aggregateCategoryGuardCounts(
      sliceEventsByQueryWindow(mixedEvents(), 'thisMonth', NOW),
      'food',
    );
    expect(card.intercepts).toBe(expected.intercepts);
    expect(card.altAdoptions).toBe(expected.altAdoptions);
    expect(card.reuseAdoptions).toBe(expected.reuseAdoptions);
    // 口径锚: 9 月窗 food 拦截 2 + 替代 1
    expect(card.intercepts).toBe(2);
    expect(card.altAdoptions).toBe(1);
  });

  it('resolved impulse/lastMonth+lateNight → 计数与 aggregateImpulseWindows 对账', () => {
    const resolved: ResolvedFollowUp = { kind: 'impulse', window: 'lastMonth', impulseWindow: 'lateNight' };
    const turn = buildFollowUpTurn({ resolved, locale: 'zh', events: mixedEvents(), now: NOW, rng: () => 0 });
    const card = turn.impulseTimeCard!;
    expect(card).toBeDefined();
    expect(card.window).toBe('lastMonth');
    expect(card.impulseWindow).toBe('lateNight');

    const sliced = sliceEventsByQueryWindow(mixedEvents(), 'lastMonth', NOW);
    const summary = aggregateImpulseWindows(sliced);
    expect(card.status).toBe(summary.status === 'ok' ? 'ok' : 'insufficient');
    expect(card.count).toBe(summary.counts.lateNight);
    expect(card.total).toBe(summary.total);
  });
});

describe('buildFollowUpTurn — 空窗 honest degrade (不编数字)', () => {
  it('savings 空窗 → noData + 57-c 引导态话术 (不是 followup 掀卡话术)', () => {
    const turn = buildFollowUpTurn({ resolved: { kind: 'savings', window: 'lastMonth' }, locale: 'zh', events: [], now: NOW, hourlyRate: 25, rng: () => 0 });
    expect(turn.savingsQueryCard!.status).toBe('noData');
    expect(turn.reply).toBe(getElephantPhrase('savings_query_empty', 'zh', undefined, () => 0));
  });

  it('category 空窗 → noData, 不产出编造计数', () => {
    const turn = buildFollowUpTurn({ resolved: { kind: 'category', window: 'lastWeek', category: 'food' }, locale: 'zh', events: [], now: NOW, rng: () => 0 });
    expect(turn.categoryQueryCard!.status).toBe('noData');
    expect(turn.categoryQueryCard!.intercepts).toBe(0);
  });

  it('impulse 样本不足 → insufficient 引导态', () => {
    const turn = buildFollowUpTurn({ resolved: { kind: 'impulse', window: 'thisWeek', impulseWindow: 'evening' }, locale: 'zh', events: [], now: NOW, rng: () => 0 });
    expect(turn.impulseTimeCard!.status).toBe('insufficient');
    expect(turn.reply).toBe(getElephantPhrase('impulse_query_empty', 'zh', undefined, () => 0));
  });
});

describe('buildFollowUpTurn — 红线 (金额面 / 措辞锁)', () => {
  it('category/impulse 卡零金额字段 (structural amount-free)', () => {
    const cat = buildFollowUpTurn({ resolved: { kind: 'category', window: 'thisMonth', category: 'food' }, locale: 'zh', events: mixedEvents(), now: NOW, rng: () => 0 });
    const catJson = JSON.stringify(cat.categoryQueryCard);
    expect(catJson).not.toContain('estSaved');
    expect(catJson).not.toContain('amount');
    expect(catJson).not.toContain('private');
    expect(catJson).not.toContain('shareFace');
    expect(catJson).not.toContain('$');

    const imp = buildFollowUpTurn({ resolved: { kind: 'impulse', window: 'thisMonth', impulseWindow: 'evening' }, locale: 'zh', events: mixedEvents(), now: NOW, rng: () => 0 });
    const impJson = JSON.stringify(imp.impulseTimeCard);
    expect(impJson).not.toContain('estSaved');
    expect(impJson).not.toContain('amount');
    expect(impJson).not.toContain('private');
    expect(impJson).not.toContain('$');
  });

  it('savings 卡金额只在 private; shareFace amount-free (无 $ 数字)', () => {
    const turn = buildFollowUpTurn({ resolved: { kind: 'savings', window: 'thisMonth' }, locale: 'zh', events: mixedEvents(), now: NOW, hourlyRate: 25, rng: () => 0 });
    const card = turn.savingsQueryCard!;
    const cardJson = JSON.stringify({ ...card, private: undefined, shareFace: undefined });
    expect(cardJson).not.toContain('estSaved');
    expect(card.private.estSavedTotal).toBeGreaterThanOrEqual(0);
    // 分享面无金额: 不含 $ 与元
    expect(card.shareFace.zh).not.toMatch(/\$|元|¥/);
    expect(card.shareFace.en).not.toMatch(/\$|¥/);
  });

  it('掀卡话术不报数字 (数字只出自聚合卡)', () => {
    const turn = buildFollowUpTurn({ resolved: { kind: 'category', window: 'thisMonth', category: 'food' }, locale: 'zh', events: mixedEvents(), now: NOW, rng: () => 0 });
    expect(turn.reply).not.toMatch(/\d/);
  });
});

describe('buildFollowUpSseStream — canned SSE 流', () => {
  it('savings 轨道: savings_query_card 事件在前, token 分块 + done 收尾', async () => {
    const turn = buildFollowUpTurn({ resolved: { kind: 'savings', window: 'thisMonth' }, locale: 'zh', events: mixedEvents(), now: NOW, hourlyRate: 25, rng: () => 0 });
    const stream = buildFollowUpSseStream(turn);
    const text = await new Response(stream).text();
    const lines = text.split('\n').filter((l) => l.startsWith('data: ')).map((l) => JSON.parse(l.slice(6)));
    expect(lines[0].type).toBe('savings_query_card');
    expect(lines[0].savingsQueryCard.window).toBe('thisMonth');
    expect(lines[lines.length - 1].type).toBe('done');
    expect(lines.slice(1, -1).every((l) => l.type === 'token')).toBe(true);
  });

  it('category 轨道: category_query_card 事件在前', async () => {
    const turn = buildFollowUpTurn({ resolved: { kind: 'category', window: 'thisMonth', category: 'food' }, locale: 'en', events: mixedEvents(), now: NOW, rng: () => 0 });
    const text = await new Response(buildFollowUpSseStream(turn)).text();
    const first = JSON.parse(text.split('\n').find((l) => l.startsWith('data: '))!.slice(6));
    expect(first.type).toBe('category_query_card');
    expect(first.categoryQueryCard.category).toBe('food');
  });
});
