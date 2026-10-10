// @vitest-environment happy-dom
/**
 * blog/page.tsx (200行) — 博客列表页 (async Server Component)。
 *
 * R432 v7-c 侦察 #2 — 博客三件中最小件。
 *
 * 锁定 (R412 定案: async Server Component = await 组件函数拿 JSX 再 render):
 * - generateMetadata zh/en 双语 SEO 锚 (title/og/twitter)
 * - 两篇文章卡 href locale 前缀
 * - 底部 CTA 回首页
 */
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import BlogPage, { generateMetadata } from '../page';

vi.mock('next/link', () => ({
  default: (props: { href: string; children: React.ReactNode }) => <a href={props.href}>{props.children}</a>,
}));

async function renderPage(locale: string) {
  const jsx = await BlogPage({ params: Promise.resolve({ locale }) });
  render(jsx);
}

describe('blog index — generateMetadata SEO (zh/en 双语)', () => {
  it('zh: title/description/canonical/og/twitter 全锚', async () => {
    const meta = await generateMetadata({ params: Promise.resolve({ locale: 'zh' }) });
    expect(meta.title).toBe('博客 — 算法解构 | Symy');
    expect(meta.description).toContain('算法解构');
    expect(meta.alternates?.canonical).toBe('/zh/blog');
    expect(meta.openGraph?.title).toBe('博客 — 算法解构 | Symy');
    expect((meta.openGraph as { url?: string }).url).toBe('https://symy.ai/zh/blog');
    expect((meta.twitter as { card?: string } | null)?.card).toBe('summary');
  });

  it('en: 双语切换', async () => {
    const meta = await generateMetadata({ params: Promise.resolve({ locale: 'en' }) });
    expect(meta.title).toBe('Blog — Algorithm Decode | Symy');
    expect(meta.alternates?.canonical).toBe('/en/blog');
  });
});

describe('blog index — 页面结构', () => {
  it('zh: 两篇文章卡 href locale 前缀 + 阅读时长徽章', async () => {
    await renderPage('zh');
    const links = screen.getAllByRole('link');
    const prison = links.find((l) => l.getAttribute('href') === '/zh/blog/the-prison-of-attachment');
    const decode = links.find((l) => l.getAttribute('href') === '/zh/blog/algorithm-decode-001');
    expect(prison).toBeTruthy();
    expect(decode).toBeTruthy();
    expect(screen.getByText(/8 分钟阅读/)).toBeTruthy();
    expect(screen.getByText(/9 分钟阅读/)).toBeTruthy();
    // 标题渲染
    expect(screen.getByText(/执念之牢/)).toBeTruthy();
    expect(screen.getByText(/FOMO 倒计时/)).toBeTruthy();
  });

  it('zh: 底部 CTA → /zh + footer 标语', async () => {
    await renderPage('zh');
    const cta = screen.getByText('免费开始').closest('a');
    expect(cta?.getAttribute('href')).toBe('/zh');
    expect(screen.getByText(/© 2026 Symy/)).toBeTruthy();
  });

  it('en: 英文版卡片+CTA', async () => {
    await renderPage('en');
    const prison = screen.getAllByRole('link').find((l) => l.getAttribute('href') === '/en/blog/the-prison-of-attachment');
    expect(prison).toBeTruthy();
    expect(screen.getByText('Get started free')).toBeTruthy();
  });
});
