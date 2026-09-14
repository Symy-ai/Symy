// @vitest-environment node

/**
 * reuse-advisor 单测 — 类目命中/未命中、zh+en 双语、词边界防误中、
 * 小时换算 (moneyToFreedomLabel 官方管道, 默认 $25/hr 与自定义时薪)。
 */

import { describe, expect, it } from 'vitest';
import { suggestReuse } from '../reuse-advisor';
import { REUSE_CATEGORIES } from '../reuse-categories';

describe('suggestReuse — 类目命中', () => {
  it('zh: 想买电钻 → 工具·设备 租赁建议', () => {
    const hint = suggestReuse('想买个电钻', 'zh');
    expect(hint).not.toBeNull();
    expect(hint!.shouldSuggestReuse).toBe(true);
    expect(hint!.category).toBe('tool_rental');
    expect(hint!.categoryLabel).toBe('工具·设备');
    expect(hint!.suggestions.length).toBeGreaterThan(0);
    expect(hint!.reuseHonestNote).toBeTruthy();
  });

  it('en: "power drill" → Tools & gear', () => {
    const hint = suggestReuse('I want to buy a power drill', 'en');
    expect(hint).not.toBeNull();
    expect(hint!.category).toBe('tool_rental');
    expect(hint!.categoryLabel).toBe('Tools & gear');
  });

  it('中英混排: "买个 drill" 也命中 (双语词表同查)', () => {
    expect(suggestReuse('买个 drill', 'zh')?.category).toBe('tool_rental');
  });

  it('每个类目至少有一个 zh + 一个 en trigger 可命中 (表完整性)', () => {
    for (const rule of REUSE_CATEGORIES) {
      const zhHit = suggestReuse(`想买${rule.triggers.zh[0]}`, 'zh');
      expect(zhHit?.category, `zh trigger "${rule.triggers.zh[0]}"`).toBe(rule.id);
      const enHit = suggestReuse(`looking for ${rule.triggers.en[0]}`, 'en');
      expect(enHit?.category, `en trigger "${rule.triggers.en[0]}"`).toBe(rule.id);
    }
  });

  it('其余类目抽测: 教材/沙发/生日布置/婴儿车', () => {
    expect(suggestReuse('考研教材', 'zh')?.category).toBe('books_media');
    expect(suggestReuse('a second-hand sofa', 'en')?.category).toBe('furniture_big');
    expect(suggestReuse('孩子生日布置', 'zh')?.category).toBe('party_disposable');
    expect(suggestReuse('stroller for the baby', 'en')?.category).toBe('baby_gear');
  });
});

describe('suggestReuse — 未命中与防御', () => {
  it('水杯 (非高频复用类目) → null', () => {
    expect(suggestReuse('想买个水杯', 'zh')).toBeNull();
  });

  it('en miss: "water bottle" → null', () => {
    expect(suggestReuse('a water bottle', 'en')).toBeNull();
  });

  it('空/异常输入 → null (纯函数不抛异常)', () => {
    expect(suggestReuse('', 'zh')).toBeNull();
    expect(suggestReuse('   ', 'en')).toBeNull();
    expect(suggestReuse(undefined as unknown as string, 'zh')).toBeNull();
  });
});

describe('suggestReuse — 词边界与复数 (en matching)', () => {
  it('"tent" 命中, "attention" 不误中', () => {
    expect(suggestReuse('need a tent for camping', 'en')?.category).toBe('tool_rental');
    expect(suggestReuse('sorry for my attention span', 'en')).toBeNull();
  });

  it('复数容忍: "drills" 命中', () => {
    expect(suggestReuse('comparing drills online', 'en')?.category).toBe('tool_rental');
  });
});

describe('suggestReuse — 里子: 省下的小时数 (官方换算管道)', () => {
  it('默认时薪 $25: 工具类 $95 价差 → 3.8 小时 (zh)', () => {
    const hint = suggestReuse('想买个电钻', 'zh');
    expect(hint!.hoursLabel).toBe('约省 3.8 小时自由时间');
  });

  it('en: ≈ 3.8 hours of freedom time back', () => {
    const hint = suggestReuse('power drill', 'en');
    expect(hint!.hoursLabel).toBe('≈ 3.8 hours of freedom time back');
  });

  it('自定义时薪: 书 $12 @ $12/hr → 1.0 小时', () => {
    const hint = suggestReuse('买教材', 'zh', 12);
    expect(hint!.hoursLabel).toBe('约省 1.0 小时自由时间');
  });

  it('不足 1 小时走分钟: 派对 $45 @ $100/hr → 27 分钟', () => {
    const hint = suggestReuse('生日布置', 'zh', 100);
    expect(hint!.hoursLabel).toBe('约省 27 分钟自由时间');
  });

  it('异常时薪 (0/负/NaN) 回落默认 $25, 不抛异常', () => {
    const hint = suggestReuse('想买个电钻', 'zh', 0);
    expect(hint!.hoursLabel).toBe('约省 3.8 小时自由时间');
    expect(suggestReuse('想买个电钻', 'zh', Number.NaN)?.hoursLabel).toBeTruthy();
  });
});
