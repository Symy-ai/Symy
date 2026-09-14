import { describe, expect, it } from "vitest";

import { GREEN_ALT_ENTRIES_APPAREL } from "@/lib/green-alt-entries-apparel";
import { suggestAlternative } from "@/lib/green-alternatives";
import { greenAltCategoryOf, isKnownGreenAltEntry } from "@/lib/green-alt-category";
import { buildGreenKnowledge } from "@/app/api/chat/parts/green-knowledge-context";

// 排在 apparel 之前的词条 id (优先级豁免用): wear + home + beauty + electronics + food
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
];

describe("green-alt-entries-apparel 结构", () => {
  it("id 唯一且含 apparel 域标记 (greenAltCategoryOf)", () => {
    const ids = GREEN_ALT_ENTRIES_APPAREL.map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) {
      expect(greenAltCategoryOf(id)).toBe("apparel");
      expect(isKnownGreenAltEntry(id)).toBe(true);
    }
  });

  it("每条 zh/en 关键词各 ≥3, 双语字段非空", () => {
    for (const entry of GREEN_ALT_ENTRIES_APPAREL) {
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

describe("green-alt-entries-apparel 触发", () => {
  const cases: Array<{ id: string; zhQuery: string; enQuery: string }> = [
    {
      id: "new_clothes",
      zhQuery: "又想买衣服了",
      enQuery: "I want to buy clothes again",
    },
    {
      id: "limited_sneakers",
      zhQuery: "这双限量球鞋好心动",
      enQuery: "that sneaker drop is calling me",
    },
    {
      id: "handbag_rotation",
      zhQuery: "又种草了一个新包",
      enQuery: "craving a new handbag",
    },
    {
      id: "wardrobe_audit",
      zhQuery: "秋天到了，衣橱换新一下",
      enQuery: "planning a fall clothes haul",
    },
    {
      id: "capsule_wardrobe",
      zhQuery: "天天喊没衣服穿",
      enQuery: "I have nothing to wear again",
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
    for (const entry of GREEN_ALT_ENTRIES_APPAREL) {
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

describe("green-alt-entries-apparel 不误伤", () => {
  it("「快时尚」仍命中 home 域 fast_fashion, 不被服饰域抢走", () => {
    const result = suggestAlternative("又刷到快时尚上新了", "zh");
    expect(result?.id).toBe("fast_fashion");
  });

  it("「打折衣服」仍命中 home 域 fast_fashion (注册顺序在前)", () => {
    const result = suggestAlternative("想买打折衣服", "zh");
    expect(result?.id).toBe("fast_fashion");
  });

  it("「囤纸巾」仍命中 home 域 tissues, 不被居家生活域抢走", () => {
    const result = suggestAlternative("大促想囤纸巾", "zh");
    expect(result?.id).toBe("tissues");
  });
});

describe("green-alt-entries-apparel 双语与红线", () => {
  it("同一 zh 查询, locale 切换输出语言", () => {
    const zh = suggestAlternative("又想买衣服了", "zh");
    const en = suggestAlternative("又想买衣服了", "en");
    expect(zh?.id).toBe("new_clothes");
    expect(en?.id).toBe("new_clothes");
    expect(zh?.message).toContain(zh!.alternative);
    expect(zh?.message).toContain(zh!.reuse);
    expect(zh?.message).not.toBe(en?.message);
  });

  it("composeMessage 输出: zh 无长英文串, en 无中文", () => {
    const zh = suggestAlternative("new clothes", "zh");
    const en = suggestAlternative("new clothes", "en");
    expect(zh?.id).toBe("new_clothes");
    expect(zh?.message).not.toMatch(/[a-zA-Z]{3,}/);
    expect(en?.message).not.toMatch(/[\u4e00-\u9fff]/);
  });

  it("文案红线: 无碳足迹数值, 无说教/羞辱句式", () => {
    for (const entry of GREEN_ALT_ENTRIES_APPAREL) {
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

describe("green-alt-entries-apparel 知识问答引用 (chat 路径)", () => {
  it("「胶囊衣橱值得吗」→ buildGreenKnowledge 引用 capsule_wardrobe 词条", () => {
    const { contextBlock, card } = buildGreenKnowledge("胶囊衣橱值得吗", "zh", undefined);
    expect(card).not.toBeNull();
    expect(card!.entries.map((e) => e.id)).toContain("capsule_wardrobe");
    expect(contextBlock).toContain("[GREEN KNOWLEDGE:");
  });

  it("「衣柜盘点有什么讲究」→ 引用 wardrobe_audit 词条", () => {
    const { card } = buildGreenKnowledge("衣柜盘点有什么讲究", "zh", undefined);
    expect(card).not.toBeNull();
    expect(card!.entries.map((e) => e.id)).toContain("wardrobe_audit");
  });
});
