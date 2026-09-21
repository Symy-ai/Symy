'use client';

import { useRef, useEffect } from 'react';
import { ChatMessage } from '@/components/chat-bubble';
import { getLocalizedDemoChatMessages } from '@/lib/demo-data';

interface UseChatDemoModeArgs {
  isDemo: boolean;
  /** effect 内读取 messages.length (deps 保持 [isDemo], 与原实现一致) */
  messages: ChatMessage[];
  setMessagesSync: (updater: ChatMessage[] | ((prev: ChatMessage[]) => ChatMessage[])) => void;
  setIsLoadingHistory: (value: boolean) => void;
  t: (key: string, values?: Record<string, string | number>) => string;
}

/**
 * ======== Demo 模式：预填充演示对话 + demo→auth 过渡清理 ========
 * (原为 chat-tab.tsx 内联逻辑 — File Split Wave 1 纯搬运, 行为零变化)
 */
export function useChatDemoMode({ isDemo, messages, setMessagesSync, setIsLoadingHistory, t }: UseChatDemoModeArgs) {
  // Demo mode timer refs for cleanup on unmount
  const demoReplyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const demoAuthTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Demo message counter — allow 3 free messages before auth prompt
  const demoMsgCountRef = useRef(0);
  const DEMO_FREE_MESSAGES = 3;

  // ======== Demo 模式：预填充演示对话 ========
  // 用 ref 追踪 demo→auth 过渡，清除所有消息（不仅是 demo- 开头的）
  const prevIsDemoRef = useRef(isDemo);
  useEffect(() => {
    if (isDemo && messages.length === 0) {
      // 预填充 demo 消息 (functional guard: t 变化但 messages prop 仍旧空时不重复写入)
      setMessagesSync(prev => (prev.length === 0 ? getLocalizedDemoChatMessages(t) : prev));

      setIsLoadingHistory(false);
      // 🔧 BUG-auto-send fix: Keep ref in sync with state
    }
    // 🔧 BUG-40+66 fix: 从 demo 切换到 auth 时，清除所有消息
    // 用户在 demo 中发的消息 ID 是 user-/ai- 开头，不是 demo-，所以需要全面清除
    if (!isDemo && prevIsDemoRef.current) {
      // demo→auth 切换: 清空所有消息 (跨用户隔离)
      setMessagesSync([]);
    }
    prevIsDemoRef.current = isDemo;
  }, [isDemo, t, messages.length, setMessagesSync, setIsLoadingHistory]);

  return { demoReplyTimerRef, demoAuthTimerRef, demoMsgCountRef, DEMO_FREE_MESSAGES };
}
