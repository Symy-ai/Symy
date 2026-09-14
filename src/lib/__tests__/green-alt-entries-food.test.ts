import { describe, expect, it } from "vitest";

import { GREEN_ALT_ENTRIES_FOOD } from "@/lib/green-alt-entries-food";
import { suggestAlternative } from "@/lib/green-alternatives";
import { greenAltCategoryOf, isKnownGreenAltEntry } from "@/lib/green-alt-category";

// 排在 food 之前的词条 id (优先级豁免用): wear + home + beauty + electronics
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
];

describe("green-alt-entries-food 结构", () => {
  it("id 唯一且含 food 域标记 (greenAltCategoryOf)", () => {
    const ids = GREEN_ALT_ENTRIES_FOOD.map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) {
      expect(greenAltCategoryOf(id)).toBe("food");
      expect(isKnownGreenAltEntry(id)).toBe(true);
    }
  });

  it("每条 zh/en 关键词各 ≥3, 双语字段非空", () => {
    for (const entry of GREEN_ALT_ENTRIES_FOOD) {
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

describe("green-alt-entries-food 触发", () => {
  const cases: Array<{ id: string; zhQuery: string; enQuery: string }> = [
    {
      id: "milk_tea",
      zhQuery: "想点杯奶茶",
      enQuery: "having a bubble tea craving",
    },
    {
      id: "takeout_meal",
      zhQuery: "中午懒得做饭，点外卖吧",
      enQuery: "too lazy to cook, gonna order takeout",
    },
    {
      id: "bottled_water",
      zhQuery: "超市整箱矿泉水划算吗",
      enQuery: "should I grab a case of bottled water",
    },
    {
      id: "coffee_shop",
      zhQuery: "每天早上都想喝拿铁",
      enQuery: "daily latte run is adding up",
    },
    {
      id: "snack_hoarding",
      zhQuery: "大促想囤零食",
      enQuery: "planning a big snack haul this weekend",
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
    for (const entry of GREEN_ALT_ENTRIES_FOOD) {
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

describe("green-alt-entries-food 不误伤", () => {
  it("「想买象牙」仍命中 wear 域, 不被食品域抢走", () => {
    const result = suggestAlternative("想买个象牙手镯", "zh");
    expect(result?.id).toBe("ivory_bone_carving");
  });

  it("buy ivory bracelet (en) 仍命中 wear 域", () => {
    const result = suggestAlternative("buy ivory bracelet", "en");
    expect(result?.id).toBe("ivory_bone_carving");
  });

  it("塑料瓶查询仍命中 home 域 (一次性塑料), 不被瓶装水抢走", () => {
    const result = suggestAlternative("想买塑料瓶装东西", "zh");
    expect(result?.id).toBe("single_use_plastic");
  });
});

describe("green-alt-entries-food 双语与红线", () => {
  it("同一 zh 查询, locale 切换输出语言", () => {
    const zh = suggestAlternative("想点杯奶茶", "zh");
    const en = suggestAlternative("想点杯奶茶", "en");
    expect(zh?.id).toBe("milk_tea");
    expect(en?.id).toBe("milk_tea");
    expect(zh?.message).toContain(zh!.alternative);
    expect(zh?.message).toContain(zh!.reuse);
    expect(zh?.message).not.toBe(en?.message);
  });

  it("composeMessage 输出: zh 无长英文串, en 无中文", () => {
    const zh = suggestAlternative("milk tea", "zh");
    const en = suggestAlternative("milk tea", "en");
    expect(zh?.id).toBe("milk_tea");
    expect(zh?.message).not.toMatch(/[a-zA-Z]{3,}/);
    expect(en?.message).not.toMatch(/[\u4e00-\u9fff]/);
  });

  it("文案红线: 无碳足迹数值, 无说教/羞辱句式", () => {
    for (const entry of GREEN_ALT_ENTRIES_FOOD) {
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
        expect(text, `${entry.id} ${locale}`).not.toMatch(/你不该|你不应|你应该感到|guilt|shame on you/i);
      }
    }
  });
});
