// @vitest-environment happy-dom

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/i18n/provider', () => ({
  useI18n: () => ({
    locale: 'zh',
    t: (key: string, opts?: { defaultValue?: string; sec?: number }) => {
      const map: Record<string, string> = {
        'butterfly.loadingStage1': '正在理解你的决定…',
        'butterfly.loadingStage5': '正在编织蝴蝶效应…',
        'butterfly.weavingHint': '通常需要 30-90 秒, 请稍候!',
        'butterfly.patienceHint': '比平时久一点 — 仍在努力中',
        'butterfly.cancelAndRefund': '取消并退款',
      };
      let v = map[key] ?? opts?.defaultValue ?? key;
      if (opts?.sec !== undefined) v = v.replace('{sec}', String(opts.sec));
      return v;
    },
  }),
}));

import { ButterflyLoadingState } from '../butterfly-loading-state';

const baseProps = {
  isLight: false,
  stageIndex: 0,
  elapsedSec: 5,
};

/**
 * butterfly-loading-state.tsx (102行) — 加载态纯展示 (P1-1 拆分件)。
 *
 * 锁定:
 * - 五阶段轮播 (stageIndex 取模) + emoji
 * - 进度条: 90s→95% 封顶 (90s 后不再涨)
 * - 60s 耐心提示 + onCancel 按钮 (P0-5)
 * - 已用秒数展示
 * - isLight 词汇
 */
describe('ButterflyLoadingState 加载态', () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(() => cleanup());

  it('五阶段: stageIndex 0→🎭 / 4→🦋; 越界取模回 0', () => {
    const { unmount } = render(<ButterflyLoadingState {...baseProps} />);
    expect(screen.getByText('🎭')).toBeTruthy();
    expect(screen.getByText('正在理解你的决定…')).toBeTruthy();
    unmount();
    render(<ButterflyLoadingState {...baseProps} stageIndex={4} />);
    expect(screen.getByText('🦋')).toBeTruthy();
    unmount();
    render(<ButterflyLoadingState {...baseProps} stageIndex={5} />); // 取模回 0
    expect(screen.getByText('🎭')).toBeTruthy();
  });

  it('进度条: 45s→50%; 90s→95% 封顶; 180s 仍 95%', () => {
    const { unmount, container } = render(<ButterflyLoadingState {...baseProps} elapsedSec={45} />);
    let bar = container.querySelector('.transition-all') as HTMLElement;
    expect(bar.style.width).toBe('50%');
    unmount();
    const c2 = render(<ButterflyLoadingState {...baseProps} elapsedSec={90} />).container;
    bar = c2.querySelector('.transition-all') as HTMLElement;
    expect(bar.style.width).toBe('95%');
    unmount();
    const c3 = render(<ButterflyLoadingState {...baseProps} elapsedSec={180} />).container;
    bar = c3.querySelector('.transition-all') as HTMLElement;
    expect(bar.style.width).toBe('95%'); // 封顶
  });

  it('60s 耐心提示出现; 59s 无', () => {
    const { unmount } = render(<ButterflyLoadingState {...baseProps} elapsedSec={59} />);
    expect(screen.queryByText(/比平时久/)).toBeNull();
    unmount();
    render(<ButterflyLoadingState {...baseProps} elapsedSec={60} />);
    expect(screen.getByText(/比平时久/)).toBeTruthy();
  });

  it('P0-5: 60s+ 显示取消并退款, 点击 → onCancel', () => {
    const onCancel = vi.fn();
    render(<ButterflyLoadingState {...baseProps} elapsedSec={70} onCancel={onCancel} />);
    fireEvent.click(screen.getByText('取消并退款'));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('已用秒数: 5s 展示 Elapsed', () => {
    render(<ButterflyLoadingState {...baseProps} />);
    expect(screen.getByText(/5s/)).toBeTruthy();
  });
});
