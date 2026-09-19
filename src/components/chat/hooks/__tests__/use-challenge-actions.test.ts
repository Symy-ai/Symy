/**
 * useChallengeActions tests (batch75-b 第四段 — testgap 盲区补测, v8 Top20 #7 / §十.3 / D2 / E3)
 *
 * 覆盖 (断言与现状对齐):
 *  - handleGiveUp happy path (basic tier): action 消息 + apiContent 金额文案同源 ($50.00, v5 §十一.3)、
 *    POST /api/challenge/complete status='passed'、拦截勋章 savedCents=Math.round(amount*100)、
 *    symyEvents tokensEarned、elephant success toast、onChallengeCompleted 同步恰一次
 *  - 勋章 savedCents 舍入: 23.995 → 2400 分
 *  - variable reward (golden): 'variable-reward' CustomEvent detail、onChallengeCompleted 延迟到
 *    'variable-reward-complete' 事件; D2 fix (batch91-b) — 事件触发后 10s 兜底不再双调 (恰 1 次)、
 *    无事件时兜底恰 1 次救场、卸载后兜底零调用
 *  - 双击防护: giveUp in-flight 时二次调用被吞; 共享 ref 也挡住 handleChooseToBuy
 *  - complete API 失败: retry info toast、不触发勋章/完成回调 (Round 19 H3)
 *  - 无 challengeId (demo): 零 API、success toast、onChallengePassed demo-* id
 *  - handleChooseToBuy: isBuyPath=true + status='failed'; E3 现状固化 — API 失败仅 warn, 无 toast 无 onChallengeBought
 *  - handleResume: 100ms timer 后 sendMessage (P0-3 时薪 2.0 hours)、skipNextHistoryLoad、
 *    双击防护、失败释放锁、无 challenge 数据释放锁、卸载清 timer (H3)
 *  - handleDismiss: 成功 challengeDismissed 事件 + 清屏; 失败 info toast 但仍清屏 (Round 19 C3)
 */
// @vitest-environment happy-dom

import { renderHook, act } from '@testing-library/react';
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import {
  useChallengeActions,
  type ChallengeActionsArgs,
  type ActiveChallenge,
} from '../use-challenge-actions';
import { apiFetch, apiFetchVoid } from '@/lib/api-client';
import { symyEvents } from '@/lib/posthog';
import { dispatchInterceptMedal } from '@/lib/intercept-medal';

vi.mock('@/lib/api-client', () => ({
  apiFetch: vi.fn(),
  apiFetchVoid: vi.fn(),
}));

vi.mock('@/lib/posthog', () => ({
  symyEvents: {
    challengeCompleted: vi.fn(),
    challengeDismissed: vi.fn(),
  },
}));

vi.mock('@/lib/intercept-medal', () => ({
  dispatchInterceptMedal: vi.fn(),
}));

vi.mock('@/lib/elephant-tone', () => ({
  elephantMoney: vi.fn((amount: number) => `$${amount.toFixed(2)}`),
  elephantHours: vi.fn((value: string | number) => `${value}h`),
  getElephantPhrase: vi.fn((scene: string) => `elephant:${scene}`),
}));

const t = (key: string, values?: Record<string, string | number> & { defaultValue?: string }) => {
  const DICT: Record<string, string> = {
    'chat.challengeSawItAction': '✓ Saw it',
    'chat.challengeChoseToBuyAction': '✗ Chose to buy',
  };
  let tpl = DICT[key] ?? values?.defaultValue ?? key;
  if (values) {
    for (const [k, v] of Object.entries(values)) {
      if (k !== 'defaultValue') tpl = tpl.replaceAll(`{${k}}`, String(v));
    }
  }
  return tpl;
};

const CH: ActiveChallenge = { challengeId: 'ch-1', itemName: 'Headphones', amount: 50 };

function deferred<T>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function setup(overrides: Partial<ChallengeActionsArgs> = {}) {
  const sendMessage = vi.fn(
    async (
      _content: string,
      _apiContent?: string,
      _ctx?: ActiveChallenge,
      _isBuyPath?: boolean,
      _actionType?: 'saw_it' | 'chose_to_buy' | 'challenge_created'
    ) => {}
  );
  const args = {
    setActiveChallenge: vi.fn(),
    setExpiredChallenge: vi.fn(),
    setMessages: vi.fn(),
    skipNextHistoryLoadRef: { current: false },
    onChallengePassed: vi.fn(),
    onChallengeCompleted: vi.fn(),
    onChallengeBought: vi.fn(),
    sendMessage,
    onToast: vi.fn(),
    onBuddyStateRefresh: vi.fn(),
    t,
    locale: 'en',
    hourlyRate: 25,
    ...overrides,
  } as unknown as ChallengeActionsArgs;
  const utils = renderHook(() => useChallengeActions(args));
  return { args, sendMessage, ...utils };
}

