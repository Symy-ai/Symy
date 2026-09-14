import { describe, expect, it } from 'vitest';
import {
  CATEGORY_WARM_COPY,
  normalizeInterceptCategory,
  type InterceptCategory,
} from '../green-alt-copy';
import zh from '@/i18n/messages/zh.json';
import en from '@/i18n/messages/en.json';

type WarmBlock = Record<string, string>;
const zhWarm = (zh as Record<string, unknown>).chat as Record<string, unknown>;
const enWarm = (en as Record<string, unknown>).chat as Record<string, unknown>;
const zhWarmBlock = zhWarm.interceptWarm as WarmBlock;
const enWarmBlock = enWarm.interceptWarm as WarmBlock;

describe('green-alt-copy', () => {
  const categories: InterceptCategory[] = [
    'electronics',
    'clothing',
    'beauty',
    'home',
    'food',
    'default',
  ];

  it('each category has a zh line and en line key', () => {
    for (const category of categories) {
      const copy = CATEGORY_WARM_COPY[category];
      expect(copy.lineKey).toBeTruthy();
      expect(copy.lineKey).toMatch(/^chat\.interceptWarm\./);
      const suffix = copy.lineKey.split('.').pop()!;
      expect(typeof zhWarmBlock[suffix]).toBe('string');
      expect(typeof enWarmBlock[suffix]).toBe('string');
      expect(zhWarmBlock[suffix].length).toBeGreaterThan(0);
      expect(enWarmBlock[suffix].length).toBeGreaterThan(0);
    }
  });

  it('interceptWarm template keys exist in both locales', () => {
    const warmKeys = Object.keys(zhWarmBlock).sort();
    expect(warmKeys).toEqual(Object.keys(enWarmBlock).sort());
    for (const k of warmKeys) {
      expect(typeof zhWarmBlock[k]).toBe('string');
      expect(typeof enWarmBlock[k]).toBe('string');
    }
  });

  it('normalizeInterceptCategory maps raw strings to categories', () => {
    expect(normalizeInterceptCategory('iPhone 16')).toBe('electronics');
    expect(normalizeInterceptCategory('牛仔外套')).toBe('clothing');
    expect(normalizeInterceptCategory('lipstick')).toBe('beauty');
    expect(normalizeInterceptCategory('tissue box')).toBe('home');
    expect(normalizeInterceptCategory('snack box')).toBe('food');
    expect(normalizeInterceptCategory('未知品类')).toBe('default');
    expect(normalizeInterceptCategory('')).toBe('default');
  });

  it('warm copy never contains raw money', () => {
    const money = /\$\d|¥\d|\d{3,}/;
    for (const k of Object.keys(zhWarmBlock)) {
      expect(zhWarmBlock[k]).not.toMatch(money);
      expect(enWarmBlock[k]).not.toMatch(money);
    }
  });
});
