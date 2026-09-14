import { describe, expect, it } from "vitest";

import { GREEN_ALT_ENTRIES_BEAUTY } from "@/lib/green-alt-entries-beauty";
import { suggestAlternative } from "@/lib/green-alternatives";

describe("green-alt-entries-beauty 触发", () => {
  const cases: Array<{ id: string; zhQuery: string; enQuery: string }> = [
    {
      id: "beauty_refill",
      zhQuery: "粉底快用完了，想买个替换装",
      enQuery: "looking for a foundation refill",
    },
    {
      id: "solid_cleanser",
      zhQuery: "想试试洗发皂好不好用",
      enQuery: "thinking of trying a shampoo bar",
    },
    {
      id: "skincare_hoard",
      zhQuery: "大促想囤精华",
      enQuery: "planning a skincare haul this sale",
    },
    {
      id: "lipstick_makeup",
      zhQuery: "想买个新口红",
      enQuery: "want a new lipstick for the weekend",
    },
    {
      id: "sheet_mask_pile",
      zhQuery: "直播间又囤面膜了",
      enQuery: "adding more sheet masks to my cart",
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

  it("每个 trigger 词 (zh+en) 都命中自己的词条", () => {
    const wearHomeIds = [
      "ivory_bone_carving",
      "tortoiseshell",
      "fur",
      "animal_leather",
      "single_use_plastic",
      "fast_fashion",
      "tissues",
      "batteries",
    ];
    for (const entry of GREEN_ALT_ENTRIES_BEAUTY) {
      for (const locale of ["zh", "en"] as const) {
        for (const trigger of entry.triggers[locale]) {
          const query =
            locale === "zh" ? `想买${trigger}` : `want to buy ${trigger}`;
          const result = suggestAlternative(query, locale);
          expect(result, `${locale} trigger "${trigger}"`).not.toBeNull();
          // 命中的要么是自身, 要么是排在前面的 wear/home 词条 (优先级)
          if (!wearHomeIds.includes(result!.id)) {
            expect(result!.id).toBe(entry.id);
          }
        }
      }
    }
  });
});

describe("green-alt-entries-beauty 不误伤", () => {
  it("solid 不匹配 solid wood table (trigger 要完整词组)", () => {
    expect(suggestAlternative("want a solid wood table", "en")).toBeNull();
  });

  it("家具/书等低相关查询不命中 beauty 词条", () => {
    expect(suggestAlternative("买木头桌子", "zh")).toBeNull();
    expect(suggestAlternative("想借一本新出的小说", "zh")).toBeNull();
    expect(suggestAlternative("face mask for diy woodwork", "en")).toBeNull();
  });
});

describe("green-alt-entries-beauty 双语", () => {
  it("同一 zh 查询, locale 切换输出语言", () => {
    const zh = suggestAlternative("想买个新口红", "zh");
    const en = suggestAlternative("想买个新口红", "en");
    expect(zh?.id).toBe("lipstick_makeup");
    expect(en?.id).toBe("lipstick_makeup");
    expect(zh?.message).toContain(zh!.alternative);
    expect(zh?.message).toContain(zh!.reuse);
    expect(zh?.message).not.toBe(en?.message);
  });

  it("composeMessage 输出: zh 无长英文串, en 无中文", () => {
    const zh = suggestAlternative("shampoo bar", "zh");
    const en = suggestAlternative("shampoo bar", "en");
    expect(zh?.id).toBe("solid_cleanser");
    expect(zh?.message).not.toMatch(/[a-zA-Z]{3,}/);
    expect(en?.message).not.toMatch(/[\u4e00-\u9fff]/);
  });
});

describe("green-alt-entries-beauty 端到端", () => {
  it("suggestAlternative 返回完整建议 (why/options/reuseChannel)", () => {
    const s = suggestAlternative("大促想囤精华", "zh");
    expect(s?.id).toBe("skincare_hoard");
    expect(s?.why).toBeTruthy();
    expect(s?.options.length).toBeGreaterThanOrEqual(2);
    expect(s?.options.length).toBeLessThanOrEqual(3);
    expect(s?.reuseChannel).toBeTruthy();
  });

  it("中英混排查询也能命中", () => {
    expect(suggestAlternative("想买个 foundation refill", "zh")?.id).toBe(
      "beauty_refill",
    );
  });
});
