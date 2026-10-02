// duplicate-purchase-detect — 纯函数行为锁（此前 0 测试）
// 只匹配「再买一个/已有还买」类问题; 出售/送礼/知识/比价等强意图排除。
import { describe, expect, it } from 'vitest';
import { detectDuplicatePurchase } from '../duplicate-purchase-detect';

describe('detectDuplicatePurchase — 重复购买预检', () => {
  it('zh 显式重复问句命中 electronics', () => {
    // 正则要求「已经有/已经买了」全量形态 — 「已有」裸形不在匹配集(如实断言)
    expect(detectDuplicatePurchase('我已有一根充电线，还要再买吗')).toBeNull();
    const r = detectDuplicatePurchase('我已经有一根充电线了，还要再买一根吗');
    expect(r).not.toBeNull();
    expect(r?.category).toBe('electronics');
    expect(r?.itemTitle.length).toBeGreaterThan(0);
  });

  it('en 显式重复问句命中 (headphones)', () => {
    const r = detectDuplicatePurchase('I already have headphones, should I buy another pair');
    expect(r?.category).toBe('electronics');
  });

  it('家中已有问法命中 (家里还有酱油吗 vs 再买)', () => {
    const r = detectDuplicatePurchase('家里还有酱油吗，要不要再买一瓶');
    expect(r?.category).toBe('food');
  });

  it('出售意图不命中（强意图排除）', () => {
    expect(detectDuplicatePurchase('我想把旧手机线卖了')).toBeNull();
  });

  it('送礼意图不命中', () => {
    expect(detectDuplicatePurchase('想买一副耳机送朋友')).toBeNull();
  });

  it('纯知识/比价不命中', () => {
    expect(detectDuplicatePurchase('有机棉和普通棉哪个好')).toBeNull();
    expect(detectDuplicatePurchase('A牌充电线和B牌哪个划算')).toBeNull();
  });

  it('无重复语义的普通购买不命中', () => {
    expect(detectDuplicatePurchase('我想买台空气炸锅')).toBeNull();
  });

  it('空输入安全', () => {
    expect(detectDuplicatePurchase('')).toBeNull();
    expect(detectDuplicatePurchase('   ')).toBeNull();
  });
});
