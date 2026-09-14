/**
 * deriveChatRecapTopic 纯函数测试 — 空历史 / 纯寒暄 / 绿色话题命中 / 14 天截断 / 异常输入
 */

import { describe, expect, it } from 'vitest';
import { deriveChatRecapTopic } from '../chat-recap-topic';
import type { ChatMessage } from '@/types/chat-message';

const NOW = new Date('2026-09-08T12:00:00Z');

function msg(
  id: string,
  role: 'user' | 'assistant',
  content: string,
  minutesAgo = 60
): ChatMessage {
  return {
    id,
    role,
    content,
    timestamp: new Date(NOW.getTime() - minutesAgo * 60 * 1000),
  };
}

describe('deriveChatRecapTopic', () => {
  it('空数组 / 非数组 → null', () => {
    expect(deriveChatRecapTopic([], NOW)).toBeNull();
    // @ts-expect-error 异常输入防御
    expect(deriveChatRecapTopic(null, NOW)).toBeNull();
    // @ts-expect-error 异常输入防御
    expect(deriveChatRecapTopic(undefined, NOW)).toBeNull();
  });

  it('纯寒暄历史 → null', () => {
    const msgs = [
      msg('1', 'user', '你好'),
      msg('2', 'assistant', '嗨，我在的'),
      msg('3', 'user', '今天天气不错'),
      msg('4', 'assistant', '是呀'),
    ];
    expect(deriveChatRecapTopic(msgs, NOW)).toBeNull();
  });

  it('只有 assistant 命中词表 → null (只认用户消息)', () => {
    const msgs = [
      msg('1', 'user', '你好'),
      msg('2', 'assistant', '关于象牙的替代，可以考虑橄榄核雕。'),
    ];
    expect(deriveChatRecapTopic(msgs, NOW)).toBeNull();
  });

  it('用户消息命中绿色替代词表 (zh) → green_alt 话题, zh+en 文案齐全', () => {
    const msgs = [
      msg('1', 'user', '你好'),
      msg('2', 'assistant', '嗨'),
      msg('3', 'user', '我想买个象牙手镯'),
      msg('4', 'assistant', '如果喜欢雕刻质感…'),
    ];
    const topic = deriveChatRecapTopic(msgs, NOW);
    expect(topic).not.toBeNull();
    expect(topic!.kind).toBe('green_alt');
    expect(topic!.messageId).toBe('3');
    expect(topic!.summaryZh).toContain('象牙');
    expect(topic!.summaryEn).toContain('ivory');
    expect(topic!.continuePromptZh).toContain('象牙');
    expect(topic!.continuePromptEn).toContain('ivory');
    // 红线: 陪伴句式, 无 "你又想买" 羞辱句式
    expect(topic!.continuePromptZh).toContain('我们上次聊到');
  });

  it('用户消息命中绿色替代词表 (en) → 仍可命中', () => {
    const msgs = [msg('u9', 'user', 'thinking about an ivory bracelet')];
    const topic = deriveChatRecapTopic(msgs, NOW);
    expect(topic?.kind).toBe('green_alt');
    expect(topic?.summaryZh).toContain('象牙');
    expect(topic?.summaryEn).toContain('ivory');
  });

  it('命中绿色意图词 (二手/复用) → green_intent 话题', () => {
    const msgs = [
      msg('1', 'user', '那个相机我看看二手的渠道'),
      msg('2', 'assistant', '闲鱼上可以看看…'),
    ];
    const topic = deriveChatRecapTopic(msgs, NOW);
    expect(topic?.kind).toBe('green_intent');
    expect(topic?.summaryZh).toContain('二手');
    expect(topic?.continuePromptZh).toContain('接着聊');
  });

  it('多条绿色话题 → 取最近一条 (倒序第一个命中)', () => {
    const msgs = [
      msg('1', 'user', '想买个皮草围巾', 60 * 24 * 10),
      msg('2', 'assistant', '…'),
      msg('3', 'user', '还是看看二手的镜头吧', 30),
    ];
    const topic = deriveChatRecapTopic(msgs, NOW);
    expect(topic?.messageId).toBe('3');
    expect(topic?.kind).toBe('green_intent');
  });

  it('话题超 14 天 → null; 恰好 14 天内 (13 天) → 命中', () => {
    const tooOld = [msg('1', 'user', '想买象牙摆件', 60 * 24 * 15)];
    expect(deriveChatRecapTopic(tooOld, NOW)).toBeNull();

    const fresh = [msg('1', 'user', '想买象牙摆件', 60 * 24 * 13)];
    expect(deriveChatRecapTopic(fresh, NOW)?.kind).toBe('green_alt');
  });

  it('缺 timestamp / 空 content / 空 id 的用户消息跳过, 不抛异常', () => {
    const broken = [
      { ...msg('1', 'user', '想买象牙摆件'), timestamp: new Date('invalid') },
      { ...msg('', 'user', '想买象牙摆件') },
      { ...msg('2', 'user', '   ') },
      msg('3', 'user', '看看复用的可能', 5),
    ] as ChatMessage[];
    expect(deriveChatRecapTopic(broken, NOW)?.messageId).toBe('3');
  });
});
