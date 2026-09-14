/**
 * follow-up-query 测试 (batch59-c)
 *
 * 覆盖验收:
 * 1. detectFollowUpQuery: 时间追问正/负例、裸品类词正/负例 ("奶茶" 命中,
 *    "想喝奶茶" 购物意图让路)、裸时段词、非疑问闲聊不命中、英文对应
 *    ("last month?" / "what about takeout")
 * 2. resolveFollowUpContext: 时间追问继承维度、维度追问继承窗口、两者都换、
 *    无上文优雅降级 (null, 回落普通检测)
 * 3. 路由顺序: 追问检测在 58-c/57-c 检测之前 (route 源码链序锁)
 */

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { detectFollowUpQuery, resolveFollowUpContext, type PrevDataQueryMeta } from '../follow-up-query';

describe('detectFollowUpQuery — 时间追问', () => {
  it.each([
    ['那上个月呢', 'lastMonth'],
    ['上月呢？', 'lastMonth'],
    ['那上个季度呢', 'lastMonth'],
    ['上周呢', 'lastWeek'],
    ['前一周呢？', 'lastWeek'],
    ['那这个月呢', 'thisMonth'],
    ['那本周呢', 'thisWeek'],
  ])('%s → %s', (text, window) => {
    expect(detectFollowUpQuery(text)).toEqual({ timeWindow: window });
  });

  it.each([
    ['last month?', 'lastMonth'],
    ['what about last month', 'lastMonth'],
    ['last week?', 'lastWeek'],
    ['what about this week', 'thisWeek'],
  ])('en: %s → %s', (text, window) => {
    expect(detectFollowUpQuery(text)).toEqual({ timeWindow: window });
  });
});

describe('detectFollowUpQuery — 维度切换追问 (裸品类词/裸时段词)', () => {
  it.each([
    ['奶茶', 'food'],
    ['那外卖呢', 'food'],
    ['衣服呢？', 'clothing'],
    ['那手机呢', 'electronics'],
  ])('%s → category %s', (text, category) => {
    expect(detectFollowUpQuery(text)).toEqual({ category });
  });

  it('en: "what about takeout" → food', () => {
    expect(detectFollowUpQuery('what about takeout')).toEqual({ category: 'food' });
  });

  it('裸时段词: "那晚上呢" → impulseWindow evening', () => {
    expect(detectFollowUpQuery('那晚上呢')).toEqual({ impulseWindow: 'evening' });
  });

  it('裸时段词: "深夜呢？" → lateNight', () => {
    expect(detectFollowUpQuery('深夜呢？')).toEqual({ impulseWindow: 'lateNight' });
  });

  it('时间 + 品类同给: "上周外卖呢" → 两者都换', () => {
    expect(detectFollowUpQuery('上周外卖呢')).toEqual({ timeWindow: 'lastWeek', category: 'food' });
  });
});

describe('detectFollowUpQuery — 负例 (让路/不命中)', () => {
  it.each([
    ['想喝奶茶'],           // 购物意图让路
    ['想吃外卖'],           // 动作动词让路
    ['奶茶该不该买'],        // 求问意图让路
    ['好的'],              // 非疑问闲聊
    ['哈哈'],              // 非疑问闲聊
    ['嗯嗯'],              // 非疑问闲聊
    ['thanks'],            // 非疑问闲聊
    ['朋友问奶茶呢'],        // 帮别人问
    ['这个月奶茶拦截了几次'],  // 完整问句 → 让回 58-c 完整检测
    ['上个月省了多少'],       // 完整问句 → 让回 57-c 完整检测
    ['how many milk tea did i skip'], // 完整问句 (en)
    [''],                  // 空输入
  ])('%s → null', (text) => {
    expect(detectFollowUpQuery(text)).toBeNull();
  });

  it('非字符串输入恒 null', () => {
    expect(detectFollowUpQuery(null as unknown as string)).toBeNull();
    expect(detectFollowUpQuery(undefined as unknown as string)).toBeNull();
  });
});

