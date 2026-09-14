import { describe, it, expect } from 'vitest';
import {
  aggregateGuardCategoryInsights,
  topGuardCategories,
  resolveGuardCategory,
  type GuardCategoryEventInput,
} from '../guard-category-insight';

describe('aggregateGuardCategoryInsights', () => {
  it('returns empty array for null/undefined/empty input', () => {
    expect(aggregateGuardCategoryInsights(null)).toEqual([]);
    expect(aggregateGuardCategoryInsights(undefined)).toEqual([]);
    expect(aggregateGuardCategoryInsights([])).toEqual([]);
  });

  it('groups counts and estSaved by metadata.category', () => {
    const events: GuardCategoryEventInput[] = [
      { metadata: { category: 'clothing', amount: 100 } },
      { metadata: { category: 'clothing', amount: 50 } },
      { metadata: { category: 'electronics', amount: 500 } },
    ];
    const rows = aggregateGuardCategoryInsights(events, 25);
    expect(rows).toHaveLength(2);
    const clothing = rows.find((r) => r.category === 'clothing');
    expect(clothing?.count).toBe(2);
    expect(clothing?.estSaved).toBe(150);
    expect(clothing?.hoursReclaimed).toBeCloseTo(6, 6);
    const electronics = rows.find((r) => r.category === 'electronics');
    expect(electronics?.count).toBe(1);
    expect(electronics?.estSaved).toBe(500);
  });

  it('puts events without category into other, sorted last', () => {
    const events: GuardCategoryEventInput[] = [
      { metadata: null },
      { metadata: {} },
      { metadata: { category: 'home', amount: 30 } },
    ];
    const rows = aggregateGuardCategoryInsights(events);
    expect(rows).toHaveLength(2);
    expect(rows[rows.length - 1].category).toBe('other');
    expect(rows[rows.length - 1].count).toBe(2);
    expect(rows[0].category).toBe('home');
  });

  it('derives category from itemTitle when metadata.category is absent', () => {
    const events: GuardCategoryEventInput[] = [
      { metadata: { itemTitle: '无线蓝牙耳机', amount: 200 } },
      { metadata: { itemTitle: 'moisturizing skincare set', amount: 60 } },
    ];
    const rows = aggregateGuardCategoryInsights(events);
    expect(rows.map((r) => r.category).sort()).toEqual(['beauty', 'electronics']);
    expect(rows.find((r) => r.category === 'electronics')?.estSaved).toBe(200);
  });

  it('maps unrecognized category strings to other', () => {
    expect(resolveGuardCategory({ category: 'garden-gnome' })).toBe('other');
  });

  it('sorts non-other categories by count desc; other excluded from top helpers', () => {
    const events: GuardCategoryEventInput[] = [
      { metadata: { category: 'food' } },
      { metadata: { category: 'beauty' } },
      { metadata: { category: 'beauty' } },
      { metadata: { category: 'clothing' } },
      { metadata: {} },
      { metadata: {} },
      { metadata: {} },
    ];
    const rows = aggregateGuardCategoryInsights(events);
    expect(rows.map((r) => r.category)).toEqual(['beauty', 'clothing', 'food', 'other']);
    const top = topGuardCategories(rows);
    expect(top.map((r) => r.category)).toEqual(['beauty', 'clothing', 'food']);
  });

  it('converts hours using hourly rate with default 25', () => {
    const events: GuardCategoryEventInput[] = [{ metadata: { category: 'home', amount: 75 } }];
    expect(aggregateGuardCategoryInsights(events)[0].hoursReclaimed).toBeCloseTo(3, 6);
    expect(aggregateGuardCategoryInsights(events, 50)[0].hoursReclaimed).toBeCloseTo(1.5, 6);
    // 非法时薪回退默认 25
    expect(aggregateGuardCategoryInsights(events, -1)[0].hoursReclaimed).toBeCloseTo(3, 6);
  });

  it('ignores invalid amounts but still counts the event', () => {
    const events: GuardCategoryEventInput[] = [
      { metadata: { category: 'food', amount: 'abc' } },
      { metadata: { category: 'food', amount: -5 } },
    ];
    const rows = aggregateGuardCategoryInsights(events);
    expect(rows[0].count).toBe(2);
    expect(rows[0].estSaved).toBe(0);
    expect(rows[0].hoursReclaimed).toBe(0);
  });
});
