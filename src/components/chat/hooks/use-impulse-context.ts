'use client';

import { useState, useRef, useEffect } from 'react';
import { ChatMessage } from '@/components/chat-bubble';
import { formatPlatformName } from '@/lib/utils';

interface UseImpulseContextArgs {
  impulseContext?: {
    platform: string;
    amount: number;
    reasons: string[];
    time: string;
  };
  nextId: (prefix: string) => string;
  saveMessage: (msg: ChatMessage) => void;
  setMessagesSync: (updater: ChatMessage[] | ((prev: ChatMessage[]) => ChatMessage[])) => void;
}

/**
 * 诱导消费上下文 → 系统开场消息 (外部 trigger → 内部 state)
 * (原为 chat-tab.tsx 内联逻辑 — File Split Wave 1 纯搬运, 行为零变化)
 */
export function useImpulseContext({ impulseContext, nextId, saveMessage, setMessagesSync }: UseImpulseContextArgs) {
  const [hasContext, setHasContext] = useState(false);

  // 当 impulseContext 变化时重置 hasContext，允许后续被诱导事件产生消息
  const prevImpulseRef = useRef(impulseContext);
  useEffect(() => {
    // 🔧 ARCH fix (Round 23 HIGH-2 — prevImpulseRef 引用比较 → 重复 context 消息):
    //    旧代码 if (impulseContext !== prevImpulseRef.current) 是引用比较。
    //    若父组件每次 render 都构造新对象 (即使内容相同), effect 会触发 setHasContext(false),
    //    随后 effect 2 创建重复 contextMsg → 消息刷屏 + 持久化到 DB。
    //    根因修复: 用内容比较 (platform + amount + time)。
    const prev = prevImpulseRef.current;
    const isSame = impulseContext && prev
      ? impulseContext.platform === prev.platform
        && impulseContext.amount === prev.amount
        && impulseContext.time === prev.time
      : impulseContext === prev;
    if (!isSame) {
      setHasContext(false);
      prevImpulseRef.current = impulseContext;
    }
  }, [impulseContext]);

  useEffect(() => {
    if (impulseContext && !hasContext) {
      // impulseContext prop → hasContext state (外部 trigger → 内部 state)

      setHasContext(true);
      const contextMsg: ChatMessage = {
        // 用 nextId helper 替代 Date.now() — 防止 burst notifications 下的 React key 碰撞
        //    nextId 内部用 ++idCounterRef.current 保证同毫秒内也唯一 (BUG-181 fix pattern)
        id: nextId('system'),
        role: 'assistant',
        content: `I noticed you just made a purchase on ${formatPlatformName(impulseContext.platform)} — $${(impulseContext.amount ?? 0).toFixed(2)}. ${impulseContext.reasons.length > 0 ? `Some patterns I detected: ${impulseContext.reasons.slice(0, 2).join(', ')}.` : ''} How are you feeling right now?`,
        timestamp: new Date(),
      };
      setMessagesSync((prev) => [...prev, contextMsg]);
      saveMessage(contextMsg);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional omission (stable ref/callback)
  }, [impulseContext, hasContext, saveMessage]);

  return { hasContext };
}
