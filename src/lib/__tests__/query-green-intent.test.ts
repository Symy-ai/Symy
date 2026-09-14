import { describe, expect, it } from 'vitest';

import {
  evaluateGreenSignal,
  GREEN_QUERY_INTENT_BONUS,
  queryHasGreenIntent,
  type GreenSignalCardInput,
} from '@/lib/green-rules';
import { rankCardsByGreenLevel } from '@/lib/green-first-rank';
import type { ProductCardData } from '@/types/product-card';

const card = (overrides: Partial<GreenSignalCardInput> = {}): GreenSignalCardInput => ({
  title: 'Plain product',
  ...overrides,
});

describe('queryHasGreenIntent — 用户查询的绿色意图（独立于卡片文本）', () => {
  it('zh 意图命中：环保水杯 = true', () => {
    expect(queryHasGreenIntent('环保水杯')).toBe(true);
  });

  it('en 词表命中：organic cotton 命中', () => {
    expect(queryHasGreenIntent('organic cotton tote')).toBe(true);
    expect(queryHasGreenIntent('eco-friendly bottle')).toBe(true);
  });

  it("普通查询不命中：水杯 / 空串 = false", () => {
    expect(queryHasGreenIntent('水杯')).toBe(false);
    expect(queryHasGreenIntent('')).toBe(false);
  });

  it('否定短语不命中（GREEN_FLAG_RULES 语义：非塑料/仿皮草/plastic-free 都不是绿色意图）', () => {
    expect(queryHasGreenIntent('非塑料收纳盒')).toBe(false);
    expect(queryHasGreenIntent('仿皮草外套')).toBe(false);
    expect(queryHasGreenIntent('plastic-free bottle')).toBe(false);
  });

  it('null/undefined 容错降级为空串（与 evaluateGreenSignal 提取前行为一致）', () => {
    expect(queryHasGreenIntent(undefined as unknown as string)).toBe(false);
  });
});

describe('evaluateGreenSignal 行为零变化（纯提取重构）', () => {
  it('意图加成分支原样保留：query 命中 → 全部卡 +GREEN_QUERY_INTENT_BONUS', () => {
    const cards = [card({ title: '竹制牙刷' }), card({ title: '不锈钢扳手' })];
    const blank = evaluateGreenSignal('', cards);
    const withQuery = evaluateGreenSignal('环保', cards);
    withQuery.forEach((signal, i) => {
      expect(signal.green_score).toBe(blank[i].green_score + GREEN_QUERY_INTENT_BONUS);
      expect(signal.green_flags).toEqual(blank[i].green_flags);
      expect(signal.non_green_flag).toBe(blank[i].non_green_flag);
    });
  });

  it('queryHasGreenIntent 与加分分支判定同源：函数 true ⇔ 加分发生', () => {
    for (const query of ['环保水杯', '水杯', '', 'organic cotton']) {
      const [signal] = evaluateGreenSignal(query, [card({ title: 'Plain', category: 'x' })]);
      const boosted = signal.green_score > evaluateGreenSignal('', [card({ title: 'Plain', category: 'x' })])[0].green_score;
      expect(boosted).toBe(queryHasGreenIntent(query));
    }
  });
});

describe('分档不变性（反造假守卫）：rankCardsByGreenLevel 输出与 query 无关', () => {
  const products: ProductCardData[] = [
    { product_ref: 'u', title: '不锈钢扳手套装', price_cents: 100, price_cents_display: '¥1', currency: 'CNY' },
    { product_ref: 'm', title: '替换装洗手液', price_cents: 200, price_cents_display: '¥2', currency: 'CNY' },
    { product_ref: 'h', title: '竹制牙刷（软毛）', price_cents: 300, price_cents_display: '¥3', currency: 'CNY' },
  ];

  it("管道内部固定传空串：每张卡的 signal 与 query='' 评估完全一致，排序/level/hasHigh 稳定", () => {
    const first = rankCardsByGreenLevel(products, true);
    const second = rankCardsByGreenLevel(products, true);
    // 两次调用（模拟不同 query 语境）结果逐位一致
    expect(second.ranked.map((e) => e.card.product_ref)).toEqual(first.ranked.map((e) => e.card.product_ref));
    expect(second.hasHigh).toBe(first.hasHigh);
    // 管道用的 signal 必须等于 query='' 的评估 — 意图加分没有从任何侧门漏进分档
    const blankSignals = evaluateGreenSignal('', products);
    for (const entry of first.ranked) {
      const idx = products.findIndex((p) => p.product_ref === entry.card.product_ref);
      expect(entry.signal).toEqual(blankSignals[idx]);
    }
    expect(first.hasHigh).toBe(true);
  });

  it('三档分层不受任何 query 影响：high→medium→unknown 且徽章判定只看卡文本', () => {
    const { ranked, hasHigh } = rankCardsByGreenLevel(products, true);
    expect(ranked.map((e) => [e.card.product_ref, e.level])).toEqual([
      ['h', 'high'],
      ['m', 'medium'],
      ['u', 'unknown'],
    ]);
    expect(hasHigh).toBe(true);
  });

  it('同一张普通卡：含意图 query 存在时也不得进入 high 档（intent-bonus never fabricates levels）', () => {
    // 管道 API 不接收 query — 这是立场本身；这里锁死它不会以任何形式回传意图
    const plain = [products[0]];
    const result = rankCardsByGreenLevel(plain, true);
    expect(result.ranked[0].level).toBe('unknown');
    expect(result.hasHigh).toBe(false);
    // 对照：evaluateGreenSignal 直收 '环保' 会 +10（保留语义），但仍够不着 high（60）线
    const boosted = evaluateGreenSignal('环保', plain)[0];
    expect(boosted.green_score).toBe(GREEN_QUERY_INTENT_BONUS);
  });
});
