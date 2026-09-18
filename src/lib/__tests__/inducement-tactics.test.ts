/**
 * inducement-tactics 纯逻辑测试 — 战术分类 + 社区聚合 (batch81-b)
 */

import { describe, expect, it } from 'vitest';
import {
  aggregateInducementTactics,
  classifyInducementTactic,
  INDUCEMENT_TACTIC_META,
  MIN_TACTIC_SAMPLE_EVENTS,
  type InducementTacticId,
} from '../inducement-tactics';

describe('classifyInducementTactic — 战术词表分类', () => {
  const cases: Array<{ id: InducementTacticId; text: string }> = [
    { id: 'payday_loan', text: 'Quick payday loan until your next check' },
    { id: 'payday_loan', text: '发薪日贷款，先拿到钱再说' },
    { id: 'cash_advance', text: 'Get a cash advance on your paycheck' },
    { id: 'zero_apr_intro', text: 'Enjoy 0% intro APR for 12 months' },
    { id: 'minimum_payment', text: 'Just pay the minimum payment this month' },
    { id: 'credit_limit_increase', text: 'You are pre-approved for a credit limit increase' },
    { id: 'subprime_credit_card', text: 'Subprime credit card for rebuilding credit' },
    { id: 'bnpl', text: 'Pay in 4 interest-free installments with Klarna' },
    { id: 'scarcity', text: 'Hurry, only 3 left in stock!' },
    { id: 'scarcity', text: '直播间仅剩 5 件，拍完下架' },
    { id: 'social_proof', text: '2.3k sold this week — everyone is buying' },
    { id: 'social_proof', text: '全网爆款，已售 10 万件' },
    { id: 'limited_time', text: 'Flash sale ends tonight!' },
  ];

  it.each(cases)('maps "$text" → $id', ({ id, text }) => {
    expect(classifyInducementTactic({ rawText: text })).toBe(id);
  });

  it('checks title as well as raw text', () => {
    expect(classifyInducementTactic({ title: 'Flash Sale', rawText: 'wireless earbuds' })).toBe('limited_time');
  });

  it('falls back to the isFlashSale flag when no keyword matches', () => {
    expect(classifyInducementTactic({ isFlashSale: true, rawText: 'mystery box' })).toBe('limited_time');
  });

  it('returns null for events with no detectable tactic (不硬塞桶)', () => {
    expect(classifyInducementTactic({ rawText: 'weekly groceries' })).toBeNull();
    expect(classifyInducementTactic({ isFlashSale: false, title: null, rawText: null })).toBeNull();
  });

  it('prioritizes specific debt phrasing over the flash-sale flag', () => {
    expect(classifyInducementTactic({ isFlashSale: true, rawText: 'Klarna pay in 4 flash event' })).toBe('bnpl');
  });

  it('prioritizes credit-limit phrasing over BNPL mentions', () => {
    expect(classifyInducementTactic({ rawText: 'pre-approved Klarna partner offer' })).toBe('credit_limit_increase');
  });
});

describe('aggregateInducementTactics — 聚合', () => {
  it('computes descending percentages over classified events only', () => {
    const events = [
      ...Array.from({ length: 3 }, () => ({ rawText: 'flash sale deal' })),
      ...Array.from({ length: 1 }, () => ({ rawText: 'Klarna pay in 4' })),
      { rawText: 'plain grocery order' },
    ];

    const { strategies, classifiedCount, totalEvents } = aggregateInducementTactics(events);

    expect(totalEvents).toBe(5);
    expect(classifiedCount).toBe(4);
    expect(strategies).toEqual([
      { id: 'limited_time', count: 3, percentage: 75 },
      { id: 'bnpl', count: 1, percentage: 25 },
    ]);
  });

  it('keeps one decimal of precision and breaks count ties alphabetically', () => {
    const events = [
      { rawText: 'flash sale' },
      { rawText: 'only 2 left' },
      { rawText: 'trending now' },
    ];

    const { strategies } = aggregateInducementTactics(events);

    expect(strategies).toEqual([
      { id: 'limited_time', count: 1, percentage: 33.3 },
      { id: 'scarcity', count: 1, percentage: 33.3 },
      { id: 'social_proof', count: 1, percentage: 33.3 },
    ]);
  });

  it('returns an empty aggregation for no events', () => {
    const { strategies, classifiedCount, totalEvents } = aggregateInducementTactics([]);
    expect(strategies).toEqual([]);
    expect(classifiedCount).toBe(0);
    expect(totalEvents).toBe(0);
  });

  it('drops tactics rounded down to 0% on very large communities', () => {
    const events = [
      ...Array.from({ length: 2000 }, () => ({ rawText: 'trending now' })),
      { rawText: 'flash sale' },
    ];

    const { strategies, classifiedCount } = aggregateInducementTactics(events);
    expect(classifiedCount).toBe(2001);
    expect(strategies).toEqual([{ id: 'social_proof', count: 2000, percentage: 100 }]);
  });
});

describe('taxonomy — 战术元数据', () => {
  it('covers every tactic id with an i18n labelKey + English fallback', () => {
    const ids = Object.keys(INDUCEMENT_TACTIC_META) as InducementTacticId[];
    expect(ids).toHaveLength(10);
    for (const id of ids) {
      expect(INDUCEMENT_TACTIC_META[id].labelKey).toBe(`defense.strategy${id.charAt(0).toUpperCase()}${id.slice(1).replace(/_(\w)/g, (_, c: string) => c.toUpperCase())}`);
      expect(INDUCEMENT_TACTIC_META[id].defaultLabel.length).toBeGreaterThan(0);
    }
  });

  it('marks aggregations below the sample threshold for the frontend badge', () => {
    expect(MIN_TACTIC_SAMPLE_EVENTS).toBe(20);
    const few = aggregateInducementTactics(Array.from({ length: MIN_TACTIC_SAMPLE_EVENTS - 1 }, () => ({ rawText: 'flash sale' })));
    expect(few.classifiedCount).toBeLessThan(MIN_TACTIC_SAMPLE_EVENTS);
  });
});
