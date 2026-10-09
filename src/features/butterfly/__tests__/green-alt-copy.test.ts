import { describe, expect, it } from 'vitest';

import { CATEGORY_WARM_COPY, normalizeInterceptCategory, type InterceptCategory } from '../green-alt-copy';

/**
 * green-alt-copy.ts (72行) — 品类 SSOT (b134 方案 A) + 温暖话术映射。
 *
 * 锁定:
 * - InterceptCategory 六档 (账本五档+default)
 * - CATEGORY_WARM_COPY 六档全覆盖 (lineKey 必有+reuseKey 可选)
 * - normalizeInterceptCategory: 中英双词表五档归一 (每档至少 2 个代表词)
 * - 未命中/空/大小写 → default
 */
describe('green-alt-copy 品类 SSOT', () => {
  it('六档全覆盖: lineKey 必有', () => {
    const cats: InterceptCategory[] = ['electronics', 'clothing', 'beauty', 'home', 'food', 'default'];
    expect(Object.keys(CATEGORY_WARM_COPY).sort()).toEqual(cats.sort());
    for (const c of cats) {
      expect(CATEGORY_WARM_COPY[c].lineKey).toBe(`chat.interceptWarm.${c}`);
    }
  });

  it('reuseKey 五档显式+default 兜底全配', () => {
    expect(CATEGORY_WARM_COPY.electronics.reuseKey).toBe('chat.interceptWarm.electronicsReuse');
    expect(CATEGORY_WARM_COPY.default.reuseKey).toBe('chat.interceptWarm.defaultReuse');
  });
});

describe('normalizeInterceptCategory 归一化', () => {
  const cases: Array<[string, InterceptCategory]> = [
    ['手机', 'electronics'], ['耳机', 'electronics'], ['laptop', 'electronics'],
    ['衣服', 'clothing'], ['jacket', 'clothing'],
    ['美妆', 'beauty'], ['skincare', 'beauty'],
    ['家居', 'home'], ['furniture', 'home'],
    ['零食', 'food'], ['grocery', 'food'],
  ];
  it.each(cases)('%s → %s', (raw, expected) => {
    expect(normalizeInterceptCategory(raw)).toBe(expected);
  });

  it('大小写+空白归一', () => {
    expect(normalizeInterceptCategory('  LAPTOP  ')).toBe('electronics');
  });

  it('未命中/空/undefined → default', () => {
    expect(normalizeInterceptCategory('宠物用品')).toBe('default');
    expect(normalizeInterceptCategory('')).toBe('default');
    expect(normalizeInterceptCategory(undefined)).toBe('default');
    expect(normalizeInterceptCategory('   ')).toBe('default');
  });
});
