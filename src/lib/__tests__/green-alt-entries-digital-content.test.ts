import { describe, expect, it } from "vitest";

import { GREEN_ALT_ENTRIES_DIGITAL_CONTENT } from "@/lib/green-alt-entries-digital-content";
import { suggestAlternative } from "@/lib/green-alternatives";
import { greenAltCategoryOf, isKnownGreenAltEntry } from "@/lib/green-alt-category";

describe("green-alt-entries-digital-content 结构", () => {
  it("id 唯一且含 digital-content 域标记 (greenAltCategoryOf)", () => {
    const ids = GREEN_ALT_ENTRIES_DIGITAL_CONTENT.map((e) => e.id);
    expect(ids).toHaveLength(6);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) {
      expect(greenAltCategoryOf(id)).toBe("digital-content");
      expect(isKnownGreenAltEntry(id)).toBe(true);
    }
  });

  it("每条 zh/en 关键词各 ≥3, 双语字段非空, options 2-3 个", () => {
    for (const entry of GREEN_ALT_ENTRIES_DIGITAL_CONTENT) {
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
    const zh = GREEN_ALT_ENTRIES_DIGITAL_CONTENT.map((e) => e.savingsHint.zh);
    const en = GREEN_ALT_ENTRIES_DIGITAL_CONTENT.map((e) => e.savingsHint.en);
    expect(new Set(zh).size).toBe(zh.length);
    expect(new Set(en).size).toBe(en.length);
  });

  it("trigger 与既有 16 域零冲突: 每个新 trigger 只归属 digital-content 词条", () => {
    for (const entry of GREEN_ALT_ENTRIES_DIGITAL_CONTENT) {
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
});

describe("green-alt-entries-digital-content 触发", () => {
  const cases: Array<{ id: string; zhQuery: string; enQuery: string }> = [
    {
      id: "ebook_repurchase",
      zhQuery: "我电子书又囤了三本",
      enQuery: "I keep buying ebooks I already own",
    },
    {
      id: "audiobook_stockpile",
      zhQuery: "又想买有声书了, 之前囤的还没听完",
      enQuery: "about to get another audiobook but my backlog is huge",
    },
    {
      id: "course_backlog_first",
      zhQuery: "看到一门新课又想买, 之前囤的网课还没看",
      enQuery: "tempted to buy another online class with a full course backlog",
    },
    {
      id: "cloud_storage_declutter",
      zhQuery: "网盘又满了, 想升级扩容",
      enQuery: "my drive is full, should I buy more storage",
    },
    {
      id: "music_repurchase",
      zhQuery: "想买张数字专辑支持偶像",
      enQuery: "thinking of buying the album for that one song",
    },
    {
      id: "design_asset_single_buy",
      zhQuery: "又看上一套字体素材想买",
      enQuery: "eyeing a design assets bundle for fonts and templates",
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

describe("green-alt-entries-digital-content 不误伤", () => {
  it("验收反例: 整理文档/听歌散步不是数字内容购买意图", () => {
    expect(suggestAlternative("帮我整理文档", "zh")).toBeNull();
    expect(suggestAlternative("听歌散步", "zh")).toBeNull();
    expect(suggestAlternative("organize my documents", "en")).toBeNull();
    expect(suggestAlternative("listening to music on a walk", "en")).toBeNull();
  });

  it("「买书/买教材」仍命中 office 域 — 电子书 trigger 不含 '买书' 子串也不抢纸质语境", () => {
    expect(suggestAlternative("下学期要买教材", "zh")?.id).toBe("textbook_secondhand");
    expect(suggestAlternative("打算买书, 一次多囤几本", "zh")?.id).toBe("textbook_digital_first");
    expect(suggestAlternative("want to buy the book for class", "en")?.id).toBe("textbook_digital_first");
  });

  it("「囤课/买网课」仍命中 subscription 域 activate_before_buy — 先激活旧卡语义优先", () => {
    expect(suggestAlternative("又想囤课了", "zh")?.id).toBe("activate_before_buy");
    expect(suggestAlternative("打算买网课", "zh")?.id).toBe("activate_before_buy");
    expect(suggestAlternative("should I buy a course", "en")?.id).toBe("activate_before_buy");
    expect(suggestAlternative("an online course caught my eye", "en")?.id).toBe("activate_before_buy");
  });

  it("「开音乐会员」仍命中 subscription 域 plan_sharing", () => {
    expect(suggestAlternative("想单开会员听歌", "zh")?.id).toBe("plan_sharing");
  });

  it("「给孩子买绘本」仍命中 parenting 域", () => {
    expect(suggestAlternative("给孩子买绘本", "zh")?.id).toBe("picturebook_library_swap");
  });
});

describe("green-alt-entries-digital-content 双语与红线", () => {
  it("同一 zh 查询, locale 切换输出语言", () => {
    const zh = suggestAlternative("我电子书又囤了三本", "zh");
    const en = suggestAlternative("我电子书又囤了三本", "en");
    expect(zh?.id).toBe("ebook_repurchase");
    expect(en?.id).toBe("ebook_repurchase");
    expect(zh?.message).toContain(zh!.alternative);
    expect(zh?.message).toContain(zh!.reuse);
    expect(zh?.message).not.toBe(en?.message);
  });

  it("composeMessage 输出: zh 无长英文串, en 无中文", () => {
    const zh = suggestAlternative("又想买有声书了", "zh");
    const en = suggestAlternative("another audiobook is calling me", "en");
    expect(zh?.id).toBe("audiobook_stockpile");
    expect(en?.id).toBe("audiobook_stockpile");
    expect(zh?.message).not.toMatch(/[a-zA-Z]{3,}/);
    expect(en?.message).not.toMatch(/[\u4e00-\u9fff]/);
  });

  it("全字段 digit-free: 数字内容文案零数值 (无碳足迹/无金额承诺)", () => {
    for (const entry of GREEN_ALT_ENTRIES_DIGITAL_CONTENT) {
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

  it("文案红线: 无说教/羞辱句式, 不暗示用户穷, 荣誉框架全暖色", () => {
    for (const entry of GREEN_ALT_ENTRIES_DIGITAL_CONTENT) {
      for (const locale of ["zh", "en"] as const) {
        const text = [
          entry.why[locale],
          entry.alternative[locale],
          entry.reuse[locale],
          entry.reuseChannel[locale],
          entry.savingsHint[locale],
          ...entry.options[locale],
        ].join(" ");
        expect(text, `${entry.id} ${locale}`).not.toMatch(/你不该|不应该买|别买|乱花钱|买不起|小气|抠门|浪费钱|guilt|shame|you're poor|too poor|cheapskate|wasteful|shouldn't buy/i);
      }
    }
  });

  it("荣誉感文案在位: 清醒拥有/资源库的体面措辞", () => {
    const joined = GREEN_ALT_ENTRIES_DIGITAL_CONTENT
      .flatMap((e) => [e.alternative.zh, e.reuse.zh, e.alternative.en, e.reuse.en])
      .join(" ");
    expect(joined).toContain("清醒");
    expect(joined).toContain("荣誉");
  });
});
