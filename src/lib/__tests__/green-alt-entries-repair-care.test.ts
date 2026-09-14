import { describe, expect, it } from "vitest";

import { GREEN_ALT_ENTRIES_REPAIR_CARE } from "@/lib/green-alt-entries-repair-care";
import { suggestAlternative } from "@/lib/green-alternatives";
import { greenAltCategoryOf, isKnownGreenAltEntry } from "@/lib/green-alt-category";

describe("green-alt-entries-repair-care 结构", () => {
  it("id 唯一且含 repair-care 域标记 (greenAltCategoryOf)", () => {
    const ids = GREEN_ALT_ENTRIES_REPAIR_CARE.map((e) => e.id);
    expect(ids).toEqual([
      "shoe_repair_first",
      "bag_care_repair",
      "clothes_mend_alter",
      "phone_battery_screen_repair",
      "appliance_checkup_repair",
      "bike_maintenance",
    ]);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) {
      expect(greenAltCategoryOf(id)).toBe("repair-care");
      expect(isKnownGreenAltEntry(id)).toBe(true);
    }
  });

  it("每条 zh/en 关键词各 ≥3, 双语字段非空, options 2-3 个", () => {
    for (const entry of GREEN_ALT_ENTRIES_REPAIR_CARE) {
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

  it("savingsHint 不千篇一律: 6 条 zh 互异且 en 互异", () => {
    const zh = GREEN_ALT_ENTRIES_REPAIR_CARE.map((e) => e.savingsHint.zh);
    const en = GREEN_ALT_ENTRIES_REPAIR_CARE.map((e) => e.savingsHint.en);
    expect(new Set(zh).size).toBe(zh.length);
    expect(new Set(en).size).toBe(en.length);
  });

  it("trigger 与既有 18 域零冲突: 每个新 trigger 只归属 repair-care 词条", () => {
    for (const entry of GREEN_ALT_ENTRIES_REPAIR_CARE) {
      for (const locale of ["zh", "en"] as const) {
        for (const trigger of entry.triggers[locale]) {
          // 包裹句本身避开所有既有 trigger 子串 (无 维修/repair/电池/battery/手机/新包 等)
          const query =
            locale === "zh"
              ? `${trigger}, 不想直接买新的`
              : `${trigger}, and I'd rather fix it than replace it`;
          const result = suggestAlternative(query, locale);
          expect(result, `${locale} trigger "${trigger}"`).not.toBeNull();
          expect(result!.id, `${locale} trigger "${trigger}"`).toBe(entry.id);
        }
      }
    }
  });
});

describe("green-alt-entries-repair-care 触发", () => {
  const cases: Array<{ id: string; zhQuery: string; enQuery: string }> = [
    {
      id: "shoe_repair_first",
      zhQuery: "鞋底磨了想去修鞋, 不想直接扔",
      enQuery: "the sole is coming off, need to resole my boots",
    },
    {
      id: "bag_care_repair",
      zhQuery: "这只包带断了, 找师傅换包带",
      enQuery: "the bag strap broke, looking to replace the strap",
    },
    {
      id: "clothes_mend_alter",
      zhQuery: "裤子太长, 想找裁缝改裤脚",
      enQuery: "trousers too long, need to hem my pants",
    },
    {
      id: "phone_battery_screen_repair",
      zhQuery: "屏幕摔碎了, 电量不耐用了, 纠结要不要换新的",
      enQuery: "cracked screen again and it won't hold a charge — replace or fix it?",
    },
    {
      id: "appliance_checkup_repair",
      zhQuery: "洗衣机响得厉害, 还不启动了",
      enQuery: "the washing machine is loud and the washer won't start",
    },
    {
      id: "bike_maintenance",
      zhQuery: "共享单车刹车不行了, 想约个保养",
      enQuery: "the brakes are squealing on my bike, time for a tune-up",
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

describe("green-alt-entries-repair-care 不误伤与让位 (route-order 锁定)", () => {
  it("既有维修词条让位不变: 裸 屏幕碎了/维修 仍命中 electronics repair_first", () => {
    expect(suggestAlternative("手机屏幕碎了", "zh")?.id).toBe("repair_first");
    expect(suggestAlternative("想送过去维修", "zh")?.id).toBe("repair_first");
    expect(suggestAlternative("need a repair shop", "en")?.id).toBe("repair_first");
    expect(suggestAlternative("broken screen, what now", "en")?.id).toBe("repair_first");
  });

  it("裸 电池/battery 仍命中 home batteries (购买语境), 本域不抢", () => {
    expect(suggestAlternative("电池不耐用了, 是不是该囤点备用的", "zh")?.id).toBe("batteries");
    expect(suggestAlternative("my battery is dying, should I buy spares", "en")?.id).toBe("batteries");
  });

  it("家具维修仍命中 furniture, 小家电购买仍命中 household", () => {
    expect(suggestAlternative("旧沙发翻新值不值", "zh")?.id).toBe("repair_reupholster");
    expect(suggestAlternative("想买新家电", "zh")?.id).toBe("small_appliance");
  });

  it("非维修购买讨论不触发本域: 买新鞋/new phone/换个包 仍走既有域", () => {
    expect(suggestAlternative("想买双新球鞋", "zh")?.id).toBe("limited_sneakers");
    expect(suggestAlternative("想买个新包", "zh")?.id).toBe("handbag_rotation");
    expect(suggestAlternative("I want a new phone", "en")?.id).toBe("refurb_gadget");
  });

  it("泛购买表述 (买新鞋/换个包) 在既有域本就无裸词承接, 本域不扩词抢接", () => {
    // apparel 无裸 「鞋」「包」 trigger: 泛表述维持现状不触发, 不由本域补位
    expect(suggestAlternative("就想买双新鞋", "zh")).toBeNull();
    expect(suggestAlternative("最近想换个包", "zh")).toBeNull();
  });

  it("纯闲聊与状态讨论不触发 (修表手艺/缝纫机/自行车颜色)", () => {
    expect(suggestAlternative("巷口修表匠手艺真好", "zh")).toBeNull();
    expect(suggestAlternative("奶奶的缝纫机还能用", "zh")).toBeNull();
    expect(suggestAlternative("the tailor did a great job on my suit", "en")).toBeNull();
    expect(suggestAlternative("my bike is red", "en")).toBeNull();
  });
});

describe("green-alt-entries-repair-care 双语与红线", () => {
  it("同一 zh 查询, locale 切换输出语言", () => {
    const zh = suggestAlternative("裤子太长想改裤脚", "zh");
    const en = suggestAlternative("裤子太长想改裤脚", "en");
    expect(zh?.id).toBe("clothes_mend_alter");
    expect(en?.id).toBe("clothes_mend_alter");
    expect(zh?.message).toContain(zh!.alternative);
    expect(zh?.message).toContain(zh!.reuse);
    expect(zh?.message).not.toBe(en?.message);
  });

  it("composeMessage 输出: zh 无长英文串, en 无中文", () => {
    const zh = suggestAlternative("鞋底磨了想去修鞋", "zh");
    const en = suggestAlternative("the sole is coming off, need to resole my boots", "en");
    expect(zh?.id).toBe("shoe_repair_first");
    expect(en?.id).toBe("shoe_repair_first");
    expect(zh?.message).not.toMatch(/[a-zA-Z]{3,}/);
    expect(en?.message).not.toMatch(/[\u4e00-\u9fff]/);
  });

  it("全字段 digit-free: 维修文案零数值 (无金额承诺/无维修报价/无碳足迹)", () => {
    for (const entry of GREEN_ALT_ENTRIES_REPAIR_CARE) {
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

  it("安全红线: 电器/手机/刹车文案只指专业检修, 无动手拆修指导与结果承诺", () => {
    const safetyEntries = GREEN_ALT_ENTRIES_REPAIR_CARE.filter((e) =>
      ["phone_battery_screen_repair", "appliance_checkup_repair", "bike_maintenance"].includes(e.id),
    );
    const bannedDiy = /自己拆|动手拆|拆机|跟着教程|自己修好|一定修好|保证修好|step-by-step|take it apart|disassemble|guarantee/i;
    for (const entry of safetyEntries) {
      for (const locale of ["zh", "en"] as const) {
        const text = [
          entry.why[locale],
          entry.alternative[locale],
          entry.reuse[locale],
          entry.reuseChannel[locale],
          entry.savingsHint[locale],
          ...entry.options[locale],
        ].join(" ");
        expect(text, `${entry.id} ${locale}`).not.toMatch(bannedDiy);
        expect(text, `${entry.id} ${locale}`).toMatch(
          locale === "zh" ? /官方|授权|售后|专业|车行/ : /official|authorized|service|professional|shop|technician/i,
        );
      }
    }
  });

  it("文案红线: 无说教/羞辱句式, 不暗示用户穷", () => {
    const banned = /你不该|不应该买|别买|乱花钱|买不起|小气|抠门|浪费钱|guilt|shame|you're poor|too poor|cheapskate|wasteful|shouldn't buy/i;
    for (const entry of GREEN_ALT_ENTRIES_REPAIR_CARE) {
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

  it("荣誉感叙事在位: 「修得好也是能力」框架贯穿鞋与手机词条", () => {
    const joined = GREEN_ALT_ENTRIES_REPAIR_CARE
      .flatMap((e) => [e.alternative.zh, e.alternative.en])
      .join(" ");
    expect(joined).toContain("修得好也是能力");
    expect(joined).toContain("fixing well is a skill");
    expect(joined).toContain("会照顾东西");
    expect(joined).toContain("caring for things");
  });
});
