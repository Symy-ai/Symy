// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { renderToString } from 'react-dom/server';
import { generateMetadata, default as PrivacyPage } from '../page';

/**
 * legal/privacy/page.tsx (276行) — 隐私政策 (隐私契约红线件)。
 *
 * 锁定:
 * - metadata zh/en+canonical
 * - 密码 bcrypt 非明文承诺在位
 * - 推荐码非邮箱 (推荐人隐私: 8 字符随机串) 在位
 * - 30 天重大变更预告在位
 */
describe('legal/privacy generateMetadata', () => {
  it('zh → 标题+canonical', async () => {
    const m = (await generateMetadata({ params: Promise.resolve({ locale: 'zh' }) } as never)) as { title: string; alternates: { canonical: string } };
    expect(m.title).toBe('隐私政策 — Symy');
    expect(m.alternates.canonical).toBe('/legal/privacy');
  });

  it('en → 英文标题', async () => {
    const m = (await generateMetadata({ params: Promise.resolve({ locale: 'en' }) } as never)) as { title: string };
    expect(m.title).toBe('Privacy Policy — Symy');
  });
});

describe('PrivacyPage 渲染 (隐私红线)', () => {
  it('密码非明文承诺在位 (bcrypt)', async () => {
    const html = renderToString(await PrivacyPage({ params: Promise.resolve({ locale: 'zh' }) } as never));
    expect(html).toContain('绝不会以明文存储');
    expect(html).toContain('bcrypt');
  });

  it('推荐码非邮箱红线在位', async () => {
    const html = renderToString(await PrivacyPage({ params: Promise.resolve({ locale: 'zh' }) } as never));
    expect(html).toContain('8 字符的随机字符串，而非其邮箱'); // 推荐人隐私
  });

  it('30 天重大变更预告在位', async () => {
    const html = renderToString(await PrivacyPage({ params: Promise.resolve({ locale: 'zh' }) } as never));
    expect(html).toContain('至少 30 天');
  });

  it('en 版 bcrypt 承诺在位', async () => {
    const html = renderToString(await PrivacyPage({ params: Promise.resolve({ locale: 'en' }) } as never));
    expect(html.toLowerCase()).toContain('bcrypt');
  });
});
