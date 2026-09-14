// @vitest-environment happy-dom

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { ProductCards } from '../product-cards';
import type { ProductCardData } from '@/types/product-card';

vi.mock('next/image', () => ({
  default: ({ onError, alt }: { onError: () => void; alt: string }) => (
    <img alt={alt} src="https://example.com/item.jpg" onError={onError} />
  ),
}));

vi.mock('@/i18n/provider', () => ({
  useI18n: () => ({
    t: (key: string) => ({
      'chat.products.buy': 'Buy',
      'chat.products.soldOut': 'Sold out',
      'chat.products.adultsOnly': 'Adults only',
      'chat.products.greenPick': 'Green pick',
      'chat.products.greenerOptions': 'Has greener options',
      'chat.products.greenFirstNote': 'Ranked greener options first',
      'chat.products.greenIntentNote': 'Showing greener choices for your search',
    })[key] || key,
  }),
}));

const card: ProductCardData = {
  product_ref: 'p1',
  title: 'Guizhou sauce liquor 500ml',
  price_cents: 32800,
  price_cents_display: '¥328',
  unit_label: '500ml',
  currency: 'CNY',
  image_url: 'https://example.com/item.jpg',
  marketplace_url: 'https://example.com/buy',
  in_stock: true,
  compliance: ['ALCOHOL_CNY'],
};

describe('ProductCards', () => {
  beforeEach(() => {
    localStorage.clear();
    global.fetch = vi.fn();
  });

  it('renders card fields and actions', () => {
    render(<ProductCards cards={[card]} />);
    expect(screen.getByText('Guizhou sauce liquor 500ml')).toBeTruthy();
    expect(screen.getByText('¥328')).toBeTruthy();
    expect(screen.getByText('500ml')).toBeTruthy();
    expect(screen.getByText('Adults only')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Buy' }).getAttribute('href')).toBe('https://example.com/buy');
  });

  it('renders sold out styling', () => {
    render(<ProductCards cards={[{ ...card, in_stock: false }]} />);
    expect(screen.getByText('Sold out')).toBeTruthy();
    expect(document.querySelector('article')?.className).toContain('grayscale');
  });

  it('falls back when image loading fails', () => {
    render(<ProductCards cards={[card]} />);
    act(() => fireEvent(screen.getByAltText(card.title), new Event('error')));
    expect(screen.getByLabelText('Package icon fallback')).toBeTruthy();
  });

  it('renders green pick badge and greener-options tip', () => {
    render(
      <ProductCards
        cards={[
          { ...card, product_ref: 'p-disposable', title: 'Disposable plastic cups 50-pack', compliance: [] },
          { ...card, product_ref: 'p-organic', title: 'Organic cotton tote bag', compliance: [] },
        ]}
      />,
    );
    expect(screen.getByText('Green pick')).toBeTruthy();
    expect(screen.getByText('Has greener options')).toBeTruthy();
  });

  it('sorts green pick cards first while keeping order stable otherwise', () => {
    render(
      <ProductCards
        cards={[
          { ...card, product_ref: 'p-disposable', title: 'Disposable plastic cups 50-pack', compliance: [] },
          { ...card, product_ref: 'p-plain', title: 'Steel wrench set', compliance: [] },
          { ...card, product_ref: 'p-organic', title: 'Organic cotton tote bag', compliance: [] },
        ]}
      />,
    );
    const titles = [...document.querySelectorAll('article h4')].map((node) => node.textContent);
    expect(titles).toEqual([
      'Organic cotton tote bag',
      'Disposable plastic cups 50-pack',
      'Steel wrench set',
    ]);
  });

  it('hides the greener-options tip when the card already earns a green pick', () => {
    render(
      <ProductCards
        cards={[{ ...card, product_ref: 'p-recycled', title: 'Recycled plastic storage bin', compliance: [] }]}
      />,
    );
    expect(screen.getByText('Green pick')).toBeTruthy();
    expect(screen.queryByText('Has greener options')).toBeNull();
  });

  it('green query promotes a weak-signal card (badge + reorder) vs the no-query baseline', () => {
    const cards = [
      { ...card, product_ref: 'p-reusable', title: 'Reusable stainless cup', compliance: [] },
      { ...card, product_ref: 'p-organic', title: 'Organic tote bag', compliance: [] },
    ];
    // 基线（现状契约）：无 query — reusable 55 分只到 medium 不上徽章，organic 排前，无意图引导语
    const baseline = render(<ProductCards cards={cards} />);
    expect([...baseline.container.querySelectorAll('article h4')].map((n) => n.textContent)).toEqual([
      'Organic tote bag',
      'Reusable stainless cup',
    ]);
    expect(screen.getAllByText('Green pick')).toHaveLength(1);
    expect(screen.queryByText('Showing greener choices for your search')).toBeNull();
    baseline.unmount();

    // 绿色 query：意图加成 (55+10=65) 让 reusable 升 high → 同档稳定排序回到原序 + 徽章 + 意图引导语
    render(<ProductCards cards={cards} query="环保材质水杯" />);
    expect([...document.querySelectorAll('article h4')].map((n) => n.textContent)).toEqual([
      'Reusable stainless cup',
      'Organic tote bag',
    ]);
    expect(screen.getAllByText('Green pick')).toHaveLength(2);
    expect(screen.getByText('Ranked greener options first')).toBeTruthy();
    expect(screen.getByText('Showing greener choices for your search')).toBeTruthy();
  });

  it('no query prop renders byte-identical to query="" (backward compat)', () => {
    const cards = [
      { ...card, product_ref: 'p-reusable', title: 'Reusable stainless cup', compliance: [] },
      { ...card, product_ref: 'p-organic', title: 'Organic tote bag', compliance: [] },
    ];
    const withoutQuery = render(<ProductCards cards={cards} />);
    const withoutQueryHtml = withoutQuery.container.innerHTML;
    withoutQuery.unmount();
    const withEmptyQuery = render(<ProductCards cards={cards} query="" />);
    expect(withEmptyQuery.container.innerHTML).toBe(withoutQueryHtml);
  });
});
