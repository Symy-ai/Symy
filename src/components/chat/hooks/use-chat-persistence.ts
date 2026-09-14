/**
 * useChatPersistence — Chat message persistence (save/delete/loadMore)
 *
 * 🔧 ARCH fix (Round 60 — chat-tab.tsx god component 拆分):
 *    从 chat-tab.tsx 提取 saveMessage + deleteMessage + loadMoreMessages (~170 行)。
 *    chat-tab.tsx 从 1780 行 → ~1610 行。
 *
 * 高内聚低耦合: 消息持久化逻辑内聚到此 hook, chat-tab 只调接口。
 */

'use client';

import { useCallback, useRef } from 'react';
import { apiFetch, apiFetchVoid } from '@/lib/api-client';
import { logger } from '@/lib/logger';
import type { ChatMessage } from '@/components/chat-bubble';

export interface ChatPersistenceParams {
  userId: string | undefined;
  activeChallenge: { itemName: string; amount: number; challengeId?: string } | undefined;
  messagesRef: React.MutableRefObject<ChatMessage[]>;
  setMessagesSync: React.Dispatch<React.SetStateAction<ChatMessage[]>>;
  hasMore: boolean;
  setHasMore: (value: boolean) => void;
  setFirstItemIndex: React.Dispatch<React.SetStateAction<number>>;
  isLoadingMoreRef: React.MutableRefObject<boolean>;
  setIsLoadingMore: (value: boolean) => void;
  pageSize: number;
}

