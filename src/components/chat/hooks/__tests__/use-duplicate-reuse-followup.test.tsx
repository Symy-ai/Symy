// @vitest-environment happy-dom

import { cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const getDueMock = vi.hoisted(() => vi.fn(() => ({ card: { itemName: 'X' }, decisionId: 'd1' })));
vi.mock('../../parts/duplicate-purchase-store', () => ({
  getDueReuseConfirmation: getDueMock,
}));

import { useDuplicateReuseFollowup } from '../use-duplicate-reuse-followup';

type Ret = ReturnType<typeof useDuplicateReuseFollowup>;
const box: { current: Ret | null } = { current: null };
function Probe(props: { isDemo: boolean; historyReady: boolean }) {
  box.current = useDuplicateReuseFollowup(props);
  return null;
}

/**
 * use-duplicate-reuse-followup.ts (16行) — 复用回访一次性派生 (batch60-c)。
 *
 * 锁定:
 * - isDemo/历史未就绪 → 不派生
 * - 就绪 → 一次性读取 (derived 门 — 重渲染不重读)
 * - clear → null
 */
describe('useDuplicateReuseFollowup 一次性派生', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    box.current = null;
  });
  afterEach(() => cleanup());

  it('isDemo → 不读 store; 历史未就绪 → 不读', () => {
    render(<Probe isDemo historyReady />);
    expect(getDueMock).not.toHaveBeenCalled();
    cleanup();
    render(<Probe isDemo={false} historyReady={false} />);
    expect(getDueMock).not.toHaveBeenCalled();
    expect(box.current?.due ?? null).toBeNull();
  });

  it('就绪 → 一次性读取 (derived 门防重读)', () => {
    const { rerender } = render(<Probe isDemo={false} historyReady />);
    expect(getDueMock).toHaveBeenCalledTimes(1);
    expect(box.current?.due).toEqual({ card: { itemName: 'X' }, decisionId: 'd1' });
    rerender(<Probe isDemo={false} historyReady />); // 重渲染
    rerender(<Probe isDemo={false} historyReady />);
    expect(getDueMock).toHaveBeenCalledTimes(1); // 只读一次
  });

  it('clear → null (rerender 承接 setState)', () => {
    const { rerender } = render(<Probe isDemo={false} historyReady />);
    expect((box.current as Ret).due).not.toBeNull();
    (box.current as Ret).clear();
    rerender(<Probe isDemo={false} historyReady />);
    expect((box.current as Ret).due).toBeNull();
  });
});
