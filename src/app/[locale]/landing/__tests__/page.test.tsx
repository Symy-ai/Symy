import { describe, expect, it } from 'vitest';
import { generateMetadata } from '../page';

/**
 * [locale]/landing/page.tsx (27行) — OG/Twitter 卡元数据。
 *
 * 锁定:
 * - locale 透传 og 图路径
 * - ref 参数: 单值/数组取首/缺省三态 (encodeURIComponent 转义)
 */
describe('landing generateMetadata', () => {
  it('无 ref → 纯 og 图路径', async () => {
    const m = (await generateMetadata({
      params: Promise.resolve({ locale: 'zh' }),
      searchParams: Promise.resolve({}),
    } as never)) as { openGraph: { images: { url: string }[] }; twitter: { images: { url: string }[] } };
    expect(m.openGraph.images[0].url).toBe('/zh/og');
    expect(m.twitter.images[0].url).toBe('/zh/og');
    expect(m.openGraph.images[0]).toEqual({ url: '/zh/og', width: 1200, height: 630 });
  });

  it('ref 单值 → 转义拼入', async () => {
    const m = (await generateMetadata({
      params: Promise.resolve({ locale: 'en' }),
      searchParams: Promise.resolve({ ref: 'abc 123' }),
    } as never)) as { openGraph: { images: { url: string }[] } };
    expect(m.openGraph.images[0].url).toBe('/en/og?ref=abc%20123'); // encodeURIComponent
  });

  it('ref 数组 → 取首元素', async () => {
    const m = (await generateMetadata({
      params: Promise.resolve({ locale: 'zh' }),
      searchParams: Promise.resolve({ ref: ['first', 'second'] }),
    } as never)) as { openGraph: { images: { url: string }[] } };
    expect(m.openGraph.images[0].url).toBe('/zh/og?ref=first');
  });
});
