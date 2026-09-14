'use client';

/**
 * ChatMessages — 消息列表 (Virtuoso 虚拟列表 + 加载指示器 + 思考指示器 + 空状态)
 *
 * 从 chat-tab.tsx 抽出 (C6 拆分).
 * 纯展示组件, 接收 messages + loading state + callbacks.
 */

import { useCallback, useEffect, useRef } from 'react';
import dynamic from 'next/dynamic';
import { Virtuoso, type VirtuosoHandle } from 'react-virtuoso';
import type { ChatMessage } from '../../chat-bubble';
import type { BuddyState } from '@/types/buddy-state';
import { useI18n } from '@/i18n/provider';
import { ReflectionPrompts } from './reflection-prompts';
// 🔧 ARCH fix (Round 8 AUDIT-3 P0 #3): McpNotification 单一 source of truth
import type { McpNotification } from '@/types/mcp-notification';
import { SymyAvatar } from '@/components/buddy/symy-avatar';

// 🔧 perf: dynamic-load ChatBubble so react-markdown (107KB) lands in the chat chunk
//    instead of the shared initial page bundle. ssr stays on (default) so SSR still
//    renders the bubbles — no visible change; the markdown parser simply moves to a
//    separate, parallel-loaded chunk.
const ChatBubble = dynamic(
  () => import('../../chat-bubble').then((m) => ({ default: m.ChatBubble })),
  {
    loading: () => (
      <div className="flex items-center gap-2 px-3 py-2 rounded-2xl bg-bg-secondary animate-pulse min-h-[40px]" />
    ),
  }
);

export interface ChatMessagesProps {
  messages: ChatMessage[];
  isLoading: boolean;
  isLoadingHistory: boolean;
  isLoadingMore: boolean;
  hasMore: boolean;
  firstItemIndex: number;
  mcpNotifications: McpNotification[];
  buddyState?: BuddyState | null;
  virtuosoRef: React.RefObject<VirtuosoHandle | null>;
  onLoadMore: () => void;
  onDeleteMessage: (msgId: string) => void;
  /** 🔧 CL3 fix: 用户真实头像 URL (来自 user_metadata.avatar_url), 传给 ChatBubble */
  userAvatarUrl?: string;
  /** 🔧 P1-3 fix: 发送消息回调 (用于 reflection prompts) */
  onSendMessage?: (content: string) => void;
}

