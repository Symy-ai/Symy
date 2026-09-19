/**
 * batch83-b — green-alt-entries-home 配套结构/触发/红线测试
 *
 * v9 §十五.2 长尾补测: home 是注册表第二段 (wear 之后), 4 词条:
 * 一次性塑料 → 快时尚 → 纸巾 → 电池。文案红线: 不说教, 无碳足迹数值,
 * 荣誉框架。模板对齐 green-alt-entries-household.test.ts。
 */
import { describe, expect, it } from "vitest";

import { GREEN_ALT_ENTRIES_HOME } from "@/lib/green-alt-entries-home";
import { suggestAlternative } from "@/lib/green-alternatives";
import { greenAltCategoryOf, isKnownGreenAltEntry } from "@/lib/green-alt-category";
import { buildGreenKnowledge } from "@/app/api/chat/parts/green-knowledge-context";

// 排在 home 之前的词条 id (优先级豁免用): wear 段 4 词条
const FRONT_IDS = ["ivory_bone_carving", "tortoiseshell", "fur", "animal_leather"];

describe("green-alt-entries-home 结构", () => {
  it("id 唯一且含 home 域标记 (greenAltCategoryOf)", () => {
    const ids = GREEN_ALT_ENTRIES_HOME.map((e) => e.id);
    expect(ids).toEqual(["single_use_plastic", "fast_fashion", "tissues", "batteries"]);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) {
      expect(greenAltCategoryOf(id)).toBe("home");
      expect(isKnownGreenAltEntry(id)).toBe(true);
    }
  });

  it("每条 zh/en 关键词各 ≥3, 双语字段非空, options 2–3 条", () => {
    for (const entry of GREEN_ALT_ENTRIES_HOME) {
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

describe("green-alt-entries-home 触发", () => {
  const cases: Array<{ id: string; zhQuery: string; enQuery: string }> = [
    { id: "single_use_plastic", zhQuery: "又被种草一次性餐具了", enQuery: "tempted by more plastic straws" },
    { id: "fast_fashion", zhQuery: "直播间上新想囤几件", enQuery: "a fashion haul video tempted me" },
    { id: "tissues", zhQuery: "家里纸巾快用完了", enQuery: "running out of paper towels" },
    { id: "batteries", zhQuery: "遥控器该换电池了", enQuery: "need new batteries for the remote" },
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

  it("每个 trigger 词 (zh+en) 都命中自己的词条 (或更前面的 wear 词条)", () => {
    for (const entry of GREEN_ALT_ENTRIES_HOME) {
      for (const locale of ["zh", "en"] as const) {
        for (const trigger of entry.triggers[locale]) {
          const query = locale === "zh" ? `想买${trigger}` : `want to buy ${trigger}`;
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

describe("green-alt-entries-home 不误伤与注册顺序", () => {
  it("「囤纸巾」命中 home 域 tissues (household 在其后, 不得抢跑)", () => {
    expect(suggestAlternative("大促想囤纸巾", "zh")?.id).toBe("tissues");
    expect(suggestAlternative("大促想囤抽纸", "zh")?.id).toBe("tissues");
  });

  it("「买纽扣电池」命中 home 域 batteries", () => {
    expect(suggestAlternative("想买几节纽扣电池", "zh")?.id).toBe("batteries");
  });

  it("wear 与 home trigger 同时出现 → wear 先命中 (注册表顺序)", () => {
    expect(suggestAlternative("皮草和塑料袋都想要", "zh")?.id).toBe("fur");
  });
});

describe("green-alt-entries-home 双语与红线", () => {
  it("同一 zh 查询, locale 切换输出语言", () => {
    const zh = suggestAlternative("快递打包袋攒了一堆", "zh");
    const en = suggestAlternative("快递打包袋攒了一堆", "en");
    expect(zh?.id).toBe("single_use_plastic");
    expect(en?.id).toBe("single_use_plastic");
    expect(zh?.message).toContain(zh!.alternative);
    expect(zh?.message).toContain(zh!.reuse);
    expect(zh?.message).not.toBe(en?.message);
  });

  it("composeMessage 输出: zh 无长英文串, en 无中文", () => {
    const zh = suggestAlternative("paper napkins", "zh");
    const en = suggestAlternative("paper napkins", "en");
    expect(zh?.id).toBe("tissues");
    expect(zh?.message).not.toMatch(/[a-zA-Z]{3,}/);
    expect(en?.message).not.toMatch(/[\u4e00-\u9fff]/);
  });

  it("文案红线: 无碳足迹数值, 无说教/羞辱句式", () => {
    for (const entry of GREEN_ALT_ENTRIES_HOME) {
      for (const locale of ["zh", "en"] as const) {
        const text = [
          entry.why[locale],
          entry.alternative[locale],
          entry.reuse[locale],
          entry.reuseChannel[locale],
          entry.savingsHint[locale],
          ...entry.options[locale],
        ].join(" ");
        expect(text, `${entry.id} ${locale}`).not.toMatch(/\d+\s*(kg|t|吨|千克|克)\s*(碳|CO2|co2)/i);
        expect(text, `${entry.id} ${locale}`).not.toMatch(/carbon footprint of \d/i);
        expect(text, `${entry.id} ${locale}`).not.toMatch(/你不该|你不应|你应该感到|乱花钱|guilt|shame on you/i);
      }
    }
  });
});

describe("green-alt-entries-home 知识问答引用 (chat 路径)", () => {
  it("「充电电池值得买吗」→ buildGreenKnowledge 引用 batteries (泛化价值问句按知识处理)", () => {
    const { contextBlock, card } = buildGreenKnowledge("充电电池值得买吗", "zh", undefined);
    expect(card).not.toBeNull();
    expect(card!.entries.map((e) => e.id)).toContain("batteries");
    expect(contextBlock).toContain("[GREEN KNOWLEDGE:");
  });

  it("「纸巾环保吗」→ 引用 tissues", () => {
    const { card } = buildGreenKnowledge("纸巾环保吗", "zh", undefined);
    expect(card).not.toBeNull();
    expect(card!.entries.map((e) => e.id)).toContain("tissues");
  });

  it("guard off → 双 null (开关语义不回归)", () => {
    const { contextBlock, card } = buildGreenKnowledge("充电电池值得买吗", "zh", "off");
    expect(contextBlock).toBeNull();
    expect(card).toBeNull();
  });
});
