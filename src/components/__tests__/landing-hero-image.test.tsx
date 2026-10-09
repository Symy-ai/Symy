// @vitest-environment happy-dom

import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const imageCalls: Array<Record<string, unknown>> = [];
vi.mock('next/image', () => ({
  default: vi.fn((props: Record<string, unknown>) => {
    imageCalls.push(props);
    const { src, alt, width, height, priority, ...rest } = props as { src: string; alt: string; width: number; height: number; priority?: boolean };
    return <img src={src} alt={alt} width={width} height={height} data-priority={String(priority)} {...rest} />;
  }),
}));

import { LandingHeroImage } from '../landing-hero-image';

/**
 * landing-hero-image.tsx (25行) — SEO 修复件 (Server Component)。
 *
 * 锁定 (SEO fix 2026-08-06):
 * - next/image 渲染 → SSR 输出 <img> (爬虫可见)
 * - src/alt/width/height/priority 五锚
 * - alt 品牌句
 */
describe('LandingHeroImage SEO 件', () => {
  afterEach(() => {
    cleanup();
    imageCalls.length = 0;
  });

  it('next/image 五锚 (src/alt/280×186/priority)', () => {
    render(<LandingHeroImage />);
    const props = imageCalls[0];
    expect(props.src).toBe('/symy-elephant-dark.png');
    expect(props.alt).toBe('Symy — Buy less. Live more.');
    expect(props.width).toBe(280);
    expect(props.height).toBe(186);
    expect(props.priority).toBe(true); // LCP 优先
  });

  it('SSR 输出 <img> 标签 (爬虫可见锚)', () => {
    render(<LandingHeroImage />);
    const img = document.querySelector('img');
    expect(img).toBeTruthy();
    expect(img?.getAttribute('src')).toBe('/symy-elephant-dark.png');
    expect(img?.getAttribute('alt')).toContain('Buy less. Live more.');
  });
});
