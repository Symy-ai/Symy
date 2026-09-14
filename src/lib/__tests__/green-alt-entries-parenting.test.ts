import { describe, expect, it } from "vitest";

import { GREEN_ALT_ENTRIES_PARENTING } from "@/lib/green-alt-entries-parenting";
import { suggestAlternative } from "@/lib/green-alternatives";
import { greenAltCategoryOf, isKnownGreenAltEntry } from "@/lib/green-alt-category";

// 排在 parenting 之前的词条 id (优先级豁免用): wear + home + beauty + electronics + food + apparel + household + subscription + travel
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
  "storage_gadgets",
  "aroma_diffuser",
  "promo_household_stockup",
  "small_appliance",
  "upcycle_decor",
  "subscription_audit",
  "tipping_pause",
  "game_topup_math",
  "activate_before_buy",
  "plan_sharing",
  "gear_rental_first",
  "travel_size_kit",
  "travel_voucher_cooldown",
  "souvenir_three_questions",
  "city_transit_choice",
];

describe("green-alt-entries-parenting 结构", () => {
  it("id 唯一且含 parenting 域标记 (greenAltCategoryOf)", () => {
    const ids = GREEN_ALT_ENTRIES_PARENTING.map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) {
      expect(greenAltCategoryOf(id)).toBe("parenting");
      expect(isKnownGreenAltEntry(id)).toBe(true);
    }
  });

  it("每条 zh/en 关键词各 ≥3, 双语字段非空", () => {
    for (const entry of GREEN_ALT_ENTRIES_PARENTING) {
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

describe("green-alt-entries-parenting 触发", () => {
  const cases: Array<{ id: string; zhQuery: string; enQuery: string }> = [
    {
      id: "kids_clothes_pass_on",
      zhQuery: "孩子长高了想买一批新童装",
      enQuery: "kid outgrew everything, need new children's clothes",
    },
    {
      id: "toy_library_borrow",
      zhQuery: "商场里那辆玩具车孩子哭着想要",
      enQuery: "tempted to buy new toys at the mall",
    },
    {
      id: "picturebook_library_swap",
      zhQuery: "想给孩子囤一套儿童绘本",
      enQuery: "want to buy picture books for my kid",
    },
    {
      id: "baby_gear_rental",
      zhQuery: "新生儿到家要不要买个高景观推车",
      enQuery: "should we buy a high-view pram for the newborn",
    },
    {
      id: "diaper_promo_math",
      zhQuery: "大促要不要囤几箱纸尿裤",
      enQuery: "diaper sale is on, should I stockpile",
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
    for (const entry of GREEN_ALT_ENTRIES_PARENTING) {
      for (const locale of ["zh", "en"] as const) {
        for (const trigger of entry.triggers[locale]) {
          const query =
            locale === "zh" ? `想${trigger}` : `want to ${trigger}`;
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

describe("green-alt-entries-parenting 不误伤", () => {
  it("「囤日用品」仍命中 household 域 promo_household_stockup — 囤纸尿裤有自己的域", () => {
    const result = suggestAlternative("大促囤日用品要不要囤点", "zh");
    expect(result?.id).toBe("promo_household_stockup");
  });

  it("「买衣服」(成人语境) 仍命中 apparel 域 new_clothes", () => {
    const result = suggestAlternative("换季了想买衣服", "zh");
    expect(result?.id).toBe("new_clothes");
  });

  it("「办健身卡」仍命中 subscription 域 activate_before_buy", () => {
    const result = suggestAlternative("又想办一张新的健身卡", "zh");
    expect(result?.id).toBe("activate_before_buy");
  });
});

describe("green-alt-entries-parenting 双语与红线", () => {
  it("同一 zh 查询, locale 切换输出语言", () => {
    const zh = suggestAlternative("大促要不要囤几箱纸尿裤", "zh");
    const en = suggestAlternative("大促要不要囤几箱纸尿裤", "en");
    expect(zh?.id).toBe("diaper_promo_math");
    expect(en?.id).toBe("diaper_promo_math");
    expect(zh?.message).toContain(zh!.alternative);
    expect(zh?.message).toContain(zh!.reuse);
    expect(zh?.message).not.toBe(en?.message);
  });

  it("composeMessage 输出: zh 无长英文串, en 无中文", () => {
    const zh = suggestAlternative("商场里那辆玩具车孩子哭着想要", "zh");
    const en = suggestAlternative("tempted to buy new toys at the mall", "en");
    expect(zh?.id).toBe("toy_library_borrow");
    expect(zh?.message).not.toMatch(/[a-zA-Z]{3,}/);
    expect(en?.message).not.toMatch(/[\u4e00-\u9fff]/);
  });

  it("文案红线: 无碳足迹数值, 无说教/羞辱句式 (含「买不起」类暗示)", () => {
    for (const entry of GREEN_ALT_ENTRIES_PARENTING) {
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
        expect(text, `${entry.id} ${locale}`).not.toMatch(/你不该|你不应|你应该感到|乱花钱|买不起|委屈孩子|guilt|shame on you|you're poor|too poor|downgrade/i);
      }
    }
  });
});
