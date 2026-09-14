import { describe, expect, it } from "vitest";

import { GREEN_ALT_ENTRIES_PETS } from "@/lib/green-alt-entries-pets";
import { suggestAlternative } from "@/lib/green-alternatives";
import { greenAltCategoryOf, isKnownGreenAltEntry } from "@/lib/green-alt-category";

describe("green-alt-entries-pets 结构", () => {
  it("id 唯一且含 pets 域标记 (greenAltCategoryOf)", () => {
    const ids = GREEN_ALT_ENTRIES_PETS.map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) {
      expect(greenAltCategoryOf(id)).toBe("pets");
      expect(isKnownGreenAltEntry(id)).toBe(true);
    }
  });

  it("每条 zh/en 关键词各 ≥3, 双语字段非空", () => {
    for (const entry of GREEN_ALT_ENTRIES_PETS) {
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

  it("trigger 与既有 13 域零冲突: 每个新 trigger 只归属 pets 词条", () => {
    for (const entry of GREEN_ALT_ENTRIES_PETS) {
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

describe("green-alt-entries-pets 触发", () => {
  const cases: Array<{ id: string; zhQuery: string; enQuery: string }> = [
    {
      id: "pet_medicine_vet_first",
      zhQuery: "猫最近软便, 想囤点宠物药和益生菌",
      enQuery: "thinking of stocking up on pet meds and supplements",
    },
    {
      id: "cat_litter_subscription_audit",
      zhQuery: "猫砂快用完了, 要不要订阅每月送",
      enQuery: "running out of cat litter, should I start a litter delivery",
    },
    {
      id: "pet_toy_durable",
      zhQuery: "狗拆家太狠, 狗玩具几分钟就咬烂一批",
      enQuery: "my dog destroys everything, chew toys die in minutes",
    },
    {
      id: "secondhand_pet_gear_first",
      zhQuery: "新猫到家, 打算入个猫爬架和宠物推车",
      enQuery: "new kitten, planning to get a cat tree and pet stroller",
    },
    {
      id: "pet_food_bulk_math",
      zhQuery: "大促到了, 猫粮要不要直接囤最大袋",
      enQuery: "sale is on, should I get the big bag dog food",
    },
    {
      id: "adopt_dont_shop",
      zhQuery: "想养宠物, 去宠物店买一只猫还是领养",
      enQuery: "want a companion, buy a puppy from the pet store or adopt",
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

describe("green-alt-entries-pets 不误伤", () => {
  it("「买地毯清洗机」仍命中 furniture 域 borrow_rare_tools — carpet 含 pet 子串也不越界", () => {
    const zh = suggestAlternative("家里地毯脏了, 买个地毯清洗机", "zh");
    const en = suggestAlternative("need a carpet cleaner for the rugs", "en");
    expect(zh?.id).toBe("borrow_rare_tools");
    expect(en?.id).toBe("borrow_rare_tools");
  });

  it("「买婴儿车」仍命中 parenting 域 baby_gear_rental", () => {
    const result = suggestAlternative("宝宝快出生了, 得买婴儿车和安全座椅", "zh");
    expect(result?.id).toBe("baby_gear_rental");
  });

  it("「囤蛋白粉」仍命中 sports 域补剂囤货词条", () => {
    const result = suggestAlternative("健身补剂打折, 囤点蛋白粉", "zh");
    expect(result?.id).toBe("supplement_stockup_math");
  });
});

describe("green-alt-entries-pets 双语与红线", () => {
  it("同一 zh 查询, locale 切换输出语言", () => {
    const zh = suggestAlternative("想买猫爬架, 去哪看好", "zh");
    const en = suggestAlternative("想买猫爬架, 去哪看好", "en");
    expect(zh?.id).toBe("secondhand_pet_gear_first");
    expect(en?.id).toBe("secondhand_pet_gear_first");
    expect(zh?.message).toContain(zh!.alternative);
    expect(zh?.message).toContain(zh!.reuse);
    expect(zh?.message).not.toBe(en?.message);
  });

  it("composeMessage 输出: zh 无长英文串, en 无中文", () => {
    const zh = suggestAlternative("狗玩具买便宜的坏了好多, 换耐咬的吧", "zh");
    const en = suggestAlternative("done with flimsy dog toys, want durable chew toys", "en");
    expect(zh?.id).toBe("pet_toy_durable");
    expect(zh?.message).not.toMatch(/[a-zA-Z]{3,}/);
    expect(en?.message).not.toMatch(/[\u4e00-\u9fff]/);
  });

  it("文案红线: 无碳足迹数值, 无说教/羞辱句式, 无医疗建议句式", () => {
    for (const entry of GREEN_ALT_ENTRIES_PETS) {
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
        expect(text, `${entry.id} ${locale}`).not.toMatch(/你不该|你不应|你应该感到|乱花钱|买不起|养不起|小气|抠门|guilt|shame on you|you're poor|too poor|cheapskate|downgrade/i);
      }
    }
  });

  it("药品词条只引导先问兽医, 不出现诊疗/剂量建议", () => {
    const med = GREEN_ALT_ENTRIES_PETS.find((e) => e.id === "pet_medicine_vet_first")!;
    for (const locale of ["zh", "en"] as const) {
      const text = [med.alternative[locale], med.reuse[locale], med.reuseChannel[locale]].join(" ");
      expect(text).toContain(locale === "zh" ? "兽医" : "vet");
      expect(text).not.toMatch(/剂量是|吃\d|每日\d|mg\/|dosage is|give \d/i);
    }
  });
});
