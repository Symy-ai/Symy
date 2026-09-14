/**
 * emotion-shopping-detector 测试 — 情绪×购物共现检测 (batch60-c)
 *
 * 覆盖: 验收命中样例 (zh+en); 单条件不命中 (只有情绪/只有购物);
 * 五种 mood 稳定输出; 更高优先级规则让路 (BNPL/绿色替代/数据问答形态);
 * 高风险语义排除 (自伤/临床词 → null 降级通用聊天); 否定形态不命中。
 */

import { describe, expect, it } from 'vitest';
import { detectEmotionShopping } from '../emotion-shopping-detector';

const BASE = { locale: 'zh' as const };

describe('emotion-shopping-detector — 验收命中样例', () => {
  it('「今天好累，想买点东西哄自己」命中, mood=tired', () => {
    expect(detectEmotionShopping('今天好累，想买点东西哄自己', BASE)).toEqual({ mood: 'tired' });
  });

  it('「rough day, I want to treat myself」命中 (en)', () => {
    expect(detectEmotionShopping('rough day, I want to treat myself', { locale: 'en' })).toEqual({ mood: 'tired' });
  });

  it('「今天好累」单独不命中 (只有情绪无购物)', () => {
    expect(detectEmotionShopping('今天好累', BASE)).toBeNull();
  });

  it('「想买耳机」单独不命中 (只有购物无情绪)', () => {
    expect(detectEmotionShopping('想买耳机', BASE)).toBeNull();
  });

  it('「I want to buy headphones」单独不命中 (en 只有购物)', () => {
    expect(detectEmotionShopping('I want to buy headphones', { locale: 'en' })).toBeNull();
  });

  it('「I feel so tired this week」单独不命中 (en 只有情绪)', () => {
    expect(detectEmotionShopping('I feel so tired this week', { locale: 'en' })).toBeNull();
  });
});

describe('emotion-shopping-detector — mood 稳定输出 (非诊断标签)', () => {
  it.each([
    ['压力太大了，想下单犒劳一下自己', 'stressed'],
    ['好焦虑啊，想逛逛购物软件', 'anxious'],
    ['今天很难过，想买点东西哄哄自己', 'sad'],
    ['升职啦好开心，想买点东西奖励自己', 'celebratory'],
    ['so stressed today, might splurge a little', 'stressed'],
    ['feeling anxious, about to do some shopping', 'anxious'],
    ['feeling sad, I want to get myself something nice', 'sad'],
    ['got good news, treating myself tonight!', 'celebratory'],
  ])('%s → %s', (text, mood) => {
    const locale = /[\u4e00-\u9fff]/.test(text) ? 'zh' : 'en';
    expect(detectEmotionShopping(text, { locale })?.mood).toBe(mood);
  });

  it('「不开心」优先归 sad, 不落 celebratory 的裸「开心」', () => {
    expect(detectEmotionShopping('今天不开心，想买点东西安慰自己', BASE)?.mood).toBe('sad');
  });

  it('非字符串/空输入恒 null', () => {
    expect(detectEmotionShopping(undefined as unknown as string, BASE)).toBeNull();
    expect(detectEmotionShopping('', BASE)).toBeNull();
    expect(detectEmotionShopping('   ', BASE)).toBeNull();
  });
});

describe('emotion-shopping-detector — 更高优先级规则让路', () => {
  it('BNPL 意图让路 (zh 支付词): 情绪+购物也不命中', () => {
    expect(detectEmotionShopping('今天好累，用花呗买点东西哄自己', BASE)).toBeNull();
  });

  it('BNPL 意图让路 (en 词库): pay in 4 不命中', () => {
    expect(detectEmotionShopping('rough day, pay in 4 for a treat myself gift', { locale: 'en' })).toBeNull();
  });

  it('绿色替代品类让路: 情绪消息点名具体品类 → 既有绿色推荐继续负责', () => {
    expect(detectEmotionShopping('今天好累，想点杯奶茶哄自己', BASE)).toBeNull();
    expect(detectEmotionShopping('今天很难过，想买个礼物哄哄自己', BASE)).toBeNull(); // 礼物属 gifting 绿色域
    expect(detectEmotionShopping('stressed today, want to order takeout and treat myself', { locale: 'en' })).toBeNull();
  });

  it('绿色守护开关关闭时, 品类词不再让路 → 情绪守护接管', () => {
    expect(detectEmotionShopping('今天好累，想点杯奶茶哄自己', { locale: 'zh', greenPref: 'off' })?.mood).toBe('tired');
  });
});

describe('emotion-shopping-detector — 否定形态与高风险语义', () => {
  it('「不想买了」否定形态不命中 (用户已经在说不买)', () => {
    expect(detectEmotionShopping('今天好累，不想买了', BASE)).toBeNull();
  });

  it('「don\'t want to buy anything」否定形态不命中 (en)', () => {
    expect(detectEmotionShopping("so tired today, I don't want to buy anything", { locale: 'en' })).toBeNull();
  });

  it('自伤/临床词汇排除 → null, 自然降级通用聊天 (红线: 本卡不做心理安全响应)', () => {
    expect(detectEmotionShopping('今天好累，不想活了，想买点东西', BASE)).toBeNull();
    expect(detectEmotionShopping('有点抑郁，想买点东西哄自己', BASE)).toBeNull();
    expect(detectEmotionShopping('depressed and want to treat myself', { locale: 'en' })).toBeNull();
    expect(detectEmotionShopping('I want to hurt myself, maybe some shopping will help', { locale: 'en' })).toBeNull();
  });
});
