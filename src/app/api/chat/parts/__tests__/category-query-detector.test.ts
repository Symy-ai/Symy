/**
 * category-query-detector 测试 (batch58-c)
 *
 * 覆盖: 正例 (zh/en 分类问句 + 时间窗解析)、负例 (闲聊含"拦截"但非问句 /
 * 帮别人问 / 更强购物意图让路 / 品类归一不到五类回落 57-c)。
 */

import { describe, expect, it } from 'vitest';
import { detectCategoryQuery } from '../category-query-detector';

describe('detectCategoryQuery — 正例', () => {
  it('zh: "我这个月奶茶拦截了几次" → food / thisMonth', () => {
    expect(detectCategoryQuery('我这个月奶茶拦截了几次')).toEqual({ window: 'thisMonth', category: 'food' });
  });

  it('zh: "外卖花了多少" → food / thisMonth (默认窗)', () => {
    expect(detectCategoryQuery('外卖花了多少')).toEqual({ window: 'thisMonth', category: 'food' });
  });

  it('zh: "上周衣服守护了几回" → clothing / lastWeek', () => {
    expect(detectCategoryQuery('上周衣服守护了几回')).toEqual({ window: 'lastWeek', category: 'clothing' });
  });

  it('zh: "这周护肤拦截多少" → beauty / thisWeek', () => {
    expect(detectCategoryQuery('这周护肤拦截多少')).toEqual({ window: 'thisWeek', category: 'beauty' });
  });

  it('en: "how many times did I skip milk tea" → food / thisMonth', () => {
    expect(detectCategoryQuery('how many times did I skip milk tea this month?')).toEqual({
      window: 'thisMonth',
      category: 'food',
    });
  });

  it('en: "how much did I spend on clothes last month" → clothing / lastMonth', () => {
    expect(detectCategoryQuery('how much did I spend on clothes last month')).toEqual({
      window: 'lastMonth',
      category: 'clothing',
    });
  });

  it('多类词命中: "手机壳和奶茶哪个拦截得多吗" 归一到已知类', () => {
    const intent = detectCategoryQuery('手机壳和奶茶哪个拦截得多吗');
    expect(intent).not.toBeNull();
    expect(['food', 'electronics']).toContain(intent!.category);
    expect(intent!.window).toBe('thisMonth');
  });
});

describe('detectCategoryQuery — 负例', () => {
  it('闲聊含"拦截"但非问句 → null', () => {
    expect(detectCategoryQuery('上次那个奶茶拦截卡做得挺好的')).toBeNull();
  });

  it('帮别人问 → null', () => {
    expect(detectCategoryQuery('帮我朋友问问她这个月奶茶拦截了几次')).toBeNull();
  });

  it('更强购物意图让路 → null', () => {
    expect(detectCategoryQuery('奶茶该不该买')).toBeNull();
    expect(detectCategoryQuery('should I buy this milk tea or skip it')).toBeNull();
  });

  it('品类归一不到五类 → null (回落 57-c 月度总答)', () => {
    expect(detectCategoryQuery('这个月拦截了几次')).toBeNull();
  });

  it('纯问账无品类词 (57-c 的地盘) → null', () => {
    expect(detectCategoryQuery('这个月省了多少')).toBeNull();
    expect(detectCategoryQuery('how much did I save this month')).toBeNull();
  });

  it('非字符串 / 空输入 → null', () => {
    expect(detectCategoryQuery('')).toBeNull();
    expect(detectCategoryQuery('   ')).toBeNull();
  });
});