describe('useChallengeActions — handleGiveUp', () => {
  let rewardEvents: CustomEvent[];
  const recordReward = (e: Event) => rewardEvents.push(e as CustomEvent);

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    rewardEvents = [];
    window.addEventListener('variable-reward', recordReward);
  });

  afterEach(() => {
    window.removeEventListener('variable-reward', recordReward);
    vi.useRealTimers();
  });

  it('basic tier happy path: action 消息金额文案同源 + POST passed + 勋章 5000 分 + 完成回调恰一次', async () => {
    const { result, args, sendMessage } = setup();
    vi.mocked(apiFetch).mockResolvedValueOnce({ result: { rewardTier: 'basic', bonusTokens: 3 } });

    await act(async () => {
      await result.current.handleGiveUp(CH);
    });

    expect(args.setActiveChallenge).toHaveBeenCalledWith(undefined);
    expect(args.sendMessage).toHaveBeenCalledTimes(1);
    const [actionContent, apiContent, savedChallenge, isBuyPath, actionType] = sendMessage.mock
      .calls[0];
    expect(actionContent).toBe('✓ Saw it');
    expect(apiContent).toBe(
      '[Action: User chose to pass on Headphones ($50.00). They saw the cost and decided to keep the money.]'
    );
    expect(savedChallenge).toEqual({ itemName: 'Headphones', amount: 50, challengeId: 'ch-1' });
    expect(isBuyPath).toBe(false);
    expect(actionType).toBe('saw_it');

    expect(apiFetch).toHaveBeenCalledWith('/api/challenge/complete', {
      method: 'POST',
      body: { challengeId: 'ch-1', status: 'passed', itemName: 'Headphones', amount: 50 },
    });
    expect(dispatchInterceptMedal).toHaveBeenCalledWith({
      itemTitle: 'Headphones',
      savedCents: 5000,
      date: expect.any(String),
    });
    expect(vi.mocked(symyEvents.challengeCompleted)).toHaveBeenCalledWith({
      challengeType: 'resist',
      tokensEarned: 3,
    });
    expect(args.onToast).toHaveBeenCalledWith('elephant:saw_it', 'success');
    expect(args.onChallengeCompleted).toHaveBeenCalledTimes(1);
    expect(args.onChallengeCompleted).toHaveBeenCalledWith('ch-1', 50);
    expect(rewardEvents).toHaveLength(0);
    expect(args.onChallengePassed).not.toHaveBeenCalled();
  });

  it('勋章 savedCents 舍入: 23.995 → 2400 分 (Math.round)', async () => {
    const { result } = setup();
    vi.mocked(apiFetch).mockResolvedValueOnce({ result: { rewardTier: 'basic' } });
    await act(async () => {
      await result.current.handleGiveUp({ ...CH, amount: 23.995 });
    });
    expect(dispatchInterceptMedal).toHaveBeenCalledWith(
      expect.objectContaining({ savedCents: 2400 })
    );
  });

  it('golden tier: variable-reward 事件 detail 正确; onChallengeCompleted 延迟到完成事件; D2 fix — 事件触发后 10s 兜底不再双调 (恰 1 次)', async () => {
    const { result, args } = setup();
    vi.mocked(apiFetch).mockResolvedValueOnce({
      result: { rewardTier: 'golden', bonusTokens: 30, bonusVitality: 10 },
    });

    await act(async () => {
      await result.current.handleGiveUp(CH);
    });
    expect(rewardEvents).toHaveLength(1);
    expect(rewardEvents[0].detail).toEqual({
      rewardTier: 'golden',
      bonusTokens: 30,
      bonusVitality: 10,
    });
    expect(args.onChallengeCompleted).not.toHaveBeenCalled();

    await act(async () => {
      window.dispatchEvent(new Event('variable-reward-complete'));
      await Promise.resolve();
    });
    expect(args.onChallengeCompleted).toHaveBeenCalledTimes(1);

    // D2 fix (batch91-b): 事件已触发 (completed 标志置位), 10s 兜底只清监听不再调用
    await act(async () => {
      vi.advanceTimersByTime(10_000);
      await Promise.resolve();
    });
    expect(args.onChallengeCompleted).toHaveBeenCalledTimes(1);
    expect(args.onChallengeCompleted).toHaveBeenNthCalledWith(1, 'ch-1', 50);

    // 兜底触发后监听已移除: 再派发完成事件仍零额外调用
    await act(async () => {
      window.dispatchEvent(new Event('variable-reward-complete'));
      await Promise.resolve();
    });
    expect(args.onChallengeCompleted).toHaveBeenCalledTimes(1);
  });

  it('D2 兜底单独路径: 无完成事件时 10s 内恰触发一次', async () => {
    const { result, args } = setup();
    vi.mocked(apiFetch).mockResolvedValueOnce({
      result: { rewardTier: 'golden', bonusTokens: 30, bonusVitality: 10 },
    });
    await act(async () => {
      await result.current.handleGiveUp(CH);
    });
    await act(async () => {
      vi.advanceTimersByTime(10_000);
      await Promise.resolve();
    });
    expect(args.onChallengeCompleted).toHaveBeenCalledTimes(1);
    await act(async () => {
      vi.advanceTimersByTime(10_000);
      await Promise.resolve();
    });
    expect(args.onChallengeCompleted).toHaveBeenCalledTimes(1);
  });

  it('D2 fix 卸载清理: 兜底 timer 挂起时卸载 → 10s 后零调用 (batch91-b)', async () => {
    const { result, args, unmount } = setup();
    vi.mocked(apiFetch).mockResolvedValueOnce({
      result: { rewardTier: 'golden', bonusTokens: 30, bonusVitality: 10 },
    });
    await act(async () => {
      await result.current.handleGiveUp(CH);
    });
    expect(args.onChallengeCompleted).not.toHaveBeenCalled();
    unmount();
    await act(async () => {
      vi.advanceTimersByTime(10_000);
      await Promise.resolve();
    });
    expect(args.onChallengeCompleted).not.toHaveBeenCalled();
  });

  it('双击防护: in-flight 时二次调用被吞 (单次 sendMessage + 单次 API)', async () => {
    const { result, args } = setup();
    const d = deferred<{ result?: { rewardTier?: string } }>();
    vi.mocked(apiFetch).mockReturnValueOnce(d.promise);

    await act(async () => {
      const p1 = result.current.handleGiveUp(CH);
      await result.current.handleGiveUp(CH);
      expect(args.sendMessage).toHaveBeenCalledTimes(1);
      d.resolve({ result: { rewardTier: 'basic' } });
      await p1;
    });
    expect(apiFetch).toHaveBeenCalledTimes(1);
    expect(args.onToast).toHaveBeenCalledTimes(1);
  });

  it('complete API 失败: retry info toast; 勋章/事件/完成回调均不触发; action 消息已发出', async () => {
    const { result, args } = setup();
    vi.mocked(apiFetch).mockRejectedValueOnce(new Error('HTTP 500'));

    await act(async () => {
      await result.current.handleGiveUp(CH);
    });

    expect(args.sendMessage).toHaveBeenCalledTimes(1);
    expect(args.onToast).toHaveBeenCalledTimes(1);
    expect(args.onToast).toHaveBeenCalledWith(
      'Challenge marked as passed locally, but server save failed. Please retry or refresh.',
      'info'
    );
    expect(dispatchInterceptMedal).not.toHaveBeenCalled();
    expect(vi.mocked(symyEvents.challengeCompleted)).not.toHaveBeenCalled();
    expect(args.onChallengeCompleted).not.toHaveBeenCalled();
  });

  it('无 challengeId (demo): 零 API + success toast + onChallengePassed demo-* id', async () => {
    const { result, args } = setup();
    await act(async () => {
      await result.current.handleGiveUp({ ...CH, challengeId: '' });
    });
    expect(apiFetch).not.toHaveBeenCalled();
    expect(args.onToast).toHaveBeenCalledWith('elephant:saw_it', 'success');
    expect(args.onChallengePassed).toHaveBeenCalledTimes(1);
    expect(args.onChallengePassed).toHaveBeenCalledWith({
      challengeId: expect.stringMatching(/^demo-\d+$/),
      itemName: 'Headphones',
      amount: 50,
    });
    expect(args.onChallengeCompleted).not.toHaveBeenCalled();
  });
});

