'use client';

import { useState, useRef, useEffect } from 'react';
import { buildChallengeDisplayMessage } from '../parts/challenge-prompt';

interface UsePendingContextArgs {
  activeChallenge: { itemName: string; amount: number; challengeId?: string } | undefined;
  isLoading: boolean;
  isLoadingHistory: boolean;
  sendMessageLockRef: { current: { inProgress: boolean; lastContent: string; lastTime: number } };
}

/**
 * pendingContext 发送器: challengeContext/contextMessage 暂存 → 聊天就绪后自动发送
 * (原为 chat-tab.tsx 内联逻辑 — File Split Wave 1 纯搬运, 行为零变化)
 * sendMessageRef 的赋值 (useLayoutEffect) 仍在壳上, 因 sendMessage 在本 hook 之后才产生。
 */
export function usePendingContext({ activeChallenge, isLoading, isLoadingHistory, sendMessageLockRef }: UsePendingContextArgs) {
  // Round 20 Frontend C1: user?.id 变化时清空所有用户相关 state (防跨用户泄露)
  // Round 65: pendingContextRef/pendingContextReady 声明上移 (防 ESLint react-compiler TDZ)
  const pendingContextRef = useRef<string | null>(null);
  // 🔧 P1 fix (mirror philosophy — challenge initiation message):
  //   旧代码: chat-tab.tsx 硬编码 displayMsg = "I want to buy X for $Y. Challenge me!"
  //   → buddy-tab.tsx 传入的 mirrorMsg 被丢弃, 用户始终看到工具语调的消息。
  //   修复: 用 pendingDisplayContentRef 暂存 mirrorMsg, pendingContext effect 用它作为 displayMsg。
  //   fallback 到硬编码字符串 (兼容老调用方)。
  const pendingDisplayContentRef = useRef<string | null>(null);
  const [pendingContextReady, setPendingContextReady] = useState(false);

  const sendMessageRef = useRef<((content: string, apiContent?: string) => Promise<void>) | null>(null);

  useEffect(() => {
    if (pendingContextRef.current && !isLoading && !isLoadingHistory && sendMessageRef.current) {
      const msg = pendingContextRef.current;
      // 🔧 NEW-030 fix (Round 59): 把 isLoadingHistory/isLoading + lock check 移到外层 if
      //   旧代码: 内层 if (isLoadingHistory || lock) return — 不清 pendingContextReady → effect 重复触发
      //   修复: 外层 if 已检查 !isLoading && !isLoadingHistory, 再检查 lock。
      //   如果 lock 持有, 不进入此 effect (外层 if 短路), 不会重复触发。
      //   如果 lock 释放后 effect 重跑, 正常发送 (只发一次)。
      if (sendMessageLockRef.current.inProgress) return; // lock 持有, 等下次 effect 重跑

      if (activeChallenge) {
        const { itemName, amount } = activeChallenge;
        // 🔧 P1 fix (mirror philosophy): 优先用 pendingDisplayContentRef (mirrorMsg from buddy-tab.tsx)
        //   旧代码: 硬编码 "I want to buy X for $Y. Challenge me!" (工具哲学, 命令 AI)
        //   新代码: 优先用 mirrorMsg "I'm moved by X · $Y · Let me see it" (镜子哲学, 邀请守护)
        //   fallback 到硬编码字符串 (兼容老调用方/直接 URL 访问 chat tab 的场景)
        const hardcodedMsg = buildChallengeDisplayMessage(itemName, amount);
        const displayMsg = pendingDisplayContentRef.current || hardcodedMsg;
        // 🔧 NEW-030 fix: 先清 ref + state, 再调 sendMessage — 防止 effect 重复触发
        pendingContextRef.current = null;
        // 清 displayContent ref 防止下次挑战复用旧 mirrorMsg
        pendingDisplayContentRef.current = null;

        setPendingContextReady(false);
        sendMessageRef.current(displayMsg, msg);
      } else {
        pendingContextRef.current = null;
        pendingDisplayContentRef.current = null;
        setPendingContextReady(false);
        sendMessageRef.current(msg);
      }
    }
  // sendMessageLockRef 为稳定 ref (identity 不变), 加入 deps 不改变触发时机
  }, [isLoading, isLoadingHistory, pendingContextReady, activeChallenge, sendMessageLockRef]);

  return { pendingContextRef, pendingDisplayContentRef, pendingContextReady, setPendingContextReady, sendMessageRef };
}
