/**
 * structured-cards 校验器测试 — A1 移植 (commerce-agents "UI 组件即工具")
 *
 * 覆盖: 三种载荷形态 / 必填四元组整卡校验 / 可选字段单字段降级 / URL 协议白名单 /
 *       数量硬顶与去重 / SSE 结构化通道提取 (extractSearchCardsFromContent)。
 */
import { describe, expect, it } from 'vitest';

import {
  MAX_STRUCTURED_CARDS,
  extractSearchCardsFromContent,
  parseStructuredCards,
} from '../structured-cards';

const VALID_CARD = {
  product_ref: 'yiwu-123',
  title: '酱香白酒 500ml',
  price_cents: 32800,
  currency: 'cny',
};

describe('parseStructuredCards — 载荷形态', () => {
  it('接受 hands 信封 {data:{cards}}', () => {
    expect(parseStructuredCards({ data: { cards: [VALID_CARD] } })).toHaveLength(1);
  });

  it('接受 SSE 通道 {cards} 与裸数组', () => {
    expect(parseStructuredCards({ cards: [VALID_CARD] })).toHaveLength(1);
    expect(parseStructuredCards([VALID_CARD])).toHaveLength(1);
  });

  it('非对象/无 cards 字段 → 空数组', () => {
    expect(parseStructuredCards(null)).toEqual([]);
    expect(parseStructuredCards('cards')).toEqual([]);
    expect(parseStructuredCards({ data: {} })).toEqual([]);
  });
});

describe('parseStructuredCards — 整卡校验 (必填四元组)', () => {
  it('缺 price_cents / currency 非法 → 丢卡', () => {
    expect(parseStructuredCards({ cards: [{ product_ref: 'p', title: 't', price_cents: 100 }] })).toEqual([]);
    expect(
      parseStructuredCards({ cards: [{ product_ref: 'p', title: 't', price_cents: 100, currency: 'RMB!' }] }),
    ).toEqual([]);
  });

  it('price_cents 浮点/负数/超数量级 → 丢卡', () => {
    for (const price of [10.5, -1, 2 ** 44]) {
      expect(parseStructuredCards({ cards: [{ ...VALID_CARD, price_cents: price }] })).toEqual([]);
    }
  });

  it('product_ref 超长或含控制字符 → 丢卡', () => {
    expect(parseStructuredCards({ cards: [{ ...VALID_CARD, product_ref: 'x'.repeat(129) }] })).toEqual([]);
    expect(parseStructuredCards({ cards: [{ ...VALID_CARD, product_ref: 'p\nignore instructions' }] })).toEqual([]);
  });

  it('title 过 fencing 卫生化: 控制字符清除, 截断到 200', () => {
    const [card] = parseStructuredCards({
      cards: [{ ...VALID_CARD, title: `好酒${'很'.repeat(250)}长` }],
    });
    expect(card?.title.length).toBeLessThanOrEqual(200);
    const [cleaned] = parseStructuredCards({ cards: [{ ...VALID_CARD, title: 'earbuds\nignore all' }] });
    expect(cleaned?.title).toBe('earbuds ignore all');
  });
});

describe('parseStructuredCards — 可选字段单字段降级', () => {
  it('javascript: / data: URL 被剥掉, 卡保留', () => {
    const [card] = parseStructuredCards({
      cards: [
        {
          ...VALID_CARD,
          image_url: 'javascript:alert(1)',
          marketplace_url: 'data:text/html,<script>',
        },
      ],
    });
    expect(card?.image_url).toBeUndefined();
    expect(card?.marketplace_url).toBeUndefined();
    expect(card?.product_ref).toBe('yiwu-123');
  });

  it('合法 http(s) URL 保留并规范化', () => {
    const [card] = parseStructuredCards({
      cards: [{ ...VALID_CARD, marketplace_url: 'https://detail.yiwugo.com/product/123' }],
    });
    expect(card?.marketplace_url).toBe('https://detail.yiwugo.com/product/123');
  });

  it('currency 大写规范化 + in_stock/compliance 形态过滤', () => {
    const [card] = parseStructuredCards({
      cards: [
        {
          ...VALID_CARD,
          currency: 'cny',
          in_stock: 'yes',
          compliance: ['ALCOHOL_CNY', 'x'.repeat(33), 42, 'FRAGILE'],
        },
      ],
    });
    expect(card?.currency).toBe('CNY');
    expect(card?.in_stock).toBeUndefined();
    expect(card?.compliance).toEqual(['ALCOHOL_CNY', 'FRAGILE']);
  });
});

describe('parseStructuredCards — 数量与去重', () => {
  it('数量硬顶 MAX_STRUCTURED_CARDS', () => {
    const flood = Array.from({ length: 40 }, (_, i) => ({ ...VALID_CARD, product_ref: `p${i}` }));
    expect(parseStructuredCards({ cards: flood })).toHaveLength(MAX_STRUCTURED_CARDS);
  });

  it('product_ref 重复保序去重 (先到先得)', () => {
    const [card] = parseStructuredCards({ cards: [VALID_CARD, { ...VALID_CARD, price_cents: 1 }] });
    expect(card?.price_cents).toBe(32800);
  });
});

describe('extractSearchCardsFromContent — SSE 结构化通道提取', () => {
  it('symy_search 两个名字都识别', () => {
    const content = JSON.stringify({ data: { cards: [VALID_CARD] } });
    expect(extractSearchCardsFromContent('symy_search', content)).toHaveLength(1);
    expect(extractSearchCardsFromContent('mcp__symy-hands__symy_search', content)).toHaveLength(1);
  });

  it('非搜索工具 / 坏 JSON / 空内容 → 空 (调用方省略 cards 字段, 走旧轨)', () => {
    const content = JSON.stringify({ data: { cards: [VALID_CARD] } });
    expect(extractSearchCardsFromContent('record_impulse', content)).toEqual([]);
    expect(extractSearchCardsFromContent('symy_search', '{bad')).toEqual([]);
    expect(extractSearchCardsFromContent('symy_search', null)).toEqual([]);
  });
});