describe('resolveFollowUpContext — 上文解析', () => {
  const savingsThisMonth: PrevDataQueryMeta = { kind: 'savings', window: 'thisMonth' };
  const foodThisMonth: PrevDataQueryMeta = { kind: 'category', window: 'thisMonth', category: 'food' };
  const eveningThisWeek: PrevDataQueryMeta = { kind: 'impulse', window: 'thisWeek', impulseWindow: 'evening' };

  it('时间追问继承维度: savings thisMonth + "那上个月呢" → savings lastMonth', () => {
    const fu = detectFollowUpQuery('那上个月呢')!;
    expect(resolveFollowUpContext(savingsThisMonth, fu)).toEqual({ kind: 'savings', window: 'lastMonth' });
  });

  it('时间追问继承维度: category food thisMonth + "那上周呢" → food lastWeek', () => {
    const fu = detectFollowUpQuery('那上周呢')!;
    expect(resolveFollowUpContext(foodThisMonth, fu)).toEqual({ kind: 'category', window: 'lastWeek', category: 'food' });
  });

  it('时间追问继承维度: impulse evening thisWeek + "上月呢" → evening lastMonth', () => {
    const fu = detectFollowUpQuery('上月呢');
    expect(resolveFollowUpContext(eveningThisWeek, fu!)).toEqual({ kind: 'impulse', window: 'lastMonth', impulseWindow: 'evening' });
  });

  it('维度追问继承窗口: category food thisMonth + "那衣服呢" → clothing thisMonth', () => {
    const fu = detectFollowUpQuery('那衣服呢')!;
    expect(resolveFollowUpContext(foodThisMonth, fu)).toEqual({ kind: 'category', window: 'thisMonth', category: 'clothing' });
  });

  it('维度追问可跨 kind: category food thisMonth + "那晚上呢" → impulse evening thisMonth', () => {
    const fu = detectFollowUpQuery('那晚上呢')!;
    expect(resolveFollowUpContext(foodThisMonth, fu)).toEqual({ kind: 'impulse', window: 'thisMonth', impulseWindow: 'evening' });
  });

  it('维度追问继承窗口: savings thisMonth + "奶茶" → food thisMonth', () => {
    const fu = detectFollowUpQuery('奶茶')!;
    expect(resolveFollowUpContext(savingsThisMonth, fu)).toEqual({ kind: 'category', window: 'thisMonth', category: 'food' });
  });

  it('两者都给: savings thisMonth + "上周外卖呢" → food lastWeek', () => {
    const fu = detectFollowUpQuery('上周外卖呢')!;
    expect(resolveFollowUpContext(savingsThisMonth, fu)).toEqual({ kind: 'category', window: 'lastWeek', category: 'food' });
  });

  it('无上文 → null (回落普通检测链, 绝不拿空窗口算数)', () => {
    const fu = detectFollowUpQuery('那上个月呢')!;
    expect(resolveFollowUpContext(null, fu)).toBeNull();
    expect(resolveFollowUpContext(undefined, fu)).toBeNull();
  });

  it('上文形状不全 (category kind 缺 category) 的纯时间追问 → null', () => {
    const broken = { kind: 'category', window: 'thisMonth' } as PrevDataQueryMeta;
    const fu = detectFollowUpQuery('那上个月呢')!;
    expect(resolveFollowUpContext(broken, fu)).toBeNull();
  });

  it('上文形状非法 (未知 kind/window) → null', () => {
    const fu = detectFollowUpQuery('那上个月呢')!;
    expect(resolveFollowUpContext({ kind: 'other', window: 'thisMonth' } as unknown as PrevDataQueryMeta, fu)).toBeNull();
    expect(resolveFollowUpContext({ kind: 'savings', window: 'thisYear' } as unknown as PrevDataQueryMeta, fu)).toBeNull();
  });
});

describe('路由顺序 — 追问检测在 57-c/58-c 检测之前 (源码链序锁)', () => {
  it('route.ts 中 follow-up 块先于 category/impulse/savings 检测', () => {
    const source = readFileSync(new URL('../../route.ts', import.meta.url), 'utf-8');
    const followUpIdx = source.indexOf('detectFollowUpQuery');
    const categoryIdx = source.indexOf('detectCategoryQuery');
    const impulseIdx = source.indexOf('detectImpulseTimeQuery');
    const savingsIdx = source.indexOf('detectSavingsQuery');
    expect(followUpIdx).toBeGreaterThan(-1);
    expect(categoryIdx).toBeGreaterThan(followUpIdx);
    expect(impulseIdx).toBeGreaterThan(followUpIdx);
    expect(savingsIdx).toBeGreaterThan(followUpIdx);
  });
});
