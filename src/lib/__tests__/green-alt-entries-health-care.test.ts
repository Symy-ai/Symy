import { describe, expect, it } from "vitest";

import { GREEN_ALT_ENTRIES_HEALTH_CARE } from "@/lib/green-alt-entries-health-care";
import { suggestAlternative } from "@/lib/green-alternatives";
import { greenAltCategoryOf, isKnownGreenAltEntry } from "@/lib/green-alt-category";

describe("green-alt-entries-health-care 结构", () => {
  it("id 唯一且含 health-care 域标记 (greenAltCategoryOf)", () => {
    const ids = GREEN_ALT_ENTRIES_HEALTH_CARE.map((e) => e.id);
    expect(ids).toEqual([
      "medicine_expiry_audit",
      "contact_lens_supply_pace",
      "beauty_device_idle_check",
      "fragrance_rotation",
      "vitamin_duplicate_check",
    ]);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) {
      expect(greenAltCategoryOf(id)).toBe("health-care");
      expect(isKnownGreenAltEntry(id)).toBe(true);
    }
  });

  it("每条 zh/en 关键词各 ≥3, 双语字段非空, options 2-3 个", () => {
    for (const entry of GREEN_ALT_ENTRIES_HEALTH_CARE) {
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

  it("savingsHint 不千篇一律: 5 条 zh 互异且 en 互异", () => {
    const zh = GREEN_ALT_ENTRIES_HEALTH_CARE.map((e) => e.savingsHint.zh);
    const en = GREEN_ALT_ENTRIES_HEALTH_CARE.map((e) => e.savingsHint.en);
    expect(new Set(zh).size).toBe(zh.length);
    expect(new Set(en).size).toBe(en.length);
  });

  it("trigger 与既有 17 域零冲突: 每个新 trigger 只归属 health-care 词条", () => {
    for (const entry of GREEN_ALT_ENTRIES_HEALTH_CARE) {
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

  it("触发语义红线: 所有触发词带购买/囤积动作语素, 不收裸品类词", () => {
    const actionMorpheme: Record<"zh" | "en", RegExp> = {
      zh: /(买|囤|换新|入手)/,
      en: /(buy|stock|haul|hoard|repurchase|upgrade|another)/,
    };
    for (const entry of GREEN_ALT_ENTRIES_HEALTH_CARE) {
      for (const locale of ["zh", "en"] as const) {
        for (const trigger of entry.triggers[locale]) {
          expect(trigger, `${locale} trigger "${trigger}"`).toMatch(actionMorpheme[locale]);
        }
      }
    }
  });
});

describe("green-alt-entries-health-care 触发", () => {
  const cases: Array<{ id: string; zhQuery: string; enQuery: string }> = [
    {
      id: "medicine_expiry_audit",
      zhQuery: "换季了想囤感冒药备着, 顺手再囤点退烧药",
      enQuery: "should I stock up on medicine for the cold season",
    },
    {
      id: "contact_lens_supply_pace",
      zhQuery: "直播间又想囤美瞳了, 上次的还没拆完",
      enQuery: "there's a deal and I want to stock up on contact lenses",
    },
    {
      id: "beauty_device_idle_check",
      zhQuery: "想入手美容仪, 家里那台还没怎么用",
      enQuery: "tempted into buying a beauty gadget while mine sits idle",
    },
    {
      id: "fragrance_rotation",
      zhQuery: "柜子里还有几瓶没喷完, 又想入手香水了",
      enQuery: "another perfume haul and my shelf isn't empty yet",
    },
    {
      id: "vitamin_duplicate_check",
      zhQuery: "想买维生素囤着, 之前买的好像还没吃完",
      enQuery: "about to buy vitamins but I already have two open bottles",
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

describe("green-alt-entries-health-care 不误伤", () => {
  it("验收反例: 非购买讨论 (吃维生素/找药箱/涂防晒) 不触发", () => {
    expect(suggestAlternative("我在吃维生素, 感觉状态不错", "zh")).toBeNull();
    expect(suggestAlternative("药箱在哪里放着来着", "zh")).toBeNull();
    expect(suggestAlternative("今天涂了防晒再出门", "zh")).toBeNull();
    expect(suggestAlternative("I take vitamins every morning", "en")).toBeNull();
    expect(suggestAlternative("where did I put the medicine cabinet key", "en")).toBeNull();
    expect(suggestAlternative("wearing sunscreen today", "en")).toBeNull();
  });

  it("使用与提问语境不触发 (美容仪怎么用/护理液辣眼睛)", () => {
    expect(suggestAlternative("美容仪怎么用才对", "zh")).toBeNull();
    expect(suggestAlternative("这瓶香水好闻吗", "zh")).toBeNull();
    expect(suggestAlternative("how do I use my beauty device", "en")).toBeNull();
  });

  it("补剂类不吞 sports 域: 蛋白粉/运动补剂仍命中 supplement_stockup_math", () => {
    expect(suggestAlternative("教练让我囤蛋白粉", "zh")?.id).toBe("supplement_stockup_math");
    expect(suggestAlternative("大促想囤运动补剂", "zh")?.id).toBe("supplement_stockup_math");
    expect(suggestAlternative("planning my workout supplements stack", "en")?.id).toBe("supplement_stockup_math");
  });

  it("药品类不吞 pets 域: 宠物药仍命中 pet_medicine_vet_first", () => {
    expect(suggestAlternative("宠物药品大促想多囤", "zh")?.id).toBe("pet_medicine_vet_first");
    expect(suggestAlternative("我家猫的驱虫药囤一些", "zh")?.id).toBe("pet_medicine_vet_first");
  });

  it("护肤类不吞 beauty 域: 囤护肤品/替换装仍命中 beauty 词条", () => {
    expect(suggestAlternative("换季想囤护肤品", "zh")?.id).toBe("skincare_hoard");
    expect(suggestAlternative("想买替换装", "zh")?.id).toBe("beauty_refill");
  });

  it("会员/团购表述不误接: 订阅语境仍命中 subscription 域", () => {
    expect(suggestAlternative("想开视频会员", "zh")?.id).toBe("plan_sharing");
    expect(suggestAlternative("健身卡续费划算吗", "zh")?.id).toBe("subscription_audit");
  });

  it("穿搭表述不误接: 买衣服仍命中 apparel 域", () => {
    expect(suggestAlternative("想买新衣服", "zh")?.id).toBe("new_clothes");
    expect(suggestAlternative("need new workout clothes", "en")?.id).toBe("sportswear_capsule");
  });
});

describe("green-alt-entries-health-care 双语与红线", () => {
  it("同一 zh 查询, locale 切换输出语言", () => {
    const zh = suggestAlternative("想买维生素囤着", "zh");
    const en = suggestAlternative("想买维生素囤着", "en");
    expect(zh?.id).toBe("vitamin_duplicate_check");
    expect(en?.id).toBe("vitamin_duplicate_check");
    expect(zh?.message).toContain(zh!.alternative);
    expect(zh?.message).toContain(zh!.reuse);
    expect(zh?.message).not.toBe(en?.message);
  });

  it("composeMessage 输出: zh 无长英文串, en 无中文", () => {
    const zh = suggestAlternative("直播间又想囤美瞳了", "zh");
    const en = suggestAlternative("want to stock up on contact lenses", "en");
    expect(zh?.id).toBe("contact_lens_supply_pace");
    expect(en?.id).toBe("contact_lens_supply_pace");
    expect(zh?.message).not.toMatch(/[a-zA-Z]{3,}/);
    expect(en?.message).not.toMatch(/[\u4e00-\u9fff]/);
  });

  it("全字段 digit-free: 健康个护文案零数值 (无金额承诺/无碳足迹/无剂量暗示)", () => {
    for (const entry of GREEN_ALT_ENTRIES_HEALTH_CARE) {
      for (const locale of ["zh", "en"] as const) {
        const text = [
          entry.why[locale],
          entry.alternative[locale],
          entry.reuse[locale],
          entry.reuseChannel[locale],
          entry.savingsHint[locale],
          ...entry.options[locale],
        ].join(" ");
        expect(text, `${entry.id} ${locale}`).not.toMatch(/\d/);
        expect(text, `${entry.id} ${locale}`).not.toMatch(/\$\d|¥\d/);
      }
    }
  });

  it("医疗红线: 零剂量/疗效/诊断/用药建议措辞", () => {
    const banned = /剂量|疗效|治愈|治疗|诊断|处方|对症|dosage|dose|prescrib|diagnos|cure|treat/i;
    for (const entry of GREEN_ALT_ENTRIES_HEALTH_CARE) {
      for (const locale of ["zh", "en"] as const) {
        const text = [
          entry.why[locale],
          entry.alternative[locale],
          entry.reuse[locale],
          entry.reuseChannel[locale],
          entry.savingsHint[locale],
          ...entry.options[locale],
        ].join(" ");
        expect(text, `${entry.id} ${locale}`).not.toMatch(banned);
      }
    }
  });

  it("文案红线: 无说教/羞辱句式, 不暗示用户穷, 不制造外貌焦虑", () => {
    const banned = /你不该|不应该买|别买|乱花钱|买不起|小气|抠门|浪费钱|变丑|显老|guilt|shame|you're poor|too poor|cheapskate|wasteful|shouldn't buy|ugly|aging skin/i;
    for (const entry of GREEN_ALT_ENTRIES_HEALTH_CARE) {
      for (const locale of ["zh", "en"] as const) {
        const text = [
          entry.why[locale],
          entry.alternative[locale],
          entry.reuse[locale],
          entry.reuseChannel[locale],
          entry.savingsHint[locale],
          ...entry.options[locale],
        ].join(" ");
        expect(text, `${entry.id} ${locale}`).not.toMatch(banned);
      }
    }
  });

  it("荣誉感叙事在位: 「刚刚好的照顾」框架贯穿药品与维生素词条", () => {
    const joined = GREEN_ALT_ENTRIES_HEALTH_CARE
      .flatMap((e) => [e.reuse.zh, e.reuse.en])
      .join(" ");
    expect(joined).toContain("刚刚好");
    expect(joined).toContain("just-right care");
  });
});
