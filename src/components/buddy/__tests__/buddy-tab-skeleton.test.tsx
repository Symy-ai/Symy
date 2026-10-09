// @vitest-environment happy-dom

import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { BuddyTabSkeleton } from '../buddy-tab-skeleton';

/**
 * buddy-tab-skeleton.tsx (53行) — 加载骨架 (Round 86 拆分, Bug 17 配套)。
 *
 * 锁定:
 * - 五区结构 (Hero/QuickActions/Stats/DreamFunds/HealthLog)
 * - 全 pulse 动画 (骨架语义)
 * - HealthLog 三行列表
 */
describe('BuddyTabSkeleton 骨架', () => {
  afterEach(() => cleanup());

  it('五区结构渲染 (Hero 头像圆 32×32)', () => {
    render(<BuddyTabSkeleton />);
    const root = document.querySelector('.h-full') as HTMLElement;
    expect(root).toBeTruthy();
    // Hero 头像: w-32 h-32 圆形
    expect(root.querySelector('.w-32.h-32.rounded-full')).toBeTruthy();
    // QuickActions: grid-cols-2
    expect(root.querySelector('.grid.grid-cols-2')).toBeTruthy();
    // Stats: glass-card
    expect(root.querySelector('.glass-card')).toBeTruthy();
  });

  it('HealthLog 三行 (循环列表)', () => {
    render(<BuddyTabSkeleton />);
    // 每行 w-7 圆头像
    const rows = document.querySelectorAll('.w-7.h-7.rounded-full');
    expect(rows.length).toBe(3);
  });

  it('全 pulse 骨架语义', () => {
    render(<BuddyTabSkeleton />);
    const pulses = document.querySelectorAll('.animate-pulse');
    expect(pulses.length).toBeGreaterThanOrEqual(15); // 密集骨架块
  });
});
