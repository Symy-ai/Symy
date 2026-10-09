// @vitest-environment happy-dom

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { PlatformInduceIndex } from '../platform-induce-index';

const t = (key: string, opts?: { defaultValue?: string }) => {
  const map: Record<string, string> = {
    'inward.platformIndex': '平台消费触发指数',
    'defense.platformIndexDesc': '指数 = 失败挑战 / 总挑战 (本周)',
    'defense.platformIndexEmpty': '社区数据还不够 — 稍后再来看看。',
    'ahaMoment.demoBadge': '🌱 示例数据',
  };
  return map[key] ?? opts?.defaultValue ?? key;
};

const baseProps = {
  platforms: [
    { platform: 'tiktok_shop', index: 82 } as never,
    { platform: 'amazon', index: 55 } as never,
    { platform: 'shein', index: 23 } as never,
  ],
  isLoading: false,
  t,
};

/**
 * platform-induce-index.tsx (100行) — 平台诱导指数三色进度条 (P1-1)。
 *
 * 锁定:
 * - isLoading → 三骨架
 * - 空数组 → 空态文案
 * - 三色分流: ≥70 红 / 40-69 橙 / <40 绿 (锚边界 82/55/23)
 * - 指数百分比 + 进度条宽
 */
describe('PlatformInduceIndex 平台诱导指数', () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(() => cleanup());

  it('isLoading → 三骨架脉冲', () => {
    const { container } = render(<PlatformInduceIndex {...baseProps} isLoading />);
    expect(screen.getByText('平台消费触发指数')).toBeTruthy();
    expect(container.querySelectorAll('.animate-pulse').length).toBeGreaterThan(0);
  });

  it('空数组 → 空态诚实文案', () => {
    render(<PlatformInduceIndex {...baseProps} platforms={[]} />);
    expect(screen.getByText(/社区数据还不够/)).toBeTruthy();
  });

  it('三色分流: 82 红 / 55 橙 / 23 绿 (含数字展示)', () => {
    render(<PlatformInduceIndex {...baseProps} />);
    expect(screen.getByText('82%').className).toContain('text-red-400');
    expect(screen.getByText('55%').className).toContain('text-orange-400');
    expect(screen.getByText('23%').className).toContain('text-green-400');
  });

  it('进度条宽 = 指数% (82% → width 82%)', () => {
    const { container } = render(<PlatformInduceIndex {...baseProps} />);
    const bar = container.querySelector('.rounded-full.transition-all') as HTMLElement;
    expect(bar.style.width).toBe('82%');
    expect(bar.className).toContain('bg-red-500');
  });
});
