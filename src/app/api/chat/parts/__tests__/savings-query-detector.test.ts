/**
 * savings-query-detector 测试 (batch57-c)
 *
 * 覆盖验收:
 * 1. 命中 (zh+en): 各时间窗问法 (省了多少 / 帮我算算 / 守护了几次 / 胜率 /
 *    how much have I saved / my win rate)
 * 2. 时间窗解析: 本周/这周/上周/本月/这个月/上月/上月 → 对应窗;
 *    this week / last week / this month / last month; 无时间词默认本月
 * 3. 不误伤: 陈述句 ("我省钱了") 不触发; 购物意图句让路 (求问/承诺/对比);
 *    问价 ("多少钱一单") 不是问账
 */

import { describe, expect, it } from 'vitest';
import { detectSavingsQuery } from '../savings-query-detector';

describe('detectSavingsQuery — 命中 + 时间窗 (zh)', () => {
  it.each([
    ['我这个月省了多少钱', 'thisMonth'],
    ['这个月省了多少', 'thisMonth'],
    ['本月帮我算算账', 'thisMonth'],
    ['我胜率怎么样', 'thisMonth'], // 无时间词默认本月
    ['这周省了多少', 'thisWeek'],
    ['本周守护了几次', 'thisWeek'],
    ['上周守护了几次', 'lastWeek'],
    ['上周帮我算一下省了多少', 'lastWeek'],
    ['上月省了多少钱', 'lastMonth'],
    ['上个月拦了几回', 'lastMonth'],
    ['挽回多少了', 'thisMonth'],
  ])('%s → %s', (text, window) => {
    expect(detectSavingsQuery(text)).toEqual({ window });
  });
});

describe('detectSavingsQuery — 命中 + 时间窗 (en)', () => {
  it.each([
    ['How much have I saved this month?', 'thisMonth'],
    ['how much have i saved', 'thisMonth'],
    ['How much did I save last week?', 'lastWeek'],
    ["what's my win rate", 'thisMonth'],
    ['How many times have I been guarded this week?', 'thisWeek'],
    ['help me add up my savings last month', 'lastMonth'],
  ])('%s → %s', (text, window) => {
    expect(detectSavingsQuery(text)).toEqual({ window });
  });
});

describe('detectSavingsQuery — 不误伤', () => {
  it('陈述句 (没在问数字) 不触发', () => {
    expect(detectSavingsQuery('我省钱了')).toBeNull();
    expect(detectSavingsQuery('上周我守护了三次')).toBeNull(); // 陈述次数, 不是 "几次"
    expect(detectSavingsQuery('I saved so much money this month')).toBeNull();
    expect(detectSavingsQuery('今天天气不错')).toBeNull();
  });

  it('购物意图句让路 (更强 detector 在前)', () => {
    expect(detectSavingsQuery('该买 iPad 吗？多少钱')).toBeNull();
    expect(detectSavingsQuery('这个月不买咖啡了')).toBeNull();
    expect(detectSavingsQuery('买 iPad 还是安卓平板')).toBeNull();
    expect(detectSavingsQuery('refurbished vs new, which one')).toBeNull();
    expect(detectSavingsQuery('should I buy this drill?')).toBeNull();
  });

  it('问价不是问账 (多少钱需省/守护语境护航)', () => {
    expect(detectSavingsQuery('帮我算算这双鞋多少钱')).toBeNull();
    expect(detectSavingsQuery('这杯咖啡多少钱')).toBeNull();
  });

  it('异常输入恒 null', () => {
    expect(detectSavingsQuery('')).toBeNull();
    expect(detectSavingsQuery('   ')).toBeNull();
  });
});
