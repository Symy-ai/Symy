// @vitest-environment happy-dom

import { act, cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useTypewriter } from '../use-typewriter';

type Ret = ReturnType<typeof useTypewriter>;
const box: { current: Ret | null } = { current: null };
function Probe({ text, speed, enabled }: { text: string; speed?: number; enabled?: boolean }) {
  box.current = useTypewriter(text, speed, enabled);
  return null;
}

/**
 * use-typewriter.ts (53行) — 打字机效果 (Round 80 F4)。
 *
 * 锁定:
 * - enabled=false → 全文直显 complete
 * - enabled → 逐字累进, 终点 complete
 * - skipToEnd 立即跳全文
 * - text 变更 → 重置重打
 */
describe('useTypewriter 打字机', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    vi.useRealTimers();
    cleanup();
  });

  it('enabled=false → 全文直显', () => {
    render(<Probe text="你好故事" enabled={false} />);
    expect(box.current?.displayedText).toBe('你好故事');
    expect(box.current?.isComplete).toBe(true);
  });

  it('enabled → 逐字累进到 complete', () => {
    render(<Probe text="abcd" speed={10} enabled />);
    expect(box.current?.displayedText).toBe('');
    expect(box.current?.isComplete).toBe(false);
    act(() => { vi.advanceTimersByTime(10); });
    expect(box.current?.displayedText).toBe('a');
    act(() => { vi.advanceTimersByTime(30); }); // 共 4 tick
    expect(box.current?.displayedText).toBe('abcd');
    expect(box.current?.isComplete).toBe(true);
  });

  it('skipToEnd 立即全文', () => {
    render(<Probe text="长文内容" speed={10} enabled />);
    act(() => { box.current?.skipToEnd(); });
    expect(box.current?.displayedText).toBe('长文内容');
    expect(box.current?.isComplete).toBe(true);
  });

  it('text 变更 → 重置重打', () => {
    const { rerender } = render(<Probe text="aaa" speed={10} enabled />);
    act(() => { vi.advanceTimersByTime(30); });
    expect(box.current?.displayedText).toBe('aaa');
    rerender(<Probe text="bbb" speed={10} enabled />);
    act(() => { vi.advanceTimersByTime(10); }); // 第一个 tick 只 1 字
    expect(box.current?.displayedText).toBe('b');
    expect(box.current?.isComplete).toBe(false);
  });
});
