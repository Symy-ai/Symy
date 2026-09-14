/**
 * topic-plaza-detectors — 话题广场 chip 命中回归 (batch55-a)
 *
 * 验收锚点: 每条 chip 文本 (直接读 zh.json/en.json 实际上架文案, 不是测试内
 * 复制品) 经现有 detector 断言命中预期流程/卡片 — 不允许"发送后小象没接住"
 * 的哑弹。zh+en 各跑一遍。红线: 广场零新检测逻辑, 这里只复用既有 detector。
 */

import { describe, expect, it } from 'vitest';
import zhMessages from '@/i18n/messages/zh.json';
import enMessages from '@/i18n/messages/en.json';
import { detectPrepurchaseIntent } from '@/lib/prepurchase-detect';
import { detectCommitment } from '@/lib/commitment-detector';
import { matchGreenKnowledge } from '@/lib/green-knowledge-query';
import { detectGreenAltCard } from '@/app/api/chat/parts/green-alt-detect';
import { detectReuseHint } from '@/app/api/chat/parts/reuse-detect';
import { detectMicroChallenge } from '@/app/api/chat/parts/micro-challenge-detector';
import { detectSavingsQuery } from '@/app/api/chat/parts/savings-query-detector';
import { TOPIC_PLAZA_CHIP_IDS, type TopicPlazaChipId } from '../topic-plaza-chips';

type Locale = 'zh' | 'en';

const MESSAGES: Record<Locale, typeof zhMessages> = { zh: zhMessages, en: enMessages };

function chipText(id: TopicPlazaChipId, locale: Locale): string {
  const items = (MESSAGES[locale].chat as Record<string, unknown>).topicPlaza as {
    items: Record<string, string>;
  };
  const text = items.items[id];
  expect(text, `chip ${id} missing in ${locale}`).toBeTruthy();
  return text;
}

/** 每条 chip 的命中断言 — detector 输入是上架文案本身, 文案漂移即红 */
const HIT_ASSERTIONS: Record<TopicPlazaChipId, (text: string, locale: Locale) => void> = {
  // 买前三问: canned 迎接回复 + 三问决策卡 (batch50-a)
  prepurchase: (text) => {
    expect(detectPrepurchaseIntent(text)?.kind).toBe('should_i_buy');
  },
  // 绿色替代拦截卡: 咖啡 (green-alt-detect → coffee_shop 词条)
  coffeeAlt: (text, locale) => {
    expect(detectGreenAltCard(text, locale, 'on')?.id).toBe('coffee_shop');
  },
  // 绿色替代拦截卡: 奶茶 (milk_tea 词条)
  milkTeaAlt: (text, locale) => {
    expect(detectGreenAltCard(text, locale, 'on')?.id).toBe('milk_tea');
  },
  // 绿色知识问答: 来源 chip + 词条上下文注入 (batch47-a)
  refurbKnowledge: (text) => {
    expect(matchGreenKnowledge(text)).toContain('refurb_gadget');
  },
  fastFashionKnowledge: (text) => {
    expect(matchGreenKnowledge(text)).toContain('fast_fashion');
  },
  // 复用优先提示卡: 工具租赁 (reuse-detect → tool_rental)
  reuseDrill: (text, locale) => {
    expect(detectReuseHint(text, locale)?.category).toBe('tool_rental');
  },
  // 24h 微挑战卡: 服饰品类 (micro-challenge-detector)
  microClothes: (text) => {
    expect(detectMicroChallenge({ userContent: text })?.category).toBe('clothing');
  },
  // 绿色承诺登记卡: 默认档到月底 (batch53-a)
  commitmentCoffee: (text) => {
    const intent = detectCommitment(text);
    expect(intent?.durationKind).toBe('month_end');
    expect(intent?.subject).toBeTruthy();
  },
  // 🐘 batch57-c 问账: canned 对账卡 ("这个月省了多少" → thisMonth 默认窗)
  savingsQuery: (text) => {
    expect(detectSavingsQuery(text)?.window).toBe('thisMonth');
  },
};

describe('topic plaza chip detector hits', () => {
  it('registers every chip id in both dictionaries with digit-free text', () => {
    for (const locale of ['zh', 'en'] as const) {
      const items = (MESSAGES[locale].chat as Record<string, unknown>).topicPlaza as {
        items: Record<string, string>;
      };
      // 注册对齐: 代码 id 列表 = 词典 items keys (无孤儿/无缺失)
      expect(Object.keys(items.items)).toEqual([...TOPIC_PLAZA_CHIP_IDS]);
      // 金额红线: chip 文案零数字 (数字留给卡内)
      for (const text of Object.values(items.items)) {
        expect(text, `${locale}: ${text}`).not.toMatch(/\d/);
      }
    }
  });

  it.each([...TOPIC_PLAZA_CHIP_IDS] as TopicPlazaChipId[])('%s hits its flow in zh+en', (id) => {
    for (const locale of ['zh', 'en'] as const) {
      HIT_ASSERTIONS[id](chipText(id, locale), locale);
    }
  });

  it('does not cross-trigger: commitment chip is not a prepurchase/knowledge question', () => {
    for (const locale of ['zh', 'en'] as const) {
      const text = chipText('commitmentCoffee', locale);
      expect(detectPrepurchaseIntent(text)).toBeNull();
      expect(matchGreenKnowledge(text)).toBeNull();
    }
  });
});
