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

  it('全 16 节标题完整性扫描 (zh)', async () => {
    const html = renderToString(await TermsPage({ params: Promise.resolve({ locale: 'zh' }) } as never));
    const sections = ['1. 条款的接受', '2. 服务说明', '3. 非财务、法律或医疗建议', '4. 用户账户与资格', '5. 用户数据与隐私', '6. 可接受的使用', '7. AI 生成的内容', '8. 邮件监控（可选功能）', '9. 高级订阅（推出时）', '10. 知识产权', '11. 责任限制', '12. 赔偿', '13. 账户终止', '14. 条款的变更', '15. 适用法律与争议', '16. 联系我们'];
    for (const sec of sections) expect(html).toContain(sec);
  });

  it('§8 邮件监控: 可选+加密+不出售+可断开 (数据功能红线)', async () => {
    const html = renderToString(await TermsPage({ params: Promise.resolve({ locale: 'zh' }) } as never));
    expect(html).toContain('如果您选择连接邮箱账户'); // 可选
    expect(html).toContain('加密'); // 传输+静态加密
    expect(html).toContain('不会阅读与购物无关的邮件'); // 范围限定
    expect(html).toContain('也不会出售或与第三方分享邮件内容'); // 不出售
    expect(html).toContain('随时在设置中断开'); // 可撤销
  });

  it('§9 Premium 防超卖: 「推出时」限定+免费层保留', async () => {
    const html = renderToString(await TermsPage({ params: Promise.resolve({ locale: 'zh' }) } as never));
    expect(html).toContain('高级订阅（推出时）'); // 未上线不承诺
    expect(html).toContain('免费层级的功能仍可免费使用'); // 免费层保留
  });

  it('§7 AI 生成内容免责在位', async () => {
    const html = renderToString(await TermsPage({ params: Promise.resolve({ locale: 'zh' }) } as never));
    expect(html).toContain('7. AI 生成的内容');
    expect(html).toContain('不保证 AI 生成内容的准确性'); // AI 内容免责核心语
  });
});
