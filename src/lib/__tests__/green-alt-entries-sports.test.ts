import { describe, expect, it } from "vitest";

import { GREEN_ALT_ENTRIES_SPORTS } from "@/lib/green-alt-entries-sports";
import { suggestAlternative } from "@/lib/green-alternatives";
import { greenAltCategoryOf, isKnownGreenAltEntry } from "@/lib/green-alt-category";

// 排在 sports 之前的词条 id (优先级豁免用): wear + home + beauty + electronics + food + apparel + household + subscription + travel + parenting
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
  "kids_clothes_pass_on",
  "toy_library_borrow",
  "picturebook_library_swap",
  "baby_gear_rental",
  "diaper_promo_math",
];

describe("green-alt-entries-sports 结构", () => {
  it("id 唯一且含 sports 域标记 (greenAltCategoryOf)", () => {
    const ids = GREEN_ALT_ENTRIES_SPORTS.map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) {
      expect(greenAltCategoryOf(id)).toBe("sports");
      expect(isKnownGreenAltEntry(id)).toBe(true);
    }
  });

  it("每条 zh/en 关键词各 ≥3, 双语字段非空", () => {
    for (const entry of GREEN_ALT_ENTRIES_SPORTS) {
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

describe("green-alt-entries-sports 触发", () => {
  const cases: Array<{ id: string; zhQuery: string; enQuery: string }> = [
    {
      id: "gym_per_visit_math",
      zhQuery: "销售说办健身房年卡最划算",
      enQuery: "the gym annual membership looks like the best deal",
    },
    {
      id: "sportswear_capsule",
      zhQuery: "新的一周想买一套新运动服奖励自己",
      enQuery: "tempted by the new athleisure drop",
    },
    {
      id: "secondhand_racquet",
      zhQuery: "入坑了想买一支羽毛球拍",
      enQuery: "want to buy a racket for badminton",
    },
    {
      id: "home_workout_first",
      zhQuery: "下雨不想出门, 搞台跑步机放客厅",
      enQuery: "hate going out, maybe buy a treadmill for home",
    },
    {
      id: "supplement_stockup_math",
      zhQuery: "大促要不要囤两桶蛋白粉",
      enQuery: "should I buy protein powder on sale to stock up",
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
    for (const entry of GREEN_ALT_ENTRIES_SPORTS) {
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

describe("green-alt-entries-sports 不误伤", () => {
  it("「办健身卡」仍命中 subscription 域 activate_before_buy — 预付卡冲动归 subscription", () => {
    const result = suggestAlternative("又想办一张新的健身卡", "zh");
    expect(result?.id).toBe("activate_before_buy");
  });

  it("「买滑雪装备」仍命中 travel 域 gear_rental_first — 户外大件装备归 travel", () => {
    const result = suggestAlternative("雪季到了想买滑雪装备", "zh");
    expect(result?.id).toBe("gear_rental_first");
  });

  it("「囤课」仍命中 subscription 域 activate_before_buy", () => {
    const result = suggestAlternative("直播间囤课把年卡办了", "zh");
    expect(result?.id).toBe("activate_before_buy");
  });
});

describe("green-alt-entries-sports 双语与红线", () => {
  it("同一 zh 查询, locale 切换输出语言", () => {
    const zh = suggestAlternative("销售说办健身房年卡最划算", "zh");
    const en = suggestAlternative("销售说办健身房年卡最划算", "en");
    expect(zh?.id).toBe("gym_per_visit_math");
    expect(en?.id).toBe("gym_per_visit_math");
    expect(zh?.message).toContain(zh!.alternative);
    expect(zh?.message).toContain(zh!.reuse);
    expect(zh?.message).not.toBe(en?.message);
  });

  it("composeMessage 输出: zh 无长英文串, en 无中文", () => {
    const zh = suggestAlternative("入坑了想买一支羽毛球拍", "zh");
    const en = suggestAlternative("want to buy a racket for badminton", "en");
    expect(zh?.id).toBe("secondhand_racquet");
    expect(zh?.message).not.toMatch(/[a-zA-Z]{3,}/);
    expect(en?.message).not.toMatch(/[\u4e00-\u9fff]/);
  });

  it("文案红线: 无碳足迹数值, 无说教/羞辱句式 (含「消费降级」类暗示)", () => {
    for (const entry of GREEN_ALT_ENTRIES_SPORTS) {
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
        expect(text, `${entry.id} ${locale}`).not.toMatch(/你不该|你不应|你应该感到|乱花钱|买不起|穷|guilt|shame on you|you're poor|too poor|downgrade|consume less/i);
      }
    }
  });
});
