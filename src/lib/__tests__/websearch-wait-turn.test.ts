import { describe, expect, it } from 'vitest';
import { buildWebSearchWaitTurn, isWebSearchFallbackResult } from '@/lib/websearch-wait-turn';
import zh from '@/i18n/messages/zh.json';
import en from '@/i18n/messages/en.json';
import type { ProductCardData } from '@/types/product-card';

/** mock 工具返回按 product-tool-result.ts 既有形状: content = JSON.stringify({data:{cards:[...]}}) */
function searchContent(cards: unknown[], extra: Record<string, unknown> = {}): string {
  return JSON.stringify({ ...extra, data: { cards } });
}

const card = (ref: string): ProductCardData => ({
  product_ref: ref,
  title: `商品${ref}`,
  price_cents: 9900,
  currency: 'CNY',
});

const fallbackInput = (overrides: Partial<Parameters<typeof isWebSearchFallbackResult>[0]> = {}) =>
  ({
    toolName: 'symy_search',
    content: searchContent([card('p1')], { data_source: 'websearch' }),
    ...overrides,
  }) as Parameters<typeof isWebSearchFallbackResult>[0];

describe('buildWebSearchWaitTurn', () => {
  it('zh 返回产品给定文案原话', () => {
    expect(buildWebSearchWaitTurn('不锈钢吸管', 'zh').reply).toBe(
      '货架里没有合适的，小象正在全网搜索、比较中…🐘',
    );
  });

  it('en 对应文案非空且带小象 emoji', () => {
    const reply = buildWebSearchWaitTurn('straw', 'en').reply;
    expect(reply).toBe((en as { chat: { websearch: { waiting: string } } }).chat.websearch.waiting);
    expect(reply).toContain('🐘');
  });

  it('zh/en 双侧 key 都存在且非空（无 defaultValue 兜底的对面：字典必须齐）', () => {
    const zhWaiting = (zh as { chat: { websearch?: { waiting?: string } } }).chat.websearch?.waiting;
    const enWaiting = (en as { chat: { websearch?: { waiting?: string } } }).chat.websearch?.waiting;
    expect(zhWaiting).toBeTruthy();
    expect(enWaiting).toBeTruthy();
  });
});

describe('isWebSearchFallbackResult — <2 卡触发等待话术', () => {
  it('data_source=websearch + 1 卡 → 触发', () => {
    expect(isWebSearchFallbackResult(fallbackInput())).toBe(true);
  });

  it('data_source=websearch + 0 卡（货架全空）→ 触发', () => {
    expect(isWebSearchFallbackResult(fallbackInput({ content: searchContent([], { data_source: 'websearch' }) }))).toBe(true);
  });

  it('data_source 落在 data 内也认（hands 字段落点防御）', () => {
    const content = JSON.stringify({ data: { cards: [card('p1')], data_source: 'websearch' } });
    expect(isWebSearchFallbackResult(fallbackInput({ content }))).toBe(true);
  });

  it('data_source 为字符串数组（含 websearch）也认', () => {
    const content = searchContent([card('p1')], { data_source: ['local', 'websearch'] });
    expect(isWebSearchFallbackResult(fallbackInput({ content }))).toBe(true);
  });

  it('显式 websearch_fallback=true 标记 + 1 卡 → 触发（第二种契约形态）', () => {
    const content = searchContent([card('p1')], { websearch_fallback: true });
    expect(isWebSearchFallbackResult(fallbackInput({ content }))).toBe(true);
  });

  it('SSE 结构化 cards 通道权威: content 只写 1 卡但 cards 通道 2 张 → 不触发', () => {
    expect(isWebSearchFallbackResult(fallbackInput({ structuredCards: [card('a'), card('b')] }))).toBe(false);
  });

  it('SSE cards 通道 1 张、content 未写 cards → 触发', () => {
    const content = JSON.stringify({ data_source: 'websearch', data: {} });
    expect(isWebSearchFallbackResult(fallbackInput({ content, structuredCards: [card('a')] }))).toBe(true);
  });
});

describe('isWebSearchFallbackResult — ≥2 卡 / 字段缺失不触发', () => {
  it('2 卡 → 不触发', () => {
    const content = searchContent([card('p1'), card('p2')], { data_source: 'websearch' });
    expect(isWebSearchFallbackResult(fallbackInput({ content }))).toBe(false);
  });

  it('3 卡 → 不触发', () => {
    const content = searchContent([card('p1'), card('p2'), card('p3')], { data_source: 'websearch' });
    expect(isWebSearchFallbackResult(fallbackInput({ content }))).toBe(false);
  });

  it('data_source 存在但非 websearch（local）→ 不触发', () => {
    const content = searchContent([card('p1')], { data_source: 'local' });
    expect(isWebSearchFallbackResult(fallbackInput({ content }))).toBe(false);
  });

  it('契约字段全缺（hands 未上线形态）→ 不触发, 行为=现状', () => {
    const content = searchContent([card('p1')]);
    expect(isWebSearchFallbackResult(fallbackInput({ content }))).toBe(false);
    expect(isWebSearchFallbackResult(fallbackInput({ content: searchContent([]) }))).toBe(false);
  });

  it('非 symy_search 工具 → 不触发', () => {
    expect(isWebSearchFallbackResult(fallbackInput({ toolName: 'complete_challenge' }))).toBe(false);
  });

  it('content 缺失 / 非法 JSON → 不触发', () => {
    expect(isWebSearchFallbackResult(fallbackInput({ content: null }))).toBe(false);
    expect(isWebSearchFallbackResult(fallbackInput({ content: 'not-json{' }))).toBe(false);
  });
});
