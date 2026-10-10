// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

const M = vi.hoisted(() => ({
  loggerError: vi.fn(),
  params: new URLSearchParams(),
}));

vi.mock('@/lib/logger', () => ({
  logger: { error: M.loggerError },
}));
vi.mock('next/link', () => ({ default: (p: { href: string; children: React.ReactNode }) => <a href={p.href}>{p.children}</a> }));
vi.mock('next/og', () => ({ ImageResponse: class {} }));
vi.mock('next-intl/server', () => ({
  getTranslations: () => Promise.resolve((k: string) => `t:${k}`),
}));
vi.mock('next/image', () => ({ default: (p: { alt: string }) => <img alt={p.alt} /> }));

import ErrorPage from '../error';
import NotFound from '../not-found';
import { generateImageMetadata, size, contentType } from '../opengraph-image';

/**
 * [locale] 四杂件 (error 137/layout 130/not-found 66/opengraph 96)。
 *
 * 锁定:
 * - error: locale 三源链 (localStorage→cookie→en) + retry 调 reset + logger 上报
 * - not-found: 404+返回首页 Link (getTranslations server)
 * - opengraph: size 1200x630 + contentType png + zh/en alt
 */
describe('[locale] error.tsx', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    document.cookie = '';
  });

  it('默认 en → 英文文案 + reset', () => {
    const reset = vi.fn();
    const err = new Error('boom') as Error & { digest?: string };
    render(<ErrorPage error={err} reset={reset} />);
    expect(screen.getByText('Page Error')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Try Again' }));
    expect(reset).toHaveBeenCalled();
  });

  it('localStorage zh → 中文文案', () => {
    localStorage.setItem('symy-locale', 'zh');
    render(<ErrorPage error={new Error('x')} reset={() => {}} />);
    expect(screen.getByText('页面出错了')).toBeTruthy();
  });

  it('cookie NEXT_LOCALE=en 覆盖默认链', () => {
    document.cookie = 'NEXT_LOCALE=en';
    render(<ErrorPage error={new Error('x')} reset={() => {}} />);
    expect(screen.getByText('Page Error')).toBeTruthy();
  });

  it('digest → 错误 ID 渲染 + logger 上报', async () => {
    const err = new Error('boom') as Error & { digest?: string };
    err.digest = 'd-123';
    render(<ErrorPage error={err} reset={() => {}} />);
    expect(screen.getByText(/d-123/)).toBeTruthy(); // 复合文本 'Error ID: d-123'
    await waitFor(() => expect(M.loggerError).toHaveBeenCalled());
  });
});

describe('[locale] not-found.tsx', () => {
  it('404 + 返回首页链接 (t() mock 返 key)', async () => {
    // async Server Component: await 拿 JSX 再 client 渲染
    const jsx = await NotFound();
    const { container } = render(jsx);
    expect(container.textContent).toContain('404');
    expect(container.querySelector('a[href="/"]')).toBeTruthy();
    expect(container.textContent).toContain('t:notFound.title');
  });
});

describe('[locale] opengraph-image.tsx', () => {
  it('size 1200x630 + png', () => {
    expect(size).toEqual({ width: 1200, height: 630 });
    expect(contentType).toBe('image/png');
  });

  it('generateImageMetadata: zh/en alt 双语', async () => {
    const zh = await generateImageMetadata({ params: Promise.resolve({ locale: 'zh' }) });
    const en = await generateImageMetadata({ params: Promise.resolve({ locale: 'en' }) });
    expect(zh[0].alt).toContain('少买一点');
    expect(en[0].alt).toContain('Buy less');
    expect(zh[0].id).toBe('og');
  });
});
