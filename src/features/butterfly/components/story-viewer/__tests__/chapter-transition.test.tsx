// @vitest-environment happy-dom

import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const stableT = (key: string, opts?: { defaultValue?: string; n?: number }) => {
  let v = key === 'butterfly.chapterLabel' ? '第 {n} 章' : (opts?.defaultValue ?? key);
  if (opts && opts.n !== undefined) v = v.replace('{n}', String(opts.n));
  return v;
};
vi.mock('@/i18n/provider', () => ({
  useI18n: () => ({ locale: 'zh', t: stableT }),
}));

import { ChapterTransition } from '../chapter-transition';

/**
 * chapter-transition.tsx (62行) — 章节转场覆盖 (Round 80 F4 拆件)。
 *
 * 锁定:
 * - 章节号插值 {n} + 标题 + 时间跨度三件渲染
 * - 2200ms 后 onComplete (P3-9 i18n 覆盖锚)
 * - 基调色光晕: TONE_COLORS[tone] 命中; 未知 tone → neutral 兜底
 * - 卸载清计时器 (不残留 onComplete)
 */
describe('ChapterTransition 章节转场', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
    cleanup();
  });

  it('三件渲染: 章节号插值+标题+时间跨度', () => {
    render(<ChapterTransition chapterIndex={3} title="山顶的风" tone="hopeful" timeSpan="2024 · 春" onComplete={vi.fn()} />);
    expect(screen.getByText('第 3 章')).toBeTruthy();
    expect(screen.getByText('山顶的风')).toBeTruthy();
    expect(screen.getByText('2024 · 春')).toBeTruthy();
  });

  it('2200ms 后 onComplete', () => {
    const onComplete = vi.fn();
    render(<ChapterTransition chapterIndex={1} title="T" tone="neutral" timeSpan="S" onComplete={onComplete} />);
    expect(onComplete).not.toHaveBeenCalled();
    act(() => { vi.advanceTimersByTime(2199); });
    expect(onComplete).not.toHaveBeenCalled();
    act(() => { vi.advanceTimersByTime(1); });
    expect(onComplete).toHaveBeenCalledTimes(1);
  });

  it('卸载清计时器 → 不再 onComplete', () => {
    const onComplete = vi.fn();
    const { unmount } = render(<ChapterTransition chapterIndex={1} title="T" tone="neutral" timeSpan="S" onComplete={onComplete} />);
    unmount();
    act(() => { vi.advanceTimersByTime(5000); });
    expect(onComplete).not.toHaveBeenCalled();
  });

  it('未知 tone → neutral 光晕兜底 (不炸)', () => {
    render(<ChapterTransition chapterIndex={1} title="T" tone={'unknown' as never} timeSpan="S" onComplete={vi.fn()} />);
    const halo = document.querySelector('.blur-3xl') as HTMLElement;
    expect(halo).toBeTruthy();
    expect(halo.style.backgroundColor).toBeTruthy();
  });
});
