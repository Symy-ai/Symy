// reuse-categories — 复用类目词表 SSOT（此前 0 测试）
// 红线: 荣誉框架(夸会安排/不说教/不提碳数值/不羞耻); 类目id唯一;
// 话术禁金额数字(只有 typicalSavedAmountUSD 是内部估算, 卡面走「约」换算)。
import { describe, expect, it } from 'vitest';
import { REUSE_CATEGORIES, REUSE_HONEST_NOTE } from '@/lib/reuse-categories';

describe('reuse-categories — 词表结构', () => {
  it('五类目齐全且 id 唯一', () => {
    const ids = REUSE_CATEGORIES.map((c) => c.id);
    expect(ids).toEqual(['tool_rental', 'books_media', 'furniture_big', 'party_disposable', 'baby_gear']);
    expect(new Set(ids).size).toBe(5);
  });

  it('每类目双语 label/triggers/suggestions 非空', () => {
    for (const c of REUSE_CATEGORIES) {
      expect(c.label.zh.length).toBeGreaterThan(1);
      expect(c.label.en.length).toBeGreaterThan(1);
      expect(c.triggers.zh.length).toBeGreaterThan(3);
      expect(c.triggers.en.length).toBeGreaterThan(3);
      expect(c.suggestions.zh.length).toBeGreaterThan(0);
      expect(c.suggestions.en.length).toBeGreaterThan(0);
    }
  });

  it('估算金额为正数 (方向感内部值)', () => {
    for (const c of REUSE_CATEGORIES) {
      expect(c.typicalSavedAmountUSD).toBeGreaterThan(0);
    }
  });

  it('荣誉框架红线: 话术不含说教/羞耻/碳数值词汇', () => {
    const banned = /应该|不该|浪费|可耻|后悔|碳排放|碳足迹|kgCO|吨碳|教你|劝你/;
    for (const c of REUSE_CATEGORIES) {
      for (const s of [...c.suggestions.zh, ...c.suggestions.zh]) {
        expect(s).not.toMatch(banned);
      }
    }
    expect(REUSE_HONEST_NOTE.zh).not.toMatch(banned);
  });

  it('话术不含硬编码美元金额 (换算走 moneyToFreedomLabel)', () => {
    for (const c of REUSE_CATEGORIES) {
      for (const s of c.suggestions.zh) {
        expect(s).not.toMatch(/\$\d|\d+美元/);
      }
    }
  });
});

describe('reuse-categories — trigger 命中抽查', () => {
  const hit = (text: string) =>
    REUSE_CATEGORIES.filter((c) =>
      [...c.triggers.zh, ...c.triggers.en].some((w) => text.toLowerCase().includes(w.toLowerCase())),
    ).map((c) => c.id);

  it('zh 命中: 电钻→tool_rental, 买书→books_media', () => {
    expect(hit('想买个电钻在家里打孔')).toContain('tool_rental');
    expect(hit('想买这套书给孩子')).toContain('books_media');
  });

  it('en 命中: drill / textbook', () => {
    expect(hit('need a drill for one project')).toContain('tool_rental');
    expect(hit('buying textbooks for next semester')).toContain('books_media');
  });

  it('中英混说命中 (买个 drill)', () => {
    expect(hit('买个 drill 用一次')).toContain('tool_rental');
  });

  it('无关节词不命中', () => {
    expect(hit('今天天气不错')).toEqual([]);
  });
});
