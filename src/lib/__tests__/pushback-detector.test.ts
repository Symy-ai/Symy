/**
 * pushback-detector 测试 — 反驳意图检测 (batch48-b)
 *
 * 覆盖: 命中 (zh/en, firm/annoyed), 不命中 (普通咨询/对比/空输入)。
 * "上一轮是否发过守护卡"由调用方判断, 不在本文件测试面内。
 */

import { describe, expect, it } from 'vitest';
import { detectPushback } from '../pushback-detector';

describe('detectPushback 命中', () => {
  it('zh 反驳短语 → firm', () => {
    expect(detectPushback('我就要买这件外套')).toEqual({ tone: 'firm' });
    expect(detectPushback('别拦我，让我买')).toEqual({ tone: 'firm' });
    expect(detectPushback('就这一次，以后不买了')).toEqual({ tone: 'firm' });
  });

  it('zh 带不耐烦信号 → annoyed', () => {
    expect(detectPushback('我就要买，你好烦')).toEqual({ tone: 'annoyed' });
    expect(detectPushback('别管我，别说了')).toEqual({ tone: 'annoyed' });
    expect(detectPushback('让我买！太啰嗦了')).toEqual({ tone: 'annoyed' });
  });

  it('en 反驳短语 → firm (词边界, 大小写不敏感)', () => {
    expect(detectPushback('Leave me alone, I want it')).toEqual({ tone: 'firm' });
    expect(detectPushback('Just this once')).toEqual({ tone: 'firm' });
    expect(detectPushback("Don't stop me")).toEqual({ tone: 'firm' });
    expect(detectPushback('I really want to buy it')).toEqual({ tone: 'firm' });
  });

  it('en 带不耐烦信号 → annoyed', () => {
    expect(detectPushback('Leave me alone, you are so annoying')).toEqual({ tone: 'annoyed' });
    expect(detectPushback('just this once, stop lecturing me')).toEqual({ tone: 'annoyed' });
  });
});

describe('detectPushback 不命中 (负例, 普通对话不误触发)', () => {
  it('普通商品咨询 (含"买"但无反驳语义)', () => {
    expect(detectPushback('我想买个耳机，有什么推荐吗？')).toBeNull();
    expect(detectPushback('帮我看看这个值不值得买')).toBeNull();
  });

  it('对比咨询', () => {
    expect(detectPushback('帮我对比一下 A 和 B 哪个好')).toBeNull();
    expect(detectPushback('A vs B, which one should I buy?')).toBeNull();
  });

  it('闲聊 / 感谢 / 无购买语义', () => {
    expect(detectPushback('今天天气不错')).toBeNull();
    expect(detectPushback('谢谢你，我感觉好多了')).toBeNull();
    expect(detectPushback('Tell me about secondhand options')).toBeNull();
  });

  it('空输入防御', () => {
    expect(detectPushback('')).toBeNull();
    expect(detectPushback('   ')).toBeNull();
    // safe to ignore: 非字符串输入按空处理 (防御调用方)
    expect(detectPushback(undefined as unknown as string)).toBeNull();
  });
});
