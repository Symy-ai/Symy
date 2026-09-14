import { describe, expect, it } from "vitest";

import { GREEN_ALT_ENTRIES_FURNITURE } from "@/lib/green-alt-entries-furniture";
import { suggestAlternative } from "@/lib/green-alternatives";
import { greenAltCategoryOf, isKnownGreenAltEntry } from "@/lib/green-alt-category";

describe("green-alt-entries-furniture 结构", () => {
  it("id 唯一且含 furniture 域标记 (greenAltCategoryOf)", () => {
    const ids = GREEN_ALT_ENTRIES_FURNITURE.map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) {
      expect(greenAltCategoryOf(id)).toBe("furniture");
      expect(isKnownGreenAltEntry(id)).toBe(true);
    }
  });

  it("每条 zh/en 关键词各 ≥3, 双语字段非空", () => {
    for (const entry of GREEN_ALT_ENTRIES_FURNITURE) {
      for (const locale of ["zh", "en"] as const) {
        expect(entry.triggers[locale].length).toBeGreaterThanOrEqual(3);
        expect(entry.why[locale].length).toBeGreaterThan(0);
        expect(entry.alternative[locale].length).toBeGreaterThan(0);
        expect(entry.reuse[locale].length).toBeGreaterThan(0);
        expect(entry.reuseChannel[locale].length).toBeGreaterThan(0);
        expect(entry.savingsHint[locale].length).toBeGreaterThan(0);
        expect(entry.options[locale].length).toBeGreaterThanOrEqual(2);
        expect(entry.options[locale].length).toBeLessThanOrEqual(3);
      }
    }
  });

  it("trigger 与既有 12 域零冲突: 每个新 trigger 只归属 furniture 词条", () => {
    for (const entry of GREEN_ALT_ENTRIES_FURNITURE) {
      for (const locale of ["zh", "en"] as const) {
        for (const trigger of entry.triggers[locale]) {
          const query =
            locale === "zh" ? `想${trigger}` : `want to ${trigger}`;
          const result = suggestAlternative(query, locale);
          expect(result, `${locale} trigger "${trigger}"`).not.toBeNull();
          expect(result!.id, `${locale} trigger "${trigger}"`).toBe(entry.id);
        }
      }
    }
  });
});

describe("green-alt-entries-furniture 触发", () => {
  const cases: Array<{ id: string; zhQuery: string; enQuery: string }> = [
    {
      id: "repair_reupholster",
      zhQuery: "家里旧了, 想做沙发翻新还是直接换新",
      enQuery: "should I reupholster or just replace it",
    },
    {
      id: "secondhand_furniture",
      zhQuery: "新家空着, 打算去买个书架",
      enQuery: "need to buy a bookshelf for the new place",
    },
    {
      id: "move_rental_furniture",
      zhQuery: "外派一年, 短租家具还是全买了",
      enQuery: "one-year posting, furniture rental or buy everything",
    },
    {
      id: "borrow_rare_tools",
      zhQuery: "想挂画, 要不要买个电钻",
      enQuery: "want to hang pictures, should I buy a power drill",
    },
    {
      id: "mattress_quality_over_cheap",
      zhQuery: "出租屋配床, 淘宝便宜家具凑合一下",
      enQuery: "furnishing a rental, tempted by cheap furniture",
    },
    {
      id: "big_ticket_cooldown_72h",
      zhQuery: "全场家具打折, 今晚就下单大件",
      enQuery: "storewide furniture sale, big purchase tonight",
    },
  ];

  it.each(cases)("zh 触发: $id", ({ id, zhQuery }) => {
    const result = suggestAlternative(zhQuery, "zh");
    expect(result).not.toBeNull();
    expect(result?.id).toBe(id);
  });

  it.each(cases)("en 触发: $id", ({ id, enQuery }) => {
    const result = suggestAlternative(enQuery, "en");
    expect(result).not.toBeNull();
    expect(result?.id).toBe(id);
  });
});

describe("green-alt-entries-furniture 不误伤", () => {
  it("「换个胶囊衣橱整理衣服」仍命中 apparel 域 capsule_wardrobe", () => {
    const result = suggestAlternative("衣柜里没衣服, 想搞胶囊衣橱", "zh");
    expect(result?.id).toBe("capsule_wardrobe");
  });

  it("「买收纳柜」仍命中 household 域 storage_gadgets", () => {
    const result = suggestAlternative("想买个收纳柜收拾杂物", "zh");
    expect(result?.id).toBe("storage_gadgets");
  });

  it("「买跑步机」仍命中 sports 域 home_workout_first — 健身器材有自己的域", () => {
    const result = suggestAlternative("想买台跑步机放家里", "zh");
    expect(result?.id).toBe("home_workout_first");
  });

  it("「给新家买婴儿车」仍命中 parenting 域 baby_gear_rental", () => {
    const result = suggestAlternative("宝宝快出生了, 得买婴儿车和安全座椅", "zh");
    expect(result?.id).toBe("baby_gear_rental");
  });
});

describe("green-alt-entries-furniture 双语与红线", () => {
  it("同一 zh 查询, locale 切换输出语言", () => {
    const zh = suggestAlternative("新家要买沙发, 去哪看好", "zh");
    const en = suggestAlternative("新家要买沙发, 去哪看好", "en");
    expect(zh?.id).toBe("secondhand_furniture");
    expect(en?.id).toBe("secondhand_furniture");
    expect(zh?.message).toContain(zh!.alternative);
    expect(zh?.message).toContain(zh!.reuse);
    expect(zh?.message).not.toBe(en?.message);
  });

  it("composeMessage 输出: zh 无长英文串, en 无中文", () => {
    const zh = suggestAlternative("旧沙发布面磨坏了, 考虑沙发翻新", "zh");
    const en = suggestAlternative("thinking about whether to reupholster the couch", "en");
    expect(zh?.id).toBe("repair_reupholster");
    expect(zh?.message).not.toMatch(/[a-zA-Z]{3,}/);
    expect(en?.message).not.toMatch(/[\u4e00-\u9fff]/);
  });

  it("文案红线: 无碳足迹数值, 无说教/羞辱句式 (含「买不起」类暗示)", () => {
    for (const entry of GREEN_ALT_ENTRIES_FURNITURE) {
      for (const locale of ["zh", "en"] as const) {
        const text = [
          entry.why[locale],
          entry.alternative[locale],
          entry.reuse[locale],
          entry.reuseChannel[locale],
          ...entry.options[locale],
        ].join(" ");
        expect(text, `${entry.id} ${locale}`).not.toMatch(/\d+\s*(kg|t|吨|千克|克)\s*(碳|CO2|co2)/i);
        expect(text, `${entry.id} ${locale}`).not.toMatch(/carbon footprint of \d/i);
        expect(text, `${entry.id} ${locale}`).not.toMatch(/你不该|你不应|你应该感到|乱花钱|买不起|小气|抠门|guilt|shame on you|you're poor|too poor|cheapskate|downgrade/i);
      }
    }
  });
});
