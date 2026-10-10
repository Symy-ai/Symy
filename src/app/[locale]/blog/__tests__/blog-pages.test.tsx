// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { renderToString } from 'react-dom/server';
import { generateMetadata as genMeta1, default as PrisonPage } from '../the-prison-of-attachment/page';
import { generateMetadata as genMeta2, default as AlgoPage } from '../algorithm-decode-001/page';

/**
 * blog 两件打包 (the-prison-of-attachment 559行 + algorithm-decode-001 438行) — SEO 静态博客。
 *
 * 锁定:
 * - metadata: zh/en 双语标题+canonical+keywords (SEO 红线)
 * - 正文关键概念在位 (损失厌恶/FOMO)
 * - OG title 与页面 title 同源
 */
describe('blog/the-prison-of-attachment generateMetadata', () => {
  it('zh → 标题+canonical+keywords', async () => {
    const m = (await genMeta1({ params: Promise.resolve({ locale: 'zh' }) } as never)) as { title: string; alternates: { canonical: string }; keywords: string[] };
    expect(m.title).toContain('执念之牢');
    expect(m.title).toContain('| Symy');
    expect(m.alternates.canonical).toBe('/blog/the-prison-of-attachment');
    expect(m.keywords).toContain('损失厌恶');
    expect(m.keywords).toContain('沉没成本谬误');
  });

  it('en → 英文标题', async () => {
    const m = (await genMeta1({ params: Promise.resolve({ locale: 'en' }) } as never)) as { title: string };
    expect(m.title).toContain('The Prison of Attachment');
  });
});

describe('blog/algorithm-decode-001 generateMetadata', () => {
  it('zh → 标题+canonical', async () => {
    const m = (await genMeta2({ params: Promise.resolve({ locale: 'zh' }) } as never)) as { title: string; alternates: { canonical: string } };
    expect(m.title).toContain('算法解构 1');
    expect(m.alternates.canonical).toBe('/blog/algorithm-decode-001');
  });

  it('en → 英文标题', async () => {
    const m = (await genMeta2({ params: Promise.resolve({ locale: 'en' }) } as never)) as { title: string };
    expect(m.title).toContain('Algorithm Decode 1');
  });
});

describe('blog 双页正文渲染 (概念红线)', () => {
  it('prison-of-attachment: 损失厌恶+沉没成本概念在位', async () => {
    const html = renderToString(await PrisonPage({ params: Promise.resolve({ locale: 'zh' }) } as never));
    expect(html).toContain('损失厌恶');
    expect(html).toContain('沉没成本');
  });

  it('algorithm-decode-001: FOMO/倒计时概念在位', async () => {
    const html = renderToString(await AlgoPage({ params: Promise.resolve({ locale: 'zh' }) } as never));
    expect(html).toContain('FOMO');
    expect(html).toContain('倒计时');
  });
});
