import { describe, expect, it } from "vitest";

import { GREEN_ALT_ENTRIES_GIFTING } from "@/lib/green-alt-entries-gifting";
import { suggestAlternative } from "@/lib/green-alternatives";
import { greenAltCategoryOf, isKnownGreenAltEntry } from "@/lib/green-alt-category";

// 排在 gifting 之前的词条 id (优先级豁免用): wear..sports 全部 53 条
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
  "gym_per_visit_math",
  "sportswear_capsule",
  "secondhand_racquet",
  "home_workout_first",
  "supplement_stockup_math",
];

describe("green-alt-entries-gifting 结构", () => {
  it("id 唯一且含 gifting 域标记 (greenAltCategoryOf)", () => {
    const ids = GREEN_ALT_ENTRIES_GIFTING.map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) {
      expect(greenAltCategoryOf(id)).toBe("gifting");
      expect(isKnownGreenAltEntry(id)).toBe(true);
    }
  });

  it("每条 zh/en 关键词各 ≥3, 双语字段非空", () => {
    for (const entry of GREEN_ALT_ENTRIES_GIFTING) {
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

describe("green-alt-entries-gifting 触发", () => {
  const cases: Array<{ id: string; zhQuery: string; enQuery: string }> = [
    {
      id: "experience_gift_first",
      zhQuery: "朋友生日快到了, 得去买个生日礼物",
      enQuery: "friend's birthday is coming, need a birthday gift",
    },
    {
      id: "gift_wishlist_first",
      zhQuery: "完全不知道送什么, 有什么挑礼物的好办法",
      enQuery: "no idea what to gift, any gift ideas",
    },
    {
      id: "secondhand_book_gift",
      zhQuery: "想送他一本绝版书当礼物",
      enQuery: "want to gift an out-of-print book",
    },
    {
      id: "handmade_gift",
      zhQuery: "要不要做点手工礼物送人",
      enQuery: "thinking of a handmade gift this year",
    },
    {
      id: "wrap_less_gift",
      zhQuery: "要买礼品包装纸把礼盒包装得漂亮点",
      enQuery: "need wrapping paper for gift wrapping",
    },
    {
      id: "holiday_gift_cooldown",
      zhQuery: "平安夜才想起差点忘了买圣诞礼物",
      enQuery: "realized I forgot a gift, last-minute gift run",
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
    for (const entry of GREEN_ALT_ENTRIES_GIFTING) {
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

describe("green-alt-entries-gifting 不误伤", () => {
  it("「直播间刷礼物」仍命中 subscription 域 tipping_pause", () => {
    const result = suggestAlternative("又在直播间刷礼物上头了", "zh");
    expect(result?.id).toBe("tipping_pause");
  });

  it("「机场免税店买纪念品」仍命中 travel 域 souvenir_three_questions", () => {
    const result = suggestAlternative("机场免税店想买点纪念品", "zh");
    expect(result?.id).toBe("souvenir_three_questions");
  });

  it("「给孩子买绘本」仍命中 parenting 域 picturebook_library_swap — 送书有自己的域", () => {
    const result = suggestAlternative("想给孩子买绘本", "zh");
    expect(result?.id).toBe("picturebook_library_swap");
  });
});

describe("green-alt-entries-gifting 双语与红线", () => {
  it("同一 zh 查询, locale 切换输出语言", () => {
    const zh = suggestAlternative("朋友生日快到了, 得去买个生日礼物", "zh");
    const en = suggestAlternative("朋友生日快到了, 得去买个生日礼物", "en");
    expect(zh?.id).toBe("experience_gift_first");
    expect(en?.id).toBe("experience_gift_first");
    expect(zh?.message).toContain(zh!.alternative);
    expect(zh?.message).toContain(zh!.reuse);
    expect(zh?.message).not.toBe(en?.message);
  });

  it("composeMessage 输出: zh 无长英文串, en 无中文", () => {
    const zh = suggestAlternative("平安夜才想起差点忘了买圣诞礼物", "zh");
    const en = suggestAlternative("realized I forgot a gift, last-minute gift run", "en");
    expect(zh?.id).toBe("holiday_gift_cooldown");
    expect(zh?.message).not.toMatch(/[a-zA-Z]{3,}/);
    expect(en?.message).not.toMatch(/[\u4e00-\u9fff]/);
  });

  it("文案红线: 无碳足迹数值, 无说教/羞辱句式 (含「买不起」类暗示)", () => {
    for (const entry of GREEN_ALT_ENTRIES_GIFTING) {
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