export function useChatPersistence({
  userId,
  activeChallenge,
  messagesRef,
  setMessagesSync,
  hasMore,
  setHasMore,
  setFirstItemIndex,
  isLoadingMoreRef,
  setIsLoadingMore,
  pageSize,
}: ChatPersistenceParams) {
  const savedMessageIdsRef = useRef<Set<string>>(new Set());

  const saveMessage = useCallback(
    (msg: ChatMessage) => {
      if (!userId) return;
      // 🔧 NEW-016/017: 去重 — 同一 tempId 只保存一次
      if (savedMessageIdsRef.current.has(msg.id)) return;
      savedMessageIdsRef.current.add(msg.id);
      // 清理超过 100 条的旧记录 (防内存泄漏)
      if (savedMessageIdsRef.current.size > 100) {
        const arr = Array.from(savedMessageIdsRef.current);
        savedMessageIdsRef.current = new Set(arr.slice(-50));
      }

      const tempId = msg.id;
      const msgMode = msg.mode || (activeChallenge ? 'challenge' : 'normal');
      // 🔧 2026-07-15 P1 fix (saveMessage Validation failed): 截断 reasoning + content 防超长
      //   根因: GLM-5.2 reasoning 模式可能产生超长推理链, 后端 zod schema 有长度限制
      //   修复: 前端发送前截断到后端 schema 允许的最大长度
      const MAX_CONTENT_LENGTH = 10000;
      const MAX_REASONING_LENGTH = 50000;
      const truncatedContent = msg.content.length > MAX_CONTENT_LENGTH
        ? msg.content.slice(0, MAX_CONTENT_LENGTH)
        : msg.content;
      const truncatedReasoning = msg.reasoning
        ? (msg.reasoning.length > MAX_REASONING_LENGTH
          ? msg.reasoning.slice(0, MAX_REASONING_LENGTH)
          : msg.reasoning)
        : null;
      // 🔧 2026-07-15 P1 fix (saveMessage Validation failed — 根因 #2):
      //   actionType 消息的 role='action', 但后端 zod schema 只接受 'user'|'assistant'
      //   → "Validation failed" → quick reply 按钮的消息不被持久化
      //   修复: 'action' → 'user' (action 消息本质是用户行为, 存为 user role)
      const dbRole = msg.role === 'action' ? 'user' as const : msg.role;
      apiFetch<{ id?: string }>('/api/chat/history', {
        method: 'POST',
        body: {
          role: dbRole,
          content: truncatedContent,
          reasoning: truncatedReasoning,
          mode: msgMode,
        },
      })
        .then((data) => {
          if (data?.id) {
            const newId = data.id;
            setMessagesSync((prev) =>
              prev.map((m) => (m.id === tempId ? { ...m, id: newId } : m))
            );
          }
        })
        .catch((err) => {
          // 🔧 M5 fix: 记录 saveMessage 失败 (之前静默吞, 用户刷新后消息消失无日志)
          logger.warn('[ChatTab] saveMessage failed:', err instanceof Error ? err.message : String(err));
          // 🔧 NEW-016/017: 失败时移除 tempId, 允许重试
          savedMessageIdsRef.current.delete(tempId);
        });
    },
    [userId, activeChallenge, setMessagesSync]
  );

  const deleteMessage = useCallback(
    (msgId: string) => {
      setMessagesSync((prev) => prev.filter((m) => m.id !== msgId));
      if (!userId) return;
      // BUG-183 fix: URL 参数编码
      // 🔧 架构还债: 用 apiFetchVoid 替代内联 fetch
      apiFetchVoid(`/api/chat/history?id=${encodeURIComponent(msgId)}`, { method: 'DELETE' }).catch((err) => {
          // 🔧 M5 fix: 记录 deleteMessage 失败
          logger.warn('[ChatTab] deleteMessage failed:', err instanceof Error ? err.message : String(err));
        });
    },
    [userId, setMessagesSync]
  );

  const loadMoreMessages = useCallback(async () => {
    if (!userId || isLoadingMoreRef.current || !hasMore || messagesRef.current.length === 0) return;

    const oldestMsg = messagesRef.current[0];
    if (!oldestMsg.timestamp) return;

    isLoadingMoreRef.current = true;
    setIsLoadingMore(true);

    try {
      const before = oldestMsg.timestamp.toISOString();
      // 🔧 P0 fix (Bug 2): 翻页也按 mode 过滤
      const mode = activeChallenge ? 'challenge' : 'normal';
      // 🔧 Bug 22 fix: 旧代码用裸 fetch + `if (!res.ok) return` 静默失败
      //   根因修复: 用 apiFetch (统一加 Content-Type + credentials + 30s timeout + 错误抛出)
      const data = await apiFetch<{ messages?: Array<{ id: string; role: string; content: string; reasoning?: string; created_at: string }>; hasMore?: boolean }>(
        `/api/chat/history?limit=${pageSize}&before=${encodeURIComponent(before)}&mode=${mode}`
      );
      setHasMore(data.hasMore ?? false);

      if (data.messages?.length) {
        const older: ChatMessage[] = data.messages.map(
          (m) => ({
            id: m.id,
            role: m.role as 'user' | 'assistant',
            content: m.content,
            reasoning: m.reasoning || undefined,
            timestamp: new Date(m.created_at),
            mode: mode as 'normal' | 'challenge',
          })
        );

        // 🔧 Adversarial review fix: 先计算 deduped (用 messagesRef.current 而非 setMessagesSync 内 prev)
        const existingIds = new Set(messagesRef.current.map(m => m.id));
        const deduped = older.filter(m => !existingIds.has(m.id));

        if (deduped.length > 0) {
          setMessagesSync((prev) => {
            // 二次检查 (防 prev 已含 deduped 中的消息 — 极小概率并发)
            const prevIds = new Set(prev.map(m => m.id));
            const finalDeduped = deduped.filter(m => !prevIds.has(m.id));
            if (finalDeduped.length === 0) return prev;
            return [...finalDeduped, ...prev];
          });
          // 🔧 Virtuoso 反向分页：firstItemIndex 前移 deduped.length (实际新增数量)
          setFirstItemIndex((prev) => prev + deduped.length);
        }
      } else {
        // API 返回空数组 — 没有更早的消息了, 关闭 hasMore 防止按钮一直显示
        setHasMore(false);
      }
      // safe to ignore: non-critical background operation, error already logged
    } catch (err) {
                    // safe to ignore: non-critical background operation, error already logged
      // 🔧 Bug 22 fix: 不再静默吞错 — 记录 + 短暂 UI 提示
      logger.warn('[ChatTab] loadMoreMessages failed:', err);
    } finally {
      isLoadingMoreRef.current = false;
      setIsLoadingMore(false);
    }
  }, [userId, activeChallenge, hasMore, pageSize, setHasMore, setMessagesSync, setFirstItemIndex, isLoadingMoreRef, setIsLoadingMore, messagesRef]);

  return { saveMessage, deleteMessage, loadMoreMessages };
}
