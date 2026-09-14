'use client';

/**
 * TopicPlazaEmpty — chat 空态的话题广场 (batch55-a)
 *
 * 无消息时替代旧 starterSuggestions: 标题 + 全量 chip 网格, 让冷启动用户
 * 一眼看到小象会什么。chip 文本与命中断言见 topic-plaza-chips。
 */

import { useI18n } from '@/i18n/provider';
import { TopicPlazaChips } from './topic-plaza-chips';

export interface TopicPlazaEmptyProps {
  onQuickReply: (text: string) => void;
}

export function TopicPlazaEmpty({ onQuickReply }: TopicPlazaEmptyProps) {
  const { t } = useI18n();

  return (
    <div data-testid="topic-plaza-empty" className="pt-1">
      <p className="text-[11px] text-text-tertiary mb-2 text-center">
        {t('chat.topicPlaza.title')}
      </p>
      <TopicPlazaChips onQuickReply={onQuickReply} />
    </div>
  );
}
