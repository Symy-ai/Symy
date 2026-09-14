// @vitest-environment happy-dom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { ProductCards } from '../product-cards';
import { GreenIntentNote } from '../green-intent-note';
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
const unknownCard2: ProductCardData = { ...base, product_ref: 'p-unknown2', title: '陶瓷马克杯' };

const domTitles = () => [...document.querySelectorAll('article h4')].map((node) => node.textContent);
const badgeCount = () => screen.queryAllByText('绿色优选').length;

beforeEach(() => {
  localStorage.clear();
  _resetGreenPrefStateForTest();
});

afterEach(() => {
  cleanup();
  _resetGreenPrefStateForTest();
});

describe('ProductCards query 意图引导语（batch22-c note / batch25-c 分档接线）', () => {
  it('query 含绿色意图 → 意图 note 出现，弱信号卡借加成升档上徽章；零命中卡不动（零造假）', () => {
    const cards = [unknownCard, highCard, mediumCard];
    render(<ProductCards cards={cards} query="环保水杯" />);
    expect(screen.getByText('你的搜索本身就是绿色的 🌱')).toBeTruthy();
    // 替换装 55 + 意图加成 10 过徽章线 → 升 high；零命中的不锈钢不凭空变绿，仍殿后无徽章
    expect(domTitles()).toEqual(['竹制牙刷（软毛）', '替换装洗手液', '不锈钢扳手套装']);
    expect(badgeCount()).toBe(2);
    cleanup();

    render(<ProductCards cards={cards} query="" />);
    // 无意图时维持现状：替换装 medium 无徽章
    expect(domTitles()).toEqual(['竹制牙刷（软毛）', '替换装洗手液', '不锈钢扳手套装']);
    expect(badgeCount()).toBe(1);
  });

  it('无 high 卡也照常提示（意图 note 只看查询本身，独立于优选 note）', () => {
    // 全零命中卡组：意图加成不给 flags、不产生 high 档 → 只有意图 note，无优选 note 无徽章
    render(<ProductCards cards={[unknownCard, unknownCard2]} query="环保水杯" />);
    expect(screen.getByText('你的搜索本身就是绿色的 🌱')).toBeTruthy();
    expect(screen.queryByText('为你把绿色选项排在了前面 🌱')).toBeNull();
    expect(badgeCount()).toBe(0);
  });

  it('query 为空 / 无意图 → 无意图 note', () => {
    render(<ProductCards cards={[highCard]} />);
    expect(screen.queryByText('你的搜索本身就是绿色的 🌱')).toBeNull();
    cleanup();

    render(<ProductCards cards={[highCard]} query="水杯" />);
    expect(screen.queryByText('你的搜索本身就是绿色的 🌱')).toBeNull();
    expect(screen.getByText('为你把绿色选项排在了前面 🌱')).toBeTruthy();
  });

  it('两 note 同现：优选 note 在前、意图 note 在后', () => {
    render(<ProductCards cards={[highCard]} query="环保水杯" />);
    const notes = screen.getAllByText(/🌱$/);
    expect(notes).toHaveLength(2);
    expect(notes[0].textContent).toContain('绿色选项排在了前面');
    expect(notes[1].textContent).toBe('你的搜索本身就是绿色的 🌱');
  });

  it('绿色守护关闭 → 双 note 全静默（与整链静默语义一致）', () => {
    setGreenPrefEnabled(false);
    render(<ProductCards cards={[unknownCard, highCard, mediumCard]} query="环保水杯" />);
    expect(screen.queryByText('你的搜索本身就是绿色的 🌱')).toBeNull();
    expect(screen.queryByText('为你把绿色选项排在了前面 🌱')).toBeNull();
    expect(badgeCount()).toBe(0);
    expect(domTitles()).toEqual(['不锈钢扳手套装', '竹制牙刷（软毛）', '替换装洗手液']);
  });
});

describe('GreenIntentNote', () => {
  it('渲染 i18n 意图引导语文案', () => {
    render(<GreenIntentNote />);
    expect(screen.getByText('你的搜索本身就是绿色的 🌱')).toBeTruthy();
  });
});

describe('greenIntentNote i18n 双语完整性', () => {
  const products = (locale: typeof zh) =>
    ((locale as Record<string, unknown>).chat as Record<string, unknown>).products as Record<string, unknown>;

  it('greenIntentNote 在 zh/en 都有非空文案（键对称）', () => {
    for (const locale of [zh, en]) {
      expect(String(products(locale).greenIntentNote)).toBeTruthy();
    }
  });

  it('en 文案带 🌱 且不含碳足迹数值/货币符号（禁止红线）', () => {
    const note = String(products(en).greenIntentNote);
    expect(note).toContain('🌱');
    expect(note.toLowerCase()).not.toMatch(/carbon|co2|\d+\s?g\b|¥|€|\$/);
  });
});
