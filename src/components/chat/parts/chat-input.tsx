'use client';

/**
 * ChatInput — 输入框 + 发送按钮 + Quick Replies
 *
 * 从 chat-tab.tsx 抽出 (C6 拆分).
 * 纯展示 + 回调组件, 无 state (input state 由父组件管理).
 */

import { Send } from 'lucide-react';
import { useI18n } from '@/i18n/provider';
// 🔧 P0-1.3 fix (2026-07-21): 移除 getLocalizedQuickReplies — 4 个细粒度按钮已移到 ChatBanners
// import { getLocalizedQuickReplies, getLocalizedChatQuickReplies } from '@/lib/demo-data';
import type { BuddyState, HealthEvent } from '@/types/buddy-state';
import { SmartPromptChips } from '../smart-prompt-chips';
// 🐘 batch55-a 话题广场: 空态全量广场 + 有历史后折叠为 💡 弹层 (替代 PM-NEW-13 starterSuggestions)
import { TopicPlazaEmpty } from '../topic-plaza/topic-plaza-empty';
import { TopicPlazaPopover } from '../topic-plaza/topic-plaza-popover';

export interface ChatInputProps {
  input: string;
  inputRef: React.RefObject<HTMLInputElement | null>;
  isComposingRef: React.MutableRefObject<boolean>;
  isDemo: boolean;
  isLoading: boolean;
  isLoadingHistory: boolean;
  buddyState?: BuddyState | null;
  activeChallenge?: { itemName: string; amount: number; challengeId?: string };
  gradientClass: string;
  messagesCount: number;
  /** Recent health events used for smart prompt context */
  healthEvents?: HealthEvent[];
  /** Whether the first intercept event happened in this session */
  hasHadInterceptInSession?: boolean;
  onInputChange: (value: string) => void;
  onCompositionStart: () => void;
  onCompositionEnd: (value: string) => void;
  onKeyDown: (e: React.KeyboardEvent<HTMLInputElement>) => void;
  onSendClick: () => void;
  onQuickReply: (reply: string) => void;
}

export function ChatInput({
  input,
  inputRef,
  isComposingRef,
  isDemo,
  isLoading,
  isLoadingHistory,
  buddyState,
  activeChallenge,
  gradientClass,
  messagesCount,
  healthEvents = [],
  hasHadInterceptInSession = false,
  onInputChange,
  onCompositionStart,
  onCompositionEnd,
  onKeyDown,
  onSendClick,
  onQuickReply,
}: ChatInputProps) {
  const { t } = useI18n();

  // 🐘 batch55-a 话题广场 (接 PM-NEW-13/38 的班): 无活跃挑战时 —
  //   空态 (messagesCount === 0) 显示全量话题广场; 有历史后折叠为输入框旁 💡 弹层。
  //   每条 chip 文本都是既有流程的自然触发语 (命中断言见 topic-plaza-detectors.test.ts)。
  const showTopicPlaza = !activeChallenge && !isLoading && !isLoadingHistory;

  return (
    <>
      {/* 🐘 batch55-a: 空态话题广场 — 小象会什么一目了然 */}
      {showTopicPlaza && messagesCount === 0 && (
        <div className="relative z-10 px-4 pb-2">
          <TopicPlazaEmpty onQuickReply={onQuickReply} />
        </div>
      )}

      {/* 🔧 P0-1.3 fix (2026-07-21): 移除 Quick Replies — 4 个细粒度决策按钮已在 ChatBanners 中显示 */}
      {/*   旧代码: 有活跃挑战时显示 4 个快捷回复 (我买了/没忍住/我看见了没买/其实我不需要) */}
      {/*   问题: 与 ChatBanners 的 2 个按钮语义重叠, 用户困惑 */}
      {/*   修复: 4 个细粒度按钮统一在 ChatBanners 中显示, 点击后完成挑战 (而非发送消息) */}

      {/* Smart prompt chips — driven by guard state + session flags */}
      {showTopicPlaza && (
        <SmartPromptChips
          hasSentMessage={false}
          buddyState={buddyState}
          healthEvents={healthEvents}
          hasHadInterceptInSession={hasHadInterceptInSession}
          onQuickReply={onQuickReply}
        />
      )}

      {/* Input + Send button */}
      <div className="relative z-10 px-4 pb-4 pt-2">
        <div className="flex items-center gap-2">
          {/* 🐘 batch55-a: 有历史消息后, 话题广场折叠为 💡 弹层入口 */}
          {showTopicPlaza && messagesCount > 0 && <TopicPlazaPopover onQuickReply={onQuickReply} />}
          <input
            ref={inputRef}
            value={input}
            onChange={(e) => {
              // P0 09-06: native event.composed check + self-healing guard.
              // Old ref-guard stuck true when compositionend was missed (focus loss mid-IME,
              // overlay open, tab switch) -> onChange swallowed forever -> "cannot type".
              // e.nativeEvent.composed is false ONLY during a live composition turn.
              if (e.nativeEvent && 'composed' in e.nativeEvent && e.nativeEvent.composed === false) return;
              if (isComposingRef.current) {
                // stale guard: composition ended but end-event missed. Heal and accept input.
                isComposingRef.current = false;
              }
              onInputChange(e.target.value);
            }}
            onCompositionStart={onCompositionStart}
            onCompositionEnd={(e) => {
              onCompositionEnd((e.target as HTMLInputElement).value);
            }}
            onKeyDown={onKeyDown}
            placeholder={isDemo ? t('chat.placeholder.active') : buddyState?.health === 'dormant' ? t('chat.placeholder.dormant') : activeChallenge ? t('chat.placeholder.challenge') : t('chat.placeholder.active')}
            aria-label={t('chat.placeholder.active')}
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="off"
            spellCheck={false}
            tabIndex={0}
            maxLength={1000}  // 🔧 PM-NEW-80 fix: 限制 1000 字符, 防 DoS + API 超长
            className={`flex-1 bg-glass-fill border rounded-xl px-4 py-2.5 text-sm text-text-primary placeholder:text-text-tertiary focus:outline-none focus:ring-1 transition-all ${activeChallenge ? 'border-red-500/30 focus:border-red-400/50 focus:ring-red-400/30' : 'border-glass-border focus:border-cyan-400/30 focus:ring-cyan-400/20'}`}
          />
          <button
            onClick={onSendClick}
            aria-label={t('chat.send', { defaultValue: 'Send' })}
            // 🔧 Bug 2 fix (P0): 不再因 isLoading 禁用发送按钮。
            //   根因: Challenge 模式 AI 回复慢 (10-30s reasoning) → isLoading=true → 按钮 disabled →
            //   用户点击无反应 → 用户以为"消息没发送" → 实际是按钮根本没响应。
            //   修复: 移除 isLoading from disabled condition。sendMessage 内部已有 force-abort 逻辑
            //   (Bug 25 fix) 处理 lock 持有时的场景: abort 当前 stream + 释放锁 + 继续发送新消息。
            //   仍保留 isLoadingHistory 禁用 (历史加载中发送会丢失消息)。
            disabled={!input.trim() || isLoadingHistory}
            className={`flex-shrink-0 w-10 h-10 rounded-xl text-white flex items-center justify-center hover:opacity-90 transition-all disabled:opacity-30 disabled:cursor-not-allowed active:scale-95 bg-gradient-to-r ${activeChallenge ? 'from-amber-500 to-orange-500' : gradientClass} ${isLoading ? 'opacity-60' : ''}`}
          >
            <Send className="w-4 h-4" />
          </button>
        </div>
      </div>
    </>
  );
}
