import { describe, expect, it } from "vitest";

import { GREEN_ALT_ENTRIES_GARDEN } from "@/lib/green-alt-entries-garden";
import { suggestAlternative } from "@/lib/green-alternatives";
import { greenAltCategoryOf, isKnownGreenAltEntry } from "@/lib/green-alt-category";

describe("green-alt-entries-garden 结构", () => {
  it("id 唯一且含 garden 域标记 (greenAltCategoryOf)", () => {
    const ids = GREEN_ALT_ENTRIES_GARDEN.map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) {
      expect(greenAltCategoryOf(id)).toBe("garden");
      expect(isKnownGreenAltEntry(id)).toBe(true);
    }
  });

  it("每条 zh/en 关键词各 ≥3, 双语字段非空", () => {
    for (const entry of GREEN_ALT_ENTRIES_GARDEN) {
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

  it("trigger 与既有 14 域零冲突: 每个新 trigger 只归属 garden 词条", () => {
    for (const entry of GREEN_ALT_ENTRIES_GARDEN) {
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

  it("域内顺序: 具体触发在前, 泛词垫后 ('买花盆' 先中花盆而非换苗, '园艺工具' 先中工具)", () => {
    // '买花盆' 同时含 secondhand_pots 的 '花盆' 与 plant_swap 的 '买花' — pots 在前
    expect(suggestAlternative("买花盆和土, 开始阳台种菜", "zh")?.id).toBe("secondhand_pots_first");
    // '园艺工具' 含 garden_tools 自己的泛词 '园艺', 但也先于 water_wise 的 '浇水' 系 ('浇水壶')
    expect(suggestAlternative("入一套园艺工具和浇水壶", "zh")?.id).toBe("garden_tools_borrow");
    // 泛词 '园艺' 单独出现仍命中工具词条 (域内兜底)
    expect(suggestAlternative("最近入坑园艺了", "zh")?.id).toBe("garden_tools_borrow");
    // '买苗' (seeds) 先于 '买绿植' (swap) — 具体动词先中
    expect(suggestAlternative("春天到了, 买苗还是买绿植", "zh")?.id).toBe("seeds_over_seedlings");
  });
});

describe("green-alt-entries-garden 触发", () => {
  const cases: Array<{ id: string; zhQuery: string; enQuery: string }> = [
    {
      id: "garden_tools_borrow",
      zhQuery: "开春修枝, 想买把剪枝剪和一套园艺工具",
      enQuery: "spring pruning, thinking of buying pruning shears and garden tools",
    },
    {
      id: "secondhand_pots_first",
      zhQuery: "阳台上盆, 打算囤一批陶盆花盆",
      enQuery: "repotting the balcony, planning to stock up on terracotta pots and flower pots",
    },
    {
      id: "seeds_over_seedlings",
      zhQuery: "种番茄, 直接买苗还是自己播种",
      enQuery: "growing tomatoes, buy seedlings or start from seed",
    },
    {
      id: "plant_swap_community",
      zhQuery: "想换苗装点客厅, 有什么推荐",
      enQuery: "want to buy houseplants for the living room, any recs",
    },
    {
      id: "compost_over_chemical",
      zhQuery: "种菜要用化肥还是自己堆肥",
      enQuery: "for the veggies, chemical fertilizer or start composting",
    },
    {
      id: "water_wise_watering",
      zhQuery: "夏天每天浇花, 水费有点高",
      enQuery: "watering the garden every day in summer, water bill is creeping up",
    },
    {
      id: "garden_plant_starter",
      zhQuery: "想买盆栽放阳台",
      enQuery: "I want to buy a potted plant for the balcony",
    },
    {
      id: "plant_swap_community",
      zhQuery: "想买花送妈妈",
      enQuery: "who wants plant cuttings today",
    },
    {
      id: "garden_outdoor_furniture",
      zhQuery: "露台桌椅要换一套",
      enQuery: "need new patio furniture for the terrace",
    },
    {
      id: "garden_tool_set",
      zhQuery: "割草机怎么租",
      enQuery: "where can I rent a lawn mower",
    },
    {
      id: "garden_pot_collection",
      zhQuery: "花器哪款透气",
      enQuery: "which ceramic planter has good drainage",
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

describe("green-alt-entries-garden 不误伤", () => {
  it("「做 ppt」不命中本域 — powerpoint/长尾含 pot 子串也不越界", () => {
    const zh = suggestAlternative("帮我改下 powerpoint 的排版", "zh");
    const en = suggestAlternative("need to finish my powerpoint deck tonight", "en");
    expect(zh).toBeNull();
    expect(en).toBeNull();
  });

  it("「power plant / planted」等 plant 长尾不命中本域", () => {
    expect(suggestAlternative("the power plant tour was fascinating", "en")).toBeNull();
    expect(suggestAlternative("she planted tulips years ago", "en")).toBeNull();
  });

  it("「买地毯清洗机」仍命中 furniture 域 borrow_rare_tools", () => {
    const en = suggestAlternative("need a carpet cleaner for the rugs", "en");
    expect(en?.id).toBe("borrow_rare_tools");
  });

  it("「买肥料」仍命中 garden 域堆肥词条", () => {
    expect(suggestAlternative("买肥料", "zh")?.id).toBe("compost_over_chemical");
  });

  it("「囤蛋白粉」仍命中 sports 域补剂囤货词条", () => {
    const result = suggestAlternative("健身补剂打折, 囤点蛋白粉", "zh");
    expect(result?.id).toBe("supplement_stockup_math");
  });

  it("「瓶装水」仍命中 food 域 — garden 域 water 系 trigger 不抢", () => {
    const zh = suggestAlternative("想囤一箱瓶装水", "zh");
    const en = suggestAlternative("a case of water for the road trip", "en");
    expect(zh?.id).toBe("bottled_water");
    expect(en?.id).toBe("bottled_water");
  });
});

describe("green-alt-entries-garden 双语与红线", () => {
  it("同一 zh 查询, locale 切换输出语言", () => {
    const zh = suggestAlternative("想买花盆, 去哪看好", "zh");
    const en = suggestAlternative("想买花盆, 去哪看好", "en");
    expect(zh?.id).toBe("secondhand_pots_first");
    expect(en?.id).toBe("secondhand_pots_first");
    expect(zh?.message).toContain(zh!.alternative);
    expect(zh?.message).toContain(zh!.reuse);
    expect(zh?.message).not.toBe(en?.message);
  });

  it("composeMessage 输出: zh 无长英文串, en 无中文", () => {
    const zh = suggestAlternative("菜苗买现成的还是播种", "zh");
    const en = suggestAlternative("should I buy seedlings or sow seeds", "en");
    expect(zh?.id).toBe("seeds_over_seedlings");
    expect(zh?.message).not.toMatch(/[a-zA-Z]{3,}/);
    expect(en?.message).not.toMatch(/[\u4e00-\u9fff]/);
  });

  it("文案红线: 无碳足迹/环保数值, 无说教/羞辱句式", () => {
    for (const entry of GREEN_ALT_ENTRIES_GARDEN) {
      for (const locale of ["zh", "en"] as const) {
        const text = [
          entry.why[locale],
          entry.alternative[locale],
          entry.reuse[locale],
          entry.reuseChannel[locale],
          ...entry.options[locale],
        ].join(" ");
        expect(text, `${entry.id} ${locale}`).not.toMatch(/\d+\s*(kg|t|吨|千克|克)\s*(碳|CO2|co2)/i);
        expect(text, `${entry.id} ${locale}`).not.toMatch(/carbon footprint of \d|reduces?\s+\d+\s*(kg|ton)/i);
        expect(text, `${entry.id} ${locale}`).not.toMatch(/你不该|你不应|你应该感到|乱花钱|买不起|小气|抠门|guilt|shame on you|you're poor|too poor|cheapskate|downgrade/i);
      }
    }
  });

  it("堆肥词条定性 only: 全字段无碳/减排数值声明", () => {
    const compost = GREEN_ALT_ENTRIES_GARDEN.find((e) => e.id === "compost_over_chemical")!;
    for (const locale of ["zh", "en"] as const) {
      const text = [
        compost.why[locale],
        compost.alternative[locale],
        compost.reuse[locale],
        compost.reuseChannel[locale],
        ...compost.options[locale],
        compost.savingsHint[locale],
      ].join(" ");
      expect(text, `compost ${locale}`).not.toMatch(/碳|排放|CO2|co2|carbon|emission|offset/i);
    }
  });
});
