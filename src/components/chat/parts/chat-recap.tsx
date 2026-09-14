'use client';

/**
 * ChatRecap — 「上次我们聊到」回顾条 (chat 会话连续性)
 *
 * 挂在 chat-header 之下、消息列表之上: 若上次会话有可续的绿色话题, 展示一次性回顾条。
 * 点「继续聊」→ 续接 prompt 填入输入框 + 回顾条消失; 点关闭仅消失。
 * 去重由 use-chat-recap (sessionStorage) 负责, 本组件只做展示 + 回调。
 *
 * 文案红线: 陪伴句式 ("我们聊到/你上次在考虑"), 不用 "你又想买X" 羞辱句式。
 */

import { useI18n } from '@/i18n/provider';
import type { ChatRecapTopic } from '@/lib/chat-recap-topic';

export interface ChatRecapProps {
  topic: ChatRecapTopic;
  /** 点「继续聊」— 传回续接 prompt, 由 chat-tab 填入输入框 */
  onContinue: (continuePrompt: string) => void;
  onDismiss: () => void;
}

export function ChatRecap({ topic, onContinue, onDismiss }: ChatRecapProps) {
  const { t, locale } = useI18n();
  const summary = locale === 'en' ? topic.summaryEn : topic.summaryZh;
  const continuePrompt = locale === 'en' ? topic.continuePromptEn : topic.continuePromptZh;

  return (
    <div
      data-testid="chat-recap"
      className="mt-2 mx-3 p-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/30 flex items-center gap-2"
    >
      <span className="text-[11px] text-emerald-600 dark:text-emerald-300 flex-1 min-w-0">
        🌱 {t('chat.recapPrefix', { defaultValue: 'Last time we talked about' })}: {summary}
      </span>
      <button
        onClick={() => onContinue(continuePrompt)}
        className="shrink-0 px-2.5 py-1 rounded-lg bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 border border-emerald-500/40 text-[11px] font-medium hover:bg-emerald-500/30 transition-all active:scale-[0.98]"
      >
        {t('chat.recapContinue', { defaultValue: 'Continue' })}
      </button>
      <button
        onClick={onDismiss}
        aria-label={t('chat.recapDismiss', { defaultValue: 'Dismiss' })}
        className="shrink-0 p-1 rounded text-text-tertiary hover:text-text-secondary transition-colors text-xs"
      >
        ✕
      </button>
    </div>
  );
}
