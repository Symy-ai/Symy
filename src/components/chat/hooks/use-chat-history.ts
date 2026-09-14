/**
 * useChatHistory — chat history loading + context message handling.
 *
 * 🔧 Round 80 F6: extracted from chat-tab.tsx (was 853 lines, target <800).
 *    Contains: loadHistory effect (apiFetch + skip nonce logic + error handling),
 *              challengeContext skip effect, contextMessage → pendingContext effect.
 *
 * Coupling: receives refs/state/setters via params (zero behavior change).
 */

'use client';

import { useEffect, useRef } from 'react';
import { apiFetch, ApiError } from '@/lib/api-client';
import { logger } from '@/lib/logger';
import { DEFAULT_HOURLY_RATE } from '@/lib/freedom-time';
import { buildChallengePrompt } from '../parts/challenge-prompt';
import type { ChatMessage } from '../../chat-bubble';
import type { ActiveChallenge } from './use-challenge-actions';

export interface UseChatHistoryParams {
  userId?: string;
  isDemo: boolean;
  activeChallenge?: { itemName: string; amount: number; challengeId?: string };
  challengeContext?: { itemName: string; amount: number; challengeId?: string };
  contextMessage?: string;
  /** 🔧 P0-3 fix: 用户时薪, 传给 buildChallengePrompt 计算正确的生命小时数 */
  hourlyRate?: number;
  historyRetryNonce: number;
  pageSize: number;
  // refs
  sendMessageLockRef: React.MutableRefObject<{ inProgress: boolean }>;
  skipNextHistoryLoadRef: React.MutableRefObject<boolean>;
  skipNonceRef: React.MutableRefObject<number>;
  pendingContextRef: React.MutableRefObject<string | null>;
  pendingDisplayContentRef: React.MutableRefObject<string | null>;
  // setters
  setMessagesSync: (updater: ChatMessage[] | ((prev: ChatMessage[]) => ChatMessage[])) => void;
  setIsLoadingHistory: (value: boolean) => void;
  setHasMore: (value: boolean) => void;
  setHistoryLoadError: (value: string | null) => void;
  setPendingContextReady: (value: boolean) => void;
  setActiveChallenge: (value: { itemName: string; amount: number; challengeId?: string } | undefined) => void;
  // callbacks
  onContextConsumed?: () => void;
  i18n: { t: (key: string, opts?: { defaultValue?: string }) => string };
}

