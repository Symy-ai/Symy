'use client';

/**
 * TopicPlazaChips — 小象话题广场的 chip 组 (batch55-a)
 *
 * 空态广场与折叠态 💡 弹层共用的同一份双语言题 chip。每条文本是既有 chat
 * 流程的自然触发语 (发送后走现有 detection 管线, 逐条命中断言见
 * topic-plaza-detectors.test.ts) — 这里只有静态 i18n 数据, 零检测逻辑。
 */

import { useI18n } from '@/i18n/provider';

/** chip id 顺序 = 广场展示顺序 (具体话题在前, 求问/承诺收尾) */
export const TOPIC_PLAZA_CHIP_IDS = [
  'prepurchase',
  'coffeeAlt',
  'milkTeaAlt',
  'refurbKnowledge',
  'fastFashionKnowledge',
  'reuseDrill',
  'microClothes',
  'commitmentCoffee',
  'savingsQuery',
] as const;

export type TopicPlazaChipId = (typeof TOPIC_PLAZA_CHIP_IDS)[number];

export function topicPlazaChipKey(id: TopicPlazaChipId): string {
  return `chat.topicPlaza.items.${id}`;
}

export interface TopicPlazaChipsProps {
  /** 点击 chip = 以该文本作为用户消息发送 (走现有 detection 管线) */
  onQuickReply: (text: string) => void;
}

export function TopicPlazaChips({ onQuickReply }: TopicPlazaChipsProps) {
  const { t } = useI18n();

  return (
    <div data-testid="topic-plaza-chips" className="flex flex-wrap justify-center gap-2">
      {TOPIC_PLAZA_CHIP_IDS.map((id) => {
        const text = t(topicPlazaChipKey(id));
        return (
          <button
            key={id}
            type="button"
            onClick={() => onQuickReply(text)}
            className="flex-shrink-0 px-3 py-1.5 rounded-full bg-glass-fill border border-glass-border text-xs text-text-secondary hover:bg-glass-fill-strong hover:text-text-primary hover:border-emerald-500/30 transition-all"
          >
            {text}
          </button>
        );
      })}
    </div>
  );
}
