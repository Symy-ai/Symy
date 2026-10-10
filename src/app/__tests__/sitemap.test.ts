// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import sitemap from '../sitemap';

/**
 * src/app/sitemap.ts (45行) — SEO sitemap 生成。
 *
 * 锁定:
 * - 12 路径 × 2 locale = 24 条目
 * - URL 形状 /{locale}{path} + baseUrl
 * - alternates.languages 双语互指
 * - lastModified 为当前时间
 */
describe('sitemap', () => {
  const entries = sitemap();

  it('12 路径 × 2 locale = 24 条目', () => {
    expect(entries).toHaveLength(24);
  });

  it('URL 形状: baseUrl+locale+path', () => {
    const urls = entries.map((e) => e.url);
    expect(urls).toContain('https://symy.ai/zh');
    expect(urls).toContain('https://symy.ai/en');
    expect(urls).toContain('https://symy.ai/zh/blog/the-prison-of-attachment');
    expect(urls).toContain('https://symy.ai/en/legal/privacy');
  });

  it('alternates 双语互指', () => {
    const zhHome = entries.find((e) => e.url === 'https://symy.ai/zh');
    expect(zhHome?.alternates?.languages).toEqual({
      en: 'https://symy.ai/en',
      zh: 'https://symy.ai/zh',
    });
  });

  it('lastModified 为当前时间 (周更/月更/年更标记在位)', () => {
    const before = Date.now();
    const entriesNow = sitemap();
    expect(entriesNow.every((e) => e.lastModified instanceof Date)).toBeTruthy();
    const lm = entriesNow[0]!.lastModified as Date;
    expect(lm.getTime()).toBeGreaterThanOrEqual(before - 1000);
    const freqs = new Set(entries.map((e) => e.changeFrequency));
    expect(freqs).toEqual(new Set(['weekly', 'monthly', 'yearly']));
  });
});
