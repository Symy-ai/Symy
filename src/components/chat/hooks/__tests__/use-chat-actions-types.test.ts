import { describe, expect, it } from 'vitest';

import type {
  ImpulseContext,
  SendMessageLockState,
  UseChatActionsParams,
} from '../use-chat-actions-types';
import type { ChatMessage } from '@/components/chat-bubble';

/**
 * use-chat-actions-types.ts (85行) — 纯类型件 (ARCH fix 2026-07-22 拆出)。
 *
 * 方法论第四用 (R130/R131/R184 后): 编译期 import 验证 + satisfies 字段锚定防漂移。
 * 锁定: 五分区结构 (state/refs/setters/callbacks/i18n/demo) + 三关键 ref
 * (justBoughtChallengeRef P0 镜像哲学锚 / skipNonceRef / demo 三 timer) +
 * onChallengeBought 需求九锚。
 */

// ——— 满字段 fixture: 编译通过本身即验证全部必填字段 ———
const params = {
  state: {
    activeChallenge: undefined,
    isLoadingHistory: false,
    isDemo: false,
    impulseContext: undefined,
    locale: 'zh',
  },
  refs: {
    sendMessageLockRef: { current: { inProgress: false, lastContent: '', lastTime: 0 } },
    abortRef: { current: null },
    messagesRef: { current: [] as ChatMessage[] },
    activeChallengeRef: { current: undefined },
    impulseContextRef: { current: undefined },
    localeRef: { current: 'zh' },
    justCompletedChallengeRef: { current: false },
    demoReplyTimerRef: { current: null },
    demoAuthTimerRef: { current: null },
    demoMsgCountRef: { current: 0 },
    buddyStateRefreshTimerRef: { current: null },
    skipNextHistoryLoadRef: { current: false },
    skipNonceRef: { current: 0 },
    justBoughtChallengeRef: { current: false },
  },
  setters: {
    setMessagesSync: (_u: ChatMessage[] | ((prev: ChatMessage[]) => ChatMessage[])) => {},
    setIsLoading: (_v: boolean) => {},
    setInput: (_v: string | ((prev: string) => string)) => {},
    setActiveChallenge: (_c: unknown) => {},
  },
  callbacks: {
    nextId: (_p: string) => 'id',
    saveMessage: (_m: ChatMessage) => {},
    handleMCPResults: (_r: unknown[]) => {},
    addMcpNotification: (_m: string, _t: 'reward' | 'penalty' | 'badge') => {},
  },
  i18n: { t: ((_k: string) => 'x') as UseChatActionsParams['i18n']['t'] },
  demo: { DEMO_FREE_MESSAGES: 5 },
} satisfies UseChatActionsParams;

// SendMessageLockState 三字段锚
const lock = { inProgress: true, lastContent: '键盘', lastTime: 123 } satisfies SendMessageLockState;

// ImpulseContext 重导出锚 (export type { ImpulseContext })
type _ImpulseReexport = ImpulseContext;

describe('use-chat-actions-types 纯类型件', () => {
  it('满字段 fixture satisfies 五分区结构', () => {
    expect(params.state.locale).toBe('zh');
    expect(params.demo.DEMO_FREE_MESSAGES).toBe(5);
    expect(Object.keys(params.refs)).toHaveLength(14);
  });

  it('SendMessageLockState 三字段', () => {
    expect(lock.inProgress).toBe(true);
    expect(lock.lastContent).toBe('键盘');
  });

  it('关键锚: justBoughtChallengeRef (P0 镜像哲学) + skipNonceRef 在 refs', () => {
    expect('justBoughtChallengeRef' in params.refs).toBe(true);
    expect('skipNonceRef' in params.refs).toBe(true);
  });

  it('callbacks 可选四件: onChallengeCompleted/onChallengeBought 等可选缺省合法', () => {
    const cb = params.callbacks as UseChatActionsParams['callbacks'];
    expect(cb.onChallengeCompleted).toBeUndefined();
    expect(cb.onChallengeBought).toBeUndefined();
    expect(cb.onBuddyStateRefresh).toBeUndefined();
  });
});
