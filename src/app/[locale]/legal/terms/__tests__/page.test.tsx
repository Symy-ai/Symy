// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { renderToString } from 'react-dom/server';
import { generateMetadata, default as TermsPage } from '../page';

/**
 * legal/terms/page.tsx (166行) — 服务条款静态页 (契约类文案)。
 *
 * 锁定 (契约文案红线):
 * - metadata: zh/en 双语标题+canonical
 * - 关键免责条款在位: 非财务/法律/医疗建议 (§3 红线)
 * - 只对消费者负责定位语在位
 */
describe('legal/terms generateMetadata', () => {
  it('zh → 中文标题+canonical', async () => {
    const m = (await generateMetadata({ params: Promise.resolve({ locale: 'zh' }) } as never)) as { title: string; description: string; alternates: { canonical: string } };
    expect(m.title).toBe('服务条款 — Symy');
    expect(m.description).toBe('Symy 服务条款');
    expect(m.alternates.canonical).toBe('/legal/terms');
  });

  it('en → 英文标题', async () => {
    const m = (await generateMetadata({ params: Promise.resolve({ locale: 'en' }) } as never)) as { title: string };
    expect(m.title).toBe('Terms of Service — Symy');
  });
});

describe('TermsPage 渲染', () => {
  it('§3 免责红线在位 (非财务/法律/医疗建议)', async () => {
    const html = renderToString(await TermsPage({ params: Promise.resolve({ locale: 'zh' }) } as never));
    expect(html).toContain('非财务、法律或医疗建议'); // §3 标题
    expect(html).toContain('咨询合格的专业人士'); // 咨询指引
  });

  it('消费者一侧定位语在位', async () => {
    const html = renderToString(await TermsPage({ params: Promise.resolve({ locale: 'zh' }) } as never));
    expect(html).toContain('只对你负责——消费者一侧'); // 品牌定位红线
  });

  it('en 版 §3 免责在位', async () => {
    const html = renderToString(await TermsPage({ params: Promise.resolve({ locale: 'en' }) } as never));
    expect(html).toContain('Not Financial, Legal, or Medical Advice');
  });
});
