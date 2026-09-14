import { describe, expect, it } from "vitest";

import { GREEN_ALT_ENTRIES_HOUSEHOLD } from "@/lib/green-alt-entries-household";
import { suggestAlternative } from "@/lib/green-alternatives";
import { greenAltCategoryOf, isKnownGreenAltEntry } from "@/lib/green-alt-category";
import { buildGreenKnowledge } from "@/app/api/chat/parts/green-knowledge-context";

// 排在 household 之前的词条 id (优先级豁免用): wear + home + beauty + electronics + food + apparel
const FRONT_IDS = [
  "ivory_bone_carving",
  "tortoiseshell",
  "fur",
  "animal_leather",
  "single_use_plastic",
  "fast_fashion",
  "tissues",
  "batteries",
  "beauty_refill",
  "solid_cleanser",
  "skincare_hoard",
  "lipstick_makeup",
  "sheet_mask_pile",
  "repair_first",
  "refurb_gadget",
  "secondhand_audio_tablet",
  "trade_in_upgrade",
  "cable_hoard",
  "milk_tea",
  "takeout_meal",
  "bottled_water",
  "coffee_shop",
  "snack_hoarding",
  "new_clothes",
  "limited_sneakers",
  "handbag_rotation",
  "wardrobe_audit",
  "capsule_wardrobe",
];

describe("green-alt-entries-household 结构", () => {
  it("id 唯一且含 household 域标记 (greenAltCategoryOf)", () => {
    const ids = GREEN_ALT_ENTRIES_HOUSEHOLD.map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) {
      expect(greenAltCategoryOf(id)).toBe("household");
      expect(isKnownGreenAltEntry(id)).toBe(true);
    }
  });

  it("每条 zh/en 关键词各 ≥3, 双语字段非空", () => {
    for (const entry of GREEN_ALT_ENTRIES_HOUSEHOLD) {
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
});

describe("green-alt-entries-household 触发", () => {
  const cases: Array<{ id: string; zhQuery: string; enQuery: string }> = [
    {
      id: "storage_gadgets",
      zhQuery: "又被种草收纳神器了",
      enQuery: "tempted by another storage organizer",
    },
    {
      id: "aroma_diffuser",
      zhQuery: "想入一个香薰蜡烛",
      enQuery: "want a new scented candle",
    },
    {
      id: "promo_household_stockup",
      zhQuery: "大促要不要囤日用品",
      enQuery: "should I stock up on household supplies",
    },
    {
      id: "small_appliance",
      zhQuery: "想买台空气炸锅",
      enQuery: "thinking about an air fryer",
    },
    {
      id: "upcycle_decor",
      zhQuery: "想给房间来点新家居装饰",
      enQuery: "in the mood for new home decor",
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

  it("每个 trigger 词 (zh+en) 都命中自己的词条 (或更前面的词条)", () => {
    for (const entry of GREEN_ALT_ENTRIES_HOUSEHOLD) {
      for (const locale of ["zh", "en"] as const) {
        for (const trigger of entry.triggers[locale]) {
          const query =
            locale === "zh" ? `想买${trigger}` : `want to buy ${trigger}`;
          const result = suggestAlternative(query, locale);
          expect(result, `${locale} trigger "${trigger}"`).not.toBeNull();
          if (!FRONT_IDS.includes(result!.id)) {
            expect(result!.id).toBe(entry.id);
          }
        }
      }
    }
  });
});

describe("green-alt-entries-household 不误伤", () => {
  it("「囤纸巾」仍命中 home 域 tissues (注册顺序在前)", () => {
    const result = suggestAlternative("大促想囤纸巾", "zh");
    expect(result?.id).toBe("tissues");
  });

  it("「买电池」仍命中 home 域 batteries", () => {
    const result = suggestAlternative("想买几节电池", "zh");
    expect(result?.id).toBe("batteries");
  });

  it("「囤零食」仍命中 food 域 snack_hoarding", () => {
    const result = suggestAlternative("大促想囤零食", "zh");
    expect(result?.id).toBe("snack_hoarding");
  });
});

describe("green-alt-entries-household 双语与红线", () => {
  it("同一 zh 查询, locale 切换输出语言", () => {
    const zh = suggestAlternative("想入一个香薰蜡烛", "zh");
    const en = suggestAlternative("想入一个香薰蜡烛", "en");
    expect(zh?.id).toBe("aroma_diffuser");
    expect(en?.id).toBe("aroma_diffuser");
    expect(zh?.message).toContain(zh!.alternative);
    expect(zh?.message).toContain(zh!.reuse);
    expect(zh?.message).not.toBe(en?.message);
  });

  it("composeMessage 输出: zh 无长英文串, en 无中文", () => {
    const zh = suggestAlternative("scented candle", "zh");
    const en = suggestAlternative("scented candle", "en");
    expect(zh?.id).toBe("aroma_diffuser");
    expect(zh?.message).not.toMatch(/[a-zA-Z]{3,}/);
    expect(en?.message).not.toMatch(/[\u4e00-\u9fff]/);
  });

  it("文案红线: 无碳足迹数值, 无说教/羞辱句式", () => {
    for (const entry of GREEN_ALT_ENTRIES_HOUSEHOLD) {
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
        expect(text, `${entry.id} ${locale}`).not.toMatch(/你不该|你不应|你应该感到|乱花钱|guilt|shame on you/i);
      }
    }
  });
});

describe("green-alt-entries-household 知识问答引用 (chat 路径)", () => {
  it("「旧物改造有什么讲究」→ buildGreenKnowledge 引用 upcycle_decor 词条", () => {
    const { contextBlock, card } = buildGreenKnowledge("旧物改造有什么讲究", "zh", undefined);
    expect(card).not.toBeNull();
    expect(card!.entries.map((e) => e.id)).toContain("upcycle_decor");
    expect(contextBlock).toContain("[GREEN KNOWLEDGE:");
  });

  it("guard off → 双 null (开关语义不回归)", () => {
    const { contextBlock, card } = buildGreenKnowledge("旧物改造有什么讲究", "zh", "off");
    expect(contextBlock).toBeNull();
    expect(card).toBeNull();
  });
});
