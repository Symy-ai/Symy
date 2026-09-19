/**
 * 透明度域 SEO metadata 冒烟 (batch86-a)
 *
 * 两个公开页的 generateMetadata (title/description zh/en) 是 X 卡片标题的
 * 来源 (OG 图 82-a 已做) — 冒烟断言双语 title/description/canonical/OG 图
 * 不缺失。另断言 robots.txt 对 /transparency 无抓取限制 (默认 Allow: /)。
 */

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { generateMetadata } from '../page';
import { generateMetadata as generateFinanceMetadata } from '../finance/page';

function meta(locale: string) {
  return generateMetadata({ params: Promise.resolve({ locale }) });
}

/** OG 图元素是 string | {url} 联合 (next 类型带 null 分支) — 归一化取 url */
function imageUrl(img: unknown): string | undefined {
  if (typeof img === 'string') return img;
  if (img && typeof img === 'object' && 'url' in img) {
    const url = (img as { url?: unknown }).url;
    if (typeof url === 'string') return url;
  }
  return undefined;
}

describe('/transparency metadata', () => {
  it('zh title/description', async () => {
    const m = await meta('zh');
    expect(m.title).toContain('每周透明度报告');
    expect(m.description).toContain('北极星指标');
  });

  it('en title/description', async () => {
    const m = await meta('en');
    expect(m.title).toContain('Weekly Transparency Report');
    expect(m.description).toContain('north-star metrics');
  });

  it('canonical + OG/Twitter 图指向本 locale OG route', async () => {
    const m = await meta('zh');
    expect(m.alternates?.canonical).toBe('/transparency');
    const og = Array.isArray(m.openGraph?.images) ? m.openGraph.images : [m.openGraph?.images];
    const tw = Array.isArray(m.twitter?.images) ? m.twitter.images : [m.twitter?.images];
    expect(imageUrl(og[0])).toBe('/zh/transparency/og');
    expect(imageUrl(tw[0])).toBe('/zh/transparency/og');
  });
});

describe('/transparency/finance metadata', () => {
  it('zh title/description', async () => {
    const m = await generateFinanceMetadata({ params: Promise.resolve({ locale: 'zh' }) });
    expect(m.title).toContain('财务公开');
    expect(m.description).toContain('收入只来自会员费');
  });

  it('en title/description + canonical', async () => {
    const m = await generateFinanceMetadata({ params: Promise.resolve({ locale: 'en' }) });
    expect(m.title).toContain('Financial Transparency');
    expect(m.description).toContain('only revenue');
    expect(m.alternates?.canonical).toBe('/transparency/finance');
  });
});

describe('robots.txt', () => {
  const robots = readFileSync(
    resolve(__dirname, '../../../../../public/robots.txt'),
    'utf-8',
  );

  it('/transparency 无抓取限制 (默认 Allow: /)', () => {
    expect(robots).not.toMatch(/Disallow:\s*\/?transparency/);
    expect(robots).toMatch(/User-agent: \*\s*\nAllow: \//);
  });

  it('sitemap 指针指向 symy.ai/sitemap.xml', () => {
    expect(robots).toContain('Sitemap: https://symy.ai/sitemap.xml');
  });
});
