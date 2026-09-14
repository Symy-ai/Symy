/**
 * Type definitions for useChatActions — extracted from use-chat-actions.ts
 *
 * 🔧 ARCH fix (2026-07-22): Extracted types to reduce use-chat-actions.ts
 *    from 851 to <800 lines. Types are pure declarations with no runtime
 *    code, safe to extract without behavior change.
 */

import type React from 'react';
import { ChatMessage } from '@/components/chat-bubble';
import type { useI18n } from '@/i18n/provider';
import type { ActiveChallenge } from './use-challenge-actions';
import type { McpToolResult } from './use-mcp-notifications';
import type { ImpulseContext } from '@/types/impulse-context';

export type { ImpulseContext };

/** sendMessageLockRef 内部结构 */
export interface SendMessageLockState {
  inProgress: boolean;
  lastContent: string;
  lastTime: number;
}

export interface UseChatActionsParams {
  /** 渲染期 state (闭包捕获, deps 触发重建) */
  state: {
    activeChallenge: ActiveChallenge | undefined;
    isLoadingHistory: boolean;
    isDemo: boolean;
    impulseContext: ImpulseContext | undefined;
    locale: string;
  };
  /** 同步 refs (stable, 不进 deps) */
  refs: {
    sendMessageLockRef: React.MutableRefObject<SendMessageLockState>;
    abortRef: React.MutableRefObject<AbortController | null>;
    messagesRef: React.MutableRefObject<ChatMessage[]>;
    activeChallengeRef: React.MutableRefObject<ActiveChallenge | undefined>;
    impulseContextRef: React.MutableRefObject<ImpulseContext | undefined>;
    localeRef: React.MutableRefObject<string>;
    justCompletedChallengeRef: React.MutableRefObject<boolean>;
    demoReplyTimerRef: React.MutableRefObject<ReturnType<typeof setTimeout> | null>;
    demoAuthTimerRef: React.MutableRefObject<ReturnType<typeof setTimeout> | null>;
    demoMsgCountRef: React.MutableRefObject<number>;
    buddyStateRefreshTimerRef: React.MutableRefObject<ReturnType<typeof setTimeout> | null>;
    skipNextHistoryLoadRef: React.MutableRefObject<boolean>;
    skipNonceRef: React.MutableRefObject<number>;
    /**
     * 🔧 P0 fix (mirror philosophy — I choose to buy):
     *   handleChooseToBuy 设此 ref = true, 让 handleToolEvent 知道接下来 AI 调
     *   complete_challenge 是 "buy" 路径 (status='failed')。sendMessage finally 块清除。
     */
    justBoughtChallengeRef: React.MutableRefObject<boolean>;
  };
  /** state setters (stable via useCallback in chat-tab, 不进 deps — 但 TS 仍要求声明) */
  setters: {
    setMessagesSync: (updater: ChatMessage[] | ((prev: ChatMessage[]) => ChatMessage[])) => void;
    setIsLoading: (value: boolean) => void;
    setInput: (value: string | ((prev: string) => string)) => void;
    setActiveChallenge: (challenge: ActiveChallenge | undefined) => void;
  };
  /** 外部回调 (父组件传入) */
  callbacks: {
    nextId: (prefix: string) => string;
    saveMessage: (msg: ChatMessage) => void;
    handleMCPResults: (results: McpToolResult[]) => void;
    addMcpNotification: (message: string, type: 'reward' | 'penalty' | 'badge') => void;
    onBuddyStateRefresh?: () => void;
    onAuthPrompt?: (feature: string) => void;
    onToast?: (message: string, type?: 'success' | 'info') => void;
    // 🔧 信任存入 fix (Round 106): 挑战完成回调, 让前端弹出 DepositDialog
    onChallengeCompleted?: (challengeId: string, savedAmount: number) => void;
    // 🔧 需求九: bought 路径回调 (AI SSE complete_challenge + justBoughtChallengeRef) → 沉默时刻 (bought)
    onChallengeBought?: (amount: number, itemName: string) => void;
  };
  /** i18n */
  i18n: {
    t: ReturnType<typeof useI18n>['t'];
  };
  /** Demo 常量 */
  demo: {
    DEMO_FREE_MESSAGES: number;
  };
}
