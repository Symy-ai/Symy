import { describe, expect, it } from 'vitest';
import { formatPrice } from '@/lib/product-card-format';
import type { ProductCardData } from '@/types/product-card';

const card = (overrides: Partial<ProductCardData> = {}): ProductCardData => ({
  product_ref: 'p-web',
  title: '竹柄不锈钢吸管',
  price_cents: 0,
  currency: 'CNY',
  ...overrides,
});

describe('formatPrice', () => {
  it('price=0 无 display → 返回“价格见链接”', () => {
    expect(formatPrice(card(), '价格见链接')).toBe('价格见链接');
  });

  it('price=0 但 display 存在 → display 优先', () => {
    expect(formatPrice(card({ price_cents_display: '免费领取' }), '价格见链接')).toBe('免费领取');
  });

  it('price>0 → 使用卡片币种格式化金额', () => {
    expect(formatPrice(card({ price_cents: 1200, currency: 'USD' }), '价格见链接')).toBe('$12.00');
  });
});
