// @vitest-environment happy-dom

import { cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const storeMock = vi.hoisted(() => ({
  getDue: vi.fn(() => ({ id: 'mc1', itemName: 'X', issuedAt: 1, dueAt: 2 })),
  prune: vi.fn(),
}));
vi.mock('@/components/chat/parts/micro-challenge-store', () => ({
  getDueMicroChallenge: storeMock.getDue,
  pruneStalePendingMicroChallenge: storeMock.prune,
}));

import { useMicroChallengeFollowup } from '../use-micro-challenge-followup';

type Ret = ReturnType<typeof useMicroChallengeFollowup>;
const box: { current: Ret | null } = { current: null };
function Probe(props: { isDemo: boolean; historyReady: boolean }) {
  box.current = useMicroChallengeFollowup(props);
  return null;
}

/**
 * use-micro-challenge-followup.ts — 微挑战次日回访 (batch46-b)一次性派生 (与 cooldown 同模式)。
 *
 * 锁定:
 * - isDemo/历史未就绪 → 不派生不清理
 * - 就绪 → 先 prune 僵尸再派生一次 (derived 门)
 * - clear → null
 */
describe('useMicroChallengeFollowup 一次性派生', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    box.current = null;
  });
  afterEach(() => cleanup());

  it('isDemo/未就绪 → 不 prune 不派生', () => {
    render(<Probe isDemo historyReady />);
    expect(storeMock.prune).not.toHaveBeenCalled();
    cleanup();
    render(<Probe isDemo={false} historyReady={false} />);
    expect(storeMock.prune).not.toHaveBeenCalled();
    expect(box.current?.dueRecord ?? null).toBeNull();
  });

  it('就绪 → 先 prune 再派生一次 (derived 门防重)', () => {
    const { rerender } = render(<Probe isDemo={false} historyReady />);
    expect(storeMock.prune).toHaveBeenCalledTimes(1);
    expect(box.current?.dueRecord).toEqual({ id: 'mc1', itemName: 'X', issuedAt: 1, dueAt: 2 });
    rerender(<Probe isDemo={false} historyReady />);
    rerender(<Probe isDemo={false} historyReady />);
    expect(storeMock.getDue).toHaveBeenCalledTimes(1); // 一次性
  });

  it('clear → null (rerender 承接)', () => {
    const { rerender } = render(<Probe isDemo={false} historyReady />);
    expect((box.current as Ret).dueRecord).not.toBeNull();
    (box.current as Ret).clear();
    rerender(<Probe isDemo={false} historyReady />);
    expect((box.current as Ret).dueRecord).toBeNull();
  });
});
