'use client';

import { useEffect, useRef } from 'react';
import type { ChatMessage } from '@/components/chat-bubble';

interface ChatTabCommonRefs {
  sendMessageLockRef: { current: { inProgress: boolean; lastContent: string; lastTime: number } };
  abortRef: { current: AbortController | null };
  demoReplyTimerRef: { current: ReturnType<typeof setTimeout> | null };
  demoAuthTimerRef: { current: ReturnType<typeof setTimeout> | null };
  buddyStateRefreshTimerRef: { current: ReturnType<typeof setTimeout> | null };
  depositNavTimerRef: { current: ReturnType<typeof setTimeout> | null };
  skipNextHistoryLoadRef: { current: boolean };
  skipNonceRef: { current: number };
  pendingContextRef: { current: string | null };
  pendingDisplayContentRef: { current: string | null };
}

interface UseChatLifecycleCleanupArgs extends ChatTabCommonRefs {
  userId: string | undefined;
  setActiveChallenge: (v: { itemName: string; amount: number; challengeId?: string } | undefined) => void;
  setExpiredChallenge: (v: { challengeId: string; itemName: string; amount: number } | null) => void;
  setMessagesSync: (updater: ChatMessage[] | ((prev: ChatMessage[]) => ChatMessage[])) => void;
  setIsLoading: (value: boolean) => void;
  setHistoryLoadError: (v: string | null) => void;
  setPendingContextReady: (v: boolean) => void;
}

/**
 * 生命周期清理: unmount 清理全部 timer/abort/锁 + 用户切换时清用户相关 state
 * (原为 chat-tab.tsx 内联 effect — File Split Wave 1 纯搬运, 行为零变化)
 */
export function useChatLifecycleCleanup({
  userId,
  sendMessageLockRef,
  abortRef,
  demoReplyTimerRef,
  demoAuthTimerRef,
  buddyStateRefreshTimerRef,
  depositNavTimerRef,
  skipNextHistoryLoadRef,
  skipNonceRef,
  pendingContextRef,
  pendingDisplayContentRef,
  setActiveChallenge,
  setExpiredChallenge,
  setMessagesSync,
  setIsLoading,
  setHistoryLoadError,
  setPendingContextReady,
}: UseChatLifecycleCleanupArgs) {
  // 清理 demo timers on unmount
  // 🔧 H7 fix: buddyStateRefreshTimerRef 也在此清理
  useEffect(() => {
    return () => {
      if (demoReplyTimerRef.current) clearTimeout(demoReplyTimerRef.current);
      if (demoAuthTimerRef.current) clearTimeout(demoAuthTimerRef.current);
      // 🔧 H7 fix: 清理 buddy state refresh timer
      // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional omission (stable ref/callback)
      if (buddyStateRefreshTimerRef.current) clearTimeout(buddyStateRefreshTimerRef.current);
      // 🔧 Round 2 QA fix: clear deposit navigation timer on unmount
      // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional omission (stable ref)
      if (depositNavTimerRef.current) clearTimeout(depositNavTimerRef.current);
      // BUG-95 fix: Abort in-flight chat request on unmount
      // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional omission (stable ref/callback)
      if (abortRef.current) abortRef.current.abort();
      // 释放模块级互斥锁 (防止组件卸载后锁卡死)
      // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional omission (stable ref/callback)
      sendMessageLockRef.current.inProgress = false;
    };
  // 所有依赖均为稳定 ref (identity 不变), 效果与原 [] deps 完全一致
  }, [demoReplyTimerRef, demoAuthTimerRef, buddyStateRefreshTimerRef, depositNavTimerRef, abortRef, sendMessageLockRef]);

  // Round 20 Frontend C1: user?.id 变化时清空所有用户相关 state (防跨用户泄露)
  // Round 65: pendingContextRef/pendingContextReady 声明上移 (防 ESLint react-compiler TDZ)
  const prevUserIdRef = useRef<string | undefined>(userId);
  useEffect(() => {
    if (userId !== prevUserIdRef.current) {
      prevUserIdRef.current = userId;
      // 清用户相关 state
      setActiveChallenge(undefined);
      setExpiredChallenge(null);
      // 清 demo timers (防 demo→auth 过渡时 timer 泄漏)
      if (demoReplyTimerRef.current) { clearTimeout(demoReplyTimerRef.current); demoReplyTimerRef.current = null; }
      if (demoAuthTimerRef.current) { clearTimeout(demoAuthTimerRef.current); demoAuthTimerRef.current = null; }
      // 清消息 + 锁 (防旧 stream 的 finally 误清新 stream 的锁)
      setMessagesSync([]);
      sendMessageLockRef.current.inProgress = false;
      setIsLoading(false);
      // 清 history load error + nonce
      setHistoryLoadError(null);
      // 清 skip 标记
      skipNextHistoryLoadRef.current = false;
      // 🔧 ARCH fix (Round 23 CRITICAL-2 — skipNonceRef 用户切换时未清 → 新用户聊天历史不加载):
      //    旧代码只清 skipNextHistoryLoadRef (boolean), 漏清 skipNonceRef (number)。
      //    用户 A 在挑战中设 skipNonceRef=Date.now() (>0), 登出后 B 登入 (同 SPA session),
      //    loadHistory effect 见 skipNonceRef > 0 → 消费 nonce → return → B 看到空聊天界面。
      //    根因修复: 用户切换时也清 skipNonceRef。
      skipNonceRef.current = 0;
      // 🔧 ARCH fix (Round 37 C1 — pendingContextRef 用户切换时未清 → 跨用户消息泄露):
      //    旧代码漏清 pendingContextRef (存 A 的 challenge prompt 含物品名+金额)。
      //    B 的 loadHistory 完成后, pendingContext effect 重跑, 发 A 的 prompt 作为 B 的消息。
      //    根因修复: 用户切换时清 pendingContextRef + pendingContextReady。
      pendingContextRef.current = null;
      // 同步清 pendingDisplayContentRef (mirrorMsg)
      pendingDisplayContentRef.current = null;
      setPendingContextReady(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional omission (stable ref/callback)
  }, [userId]);
}
