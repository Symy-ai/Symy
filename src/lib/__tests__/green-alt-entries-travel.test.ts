import { describe, expect, it } from "vitest";

import { GREEN_ALT_ENTRIES_TRAVEL } from "@/lib/green-alt-entries-travel";
import { suggestAlternative } from "@/lib/green-alternatives";
import { greenAltCategoryOf, isKnownGreenAltEntry } from "@/lib/green-alt-category";

// 排在 travel 之前的词条 id (优先级豁免用): wear + home + beauty + electronics + food + apparel + household + subscription
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
];

describe("green-alt-entries-travel 结构", () => {
  it("id 唯一且含 travel 域标记 (greenAltCategoryOf)", () => {
    const ids = GREEN_ALT_ENTRIES_TRAVEL.map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) {
      expect(greenAltCategoryOf(id)).toBe("travel");
      expect(isKnownGreenAltEntry(id)).toBe(true);
    }
  });

  it("每条 zh/en 关键词各 ≥3, 双语字段非空", () => {
    for (const entry of GREEN_ALT_ENTRIES_TRAVEL) {
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

describe("green-alt-entries-travel 触发", () => {
  const cases: Array<{ id: string; zhQuery: string; enQuery: string }> = [
    {
      id: "gear_rental_first",
      zhQuery: "雪季到了想买滑雪装备",
      enQuery: "planning to buy ski gear this winter",
    },
    {
      id: "travel_size_kit",
      zhQuery: "出差想买一套旅行装洗护",
      enQuery: "need travel-size toiletries for the trip",
    },
    {
      id: "travel_voucher_cooldown",
      zhQuery: "大促要不要囤酒店券",
      enQuery: "hotel deal looks good, should I grab it",
    },
    {
      id: "souvenir_three_questions",
      zhQuery: "景区里的纪念品想买一个",
      enQuery: "tempted by this souvenir at the scenic spot",
    },
    {
      id: "city_transit_choice",
      zhQuery: "三站路懒得走还是打车吧",
      enQuery: "just take a taxi, it's only three stops",
    },
    {
      id: "suitcase_reuse_first",
      zhQuery: "国庆出游想买个新行李箱",
      enQuery: "suitcase for travel",
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
    for (const entry of GREEN_ALT_ENTRIES_TRAVEL) {
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

  it("行李箱包全族 trigger 归 suitcase_reuse_first (QA wool-report 发现 #2)", () => {
    for (const q of ["想买个新行李箱", "换个旅行箱", "登机箱有必要买吗", "看中一只拉杆箱"]) {
      expect(suggestAlternative(q, "zh")?.id, q).toBe("suitcase_reuse_first");
    }
    for (const q of ["need new luggage for the trip", "is a carry-on worth buying"]) {
      expect(suggestAlternative(q, "en")?.id, q).toBe("suitcase_reuse_first");
    }
  });
});

describe("green-alt-entries-travel 不误伤", () => {
  it("「囤酒店券大促」不误伤 household 域 promo_household_stockup — 囤旅行券有自己的域", () => {
    const result = suggestAlternative("促销囤货要不要囤点日用品", "zh");
    expect(result?.id).toBe("promo_household_stockup");
  });

  it("「囤零食」仍命中 food 域 snack_hoarding", () => {
    const result = suggestAlternative("出行想囤零食", "zh");
    expect(result?.id).toBe("snack_hoarding");
  });

  it("「买健身卡」仍命中 subscription 域 activate_before_buy", () => {
    const result = suggestAlternative("又想办一张新的健身卡", "zh");
    expect(result?.id).toBe("activate_before_buy");
  });

  it("「行李」语境但不买箱: 不命中 suitcase_reuse_first (子串让位)", () => {
    expect(suggestAlternative("行李超重了怎么办", "zh")).toBeNull();
    expect(suggestAlternative("整理行李准备出发", "zh")).toBeNull();
  });
});

describe("green-alt-entries-travel 双语与红线", () => {
  it("同一 zh 查询, locale 切换输出语言", () => {
    const zh = suggestAlternative("三站路懒得走还是打车吧", "zh");
    const en = suggestAlternative("三站路懒得走还是打车吧", "en");
    expect(zh?.id).toBe("city_transit_choice");
    expect(en?.id).toBe("city_transit_choice");
    expect(zh?.message).toContain(zh!.alternative);
    expect(zh?.message).toContain(zh!.reuse);
    expect(zh?.message).not.toBe(en?.message);
  });

  it("composeMessage 输出: zh 无长英文串, en 无中文", () => {
    const zh = suggestAlternative("景区里的纪念品想买一个", "zh");
    const en = suggestAlternative("souvenir shopping at the airport", "en");
    expect(zh?.id).toBe("souvenir_three_questions");
    expect(zh?.message).not.toMatch(/[a-zA-Z]{3,}/);
    expect(en?.message).not.toMatch(/[\u4e00-\u9fff]/);
  });

  it("文案红线: 无碳足迹数值, 无说教/羞辱句式 (含「穷游才对」类消费降级暗示)", () => {
    for (const entry of GREEN_ALT_ENTRIES_TRAVEL) {
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
        expect(text, `${entry.id} ${locale}`).not.toMatch(/你不该|你不应|你应该感到|乱花钱|买不起|穷游|guilt|shame on you|you're poor|too poor|downgrade/i);
      }
    }
  });
});
