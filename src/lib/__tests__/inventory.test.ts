/**
 * Tests for lib/inventory (batch81-c) — 物品清单数据契约
 *
 * - inventoryItemSchema: item_name 1-100 (trim 后), category 可选 ≤50, source 枚举 + 默认 chat
 * - isInventoryTableMissing: 只认 PG 42P01
 */

import { describe, it, expect } from 'vitest';
import { inventoryItemSchema, isInventoryTableMissing } from '../inventory';

describe('inventoryItemSchema', () => {
  it('minimal input: source 默认 chat, category 缺省 undefined', () => {
    const parsed = inventoryItemSchema.parse({ item_name: '充电宝' });
    expect(parsed).toEqual({ item_name: '充电宝', source: 'chat' });
    expect('category' in parsed).toBe(false);
  });

  it('item_name trim 后落库; category trim', () => {
    const parsed = inventoryItemSchema.parse({ item_name: '  数据线 ', category: ' electronics ' });
    expect(parsed.item_name).toBe('数据线');
    expect(parsed.category).toBe('electronics');
  });

  it('source: manual 合法', () => {
    expect(inventoryItemSchema.parse({ item_name: 'x', source: 'manual' }).source).toBe('manual');
  });

  it.each([
    ['empty after trim', { item_name: '   ' }],
    ['101 chars', { item_name: 'a'.repeat(101) }],
    ['non-string item_name', { item_name: 42 }],
    ['invalid source', { item_name: 'x', source: 'other' }],
    ['category empty after trim', { item_name: 'x', category: ' ' }],
    ['category 51 chars', { item_name: 'x', category: 'c'.repeat(51) }],
  ])('rejects: %s', (_label, input) => {
    expect(inventoryItemSchema.safeParse(input).success).toBe(false);
  });

  it.each([
    ['1 char', { item_name: 'a' }],
    ['100 chars (边界)', { item_name: 'a'.repeat(100) }],
    ['category 50 chars (边界)', { item_name: 'x', category: 'c'.repeat(50) }],
  ])('accepts: %s', (_label, input) => {
    expect(inventoryItemSchema.safeParse(input).success).toBe(true);
  });
});

describe('isInventoryTableMissing', () => {
  it('42P01 → true', () => {
    expect(isInventoryTableMissing({ code: '42P01' })).toBe(true);
  });
  it('other code / null code / 非对象 → false', () => {
    expect(isInventoryTableMissing({ code: '23505' })).toBe(false);
    expect(isInventoryTableMissing({})).toBe(false);
    expect(isInventoryTableMissing(null)).toBe(false);
    expect(isInventoryTableMissing('42P01')).toBe(false);
    expect(isInventoryTableMissing(undefined)).toBe(false);
  });
});
