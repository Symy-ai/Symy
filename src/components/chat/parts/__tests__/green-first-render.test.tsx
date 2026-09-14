// @vitest-environment happy-dom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { ProductCards } from '../product-cards';
import { GreenFirstNote } from '../green-first-note';
import { _resetGreenPrefStateForTest, setGreenPrefEnabled } from '@/hooks/use-green-pref';
import type { ProductCardData } from '@/types/product-card';
import zh from '../../../../i18n/messages/zh.json';
import en from '../../../../i18n/messages/en.json';

vi.mock('next/image', () => ({
  default: ({ alt }: { alt: string }) => <img alt={alt} src="https://example.com/item.jpg" />,
}));

vi.mock('@/i18n/provider', () => ({
  useI18n: () => ({
    t: (key: string) => {
      const products = ((zh as Record<string, unknown>).chat as Record<string, unknown>)
        .products as Record<string, string> | undefined;
      return products?.[key.split('.').pop() ?? ''] || key;
    },
  }),
}));

const base: ProductCardData = {
  product_ref: 'p',
  title: 'placeholder',
  price_cents: 1200,
  price_cents_display: '¥12',
  currency: 'CNY',
};

const highCard: ProductCardData = { ...base, product_ref: 'p-high', title: '竹制牙刷（软毛）' };
const mediumCard: ProductCardData = { ...base, product_ref: 'p-medium', title: '替换装洗手液' };
const unknownCard: ProductCardData = { ...base, product_ref: 'p-unknown', title: '不锈钢扳手套装' };

const domTitles = () => [...document.querySelectorAll('article h4')].map((node) => node.textContent);

beforeEach(() => {
  localStorage.clear();
  _resetGreenPrefStateForTest();
});

afterEach(() => {
  cleanup();
  _resetGreenPrefStateForTest();
});

describe('商品卡绿色优先渲染', () => {
  it('三档稳定排序：high → medium → unknown，角标只标 high（🌱 绿色优选）', () => {
    render(
      <ProductCards
        cards={[unknownCard, mediumCard, highCard]}
      />,
    );
    expect(domTitles()).toEqual(['竹制牙刷（软毛）', '替换装洗手液', '不锈钢扳手套装']);
    expect(screen.getByText('绿色优选')).toBeTruthy();
    expect(screen.getAllByText('绿色优选')).toHaveLength(1);
  });

  it('medium 与 unknown 卡无角标 — 无标记即 unknown（不打负向标）', () => {
    render(<ProductCards cards={[mediumCard, unknownCard]} />);
    expect(screen.queryByText('绿色优选')).toBeNull();
  });

  it('结果含 high 绿色商品 → 顶部出现引导语', () => {
    render(<ProductCards cards={[unknownCard, highCard]} />);
    expect(screen.getByText('为你把绿色选项排在了前面 🌱')).toBeTruthy();
  });

  it('没有 high 绿色商品 → 不提示（medium/unknown 不算，不说教）', () => {
    render(<ProductCards cards={[unknownCard, mediumCard]} />);
    expect(screen.queryByText('为你把绿色选项排在了前面 🌱')).toBeNull();
  });

  it('绿色守护关闭 → 整体静默：不重排、无角标、无引导语', () => {
    setGreenPrefEnabled(false);
    render(<ProductCards cards={[unknownCard, highCard, mediumCard]} />);
    expect(domTitles()).toEqual(['不锈钢扳手套装', '竹制牙刷（软毛）', '替换装洗手液']);
    expect(screen.queryByText('绿色优选')).toBeNull();
    expect(screen.queryByText('为你把绿色选项排在了前面 🌱')).toBeNull();
  });
});

describe('GreenFirstNote', () => {
  it('渲染 i18n 引导语文案', () => {
    render(<GreenFirstNote />);
    expect(screen.getByText('为你把绿色选项排在了前面 🌱')).toBeTruthy();
  });
});

describe('绿色优先 i18n 双语完整性', () => {
  const products = (locale: typeof zh) =>
    ((locale as Record<string, unknown>).chat as Record<string, unknown>).products as Record<string, unknown>;

  it('greenFirstNote + greenPick 在 zh/en 都有非空文案', () => {
    for (const locale of [zh, en]) {
      expect(String(products(locale).greenFirstNote)).toBeTruthy();
      expect(String(products(locale).greenPick)).toBeTruthy();
    }
  });

  it('en 文案带 🌱 且不含碳足迹数值/货币符号（禁止红线）', () => {
    const note = String(products(en).greenFirstNote);
    expect(note).toContain('🌱');
    expect(note.toLowerCase()).not.toMatch(/carbon|co2|\d+\s?g\b|¥|€|\$/);
  });
});
