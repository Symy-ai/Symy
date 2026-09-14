// @vitest-environment happy-dom

/**
 * StructuredProductCards 渲染边界测试 — A1 移植 (commerce-agents "UI 组件即工具")
 *
 * 覆盖: 合法卡直通渲染 (与 ProductCards 输出一致) / 坏卡在边界被拦 / 全无效不渲染。
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { StructuredProductCards } from '../structured-cards';
import type { ProductCardData } from '@/types/product-card';

vi.mock('next/image', () => ({
  default: ({ alt }: { alt: string }) => <img alt={alt} src="https://example.com/item.jpg" />,
}));

vi.mock('@/i18n/provider', () => ({
  useI18n: () => ({
    t: (key: string) => ({
      'chat.products.buy': 'Buy',
    })[key] || key,
  }),
}));

const card: ProductCardData = {
  product_ref: 'p1',
  title: 'Guizhou sauce liquor 500ml',
  price_cents: 32800,
  price_cents_display: '¥328',
  currency: 'CNY',
  marketplace_url: 'https://example.com/buy',
};

describe('StructuredProductCards', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('renders valid cards identically to the inner ProductCards', () => {
    render(<StructuredProductCards cards={[card]} />);
    expect(screen.getAllByText('Guizhou sauce liquor 500ml').length).toBeGreaterThan(0);
    expect(screen.getByRole('link', { name: 'Buy' }).getAttribute('href')).toBe('https://example.com/buy');
  });

  it('drops hostile cards at the render boundary, keeps valid ones', () => {
    render(
      <StructuredProductCards
        cards={[
          // 越界数组混入的坏形态: 字符串冒充卡片 / ref 带注入换行
          'buy now!!' as unknown as ProductCardData,
          { ...card, product_ref: 'p\nevil' },
          card,
        ]}
      />,
    );
    expect(screen.getAllByText('Guizhou sauce liquor 500ml').length).toBeGreaterThan(0);
    expect(document.querySelectorAll('article')).toHaveLength(1);
  });

  it('renders nothing when every card fails validation or list is empty', () => {
    const { container: empty } = render(<StructuredProductCards cards={[]} />);
    expect(empty.querySelector('article')).toBeNull();
    const { container: allBad } = render(
      <StructuredProductCards cards={[{ ...card, price_cents: 12.5 }]} />,
    );
    expect(allBad.querySelector('article')).toBeNull();
  });
});