export function useChatHistory({
  userId,
  isDemo,
  activeChallenge,
  challengeContext,
  contextMessage,
  hourlyRate = DEFAULT_HOURLY_RATE,
  historyRetryNonce,
  pageSize,
  sendMessageLockRef,
  skipNextHistoryLoadRef,
  skipNonceRef,
  pendingContextRef,
  pendingDisplayContentRef,
  setMessagesSync,
  setIsLoadingHistory,
  setHasMore,
  setHistoryLoadError,
  setPendingContextReady,
  setActiveChallenge,
  onContextConsumed,
  i18n,
}: UseChatHistoryParams) {
  const { t } = i18n;

  // ======== challengeContext skip effect ========
  // 🔧 BUG-009/NEW-012 root cause fix: 在 loadHistory effect 之前同步设 skip 标记 + 清空消息
  //   当 challengeContext prop 变化时 (新挑战从 Buddy tab 发起), 立即设 skip + 清空旧消息
  // 🔧 NEW-012 deeper fix: 用 nonce 替代 boolean — 防止 skip 被消费后 setActiveChallenge 触发的
  //   二次 loadHistory effect 重新加载旧消息。nonce 在 contextMessage effect 内刷新, loadHistory 消费时比对。
  // 🔧 P0-3 fix (2026-07-17): 用 ref 记录 prevActiveChallenge, 当 activeChallenge 从有值变 undefined
  //   (用户刚完成挑战) 时, 设 skip 标记 — 防止 loadHistory 重新拉历史覆盖 chat 当前消息
  const prevActiveChallengeRef = useRef<ActiveChallenge | undefined>(undefined);
  useEffect(() => {
    // 检测 activeChallenge 从有值变 undefined (用户完成挑战或 give up)
    // 🔧 P0-3 fix: 这种情况不需要重新 loadHistory — chat 里的消息是最新的
    if (prevActiveChallengeRef.current && !activeChallenge) {
      skipNextHistoryLoadRef.current = true;
      skipNonceRef.current = Date.now();
    }
    prevActiveChallengeRef.current = activeChallenge;

    if (challengeContext) {
      skipNextHistoryLoadRef.current = true;
      skipNonceRef.current = Date.now();
      setMessagesSync([]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [challengeContext, activeChallenge]);

  // ======== loadHistory effect ========
  useEffect(() => {
    if (isDemo) return;
    if (!userId) {
      setIsLoadingHistory(false);
      return;
    }

    // 🔧 Bug 1 fix (Round 43, P0): sendMessage 进行中时, 不允许 loadHistory 覆盖消息
    if (sendMessageLockRef.current.inProgress) {
      setIsLoadingHistory(false);
      return;
    }

    // 🔧 NEW-012 根因修复: 用 nonce 防止 skip 被消费后 setActiveChallenge 触发的二次 loadHistory
    if (skipNonceRef.current > 0) {
      skipNonceRef.current = 0;
      skipNextHistoryLoadRef.current = false;
      setIsLoadingHistory(false);
      return;
    }

    // 🔧 向后兼容: 旧的 boolean skip (resumeChallenge 等场景)
    if (skipNextHistoryLoadRef.current) {
      skipNextHistoryLoadRef.current = false;
      setIsLoadingHistory(false);
      return;
    }

    let cancelled = false;

    async function loadHistory() {
      try {
        // 🔧 消息分离: 按 mode 加载历史 (challenge 模式只加载 challenge 消息)
        const mode = activeChallenge ? 'challenge' : 'normal';
        // 🔧 ARCH fix (Round 38 H3 — loadHistory 用 raw fetch 绕过 apiFetch):
        //    旧代码用 raw fetch → 无 30s timeout, 401 不触发 signOut, catch 吞错无日志。
        //    根因修复: 用 apiFetch (统一错误处理 + timeout + ApiError 含 status)。
  // eslint-disable-next-line symy/no-raw-fetch-in-use-effect
        const data = await apiFetch<{ messages?: Array<{ id: string; role: string; content: string; reasoning?: string; created_at: string }>; hasMore?: boolean }>(
          `/api/chat/history?limit=${pageSize}&mode=${mode}`,
          { headers: { 'Cache-Control': 'no-cache' } }
        );
        if (cancelled) return;
        setHistoryLoadError(null);
        setHasMore(data.hasMore ?? false);
        if (data.messages?.length) {
          const loaded: ChatMessage[] = data.messages.map(
            (m) => ({
              id: m.id,
              role: m.role as 'user' | 'assistant',
              content: m.content,
              reasoning: m.reasoning || undefined,
              timestamp: new Date(m.created_at),
              mode: mode as 'normal' | 'challenge',
            })
          );
          setMessagesSync(loaded);
        } else {
          setMessagesSync([]);
        }
      } catch (err) {
        if (cancelled) return;
        if (err instanceof ApiError && (err.status === 401 || err.status === 403)) {
          setHistoryLoadError(t('chat.error.sessionExpired', { defaultValue: 'Session expired. Please sign in again.' }));
        } else {
          const errMsg = err instanceof ApiError ? err.message : 'Failed to load chat history';
          setHistoryLoadError(errMsg);
          logger.warn('[ChatTab] loadHistory error:', err);
        }
      } finally {
        if (!cancelled) {
          setIsLoadingHistory(false);
        }
      }
    }

    loadHistory();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, activeChallenge, historyRetryNonce]);

  // ======== contextMessage → pendingContext effect ========
  useEffect(() => {
    if (contextMessage && onContextConsumed) {
      // 如果有 challengeContext，构造结构化的挑战提示词
      if (challengeContext) {
        const { itemName, amount } = challengeContext;
        const challengePrompt = buildChallengePrompt(itemName, amount, hourlyRate);
        pendingContextRef.current = challengePrompt;
        // 🔧 P1 fix (mirror philosophy): 暂存 contextMessage (mirrorMsg) 作为用户可见消息
        pendingDisplayContentRef.current = contextMessage || null;
        // 🔧 BUG-003 fix: 设 skip 标记, 防止 setActiveChallenge 触发的 loadHistory 覆盖 sendMessage 的消息
        skipNextHistoryLoadRef.current = true;
        // 🔧 NEW-012: 刷新 nonce, 确保 setActiveChallenge 触发的二次 loadHistory 也被 skip
        skipNonceRef.current = Date.now();
        // 保存挑战上下文到本地状态，让 banner 不依赖 prop
        setActiveChallenge(challengeContext);
      } else {
        pendingContextRef.current = contextMessage;
        pendingDisplayContentRef.current = null;
      }
      setPendingContextReady(true);
      onContextConsumed();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contextMessage, onContextConsumed, challengeContext]);
}
