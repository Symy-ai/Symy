// @vitest-environment happy-dom

import { act, render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('../../parts/challenge-prompt', () => ({
  buildChallengeDisplayMessage: vi.fn((item: string, amount: number) => `想买 ${item} · $${amount}, 陪我看看`),
}));

import { usePendingContext } from '../use-pending-context';

type Ret = ReturnType<typeof usePendingContext>;
const box: { current: Ret | null } = { current: null };

function Probe(props: Parameters<typeof usePendingContext>[0]) {
  box.current = usePendingContext(props);
  return null;
}

const lock = { current: { inProgress: false, lastContent: '', lastTime: 0 } };

/**
 * use-pending-context.ts (68行) — pendingContext 暂存→就绪自动发送 (Wave 1 搬运件)。
 *
 * 锁定 (NEW-030 + mirror P1 双修复):
 * - loading 未就绪 → 暂存不发送; 就绪 → 自动发送+清 ref (只发一次)
 * - activeChallenge: displayMsg 优先 pendingDisplayContentRef (镜子哲学), fallback 硬编码
 * - lock 持有 → 本轮不发 (等下次 effect)
 */
describe('usePendingContext 暂存→自动发送', () => {
  it('loading 中暂存; 就绪后自动发 (清 ref 防重复)', () => {
    const send = vi.fn(() => Promise.resolve());
    const { rerender } = render(<Probe activeChallenge={undefined} isLoading isLoadingHistory={false} sendMessageLockRef={lock} />);
    const r = box.current as Ret;
    act(() => {
      r.pendingContextRef.current = 'context-payload';
      r.sendMessageRef.current = send;
    });
    // isLoading=true → 不发
    act(() => { rerender(<Probe activeChallenge={undefined} isLoading isLoadingHistory={false} sendMessageLockRef={lock} />); });
    expect(send).not.toHaveBeenCalled();
    // 就绪 → 发
    act(() => { rerender(<Probe activeChallenge={undefined} isLoading={false} isLoadingHistory={false} sendMessageLockRef={lock} />); });
    expect(send).toHaveBeenCalledTimes(1);
    expect(send).toHaveBeenCalledWith('context-payload');
    expect((box.current as Ret).pendingContextRef.current).toBeNull(); // 已清
  });

  it('activeChallenge: displayMsg 优先镜子 ref, fallback 硬编码', () => {
    const send = vi.fn(() => Promise.resolve());
    const challenge = { itemName: '咖啡机', amount: 129 };
    const { rerender } = render(<Probe activeChallenge={challenge} isLoading isLoadingHistory={false} sendMessageLockRef={lock} />);
    const r = box.current as Ret;
    act(() => {
      r.pendingContextRef.current = 'api-payload';
      r.pendingDisplayContentRef.current = '我被咖啡机打动了, 陪我看看';
      r.sendMessageRef.current = send;
    });
    act(() => { rerender(<Probe activeChallenge={challenge} isLoading={false} isLoadingHistory={false} sendMessageLockRef={lock} />); });
    // 双参: (displayMsg, apiContent)
    expect(send).toHaveBeenCalledWith('我被咖啡机打动了, 陪我看看', 'api-payload');
    // displayContent ref 已清 (防下次挑战复用旧 mirrorMsg)
    expect((box.current as Ret).pendingDisplayContentRef.current).toBeNull();
  });

  it('lock 持有 → 本轮不发', () => {
    const send = vi.fn(() => Promise.resolve());
    lock.current.inProgress = true;
    const { rerender } = render(<Probe activeChallenge={undefined} isLoading isLoadingHistory={false} sendMessageLockRef={lock} />);
    const r = box.current as Ret;
    act(() => {
      r.pendingContextRef.current = 'ctx';
      r.sendMessageRef.current = send;
    });
    act(() => { rerender(<Probe activeChallenge={undefined} isLoading={false} isLoadingHistory={false} sendMessageLockRef={lock} />); });
    expect(send).not.toHaveBeenCalled();
    expect((box.current as Ret).pendingContextRef.current).toBe('ctx'); // 暂存保留
    lock.current.inProgress = false;
  });
});
