/**
 * batch83-b — green-alt-entries-wear 配套结构/触发/红线测试
 *
 * v9 §十五.2 长尾补测: 21 个品类词条文件里 wear 是注册表首位 (匹配优先级最高),
 * 4 词条: 象牙 → 玳瑁 → 皮草 → 动物皮革。文件头红线: "真皮草" 必须先命中皮草
 * 而非真皮 (顺序勿动) — 本文件专设顺序钉子。文案红线: 不说教, 无碳足迹数值。
 * 模板对齐 green-alt-entries-household.test.ts。
 */
import { describe, expect, it } from "vitest";

import { GREEN_ALT_ENTRIES_WEAR } from "@/lib/green-alt-entries-wear";
import { suggestAlternative } from "@/lib/green-alternatives";
import { greenAltCategoryOf, isKnownGreenAltEntry } from "@/lib/green-alt-category";
import { buildGreenKnowledge } from "@/app/api/chat/parts/green-knowledge-context";

// wear 是 GREEN_ALTERNATIVES 注册表第一段, 其之前没有任何词条 —
// 所有 trigger 必须严格命中自己的词条, 无豁免名单 (对比 household 测试的 FRONT_IDS)。
describe("green-alt-entries-wear 结构", () => {
  it("id 唯一且含 wear 域标记 (greenAltCategoryOf)", () => {
    const ids = GREEN_ALT_ENTRIES_WEAR.map((e) => e.id);
    expect(ids).toEqual(["ivory_bone_carving", "tortoiseshell", "fur", "animal_leather"]);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) {
      expect(greenAltCategoryOf(id)).toBe("wear");
      expect(isKnownGreenAltEntry(id)).toBe(true);
    }
  });

  it("每条 zh/en 关键词各 ≥3, 双语字段非空, options 2–3 条", () => {
    for (const entry of GREEN_ALT_ENTRIES_WEAR) {
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

describe("green-alt-entries-wear 触发", () => {
  const cases: Array<{ id: string; zhQuery: string; enQuery: string }> = [
    { id: "ivory_bone_carving", zhQuery: "想入手一件牙雕摆件", enQuery: "tempted by a bone carving ornament" },
    { id: "tortoiseshell", zhQuery: "看中一副玳瑁眼镜框", enQuery: "eyeing a tortoiseshell frame" },
    { id: "fur", zhQuery: "冬天想买件貂皮", enQuery: "want a mink coat for winter" },
    { id: "animal_leather", zhQuery: "想买鳄鱼皮包", enQuery: "want a crocodile bag" },
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

  it("每个 trigger 词 (zh+en) 都严格命中自己的词条 (注册表首位, 无豁免)", () => {
    for (const entry of GREEN_ALT_ENTRIES_WEAR) {
      for (const locale of ["zh", "en"] as const) {
        for (const trigger of entry.triggers[locale]) {
          const query = locale === "zh" ? `想买${trigger}` : `want to buy ${trigger}`;
          const result = suggestAlternative(query, locale);
          expect(result, `${locale} trigger "${trigger}"`).not.toBeNull();
          expect(result!.id).toBe(entry.id);
        }
      }
    }
  });
});

describe("green-alt-entries-wear 顺序红线 (文件头: 顺序勿动)", () => {
  it("「真皮草」命中皮草而非动物皮革 (fur 注册在 animal_leather 之前)", () => {
    expect(suggestAlternative("想买真皮草", "zh")?.id).toBe("fur");
    expect(suggestAlternative("a real fur coat", "en")?.id).toBe("fur");
  });

  it("「真皮」单独出现仍命中动物皮革 (两词条都可达)", () => {
    expect(suggestAlternative("想买真皮", "zh")?.id).toBe("animal_leather");
    expect(suggestAlternative("genuine leather shoes", "en")?.id).toBe("animal_leather");
  });
});

describe("green-alt-entries-wear 双语与红线", () => {
  it("同一 zh 查询, locale 切换输出语言", () => {
    const zh = suggestAlternative("想买件皮草外套", "zh");
    const en = suggestAlternative("想买件皮草外套", "en");
    expect(zh?.id).toBe("fur");
    expect(en?.id).toBe("fur");
    expect(zh?.message).toContain(zh!.alternative);
    expect(zh?.message).toContain(zh!.reuse);
    expect(zh?.message).not.toBe(en?.message);
  });

  it("composeMessage 输出: zh 无长英文串, en 无中文", () => {
    const zh = suggestAlternative("bone carving", "zh");
    const en = suggestAlternative("bone carving", "en");
    expect(zh?.id).toBe("ivory_bone_carving");
    expect(zh?.message).not.toMatch(/[a-zA-Z]{3,}/);
    expect(en?.message).not.toMatch(/[\u4e00-\u9fff]/);
  });

  it("文案红线: 无碳足迹数值, 无说教/羞辱句式", () => {
    for (const entry of GREEN_ALT_ENTRIES_WEAR) {
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

describe("green-alt-entries-wear 知识问答引用 (chat 路径)", () => {
  it("「象牙制品是什么」→ buildGreenKnowledge 引用 ivory_bone_carving", () => {
    const { contextBlock, card } = buildGreenKnowledge("象牙制品是什么", "zh", undefined);
    expect(card).not.toBeNull();
    expect(card!.entries.map((e) => e.id)).toContain("ivory_bone_carving");
    expect(contextBlock).toContain("[GREEN KNOWLEDGE:");
  });

  it("guard off → 双 null (开关语义不回归)", () => {
    const { contextBlock, card } = buildGreenKnowledge("象牙制品是什么", "zh", "off");
    expect(contextBlock).toBeNull();
    expect(card).toBeNull();
  });
});
