import { describe, expect, it, vi } from 'vitest';

import { finalizeSendMessage } from '../send-message-finalize';

function makeHarness(abortSame = true) {
  const abortController = new AbortController();
  const abortRef = { current: abortSame ? abortController : new AbortController() };
  const sendMessageLockRef = { current: { inProgress: true, lastContent: 'x', lastTime: 1 } };
  const setIsLoading = vi.fn();
  const skipNextHistoryLoadRef = { current: false };
  const skipNonceRef = { current: 0 };
  const justBoughtChallengeRef = { current: true };
  const args = {
    abortRef, sendMessageLockRef, setIsLoading,
    skipNextHistoryLoadRef, skipNonceRef, justBoughtChallengeRef, abortController,
  };
  return { args, sendMessageLockRef, setIsLoading, skipNextHistoryLoadRef, skipNonceRef, justBoughtChallengeRef, abortRef };
}

/**
 * send-message-finalize.ts (32行) — 发送收尾五连清 (拆相位件)。
 *
 * 锁定:
 * - 同一 controller → 五连清 (abortRef null/锁释放/loading 假/skip 历史/skip nonce 时间戳/justBought 复位)
 * - 不同 controller (已被新请求替换) → 全不动 (陈旧收尾守卫)
 */
describe('finalizeSendMessage 五连清', () => {
  it('同一 controller → 全清', () => {
    const h = makeHarness(true);
    const before = Date.now();
    finalizeSendMessage(h.args);
    expect(h.abortRef.current).toBeNull();
    expect(h.sendMessageLockRef.current.inProgress).toBe(false);
    expect(h.setIsLoading).toHaveBeenCalledWith(false);
    expect(h.skipNextHistoryLoadRef.current).toBe(true);
    expect(h.skipNonceRef.current).toBeGreaterThanOrEqual(before); // Date.now 时间戳
    expect(h.justBoughtChallengeRef.current).toBe(false);
  });

  it('不同 controller (陈旧) → 全不动', () => {
    const h = makeHarness(false);
    finalizeSendMessage(h.args);
    expect(h.abortRef.current).not.toBeNull(); // 保持新 controller
    expect(h.sendMessageLockRef.current.inProgress).toBe(true); // 锁不释放
    expect(h.setIsLoading).not.toHaveBeenCalled();
    expect(h.skipNextHistoryLoadRef.current).toBe(false);
    expect(h.skipNonceRef.current).toBe(0);
    expect(h.justBoughtChallengeRef.current).toBe(true);
  });
});
