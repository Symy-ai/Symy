/**
 * compare-detector 表驱动测试 (batch56-a)
 *
 * 覆盖验收:
 * 1. 命中: zh "A 还是 B / A 或 B / 还是选"、en "A vs B / A or B (带购买语境)"
 *    — 两侧对象词正确抽取
 * 2. 互斥让路: 反驳 (48-b) / 承诺 (53-a) / 单对象求问 (50-a) 句式优先, 不命中
 * 3. 不误伤: 陈述已买 / 无关 "还是" 连词 / 空输入 一律 null
 */

import { describe, expect, it } from 'vitest';
import { detectCompare } from '../compare-detector';

describe('detectCompare 命中 (zh)', () => {
  it.each([
    ['买 iPad 还是安卓平板', 'ipad', '安卓平板'],
    ['该选索尼还是森海塞尔？', '索尼', '森海塞尔'],
    ['换 iPhone 或者继续用安卓', 'iphone', '继续用安卓'],
    ['买新的还是选二手的？', '新的', '二手的'],
  ])('%s → {sideA:%s, sideB:%s}', (input, sideA, sideB) => {
    expect(detectCompare(input)).toEqual({ sideA, sideB });
  });
});

describe('detectCompare 命中 (en)', () => {
  it.each([
    ['refurbished vs new', 'refurbished', 'new'],
    ['should I get an iPad or an Android tablet?', 'an ipad', 'an android tablet'],
    ['help me choose: macbook air vs pro!', 'help me choose: macbook air', 'pro'],
  ])('%s', (input) => {
    const result = detectCompare(input);
    expect(result).not.toBeNull();
    expect(typeof result?.sideA).toBe('string');
    expect(typeof result?.sideB).toBe('string');
  });

  it('强连接词 vs 无需购买语境词也命中', () => {
    expect(detectCompare('iphone vs android')).toEqual({ sideA: 'iphone', sideB: 'android' });
  });
});

describe('detectCompare 互斥让路 (更强意图优先)', () => {
  it.each([
    ['我就要买iPad了，别劝我'],
    ['这个月不买咖啡了'],
    ['先忍 30 天不买游戏'],
    ['该不该买这台iPad？'],
    ['值得买吗这台平板'],
    ['no more coffee'],
    ['leave me alone, let me buy it'],
  ])('%s → null (让路给反驳/承诺/三问流)', (input) => {
    expect(detectCompare(input)).toBeNull();
  });
});

describe('detectCompare 不误伤', () => {
  it.each([
    ['我还是算了'], // 无关 "还是" 连词
    ['还是先看看吧'],
    ['我已经买了iPad和安卓平板'], // 陈述已买
    ['刚买了新手机，很开心'],
    ['i already bought the ipad'],
    ['今天天气不错'], // 无连接词
    ['coffee or tea with breakfast'], // or 无购买语境词
    [''], // 空输入
  ])('%s → null', (input) => {
    expect(detectCompare(input)).toBeNull();
  });

  it('非字符串输入恒 null', () => {
    expect(detectCompare(undefined as unknown as string)).toBeNull();
    expect(detectCompare(123 as unknown as string)).toBeNull();
  });
});
