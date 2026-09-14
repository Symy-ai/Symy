import { describe, expect, it } from "vitest";

import { GREEN_ALT_ENTRIES_SUBSCRIPTION } from "@/lib/green-alt-entries-subscription";
import { suggestAlternative } from "@/lib/green-alternatives";
import { greenAltCategoryOf, isKnownGreenAltEntry } from "@/lib/green-alt-category";

// 排在 subscription 之前的词条 id (优先级豁免用): wear + home + beauty + electronics + food + apparel + household
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
];

describe("green-alt-entries-subscription 结构", () => {
  it("id 唯一且含 subscription 域标记 (greenAltCategoryOf)", () => {
    const ids = GREEN_ALT_ENTRIES_SUBSCRIPTION.map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) {
      expect(greenAltCategoryOf(id)).toBe("subscription");
      expect(isKnownGreenAltEntry(id)).toBe(true);
    }
  });

  it("每条 zh/en 关键词各 ≥3, 双语字段非空", () => {
    for (const entry of GREEN_ALT_ENTRIES_SUBSCRIPTION) {
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

describe("green-alt-entries-subscription 触发", () => {
  const cases: Array<{ id: string; zhQuery: string; enQuery: string }> = [
    {
      id: "subscription_audit",
      zhQuery: "月底又自动续费了一堆会员",
      enQuery: "another auto-renewal hit my card",
    },
    {
      id: "tipping_pause",
      zhQuery: "直播间想刷礼物上头了",
      enQuery: "tempted to send a tip to the streamer",
    },
    {
      id: "game_topup_math",
      zhQuery: "新池子出了，想氪金抽卡",
      enQuery: "new banner out, planning a game top-up",
    },
    {
      id: "activate_before_buy",
      zhQuery: "又想办一张新的健身卡",
      enQuery: "thinking about buying a gym membership again",
    },
    {
      id: "plan_sharing",
      zhQuery: "续视频会员前先看看家庭组",
      enQuery: "renewing my video subscription this month",
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
    for (const entry of GREEN_ALT_ENTRIES_SUBSCRIPTION) {
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

describe("green-alt-entries-subscription 不误伤", () => {
  it("「囤零食」仍命中 food 域 snack_hoarding", () => {
    const result = suggestAlternative("大促想囤零食", "zh");
    expect(result?.id).toBe("snack_hoarding");
  });

  it("「促销囤货」仍命中 household 域 promo_household_stockup", () => {
    const result = suggestAlternative("大促要不要促销囤货", "zh");
    expect(result?.id).toBe("promo_household_stockup");
  });
});

describe("green-alt-entries-subscription 双语与红线", () => {
  it("同一 zh 查询, locale 切换输出语言", () => {
    const zh = suggestAlternative("又想办一张新的健身卡", "zh");
    const en = suggestAlternative("又想办一张新的健身卡", "en");
    expect(zh?.id).toBe("activate_before_buy");
    expect(en?.id).toBe("activate_before_buy");
    expect(zh?.message).toContain(zh!.alternative);
    expect(zh?.message).toContain(zh!.reuse);
    expect(zh?.message).not.toBe(en?.message);
  });

  it("composeMessage 输出: zh 无长英文串, en 无中文", () => {
    const zh = suggestAlternative("游戏充值", "zh");
    const en = suggestAlternative("game top-up", "en");
    expect(zh?.id).toBe("game_topup_math");
    expect(zh?.message).not.toMatch(/[a-zA-Z]{3,}/);
    expect(en?.message).not.toMatch(/[\u4e00-\u9fff]/);
  });

  it("文案红线: 无碳足迹数值, 无说教/羞辱句式 (含「你穷」类暗示)", () => {
    for (const entry of GREEN_ALT_ENTRIES_SUBSCRIPTION) {
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
        expect(text, `${entry.id} ${locale}`).not.toMatch(/你不该|你不应|你应该感到|乱花钱|买不起|guilt|shame on you|you're poor|too poor/i);
      }
    }
  });
});
