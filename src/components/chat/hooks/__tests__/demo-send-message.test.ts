/**
 * handleDemoSendMessage tests (batch77-c — testgap v9 §十五.2 中高盲区补测, 纯测试)
 *
 * 覆盖 (断言与现状对齐, demo-reply mock 化, 真实时序走 fake timers):
 *  - 核心断言: demo 模式全流程零 fetch (不触真实 API)
 *  - 返回 true 短路真实路径; 1.5s 后 canned 回复; 锁/加载态时序
 *  - NEW-016 去重: 同 id user 消息不重复入列
 *  - BUG-45: 连发时旧 reply/auth timer 被清, 不叠加
 *  - BUG-47: 同步置锁防双击
 *  - BUG-55/Aha: N 条免费消息后 +1s 弹注册提示; 挑战模式不弹
 *  - Round 122: overrideChallengeContext 优先; P0-5 isFollowUp 判定
 *  - Brief D1a: saw-it 回复触发庆祝动画 (仅挑战上下文)
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act } from '@testing-library/react';
import type { ChatMessage } from '@/types/chat-message';
import { handleDemoSendMessage, type DemoSendMessageParams } from '../demo-send-message';
import {
  getDemoReply,
  getDemoChallengeReply,
  isChallengeFirstTriggerMessage,
  triggerDemoSeeItCelebration,
  isDemoSawItReply,
} from '../../parts/demo-reply';

vi.mock('../../parts/demo-reply', () => ({
  getDemoReply: vi.fn((input: string, locale: string) => `demo-reply:${input}:${locale}`),
  getDemoChallengeReply: vi.fn(
    (_content: string, ctx: { itemName: string; amount: number }, locale: string, isFollowUp: boolean) =>
      `challenge-reply:${ctx.itemName}:${ctx.amount}:${locale}:${isFollowUp}`
  ),
  isChallengeFirstTriggerMessage: vi.fn(() => true),
  triggerDemoSeeItCelebration: vi.fn(),
  isDemoSawItReply: vi.fn(() => false),
}));

const CHALLENGE = { itemName: 'Air Fryer', amount: 89 };

function makeHarness(overrides: Partial<DemoSendMessageParams> = {}) {
  let n = 0;
  const holder = { list: [] as ChatMessage[] };
  const params: DemoSendMessageParams = {
    content: 'I want coffee',
    activeChallengeRef: { current: undefined },
    demoMsgCountRef: { current: 0 },
    demoReplyTimerRef: { current: null },
    demoAuthTimerRef: { current: null },
    sendMessageLockRef: { current: { inProgress: false } },
    nextId: vi.fn((prefix: string) => `${prefix}-${++n}`),
    setMessagesSync: vi.fn((updater: ChatMessage[] | ((prev: ChatMessage[]) => ChatMessage[])) => {
      holder.list = typeof updater === 'function' ? updater(holder.list) : updater;
    }),
    setInput: vi.fn(),
    setIsLoading: vi.fn(),
    onAuthPrompt: vi.fn(),
    DEMO_FREE_MESSAGES: 3,
    locale: 'en',
    ...overrides,
  };
  return { params, holder };
}

describe('handleDemoSendMessage', () => {
  let fetchSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    // restoreAllMocks 只还原 vi.spyOn — 模块级 vi.fn() 的调用历史/returnValue 覆盖须手动重置
    vi.clearAllMocks();
    vi.mocked(isChallengeFirstTriggerMessage).mockReturnValue(true);
    vi.mocked(isDemoSawItReply).mockReturnValue(false);
    vi.useFakeTimers();
    fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('核心断言: demo 全流程 (回复 + 计数) 零 fetch; 同步返回 true + 入列 trimmed user 消息 + 置锁', () => {
    const { params, holder } = makeHarness({ content: '  I want coffee  ' });

    expect(handleDemoSendMessage(params)).toBe(true);

    // 短路真实路径: 不发网络请求 (同步 + 定时器走完都不发)
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(params.setInput).toHaveBeenCalledWith('');
    expect(params.setIsLoading).toHaveBeenCalledWith(true);
    expect(params.sendMessageLockRef.current.inProgress).toBe(true);
    expect(params.demoReplyTimerRef.current).not.toBeNull();
    expect(holder.list).toHaveLength(1);
    expect(holder.list[0]).toMatchObject({ role: 'user', content: 'I want coffee' });

    actAdvance(1500);

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(getDemoReply).toHaveBeenCalledWith('  I want coffee  ', 'en'); // 现状: 回复生成器收原始输入, 仅 user 气泡 trim
    expect(holder.list).toHaveLength(2);
    expect(holder.list[1]).toMatchObject({ role: 'assistant', content: 'demo-reply:  I want coffee  :en' });
    expect(params.setIsLoading).toHaveBeenLastCalledWith(false);
    expect(params.sendMessageLockRef.current.inProgress).toBe(false);
    expect(params.demoMsgCountRef.current).toBe(1);
    expect(params.onAuthPrompt).not.toHaveBeenCalled(); // 1 < DEMO_FREE_MESSAGES=3
  });

  it('NEW-016 去重: prev 已含同 id 消息 → updater 返回原数组, 不重复入列', () => {
    const seeded = [{ id: 'user-1', role: 'user', content: 'seeded', timestamp: new Date() } as ChatMessage];
    const { params, holder } = makeHarness();
    holder.list = seeded;

    handleDemoSendMessage(params); // nextId 生成 user-1, 与 seed 撞 id

    expect(params.setMessagesSync).toHaveBeenCalled();
    expect(holder.list).toBe(seeded); // 同引用 = 原样返回
    expect(holder.list).toHaveLength(1);
  });

  it('BUG-47+45 连发: 同步置锁; 第二次发送清旧 reply timer → 只有一条 AI 回复一次计数', () => {
    const { params, holder } = makeHarness();

    handleDemoSendMessage(params);
    handleDemoSendMessage(params); // 1.5s 内连发第二次

    actAdvance(1500);

    expect(getDemoReply).toHaveBeenCalledTimes(1); // 第一个 reply timer 已被清
    expect(holder.list.filter((m) => m.role === 'user')).toHaveLength(2);
    expect(holder.list.filter((m) => m.role === 'assistant')).toHaveLength(1);
    expect(params.demoMsgCountRef.current).toBe(1);
    expect(params.sendMessageLockRef.current.inProgress).toBe(false);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('挑战首触: activeChallenge 上下文 → getDemoChallengeReply(isFollowUp=false)', () => {
    const { params, holder } = makeHarness({ activeChallengeRef: { current: CHALLENGE } });
    vi.mocked(isChallengeFirstTriggerMessage).mockReturnValue(true);

    handleDemoSendMessage(params);
    actAdvance(1500);

    expect(getDemoChallengeReply).toHaveBeenCalledWith('I want coffee', CHALLENGE, 'en', false);
    expect(holder.list[1]?.content).toBe('challenge-reply:Air Fryer:89:en:false');
  });

  it('挑战后续消息: 非系统模板 → isFollowUp=true (走承认情绪路径, 不复读)', () => {
    const { params } = makeHarness({ activeChallengeRef: { current: CHALLENGE } });
    vi.mocked(isChallengeFirstTriggerMessage).mockReturnValue(false);

    handleDemoSendMessage(params);
    actAdvance(1500);

    expect(getDemoChallengeReply).toHaveBeenCalledWith('I want coffee', CHALLENGE, 'en', true);
  });

  it('Round 122: overrideChallengeContext 优先且强制 isFollowUp=false (saw_it/chose_to_buy 路径)', () => {
    const override = { itemName: 'New Shoes', amount: 120, challengeId: 'ch-9' };
    const { params, holder } = makeHarness({
      activeChallengeRef: { current: { itemName: 'Stale', amount: 1 } },
      overrideChallengeContext: override,
    });
    vi.mocked(isChallengeFirstTriggerMessage).mockReturnValue(false); // 即使判定为后续消息, override 仍优先

    handleDemoSendMessage(params);
    actAdvance(1500);

    expect(getDemoChallengeReply).toHaveBeenCalledWith('I want coffee', { itemName: 'New Shoes', amount: 120 }, 'en', false);
    expect(holder.list[1]?.content).toBe('challenge-reply:New Shoes:120:en:false');
  });

  it('saw-it 庆祝: isDemoSawItReply 命中且仅在挑战上下文时派发 (amount 透传)', () => {
    vi.mocked(isDemoSawItReply).mockReturnValue(true);
    const { params } = makeHarness({ activeChallengeRef: { current: CHALLENGE } });

    handleDemoSendMessage(params);
    actAdvance(1500);
    expect(triggerDemoSeeItCelebration).toHaveBeenCalledTimes(1);
    expect(triggerDemoSeeItCelebration).toHaveBeenCalledWith(89);

    // 非挑战上下文 (getDemoReply 路径) 不庆祝
    const second = makeHarness({ activeChallengeRef: { current: undefined } });
    handleDemoSendMessage(second.params);
    actAdvance(1500);
    expect(triggerDemoSeeItCelebration).toHaveBeenCalledTimes(1);
  });

  it('BUG-55 + BUG-45: 达 N 条后 +1s 弹注册提示; 连发时旧 auth timer 被清 → 只弹一次', () => {
    const { params } = makeHarness({ DEMO_FREE_MESSAGES: 2 });

    // 第 1 条: count 1 < 2 → 无 auth timer
    handleDemoSendMessage(params);
    actAdvance(1500);
    expect(params.demoAuthTimerRef.current).toBeNull();

    // 第 2 条: count 2 ≥ 2 且无挑战 → auth timer 排程 (+1s)
    handleDemoSendMessage(params);
    actAdvance(1500);
    expect(params.demoAuthTimerRef.current).not.toBeNull();
    expect(params.onAuthPrompt).not.toHaveBeenCalled();

    // 第 3 条在 auth 触发前到达: 清旧 auth timer (不叠加) → 全程只弹一次
    handleDemoSendMessage(params);
    actAdvance(1500);
    actAdvance(1000);

    expect(params.onAuthPrompt).toHaveBeenCalledTimes(1);
    expect(params.onAuthPrompt).toHaveBeenCalledWith('chat');
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('Aha: 挑战模式达阈值不弹注册引导 (让用户完成挑战)', () => {
    const { params } = makeHarness({ DEMO_FREE_MESSAGES: 1, activeChallengeRef: { current: CHALLENGE } });

    handleDemoSendMessage(params);
    actAdvance(1500);
    actAdvance(2000);

    expect(params.demoMsgCountRef.current).toBe(1);
    expect(params.demoAuthTimerRef.current).toBeNull();
    expect(params.onAuthPrompt).not.toHaveBeenCalled();
  });
});

function actAdvance(ms: number) {
  act(() => {
    vi.advanceTimersByTime(ms);
  });
}
