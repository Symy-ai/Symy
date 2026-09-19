/**
 * sitemap 输出断言 (batch86-a)
 *
 * /transparency 与 /transparency/finance 是 build in public 内容引擎的
 * 搜索引擎面 (BP p20) — sitemap 不收录 = 自然流量入口缺失。断言:
 * 双 locale 形态 + alternates 互链 + blog 两篇不回退 + OG route 永不进 sitemap
 * (OG 图是分享卡资源非可索引页)。
 */

import { describe, expect, it } from 'vitest';
import sitemap from '../sitemap';

const BASE = 'https://symy.ai';

function urls(): string[] {
  return sitemap().map((e) => e.url);
}

describe('sitemap', () => {
  it('transparency 双 locale 均收录', () => {
    const all = urls();
    expect(all).toContain(`${BASE}/en/transparency`);
    expect(all).toContain(`${BASE}/zh/transparency`);
  });

  it('finance 页双 locale 均收录', () => {
    const all = urls();
    expect(all).toContain(`${BASE}/en/transparency/finance`);
    expect(all).toContain(`${BASE}/zh/transparency/finance`);
  });

  it('transparency 条目带 alternates 双语互链与周更频率', () => {
    const entry = sitemap().find((e) => e.url === `${BASE}/zh/transparency`);
    expect(entry).toBeDefined();
    expect(entry!.changeFrequency).toBe('weekly');
    expect(entry!.priority).toBe(0.8);
    expect(entry!.alternates?.languages).toEqual({
      en: `${BASE}/en/transparency`,
      zh: `${BASE}/zh/transparency`,
    });
  });

  it('finance 条目为月更 (owner 手动月更)', () => {
    const entry = sitemap().find((e) => e.url === `${BASE}/en/transparency/finance`);
    expect(entry).toBeDefined();
    expect(entry!.changeFrequency).toBe('monthly');
    expect(entry!.priority).toBe(0.7);
  });

  it('blog 两篇不回退 (既有收录)', () => {
    const all = urls();
    expect(all).toContain(`${BASE}/en/blog/algorithm-decode-001`);
    expect(all).toContain(`${BASE}/zh/blog/the-prison-of-attachment`);
  });

  it('OG route 永不进 sitemap (分享卡资源非可索引页)', () => {
    expect(urls().some((u) => u.includes('/transparency/og'))).toBe(false);
  });
});
