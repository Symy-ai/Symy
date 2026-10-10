// @vitest-environment happy-dom
/**
 * blog/algorithm-decode-001/page.tsx (438行) — 算法解构 #001 长文。
 *
 * R434 v7-c 收官件 — 完成后 src 全域无测试件彻底清零。
 *
 * 锁定:
 * - generateMetadata zh/en SEO (keywords 含 FOMO/暗黑模式, og article, publishedTime)
 * - 三个信号卡 (01/02/03) 渲染
 * - Symy 三件事 (BuddyRow) + CTA
 * - 返回博客导航 + 相关文章
 */
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import ArticlePage, { generateMetadata } from '../page';

vi.mock('next/link', () => ({
  default: (props: { href: string; children: React.ReactNode }) => <a href={props.href}>{props.children}</a>,
}));

async function renderPage(locale: string) {
  const jsx = await ArticlePage({ params: Promise.resolve({ locale }) });
  render(jsx);
}

describe('algorithm-decode-001 — generateMetadata', () => {
  it('zh: SEO 全锚 (title/canonical/keywords/og article)', async () => {
    const meta = await generateMetadata({ params: Promise.resolve({ locale: 'zh' }) });
    expect(meta.title).toBe('算法解构 1：FOMO 倒计时 —— TikTok Shop 如何制造虚假紧迫感 | Symy');
    expect(meta.alternates?.canonical).toBe('/blog/algorithm-decode-001');
    expect(meta.keywords).toContain('FOMO');
    expect(meta.keywords).toContain('暗黑模式');
    const og = meta.openGraph as { type?: string; publishedTime?: string };
    expect(og.type).toBe('article');
    expect(og.publishedTime).toBe('2026-08-05');
  });

  it('en: 双语切换', async () => {
    const meta = await generateMetadata({ params: Promise.resolve({ locale: 'en' }) });
    expect(meta.title).toContain('FOMO Timer');
    expect(meta.keywords).toContain('dark patterns');
  });
});

describe('algorithm-decode-001 — 页面结构', () => {
  it('zh: 标题+返回博客+三个信号卡 (01/02/03)', async () => {
    await renderPage('zh');
    expect(screen.getAllByText(/FOMO 倒计时/).length).toBeGreaterThan(0);
    expect(screen.getByText('返回博客').closest('a')?.getAttribute('href')).toBe('/zh/blog');
    expect(screen.getByText('如何识破它：三个信号')).toBeTruthy();
    expect(screen.getByText('01')).toBeTruthy();
    expect(screen.getByText('02')).toBeTruthy();
    expect(screen.getByText('03')).toBeTruthy();
    expect(screen.getByText('倒计时会重启吗？')).toBeTruthy();
    expect(screen.getByText('库存会变吗？')).toBeTruthy();
    expect(screen.getByText('下周它还会在吗？')).toBeTruthy();
  });

  it('zh: Symy 三件事 + CTA → /zh', async () => {
    await renderPage('zh');
    expect(screen.getByText('Symy 如何帮你')).toBeTruthy();
    expect(screen.getByText('拦一道绿色关')).toBeTruthy();
    expect(screen.getByText('给绿色替代')).toBeTruthy();
    expect(screen.getByText('守住的钱进梦想基金')).toBeTruthy();
    const cta = screen.getByText(/认识小象|免费开始/).closest('a');
    expect(cta?.getAttribute('href')).toBe('/zh');
  });

  it('en: 英文版三信号+导航', async () => {
    await renderPage('en');
    expect(screen.getByText('Does the countdown restart?')).toBeTruthy();
    expect(screen.getByText('Back to Blog').closest('a')?.getAttribute('href')).toBe('/en/blog');
  });
});
