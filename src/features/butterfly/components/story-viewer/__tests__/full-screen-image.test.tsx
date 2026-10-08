// @vitest-environment happy-dom

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi, beforeEach } from 'vitest';

vi.mock('@/i18n/provider', () => ({
  useI18n: () => ({
    locale: 'zh',
    t: (key: string, opts?: { defaultValue?: string }) => {
      const map: Record<string, string> = {
        'storyViewer.generatingIllustration': '正在生成插图…',
        'storyViewer.illustrationFailed': '插图加载失败',
        'storyViewer.regenerate': '重新生成',
        'storyViewer.regenerateIllustration': '重新生成插图',
      };
      return map[key] ?? opts?.defaultValue ?? key;
    },
  }),
}));

import { FullScreenImage } from '../full-screen-image';

const baseProps = {
  tone: 'neutral' as const,
};

function renderUI(props: Partial<Parameters<typeof FullScreenImage>[0]> = {}) {
  return render(<FullScreenImage {...baseProps} {...props} />);
}

const SVG_DATA = 'data:image/svg+xml;base64,PHN2Zz4=';
const PNG_CDN = 'https://cdn.example.com/x.png';

/**
 * full-screen-image.tsx (153行) — Round 80 F4 全屏场景图 (占位/加载/错误/重生四态)。
 *
 * 锁定:
 * - 无 url → 生成中态 (蝴蝶剪影 + Generating 文字)
 * - SVG 占位 data URL → 同为生成中 + 低透明度背景
 * - http CDN → 真图加载 spinner → onLoad 后 opacity-100 + 覆盖层
 * - 协议缺头 url 自动补 https://
 * - onError → 失败态 + 重新生成按钮 (有 onRegenerate 才出)
 * - hover 重生按钮 (成功态 + 非 regenerating)
 */
describe('FullScreenImage 全屏场景图', () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('无 url → 生成中态 (Generating 文字)', () => {
    renderUI();
    expect(screen.getByText('正在生成插图…')).toBeTruthy();
  });

  it('SVG 占位 data URL → 生成中 + aria-hidden 背景图', () => {
    renderUI({ illustrationUrl: SVG_DATA });
    expect(screen.getByText('正在生成插图…')).toBeTruthy();
    const bg = document.querySelector('img[aria-hidden="true"]');
    expect(bg?.getAttribute('src')).toBe(SVG_DATA);
  });

  it('CDN 真图: 加载完成 → 生成中提示消失 + 主图 opacity-100', () => {
    renderUI({ illustrationUrl: PNG_CDN });
    expect(screen.queryByText('正在生成插图…')).toBeNull(); // 真图不显示生成中
    const img = screen.getByRole('img') as HTMLImageElement;
    expect(img.className).toContain('opacity-0'); // 未加载完成
    fireEvent.load(img);
    expect(img.className).toContain('opacity-100');
    // 覆盖层出现 (底部渐变)
    const overlays = document.querySelectorAll('.pointer-events-none');
    expect(overlays.length).toBeGreaterThanOrEqual(3);
  });

  it('协议缺头 url 自动补 https:// 前缀', () => {
    renderUI({ illustrationUrl: 'cdn.example.com/x.png' });
    const img = screen.getByRole('img') as HTMLImageElement;
    expect(img.getAttribute('src')).toBe('https://cdn.example.com/x.png');
  });

  it('onError → 失败态 + 重新生成按钮接线', () => {
    const onReg = vi.fn();
    renderUI({ illustrationUrl: PNG_CDN, onRegenerate: onReg });
    const img = screen.getByRole('img');
    fireEvent.error(img);
    expect(screen.getByText('插图加载失败')).toBeTruthy();
    const regen = screen.getByText('重新生成');
    fireEvent.click(regen);
    expect(onReg).toHaveBeenCalledTimes(1);
  });

  it('失败态无 onRegenerate → 无重生按钮', () => {
    renderUI({ illustrationUrl: PNG_CDN });
    fireEvent.error(screen.getByRole('img'));
    expect(screen.getByText('插图加载失败')).toBeTruthy();
    expect(screen.queryByText('重新生成')).toBeNull();
  });

  it('成功态 hover 重生按钮: 有 onRegenerate+非 regenerating 才渲染', () => {
    const onReg = vi.fn();
    renderUI({ illustrationUrl: PNG_CDN, onRegenerate: onReg });
    fireEvent.load(screen.getByRole('img'));
    // hover 按钮 (title 属性定位)
    const hoverBtn = screen.getByTitle('重新生成插图');
    fireEvent.click(hoverBtn);
    expect(onReg).toHaveBeenCalledTimes(1);
    cleanup();
    // isRegenerating → 不渲染
    renderUI({ illustrationUrl: PNG_CDN, onRegenerate: onReg, isRegenerating: true });
    fireEvent.load(screen.getByRole('img'));
    expect(screen.queryByTitle('重新生成插图')).toBeNull();
  });

  it('isLight 词汇切换 (bg-gray-50 vs bg-gray-950)', () => {
    const { container } = renderUI({ isLight: true });
    expect(container.firstElementChild?.className).toContain('bg-gray-50');
    cleanup();
    const { container: c2 } = renderUI({});
    expect(c2.firstElementChild?.className).toContain('bg-gray-950');
  });
});
