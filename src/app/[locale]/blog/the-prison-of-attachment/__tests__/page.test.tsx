// @vitest-environment happy-dom
/**
 * blog/the-prison-of-attachment/page.tsx (559行) — 博客长文 (async Server Component)。
 *
 * R433 v7-c 侦察 #3 — 博客三件中最大件。
 *
 * 锁定 (R412 定案: await 组件函数拿 JSX):
 * - generateMetadata zh/en SEO (title/keywords/og article 类型/发布时间)
 * - 返回博客导航锚
 * - 守护出口 CTA (小象三行) + 底部 CTA + 相关文章卡
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

describe('the-prison-of-attachment — generateMetadata', () => {
  it('zh: SEO 全锚 (title/canonical/keywords/og article/publishedTime)', async () => {
    const meta = await generateMetadata({ params: Promise.resolve({ locale: 'zh' }) });
    expect(meta.title).toBe('执念之牢：对失去的恐惧如何控制你 | Symy');
    expect(meta.alternates?.canonical).toBe('/blog/the-prison-of-attachment');
    expect(meta.keywords).toContain('损失厌恶');
    const og = meta.openGraph as { type?: string; publishedTime?: string; tags?: string[] };
    expect(og.type).toBe('article');
    expect(og.publishedTime).toBe('2026-08-06');
    expect(og.tags).toContain('自在之心');
  });

  it('en: 双语切换 + 英文 keywords', async () => {
    const meta = await generateMetadata({ params: Promise.resolve({ locale: 'en' }) });
    expect(meta.title).toBe('The Prison of Attachment: How the Fear of Loss Controls You | Symy');
    expect(meta.keywords).toContain('loss aversion');
  });
});

describe('the-prison-of-attachment — 页面结构', () => {
  it('zh: 标题+返回博客导航+阅读元信息', async () => {
    await renderPage('zh');
    expect(screen.getByText(/执念之牢/)).toBeTruthy();
    expect(screen.getByText('返回博客').closest('a')?.getAttribute('href')).toBe('/zh/blog');
    expect(screen.getByText(/分钟阅读/)).toBeTruthy();
  });

  it('zh: 守护出口 CTA 三行 + 认识小象按钮', async () => {
    await renderPage('zh');
    expect(screen.getByText('松开这只手，可以有人陪你')).toBeTruthy();
    expect(screen.getAllByText('拦一道绿色关').length).toBe(2); // 守护出口 + 底部 CTA 双渲染
    expect(screen.getAllByText('给绿色替代').length).toBe(2);
    expect(screen.getAllByText('守住的钱进梦想基金').length).toBe(2);
    expect(screen.getByText(/认识小象 Symy/).closest('a')?.getAttribute('href')).toBe('/zh');
  });

  it('zh: 底部 CTA + 品牌标语', async () => {
    await renderPage('zh');
    expect(screen.getByText('与 Symy 一起松开你的手')).toBeTruthy();
    expect(screen.getByText(/© 2026 Symy/)).toBeTruthy();
  });

  it('en: 英文版标题+CTA', async () => {
    await renderPage('en');
    expect(screen.getByText(/The Prison of Attachment/)).toBeTruthy();
    expect(screen.getByText('Back to Blog').closest('a')?.getAttribute('href')).toBe('/en/blog');
    expect(screen.getByText(/Meet Symy/).closest('a')?.getAttribute('href')).toBe('/en');
  });
});