export function ChatMessages({
  messages,
  isLoading,
  isLoadingHistory,
  isLoadingMore,
  hasMore,
  firstItemIndex,
  mcpNotifications,
  buddyState,
  virtuosoRef,
  onLoadMore,
  onDeleteMessage,
  userAvatarUrl,
  onSendMessage,
}: ChatMessagesProps) {
  const { t } = useI18n();
  // 🔧 ARCH fix (Round 11 M3 — 删除 BUG-2 调试日志, 每次 render 都打且含用户 PII):
  //   console.log('[BUG-2 FINAL] ChatMessages render, messages.length:', messages.length, 'last:', messages[messages.length - 1]?.content?.substring(0, 20));

  // 🔧 BUG-2 fix: 强制 Virtuoso 滚动到底部 (followOutput='smooth' 在某些场景不触发)
  const prevMsgCountRef = useRef(messages.length);
  // 🔧 ARCH fix: 也跟踪最后一条消息的内容长度 — 流式 token 更新时消息数量不变但内容变长,
  //    需要持续滚动到底部, 否则用户看不到新 token
  const prevLastContentLenRef = useRef(0);
  const rafRef = useRef<number | null>(null);

  // 🔧 CL3 fix: 聊天框打开时默认滚到最底部
  //   根因: initialTopMostItemIndex={Number.MAX_SAFE_INTEGER} 只在 Virtuoso 首次 mount 时生效,
  //   但 isLoadingHistory: true → false 切换时 messages 从 [] 变成 [...history], Virtuoso 重新挂载,
  //   initialTopMostItemIndex 不再生效 → 用户打开聊天看到的是顶部 (最旧消息)。
  //   修复: 跟踪 isLoadingHistory 从 true → false 的转换, 在历史加载完成时强制滚到底部。
  const prevLoadingHistoryRef = useRef(isLoadingHistory);
  useEffect(() => {
    if (prevLoadingHistoryRef.current && !isLoadingHistory && messages.length > 0) {
      // isLoadingHistory: true → false 且有消息 → 强制滚到底部 (延迟 2 rAF 等 Virtuoso 渲染完)
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      rafRef.current = requestAnimationFrame(() => {
        rafRef.current = null;
        // 第二层 rAF: 确保虚拟列表 DOM 已渲染
        requestAnimationFrame(() => {
          virtuosoRef.current?.scrollToIndex({
            index: Number.MAX_SAFE_INTEGER,
            behavior: 'auto',
          });
        });
      });
    }
    prevLoadingHistoryRef.current = isLoadingHistory;
  }, [isLoadingHistory, messages.length, virtuosoRef]);

  useEffect(() => {
    const lastMsg = messages[messages.length - 1];
    const lastContentLen = lastMsg?.content?.length ?? 0;
    const countIncreased = messages.length > prevMsgCountRef.current;
    const contentGrew = messages.length === prevMsgCountRef.current && lastContentLen > prevLastContentLenRef.current;

    if (countIncreased || contentGrew) {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      rafRef.current = requestAnimationFrame(() => {
        rafRef.current = null;
        // 🔧 ARCH fix: 用 'auto' 替代 'smooth' — Virtuoso 虚拟列表中 'smooth' 不可靠
        virtuosoRef.current?.scrollToIndex({
          index: Number.MAX_SAFE_INTEGER,
          behavior: 'auto',
        });
      });
    }
    prevMsgCountRef.current = messages.length;
    prevLastContentLenRef.current = lastContentLen;
    return () => {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };
  }, [messages, virtuosoRef]);

  // 🔧 ARCH fix: isLoading 变化时 (AI 开始/结束回复) 也强制滚动到底部
  //    思考指示器出现/消失会改变列表高度, followOutput 可能不跟上
  const prevLoadingRef = useRef(isLoading);
  useEffect(() => {
    if (prevLoadingRef.current && !isLoading) {
      // loading: true → false = AI 回复结束, 强制滚到底
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      rafRef.current = requestAnimationFrame(() => {
        rafRef.current = null;
        virtuosoRef.current?.scrollToIndex({
          index: Number.MAX_SAFE_INTEGER,
          behavior: 'auto',
        });
      });
    }
    prevLoadingRef.current = isLoading;
  }, [isLoading, virtuosoRef]);

  const renderItemContent = useCallback(
    (_index: number, msg: ChatMessage) => (
      // 🔧 头像裁剪 fix: px-4 从 Virtuoso className 移到这里 (每个 item 的 wrapper)。
      //   旧代码: Virtuoso 有 px-4, 但 Virtuoso 内部容器没有正确扣除 padding,
      //   导致 flex-row-reverse 的右侧头像被推到 padding 区域外, 被 overflow-hidden 裁剪掉右半。
      //   修复: Virtuoso 不加 px-4, 每个 item 内部加 px-4, padding 在 item 内部生效。
      <div className="px-4">
        <ChatBubble message={msg} onDelete={onDeleteMessage} userAvatarUrl={userAvatarUrl} onSendMessage={onSendMessage} />
      </div>
    ),
    [onDeleteMessage, userAvatarUrl, onSendMessage]
  );

  return (
    <div className="relative z-10 flex-1 flex flex-col overflow-hidden">
      {/* MCP 通知浮层 */}
      {mcpNotifications.length > 0 && (
        <div className="flex flex-col gap-1.5 px-4 pt-2">
          {mcpNotifications.map((n) => (
            <div
              key={n.id}
              className={`px-3 py-2 rounded-xl text-xs font-medium animate-in fade-in slide-in-from-top-2 duration-300 backdrop-blur-sm ${
                n.type === 'badge'
                  ? 'bg-amber-500/15 text-amber-700 dark:text-amber-300 border border-amber-500/20'
                  : n.type === 'reward'
                  ? 'bg-green-500/15 text-green-700 dark:text-green-300 border border-green-500/20'
                  : 'bg-red-500/15 text-red-700 dark:text-red-300 border border-red-500/20'
              }`}
            >
              {n.type === 'badge' ? '🏅 ' : n.type === 'reward' ? '✨ ' : '💔 '}
              {n.message}
            </div>
          ))}
        </div>
      )}

      {isLoadingHistory ? (
        <div className="flex-1 flex flex-col items-center justify-center text-center">
          <div className="flex gap-1.5 mb-3">
            <span className="w-2 h-2 bg-cyan-400/50 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
            <span className="w-2 h-2 bg-cyan-400/50 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
            <span className="w-2 h-2 bg-cyan-400/50 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
          </div>
          <p className="text-text-tertiary text-xs">{t('chat.loadingChatHistory')}</p>
        </div>
      ) : messages.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center text-center px-4">
          {/* 🔧 V3-7 fix: AI 头像从 🪞 改为 🐘 (与 UI 其他地方一致, Symy 是小象不是镜子) */}
          <div className="w-16 h-16 rounded-full mb-4 relative opacity-90 overflow-hidden shadow-lg flex items-center justify-center bg-gradient-to-br from-cyan-500/30 to-purple-500/30 ring-2 ring-white/10">
            <SymyAvatar growthStage={buddyState?.growthStage ?? 'baby'} animate={false} />
          </div>
          <p className="text-text-secondary text-sm font-medium">{t('chat.welcomeTitle')}</p>
          <p className="text-text-tertiary text-xs mt-1 max-w-[240px]">
            {t('chat.welcomeDesc')}
          </p>
          {buddyState && buddyState.health === 'dormant' && (
            <p className="text-red-400/80 text-xs mt-2 font-medium">
              {t('chat.dormantWarning')}
            </p>
          )}
        </div>
      ) : (
        <>
          {/* 加载更多 / 加载中指示器 */}
          {(isLoadingMore || hasMore) && (
            <div className="flex justify-center py-2 px-4">
              {isLoadingMore ? (
                <div className="flex gap-1.5 items-center">
                  <span className="w-1.5 h-1.5 bg-cyan-400/50 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                  <span className="w-1.5 h-1.5 bg-cyan-400/50 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                  <span className="w-1.5 h-1.5 bg-cyan-400/50 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                  <span className="text-text-tertiary text-xs ml-1.5">{t('chat.loadingMore')}</span>
                </div>
              ) : (
                <button
                  onClick={onLoadMore}
                  className="text-text-tertiary text-xs hover:text-text-secondary transition-colors"
                >
                  {t('chat.scrollUpHint')}
                </button>
              )}
            </div>
          )}
          <div className="flex-1 min-h-0">
            <Virtuoso
              ref={virtuosoRef}
              data={messages}
              itemContent={renderItemContent}
              // 🔧 ARCH fix: followOutput 用函数形式, 返回 'auto' (而非 'smooth') 确保即时跳转
              //    'smooth' 在虚拟列表高度变化时可能不触发到底部
              // 🔧 NEW-063 fix (Round 69): followOutput 只在 atBottom 时 'auto',
              //   不在底部时不跟随 (防止快速发送时跳过中间消息)
              followOutput={(atBottom: boolean) => atBottom ? 'auto' : false}
              startReached={onLoadMore}
              firstItemIndex={firstItemIndex}
              initialTopMostItemIndex={Number.MAX_SAFE_INTEGER}
              // 🔧 NEW-063 fix (Round 69): 增加 overscan buffer, 防止快速发送时
              //   Virtuoso 虚拟化不渲染中间消息
              increaseViewportBy={{ top: 1000, bottom: 1000 }}
              style={{ height: '100%', overflowX: 'hidden' }}
              className="py-4 custom-scrollbar"
            />
          </div>
          {/* 🔧 PM-NEW-27 fix: 思考指示器 + "Symy is typing..." 文字 */}
          {/* 🔧 P1 fix (Issue 3): 如果最后一条 assistant 消息内容为空 (AI 正在生成但还没出 token),
              也显示 typing indicator — 否则用户看到空气泡 + 时间戳, 以为产品坏了 */}
          {/* 🔧 P1-2 fix: 现在 ChatBubble 内部已处理空内容 assistant 消息 (显示 typing 三点),
              此处 typing indicator 仅在 "AI 还未开始流式 (assistantMsg 还未 push)" 时显示,
              避免与 ChatBubble 内的 typing indicator 双重显示. */}
          {(() => {
            const lastMsg = messages[messages.length - 1];
            // 🔧 P1-2 fix: 仅当 isLoading 且 lastMsg 不是 assistant 空消息时显示外部 indicator
            //   (assistant 空消息的 typing 由 ChatBubble 内部处理)
            const hasEmptyAssistant = lastMsg && lastMsg.role === 'assistant' && !lastMsg.content?.trim();
            const showTyping = isLoading && !hasEmptyAssistant && (!lastMsg || lastMsg.role !== 'assistant' || !lastMsg.content?.trim());
            if (!showTyping) return null;
            return (
              <div className="flex gap-2 mb-4 px-4">
                {/* 🔧 V3-7 fix: AI 头像从 🪞 改为 🐘 */}
                <div className="flex-shrink-0 w-8 h-8 rounded-full overflow-hidden flex items-center justify-center bg-gradient-to-br from-cyan-500/30 to-purple-500/30 ring-1 ring-white/10">
                  <SymyAvatar growthStage={buddyState?.growthStage ?? 'baby'} animate={false} />
                </div>
                <div className="glass-card rounded-2xl rounded-bl-md px-4 py-3">
                  <div className="flex items-center gap-2">
                    <div className="flex gap-1.5">
                      <span className="w-2 h-2 bg-cyan-400/50 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                      <span className="w-2 h-2 bg-cyan-400/50 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                      <span className="w-2 h-2 bg-cyan-400/50 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                    </div>
                    {/* 🔧 PM-NEW-27 fix: 加 "Symy is typing..." 文字, 让用户知道 AI 在回复 */}
                    <span className="text-[11px] text-text-tertiary">
                      {t('chat.symyTyping', { defaultValue: 'Symy is typing...' })}
                    </span>
                  </div>
                </div>
              </div>
            );
          })()}
          {/* 🔧 P1-3 fix: Reflection prompts after "chose to buy" action (failure path) */}
          {/*    Shows 3 clickable reflection questions when the last action was "chose_to_buy"
                  and the AI has finished responding (not loading) */}
          {/* 🔧 V4-4 fix: 反思按钮点击后用 setTimeout 延迟发送, 避免被 isLoadingHistory 拦截 */}
          {/*   根因: 挑战完成后 setActiveChallenge(undefined) 触发 loadHistory, isLoadingHistory 短暂为 true */}
          {/*   此时点击反思按钮 → sendMessage 检查 isLoadingHistory → return → 消息被吞 */}
          {/*   修复: setTimeout(500) 等 loadHistory 完成, 再发送 */}
          {onSendMessage && !isLoading && (() => {
            // Find the last action message
            const lastActionMsg = [...messages].reverse().find(m => m.role === 'action');
            if (!lastActionMsg || lastActionMsg.actionType !== 'chose_to_buy') return null;
            // Check if there's an assistant response after the action
            const actionIdx = messages.findIndex(m => m.id === lastActionMsg.id);
            const hasAssistantAfter = messages.slice(actionIdx + 1).some(m => m.role === 'assistant' && m.content?.trim());
            if (!hasAssistantAfter) return null;
            return <ReflectionPrompts onSelect={(q) => {
              // V4-4 fix: 延迟 500ms 等 loadHistory 完成, 避免被 isLoadingHistory 拦截
              setTimeout(() => onSendMessage(q), 500);
            }} />;
          })()}
        </>
      )}
    </div>
  );
}
