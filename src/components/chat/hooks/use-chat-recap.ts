'use client';

/**
 * useChatRecap — 「上次我们聊到」回顾条的派生与生命周期
 *
 * 从 use-chat-history 已加载的首屏消息推导回顾话题 (deriveChatRecapTopic, 不新发请求):
 * - 只在历史首次加载完成 (historyReady && messages 非空) 时派生一次, 之后锁定 —
 *   用户本次会话里新聊的绿色话题不会当场变成 recap
 * - demo 模式不派生
 * - 每浏览器会话只出现一次: dismiss 时把 messageId 写入 sessionStorage, 重挂载时对得上就不再出现
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { deriveChatRecapTopic, type ChatRecapTopic } from '@/lib/chat-recap-topic';
import type { ChatMessage } from '@/types/chat-message';

const SESSION_STORAGE_KEY = 'symy:chat-recap:dismissed-message-id';

function isDismissedInSession(topic: ChatRecapTopic): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return window.sessionStorage.getItem(SESSION_STORAGE_KEY) === topic.messageId;
  } catch {
    // safe to ignore: recap is best-effort decoration — unreadable sessionStorage just skips session dedupe
    return false;
  }
}

export interface UseChatRecapParams {
  /** 已加载的 chat 消息 (来自 use-chat-history / chat-tab state) */
  messages: ChatMessage[];
  /** demo 模式无真实历史, 不派生 */
  isDemo: boolean;
  /** 历史首屏是否加载完成 (isLoadingHistory === false 且非空消息时派生一次) */
  historyReady: boolean;
}

export interface UseChatRecapResult {
  recap: ChatRecapTopic | null;
  /** 用户点「继续聊」或关闭后调用 — 回顾条消失并写 sessionStorage */
  dismiss: () => void;
}

export function useChatRecap({ messages, isDemo, historyReady }: UseChatRecapParams): UseChatRecapResult {
  const [recap, setRecap] = useState<ChatRecapTopic | null>(null);
  const derivedRef = useRef(false);

  useEffect(() => {
    if (derivedRef.current || isDemo || !historyReady) return;
    if (messages.length === 0) return;
    derivedRef.current = true;
    const topic = deriveChatRecapTopic(messages);
    if (topic && !isDismissedInSession(topic)) {
      setRecap(topic);
    }
  }, [messages, isDemo, historyReady]);

  const dismiss = useCallback(() => {
    setRecap((current) => {
      if (current && typeof window !== 'undefined') {
        try {
          window.sessionStorage.setItem(SESSION_STORAGE_KEY, current.messageId);
        } catch {
          // 写不进就算了 — 本组件实例内已消失
        }
      }
      return null;
    });
  }, []);

  return { recap, dismiss };
}
