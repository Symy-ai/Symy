// @vitest-environment happy-dom
import { describe, expect, it, vi } from 'vitest';
import { render } from '@testing-library/react';
import type { ReactNode } from 'react';

vi.mock('next-intl', () => ({
  NextIntlClientProvider: ({ children }: { children: ReactNode }) => <div data-testid="intl">{children}</div>,
}));
vi.mock('next-intl/server', () => ({
  getMessages: () => Promise.resolve({}),
}));
vi.mock('@/i18n/provider', () => ({
  I18nProviderWrapper: ({ children }: { children: ReactNode }) => <div data-testid="i18n-wrap">{children}</div>,
}));

import Layout, { generateMetadata } from '../layout';

/**
 * [locale]/layout.tsx (130行) — locale 布局 + SEO 元数据。
 *
 * 锁定:
 * - generateMetadata: zh/en 标题+描述+canonical+hreflang 双语
 * - Layout: 双 Provider 嵌套+children 透传
 * - keywords 数组形状 (绿色消费 SEO)
 */
describe('[locale] layout generateMetadata', () => {
  it('zh → 中文标题+描述', async () => {
    const meta = await generateMetadata({ params: Promise.resolve({ locale: 'zh' }) });
    expect(meta.title).toContain('少买一点');
    expect(meta.description).toContain('绿色消费');
    expect(meta.alternates?.canonical).toBe('/zh');
  });

  it('en → 英文标题+hreflang 双语', async () => {
    const meta = await generateMetadata({ params: Promise.resolve({ locale: 'en' }) });
    expect(meta.title).toContain('Buy less');
    expect((meta.alternates?.languages as Record<string, string>).zh).toBe('/zh');
    expect((meta.alternates?.languages as Record<string, string>).en).toBe('/en');
  });

  it('OG+Twitter 卡片形状', async () => {
    const meta = await generateMetadata({ params: Promise.resolve({ locale: 'zh' }) });
    expect(meta.openGraph?.siteName).toBe('Symy');
    expect((meta.twitter as { card?: string } | null)?.card).toBe('summary_large_image');
    expect((meta.twitter?.images as { url: string }[])[0].url).toBe('/zh/og');
  });

  it('keywords 含核心 SEO 词', async () => {
    const meta = await generateMetadata({ params: Promise.resolve({ locale: 'zh' }) });
    const kw = meta.keywords as string[];
    expect(kw).toContain('绿色消费');
    expect(kw).toContain('buy less live more');
  });
});

describe('[locale] Layout 组件', () => {
  it('双 Provider 嵌套+children 透传', async () => {
    // async Server Component: await 拿 JSX (R412 定案)
    const jsx = await Layout({
      children: <div data-testid="child">CONTENT</div>,
      params: Promise.resolve({ locale: 'zh' }),
    });
    const { container } = render(jsx);
    expect(container.textContent).toContain('CONTENT');
    expect(container.querySelector('[data-testid="intl"]')).toBeTruthy();
    expect(container.querySelector('[data-testid="i18n-wrap"]')).toBeTruthy();
  });
});
