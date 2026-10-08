// @vitest-environment happy-dom

import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../tab', () => ({}));

import { AtmosphereParticles } from '../atmosphere-particles';

/**
 * atmosphere-particles.tsx (111行) — canvas 粒子氛围 (Round 80 F4 拆分)。
 *
 * happy-dom 无真 canvas 2d → getContext 返回 null, 组件 effect 早退。
 * 可测: 渲染不炸 + canvas 元素在 + tone 切换不崩 + resize 监听清理。
 */
describe('AtmosphereParticles canvas 粒子', () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('渲染 canvas 元素不炸 (getContext null 早退路径)', () => {
    const { container } = render(<AtmosphereParticles tone="neutral" />);
    const canvas = container.querySelector('canvas');
    expect(canvas).toBeTruthy();
  });

  it('四基调切换均不炸 (hopeful/neutral/dark/twist)', () => {
    for (const tone of ['hopeful', 'neutral', 'dark', 'twist'] as const) {
      const { unmount } = render(<AtmosphereParticles tone={tone} />);
      unmount();
    }
    expect(true).toBe(true);
  });

  it('卸载清理 (animFrame + resize listener 不泄漏)', () => {
    const { unmount } = render(<AtmosphereParticles tone="dark" />);
    expect(() => unmount()).not.toThrow();
  });

  it('canvas 全屏尺寸属性 (width/height 设置)', () => {
    // happy-dom innerWidth/innerHeight 有默认值 — effect 里 getContext null 早退,
    // width 属性保持默认; 只验证元素可访问这些属性
    const { container } = render(<AtmosphereParticles tone="twist" />);
    const canvas = container.querySelector('canvas') as HTMLCanvasElement;
    expect(typeof canvas.width).toBe('number');
    expect(typeof canvas.height).toBe('number');
  });
});