describe('useChallengeActions — handleChooseToBuy', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('成功: sendMessage isBuyPath=true + POST status=failed + onChallengeBought + 双 info toast', async () => {
    const { result, args, sendMessage } = setup();
    vi.mocked(apiFetchVoid).mockResolvedValueOnce(undefined);

    await act(async () => {
      await result.current.handleChooseToBuy(CH);
    });

    const [actionContent, apiContent, , isBuyPath, actionType] = sendMessage.mock.calls[0];
    expect(actionContent).toBe('✗ Chose to buy');
    expect(String(apiContent)).toContain('[Action: User chose to buy Headphones for $50.00.');
    expect(isBuyPath).toBe(true);
    expect(actionType).toBe('chose_to_buy');

    expect(apiFetchVoid).toHaveBeenCalledWith('/api/challenge/complete', {
      method: 'POST',
      body: { challengeId: 'ch-1', status: 'failed', itemName: 'Headphones', amount: 50 },
    });
    expect(args.onChallengeBought).toHaveBeenCalledWith(50, 'Headphones');
    expect(args.onToast).toHaveBeenCalledTimes(2);
    expect(args.onToast).toHaveBeenNthCalledWith(1, 'elephant:bought_anyway', 'info');
    expect(args.onToast).toHaveBeenNthCalledWith(2, '📋 Challenge recorded. Symy noted this purchase.', 'info');
    expect(vi.mocked(symyEvents.challengeCompleted)).toHaveBeenCalledWith({ challengeType: 'bought' });
    expect(args.onBuddyStateRefresh).toHaveBeenCalledTimes(1);
    expect(apiFetch).not.toHaveBeenCalled();
  });

  it('E3 现状固化: API 失败仅 logger.warn — 零 toast、零 onChallengeBought、零事件', async () => {
    const { result, args } = setup();
    vi.mocked(apiFetchVoid).mockRejectedValueOnce(new Error('HTTP 500'));

    await act(async () => {
      await result.current.handleChooseToBuy(CH);
    });

    expect(args.sendMessage).toHaveBeenCalledTimes(1);
    expect(args.onToast).not.toHaveBeenCalled();
    expect(args.onChallengeBought).not.toHaveBeenCalled();
    expect(vi.mocked(symyEvents.challengeCompleted)).not.toHaveBeenCalled();
    expect(args.onBuddyStateRefresh).not.toHaveBeenCalled();
  });

  it('共享 in-flight ref: giveUp 进行中时 handleChooseToBuy 被吞', async () => {
    const { result, args } = setup();
    const d = deferred<{ result?: { rewardTier?: string } }>();
    vi.mocked(apiFetch).mockReturnValueOnce(d.promise);

    await act(async () => {
      const p1 = result.current.handleGiveUp(CH);
      await result.current.handleChooseToBuy(CH);
      expect(apiFetchVoid).not.toHaveBeenCalled();
      expect(args.onChallengeBought).not.toHaveBeenCalled();
      d.resolve({ result: { rewardTier: 'basic' } });
      await p1;
    });
  });
});

