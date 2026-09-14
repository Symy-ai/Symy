/**
 * impulse-time-query-detector 测试 (batch58-c)
 *
 * 覆盖: 正例 (zh/en 时段问句 + 时段桶归一 + 时间窗)、负例 (陈述句 /
 * 该不该买让路 / 帮别人问 / 无时段词)。
 */

import { describe, expect, it } from 'vitest';
import { detectImpulseTimeQuery } from '../impulse-time-query-detector';

describe('detectImpulseTimeQuery — 正例', () => {
  it('zh: "我晚上冲动买的多吗" → evening / thisMonth', () => {
    expect(detectImpulseTimeQuery('我晚上冲动买的多吗')).toEqual({ window: 'thisMonth', impulseWindow: 'evening' });
  });

  it('zh: "我深夜下单多吗" → lateNight', () => {
    expect(detectImpulseTimeQuery('我深夜下单多吗')).toEqual({ window: 'thisMonth', impulseWindow: 'lateNight' });
  });

  it('zh: "这个月半夜冲动买的多吗" → lateNight / thisMonth', () => {
    expect(detectImpulseTimeQuery('这个月半夜冲动买的多吗')).toEqual({ window: 'thisMonth', impulseWindow: 'lateNight' });
  });

  it('zh: "上周晚上买的东西多吗" → evening / lastWeek', () => {
    expect(detectImpulseTimeQuery('上周晚上买的东西多吗')).toEqual({ window: 'lastWeek', impulseWindow: 'evening' });
  });

  it('en: "do I impulse shop late at night?" → lateNight / thisMonth', () => {
    expect(detectImpulseTimeQuery('do I impulse shop late at night?')).toEqual({
      window: 'thisMonth',
      impulseWindow: 'lateNight',
    });
  });

  it('en: "how often do I buy things in the evening this month" → evening / thisMonth', () => {
    expect(detectImpulseTimeQuery('how often do I buy things in the evening this month')).toEqual({
      window: 'thisMonth',
      impulseWindow: 'evening',
    });
  });
});

describe('detectImpulseTimeQuery — 负例', () => {
  it('陈述句 (无求问形态) → null', () => {
    expect(detectImpulseTimeQuery('我昨晚冲动买了个包')).toBeNull();
  });

  it('更强购物意图让路 → null', () => {
    expect(detectImpulseTimeQuery('晚上冲动买的这个该不该买')).toBeNull();
  });

  it('帮别人问 → null', () => {
    expect(detectImpulseTimeQuery('我朋友晚上冲动买的多吗')).toBeNull();
  });

  it('无时段词 → null', () => {
    expect(detectImpulseTimeQuery('我冲动买的多吗')).toBeNull();
  });

  it('非字符串 / 空输入 → null', () => {
    expect(detectImpulseTimeQuery('')).toBeNull();
  });
});
