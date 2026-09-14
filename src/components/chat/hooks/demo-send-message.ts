/**
 * demoSendMessage — Demo mode message sending logic.
 *
 * 🔧 Round 80 F10: extracted from use-chat-actions.ts sendMessage (was 829 lines).
 *    Demo mode: no API call, uses canned replies + auth prompt after N messages.
 *
 * Behavior:
 * 1. Add user message to UI
 * 2. After 1.5s, add AI reply (getDemoReply or getDemoChallengeReply)
 * 3. After N free messages (non-challenge), trigger auth prompt
 * 4. Return early (skip the real API path)
 */

import { getDemoReply, getDemoChallengeReply, isChallengeFirstTriggerMessage, triggerDemoSeeItCelebration, isDemoSawItReply } from '../parts/demo-reply';
import type { ChatMessage } from '../../chat-bubble';
import { logger } from '@/lib/logger';

export interface DemoSendMessageParams {
  content: string;
  activeChallengeRef: React.MutableRefObject<{ itemName: string; amount: number; challengeId?: string } | undefined>;
  demoMsgCountRef: React.MutableRefObject<number>;
  demoReplyTimerRef: React.MutableRefObject<ReturnType<typeof setTimeout> | null>;
  demoAuthTimerRef: React.MutableRefObject<ReturnType<typeof setTimeout> | null>;
  sendMessageLockRef: React.MutableRefObject<{ inProgress: boolean }>;
  nextId: (prefix: string) => string;
  setMessagesSync: (updater: ChatMessage[] | ((prev: ChatMessage[]) => ChatMessage[])) => void;
  setInput: (value: string) => void;
  setIsLoading: (value: boolean) => void;
  onAuthPrompt?: (feature: string) => void;
  DEMO_FREE_MESSAGES: number;
  /**
   * 🐘 人设转型 (2026-09-05): demo canned 回复话术改由 src/lib/elephant-tone.ts 提供 (SSOT),
   *    不再走 i18n JSON (旧 demo.aiResponses.* key 原样保留未动)。
   *    旧参数 t: (key, opts?) => string 已由 locale 替代。
   */
  locale: string;
  /** 🔧 Round 122 fix: 传入 challenge context (saw_it/chose_to_buy 路径在 sendMessage 前已清 activeChallenge) */
  overrideChallengeContext?: { itemName: string; amount: number; challengeId?: string };
}

/**
 * Handle demo mode message sending.
 * Returns true if demo path was taken (caller should return early), false otherwise.
 */
export function handleDemoSendMessage(params: DemoSendMessageParams): boolean {
  const {
    content,
    activeChallengeRef,
    demoMsgCountRef,
    demoReplyTimerRef,
    demoAuthTimerRef,
    sendMessageLockRef,
    nextId,
    setMessagesSync,
    setInput,
    setIsLoading,
    onAuthPrompt,
    DEMO_FREE_MESSAGES,
    locale,
    overrideChallengeContext,
  } = params;

  // 🔧 BUG-47 fix: 设置同步守卫防止双击重复发送
  sendMessageLockRef.current.inProgress = true;

  // 🔧 BUG-45 fix: 清理之前的定时器，防止多次auth prompt叠加
  if (demoReplyTimerRef.current) clearTimeout(demoReplyTimerRef.current);
  if (demoAuthTimerRef.current) clearTimeout(demoAuthTimerRef.current);

  // 先添加用户消息到界面
  const userMsg: ChatMessage = {
    id: nextId('user'),
    role: 'user',
    content: content.trim(),
    timestamp: new Date(),
  };
  setMessagesSync((prev) => {
    // 🔧 NEW-016 fix: 去重
    if (prev.some(m => m.id === userMsg.id)) return prev;
    return [...prev, userMsg];
  });
  setInput('');

  // 🔧 BUG-39 fix: 存储 timer ID，组件卸载时清理，防止 ghost auth prompt
  setIsLoading(true);
  const replyTimer = setTimeout(() => {
    // 🔧 Aha Moment fix: Challenge 模式下用 getDemoChallengeReply (真正的挑战对话)
    // 🔧 Round 122 fix: 优先用 overrideChallengeContext (saw_it/chose_to_buy 路径传入)
    //   旧代码: 只看 activeChallengeRef.current, 但 saw_it/chose_to_buy 在 sendMessage 前已清 activeChallenge
    //   → demo 回复走 getDemoReply 而非 getDemoChallengeReply → 回复不正确
    //   修复: 优先用 overrideChallengeContext, fallback 到 activeChallengeRef.current
    const challengeContext = overrideChallengeContext || activeChallengeRef.current;
    // 🔧 P0-5 fix: 检测是否是挑战的"后续消息" (非系统模板)
    //   - overrideChallengeContext 存在 = saw_it/chose_to_buy/resume 路径 → isFollowUp=false (这些有专门的关键词检测)
    //   - activeChallengeRef.current 存在 + content 不是系统模板 ("I'm moved by...") → isFollowUp=true (用户后续消息)
    //   - activeChallengeRef.current 存在 + content 是系统模板 → isFollowUp=false (第一次挑战触发)
    //   旧代码: 不区分 isFollowUp, getDemoChallengeReply fallback 永远返回 "item + price + hours" → 复读
    //   修复: isFollowUp=true 时, getDemoChallengeReply 走"承认情绪 + 不复读"路径
    const isFollowUp = !overrideChallengeContext
      && !!activeChallengeRef.current
      && !isChallengeFirstTriggerMessage(content);
    const demoReply = challengeContext
      ? getDemoChallengeReply(content, { itemName: challengeContext.itemName, amount: challengeContext.amount }, locale, isFollowUp)
      : getDemoReply(content, locale);
    const aiMsg: ChatMessage = {
      id: nextId('ai'),
      role: 'assistant',
      content: demoReply,
      timestamp: new Date(),
    };
    setMessagesSync((prev) => [...prev, aiMsg]);
    setIsLoading(false);
    // 🔧 Brief D1a: Demo 模式下 See It 完成 — 触发庆祝动画 (variable-reward 事件)
    //   🐘 人设转型: 旧实现硬编码英文子串 (includes('You saw it') + includes('stays')),
    //   中文回复永远不触发。新实现 isDemoSawItReply 双语匹配 (金额 + stays/留住)。
    if (challengeContext && isDemoSawItReply(demoReply, challengeContext.amount)) {
      triggerDemoSeeItCelebration(challengeContext.amount);
    }
    // 🔧 BUG-47 fix: 重置同步守卫
    // 🔧 C1 fix: 释放互斥锁 (之前 demo 分支 return 绕过 finally, 锁永久泄漏)
    sendMessageLockRef.current.inProgress = false;

    // 🔧 BUG-55 fix: 允许 N 条免费消息后再弹出注册提示
    // 🔧 Aha Moment fix: Challenge 模式下不自动弹注册引导 — 让用户完成挑战
    demoMsgCountRef.current += 1;
    if (demoMsgCountRef.current >= DEMO_FREE_MESSAGES && !activeChallengeRef.current) {
      const authTimer = setTimeout(() => {
        onAuthPrompt?.('chat');
      }, 1000);
      demoAuthTimerRef.current = authTimer;
    }
  }, 1500);
  demoReplyTimerRef.current = replyTimer;

  logger.info('[ChatTab] Demo mode: message sent (canned reply scheduled)');
  return true;
}
