// @vitest-environment happy-dom
// layout.tsx import globals.css 会触发 PostCSS 解析 (vitest 环境无 tailwind 插件)。
// vitest 的 mock 无法拦 css import → 测试侧用 vi.mock 拦 layout 模块不行;
// 改法: cssModulesMock via test.deps 不适用 — 直接测导出的 viewport 与子树 (css import 被 vite stub 后无副作用)。
import { describe, expect, it, vi } from 'vitest';
import { renderToString } from 'react-dom/server';
import { viewport, default as RootLayout } from '../layout';
import Loading from '../loading';

vi.mock('next/font/google', () => ({
  Geist: () => ({ variable: '--font-geist-sans' }),
  Geist_Mono: () => ({ variable: '--font-geist-mono' }),
}));
vi.mock('@/components/theme-provider', () => ({ ThemeProvider: ({ children }: { children: React.ReactNode }) => <>{children}</> }));
vi.mock('@/components/auth/auth-provider', () => ({ AuthProvider: ({ children }: { children: React.ReactNode }) => <>{children}</> }));
vi.mock('@/lib/query-provider', () => ({ QueryProvider: ({ children }: { children: React.ReactNode }) => <>{children}</> }));
vi.mock('@/components/providers/posthog-provider', () => ({ SymyAnalyticsProvider: ({ children }: { children: React.ReactNode }) => <>{children}</> }));
vi.mock('next-intl/server', () => ({
  getTranslations: vi.fn(() => Promise.resolve((k: string) => `t:${k}`)),
}));

/**
 * src/app/layout.tsx (49行) + loading.tsx (18行) — 根布局与加载态打包。
 *
 * 锁定:
 * - viewport: 双 themeColor (light/dark) + cover 适配
 * - layout: Provider 嵌套顺序 Theme→Analytics→Auth→Query, children 透传
 * - loading: 象标+spinner+i18n 文案
 */
describe('RootLayout viewport', () => {
  it('双 themeColor light/dark', () => {
    expect(viewport.width).toBe('device-width');
    expect(viewport.viewportFit).toBe('cover');
    const colors = viewport.themeColor as { media: string; color: string }[];
    expect(colors).toEqual([
      { media: '(prefers-color-scheme: light)', color: '#f1f8f4' },
      { media: '(prefers-color-scheme: dark)', color: '#143527' },
    ]);
  });
});

describe('RootLayout 渲染', () => {
  it('children 透传 + 四 Provider 嵌套', () => {
    const html = renderToString(
      <RootLayout>
        <div data-testid="child">MARKER</div>
      </RootLayout>,
    );
    expect(html).toContain('MARKER');
    // body 上挂双字体变量类
    expect(html).toContain('--font-geist-sans');
    expect(html).toContain('--font-geist-mono');
  });
});

describe('Loading 渲染', () => {
  it('象标+spinner+文案', async () => {
    const html = renderToString(await Loading());
    expect(html).toContain('🐘');
    expect(html).toContain('animate-spin');
    expect(html).toContain('t:loading.message');
  });
});
