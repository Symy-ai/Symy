// shopping-context-signals — 弱信号词表红线探针（此前 0 测试, 纯数据 SSOT）
// 文档红线: 歧义生活短语必须不命中; 结构完整性; en 词边界。
import { describe, expect, it } from 'vitest';
import { SHOPPING_CONTEXT_SIGNALS } from '@/lib/shopping-context-signals';

function zhHits(text: string) {
  return SHOPPING_CONTEXT_SIGNALS.filter((e) => e.zh.test(text.toLowerCase())).map((e) => e.id);
}
function enHits(text: string) {
  return SHOPPING_CONTEXT_SIGNALS.filter((e) => e.en.test(text.toLowerCase())).map((e) => e.id);
}

describe('shopping-context-signals — 词条结构', () => {
  it('全部词条结构完整 (id/词/双模式/合法枚举)', () => {
    for (const e of SHOPPING_CONTEXT_SIGNALS) {
      expect(e.id).toBeTruthy();
      expect(e.wordZh).toBeTruthy();
      expect(e.wordEn).toBeTruthy();
      expect(e.zh).toBeInstanceOf(RegExp);
      expect(e.en).toBeInstanceOf(RegExp);
      expect(['emotion_reward', 'scarcity_promo', 'wear_replace']).toContain(e.signal);
      expect(['direct', 'implicit', 'weak']).toContain(e.tier);
    }
  });

  it('词条 id 唯一 (dismissedContextSignals 排除键稳定)', () => {
    const ids = SHOPPING_CONTEXT_SIGNALS.map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('展示词无数字 (含数字时须写汉字 — 卡面红线)', () => {
    for (const e of SHOPPING_CONTEXT_SIGNALS) {
      expect(e.wordZh).not.toMatch(/[0-9]/);
      expect(e.wordEn).not.toMatch(/[0-9]/);
    }
  });
});

describe('shopping-context-signals — 歧义红线探针 (文档锁定)', () => {
  it('「不想花钱」不命中 (否定语义非消费冲动)', () => {
    expect(zhHits('不想花钱')).toEqual([]);
    expect(zhHits('我没想花钱')).toEqual([]);
    expect(zhHits('别想花钱了')).toEqual([]);
  });

  it('「最后一件事」不命中 (非促销稀缺)', () => {
    expect(zhHits('最后一件事做完就睡')).toEqual([]);
  });

  it('「直播间讲段子」不命中 (非直播带货)', () => {
    expect(zhHits('直播间讲段子挺好笑')).toEqual([]);
  });

  it('正向命中不受影响', () => {
    expect(zhHits('想花钱')).toContain('emotion_reward.urge_to_spend');
    expect(zhHits('想花点钱')).toContain('emotion_reward.urge_to_spend');
    expect(zhHits('手痒')).toContain('emotion_reward.urge_to_spend');
  });

  it('en 词边界: heartbroken 不误中 heart 类词', () => {
    expect(enHits('I am heartbroken today')).toEqual([]);
  });
});