describe('useChallengeActions — handleResume', () => {
  const EXPIRED = { challengeId: 'ch-9', itemName: 'Desk', amount: 100 };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('成功: 100ms 后 sendMessage; P0-3 时薪换算 (100/25=4.0 hours); skip 标记 + 状态恢复', async () => {
    const { result, args, sendMessage } = setup();
    vi.mocked(apiFetch).mockResolvedValueOnce({
      challenge: { challengeId: 'ch-9', itemName: 'Desk', amount: 100 },
    });

    await act(async () => {
      await result.current.handleResume(EXPIRED);
    });

    expect(apiFetch).toHaveBeenCalledWith('/api/challenge/resume', {
      method: 'POST',
      body: { challengeId: 'ch-9' },
    });
    expect(args.skipNextHistoryLoadRef.current).toBe(true);
    expect(args.setMessages).toHaveBeenCalledTimes(1);
    expect(args.setActiveChallenge).toHaveBeenCalledWith({
      itemName: 'Desk',
      amount: 100,
      challengeId: 'ch-9',
    });
    expect(args.setExpiredChallenge).toHaveBeenCalledWith(null);
    expect(args.sendMessage).not.toHaveBeenCalled();

    await act(async () => {
      vi.advanceTimersByTime(100);
      await Promise.resolve();
    });
    expect(args.sendMessage).toHaveBeenCalledTimes(1);
    const [msg, prompt, ctx] = sendMessage.mock.calls[0];
    expect(msg).toBe("I'm back — let's continue the challenge about Desk");
    expect(String(prompt)).toContain('RESUMED');
    expect(String(prompt)).toContain('4.0 hours');
    expect(ctx).toEqual({ itemName: 'Desk', amount: 100, challengeId: 'ch-9' });
  });

  it('双击防护: in-flight 时二次调用只发一次 API; timer 后仅一条 resume 消息', async () => {
    const { result, args } = setup();
    const d = deferred<{ challenge?: { challengeId: string; itemName: string; amount: number } }>();
    vi.mocked(apiFetch).mockReturnValueOnce(d.promise);

    await act(async () => {
      const p1 = result.current.handleResume(EXPIRED);
      await result.current.handleResume(EXPIRED);
      expect(apiFetch).toHaveBeenCalledTimes(1);
      d.resolve({ challenge: { challengeId: 'ch-9', itemName: 'Desk', amount: 100 } });
      await p1;
    });
    await act(async () => {
      vi.advanceTimersByTime(100);
      await Promise.resolve();
    });
    expect(args.sendMessage).toHaveBeenCalledTimes(1);
  });

  it('API 失败释放锁: 首次 reject 后可再次 resume', async () => {
    const { result } = setup();
    vi.mocked(apiFetch).mockRejectedValueOnce(new Error('HTTP 500'));
    await act(async () => {
      await result.current.handleResume(EXPIRED);
    });

    vi.mocked(apiFetch).mockResolvedValueOnce({
      challenge: { challengeId: 'ch-9', itemName: 'Desk', amount: 100 },
    });
    await act(async () => {
      await result.current.handleResume(EXPIRED);
    });
    expect(apiFetch).toHaveBeenCalledTimes(2);
    await act(async () => {
      vi.advanceTimersByTime(100);
      await Promise.resolve();
    });
    expect(result.current).toBeTruthy();
  });

  it('API 成功但无 challenge 数据: 不恢复状态且释放锁 (可再次调用)', async () => {
    const { result, args } = setup();
    vi.mocked(apiFetch).mockResolvedValueOnce({});
    await act(async () => {
      await result.current.handleResume(EXPIRED);
    });
    expect(args.setActiveChallenge).not.toHaveBeenCalled();

    vi.mocked(apiFetch).mockResolvedValueOnce({});
    await act(async () => {
      await result.current.handleResume(EXPIRED);
    });
    expect(apiFetch).toHaveBeenCalledTimes(2);
    await act(async () => {
      vi.advanceTimersByTime(200);
      await Promise.resolve();
    });
    expect(args.sendMessage).not.toHaveBeenCalled();
  });

  it('卸载清理: 成功后、100ms timer 前卸载 → sendMessage 永不触发 (H3)', async () => {
    const { result, args, unmount } = setup();
    vi.mocked(apiFetch).mockResolvedValueOnce({
      challenge: { challengeId: 'ch-9', itemName: 'Desk', amount: 100 },
    });
    await act(async () => {
      await result.current.handleResume(EXPIRED);
    });
    unmount();
    await act(async () => {
      vi.advanceTimersByTime(10_000);
      await Promise.resolve();
    });
    expect(args.sendMessage).not.toHaveBeenCalled();
  });
});

