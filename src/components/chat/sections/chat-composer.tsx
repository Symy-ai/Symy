'use client';

import { ChatInput } from '../parts/chat-input';
import type { BuddyState } from '@/types/buddy-state';
import type { HealthEvent } from '@/types/buddy-state';

interface ChatComposerProps {
  input: string;
  inputRef: React.RefObject<HTMLInputElement | null>;
  isComposingRef: { current: boolean };
  isDemo: boolean;
  isLoading: boolean;
  isLoadingHistory: boolean;
  buddyState?: BuddyState;
  activeChallenge?: { itemName: string; amount: number; challengeId?: string };
  gradientClass: string;
  messagesCount: number;
  healthEvents?: HealthEvent[];
  hasHadInterceptInSession?: boolean;
  setInput: (value: string) => void;
  /** sendMessageWithTaskTracking (含 onMessageSent 任务打卡) */
  onSend: (content: string) => void;
}

/**
 * === Input + Quick Replies ===
 * (原为 chat-tab.tsx 内联 JSX — File Split Wave 1 纯搬运, 行为零变化)
 */
export function ChatComposer({ input, inputRef, isComposingRef, isDemo, isLoading, isLoadingHistory, buddyState, activeChallenge, gradientClass, messagesCount, healthEvents = [], hasHadInterceptInSession = false, setInput, onSend }: ChatComposerProps) {
  return (
    <ChatInput
      input={input}
      inputRef={inputRef}
      isComposingRef={isComposingRef}
      isDemo={isDemo}
      isLoading={isLoading}
      isLoadingHistory={isLoadingHistory}
      buddyState={buddyState}
      activeChallenge={activeChallenge}
      gradientClass={gradientClass}
      messagesCount={messagesCount}
      healthEvents={healthEvents}
      hasHadInterceptInSession={hasHadInterceptInSession}
      onInputChange={setInput}
      onCompositionStart={() => { isComposingRef.current = true; }}
      onCompositionEnd={(value) => {
        isComposingRef.current = false;
        setInput(value);
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
          e.preventDefault();
          // 🔧 NEW-AAA fix: 用 e.currentTarget.value 而非 input state (避免 stale closure)
          const currentInput = e.currentTarget.value;
          if (currentInput.trim()) {
            // 🔧 NEW-AAA fix: 同步清空 DOM input, 防止用户快速输入时追加到旧值
            // 之前: setInput('') 异步, React 还没 re-render, DOM value 还是旧值
            //   → 用户输入 "Quick msg 2" → onChange 读到 "Quick msg 1Quick msg 2"
            // 现在: 同步清空 DOM, React re-render 后 value={input} 一致
            e.currentTarget.value = '';
            setInput('');
            onSend(currentInput);
          }
        }
      }}
      onSendClick={() => {
        // 🔧 NEW-AAA fix: 用 inputRef.current.value 而非 input state
        const currentInput = inputRef.current?.value || input;
        if (currentInput.trim()) {
          // 🔧 NEW-AAA fix: 同步清空 DOM input
          if (inputRef.current) inputRef.current.value = '';
          setInput('');
          onSend(currentInput);
        }
      }}
      onQuickReply={(reply) => onSend(reply)}
    />
  );
}
