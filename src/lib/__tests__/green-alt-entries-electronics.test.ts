import { describe, expect, it } from "vitest";

import { GREEN_ALT_ENTRIES_ELECTRONICS } from "@/lib/green-alt-entries-electronics";
import { suggestAlternative } from "@/lib/green-alternatives";
import { greenAltCategoryOf, isKnownGreenAltEntry } from "@/lib/green-alt-category";

// 排在 electronics 之前的词条 id (优先级豁免用)
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
];

describe("green-alt-entries-electronics 结构", () => {
  it("id 唯一且含 electronics 域标记 (greenAltCategoryOf)", () => {
    const ids = GREEN_ALT_ENTRIES_ELECTRONICS.map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) {
      expect(greenAltCategoryOf(id)).toBe("electronics");
      expect(isKnownGreenAltEntry(id)).toBe(true);
    }
  });

  it("每条 zh/en 关键词各 ≥3, 双语字段非空", () => {
    for (const entry of GREEN_ALT_ENTRIES_ELECTRONICS) {
      for (const locale of ["zh", "en"] as const) {
        expect(entry.triggers[locale].length).toBeGreaterThanOrEqual(3);
        expect(entry.why[locale].length).toBeGreaterThan(0);
        expect(entry.alternative[locale].length).toBeGreaterThan(0);
        expect(entry.reuse[locale].length).toBeGreaterThan(0);
        expect(entry.reuseChannel[locale].length).toBeGreaterThan(0);
        expect(entry.options[locale].length).toBeGreaterThanOrEqual(2);
        expect(entry.options[locale].length).toBeLessThanOrEqual(3);
      }
    }
  });
});

describe("green-alt-entries-electronics 触发", () => {
  const cases: Array<{ id: string; zhQuery: string; enQuery: string }> = [
    {
      id: "refurb_gadget",
      zhQuery: "想换个新手机",
      enQuery: "thinking of buying a new macbook",
    },
    {
      id: "secondhand_audio_tablet",
      zhQuery: "想买个降噪耳机",
      enQuery: "want new earbuds for the gym",
    },
    {
      id: "trade_in_upgrade",
      zhQuery: "发布会看完想以旧换新",
      enQuery: "new model just dropped, thinking of a trade-in",
    },
    {
      id: "repair_first",
      zhQuery: "手机屏幕碎了，换个新的还是修",
      enQuery: "broken screen, should I just buy a new one or repair it",
    },
    {
      id: "cable_hoard",
      zhQuery: "想再买根充电线",
      enQuery: "need a new charging cable",
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
    for (const entry of GREEN_ALT_ENTRIES_ELECTRONICS) {
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

describe("green-alt-entries-electronics 不误伤", () => {
  it("纸笔类 notebook 查询不命中 (en 无 notebook trigger)", () => {
    expect(suggestAlternative("a plain notebook", "en")).toBeNull();
  });

  it("非购物语境的 手机/耳机 提及仍给建议但属于陪伴语气 (可命中, 无说教词)", () => {
    const s = suggestAlternative("手机电池不耐用", "zh");
    expect(s?.message).not.toMatch(/你应该|必须|才环保/);
  });
});

describe("green-alt-entries-electronics 双语", () => {
  it("同一 zh 查询, locale 切换输出语言", () => {
    const zh = suggestAlternative("想换个新手机", "zh");
    const en = suggestAlternative("想换个新手机", "en");
    expect(zh?.id).toBe("refurb_gadget");
    expect(en?.id).toBe("refurb_gadget");
    expect(zh?.message).toContain(zh!.alternative);
    expect(zh?.message).toContain(zh!.reuse);
    expect(zh?.message).not.toBe(en?.message);
  });

  it("composeMessage 输出: zh 无长英文串, en 无中文", () => {
    const zh = suggestAlternative("macbook", "zh");
    const en = suggestAlternative("macbook", "en");
    expect(zh?.id).toBe("refurb_gadget");
    expect(zh?.message).not.toMatch(/[a-zA-Z]{3,}/);
    expect(en?.message).not.toMatch(/[\u4e00-\u9fff]/);
  });

  it("文案红线: 无碳足迹数值 (只允许 e-waste 定性叙事)", () => {
    for (const entry of GREEN_ALT_ENTRIES_ELECTRONICS) {
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
      }
    }
  });
});