describe('useChallengeActions — handleDismiss', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('成功: POST dismiss + challengeDismissed 事件 + 清屏, 无 toast', async () => {
    const { result, args } = setup();
    vi.mocked(apiFetchVoid).mockResolvedValueOnce(undefined);
    await act(async () => {
      await result.current.handleDismiss({ challengeId: 'ch-x', itemName: 'Sofa', amount: 300 });
    });
    expect(apiFetchVoid).toHaveBeenCalledWith('/api/challenge/dismiss', {
      method: 'POST',
      body: { challengeId: 'ch-x' },
    });
    expect(vi.mocked(symyEvents.challengeDismissed)).toHaveBeenCalledWith({ challengeType: 'expired' });
    expect(args.setExpiredChallenge).toHaveBeenCalledWith(null);
    expect(args.onToast).not.toHaveBeenCalled();
  });

  it('失败: info toast 但仍清屏 (乐观 UX, Round 19 C3)', async () => {
    const { result, args } = setup();
    vi.mocked(apiFetchVoid).mockRejectedValueOnce(new Error('HTTP 500'));
    await act(async () => {
      await result.current.handleDismiss({ challengeId: 'ch-x', itemName: 'Sofa', amount: 300 });
    });
    expect(args.onToast).toHaveBeenCalledWith(
      'Failed to dismiss — challenge may reappear on refresh.',
      'info'
    );
    expect(args.setExpiredChallenge).toHaveBeenCalledWith(null);
  });
});
