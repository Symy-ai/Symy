import { describe, expect, it } from "vitest";

import { GREEN_ALT_ENTRIES_OFFICE } from "@/lib/green-alt-entries-office";
import { suggestAlternative } from "@/lib/green-alternatives";
import { greenAltCategoryOf, isKnownGreenAltEntry } from "@/lib/green-alt-category";

describe("green-alt-entries-office 结构", () => {
  it("id 唯一且含 office 域标记 (greenAltCategoryOf)", () => {
    const ids = GREEN_ALT_ENTRIES_OFFICE.map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) {
      expect(greenAltCategoryOf(id)).toBe("office");
      expect(isKnownGreenAltEntry(id)).toBe(true);
    }
  });

  it("每条 zh/en 关键词各 ≥3, 双语字段非空", () => {
    for (const entry of GREEN_ALT_ENTRIES_OFFICE) {
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

  it("trigger 与既有 15 域零冲突: 每个新 trigger 只归属 office 词条", () => {
    for (const entry of GREEN_ALT_ENTRIES_OFFICE) {
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

  it("域内顺序: 具体触发在前, 泛词垫后 ('买教材' 先中二手教材而非电子版优先, '打印机' 在开学泛词前)", () => {
    // '买教材' 含 textbook_secondhand 的 '教材' — secondhand 在 digital_first 之前
    expect(suggestAlternative("下学期开课, 要买教材了", "zh")?.id).toBe("textbook_secondhand");
    // 泛词 '买书' 单独出现命中 digital_first (域内第二顺位)
    expect(suggestAlternative("老师推荐了书单, 打算买书", "zh")?.id).toBe("textbook_digital_first");
    // '开学季买打印机' — printer_borrow 在 cooldown 之前 (设备词先于泛促销词)
    expect(suggestAlternative("开学季想添一台打印机", "zh")?.id).toBe("printer_borrow");
    // 泛促销词单独出现命中 cooldown (域内兜底)
    expect(suggestAlternative("开学季促销好多, 忍不住想囤", "zh")?.id).toBe("back_to_school_cooldown");
  });
});

describe("green-alt-entries-office 触发", () => {
  const cases: Array<{ id: string; zhQuery: string; enQuery: string }> = [
    {
      id: "textbook_secondhand",
      zhQuery: "新学期课本好贵, 一堆教材要买",
      enQuery: "the course books this semester cost a fortune, need every textbook",
    },
    {
      id: "textbook_digital_first",
      zhQuery: "老师又推了一摞书, 准备买书了",
      enQuery: "planning to buy the book for the seminar",
    },
    {
      id: "stationery_refill",
      zhQuery: "开学前去文具店买笔, 顺手囤点中性笔",
      enQuery: "stocking up before term, need to buy pens and some gel pens",
    },
    {
      id: "notebook_reuse",
      zhQuery: "新学期想买个新的本子记笔记",
      enQuery: "want a new notebook for the new term",
    },
    {
      id: "printer_borrow",
      zhQuery: "偶尔要打讲义, 要不要买台打印机",
      enQuery: "need to print handouts now and then, should I get a home printer",
    },
    {
      id: "back_to_school_cooldown",
      zhQuery: "返校季大促, 购物车塞满了",
      enQuery: "back to school sales are tempting, cart is full",
    },
    {
      id: "office_stationery_stock",
      zhQuery: "办公用品",
      enQuery: "stock up on office supplies before the quarter closes",
    },
    {
      id: "office_printer_supplies",
      zhQuery: "硒鼓",
      enQuery: "the toner cartridge is almost empty",
    },
    {
      id: "office_furniture_upgrade",
      zhQuery: "腰不好想换个椅子",
      enQuery: "my back hurts, time to upgrade my office chair",
    },
    {
      id: "office_event_supplies",
      zhQuery: "公司活动奖品买什么",
      enQuery: "time to order corporate event swag",
    },
    {
      id: "office_stationery_stock",
      zhQuery: "办公用品",
      enQuery: "stock up on office supplies before the quarter closes",
    },
    {
      id: "office_printer_supplies",
      zhQuery: "墨盒型号",
      enQuery: "which toner cartridge lasts longer",
    },
    {
      id: "office_furniture_upgrade",
      zhQuery: "腰不好想换个椅子",
      enQuery: "my back hurts, time to upgrade my office chair",
    },
    {
      id: "office_event_supplies",
      zhQuery: "公司活动奖品买什么",
      enQuery: "need corporate event swag for the annual meeting",
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

describe("green-alt-entries-office 不误伤", () => {
  it("「open the app」/「cheap phone」不触发 stationery — 裸 pen 红线 ('open'/'cheap' 含 pen 子串)", () => {
    expect(suggestAlternative("open the app for me", "en")).toBeNull();
    expect(suggestAlternative("looking for a cheap phone", "en")).toBeNull();
    expect(suggestAlternative("the shop opens at nine", "en")).toBeNull();
    expect(suggestAlternative("my monthly expenses are high", "en")).toBeNull();
  });

  it("「a plain notebook」不触发 notebook_reuse — 日常提及不是购买意图", () => {
    expect(suggestAlternative("a plain notebook on the desk", "en")).toBeNull();
  });

  it("「笔记本电脑」仍命中 electronics 域 — 纸本 '本子' 系 trigger 不抢", () => {
    expect(suggestAlternative("想换台笔记本电脑", "zh")?.id).toBe("refurb_gadget");
  });

  it("「printer paper」命中 printer_borrow 方向正确", () => {
    expect(suggestAlternative("need printer paper for the lecture notes", "en")?.id).toBe("printer_borrow");
  });

  it("「买绘本」仍命中 parenting 域 — office 域 '买书' 系 trigger 不抢", () => {
    expect(suggestAlternative("给孩子买绘本", "zh")?.id).toBe("picturebook_library_swap");
  });

  it("「二手书送礼」仍命中 gifting 域", () => {
    expect(suggestAlternative("想送书给朋友当乔迁礼", "zh")?.id).toBe("secondhand_book_gift");
  });

  it("「公司内部会议物料」命中 office, 「年会伴手礼」让位 travel", () => {
    expect(suggestAlternative("公司内部会议物料", "zh")?.id).toBe("office_event_supplies");
    expect(suggestAlternative("年会伴手礼选什么", "zh")?.id).toBe("souvenir_three_questions");
  });
});

describe("green-alt-entries-office 双语与红线", () => {
  it("同一 zh 查询, locale 切换输出语言", () => {
    const zh = suggestAlternative("想买台打印机, 偶尔打印用", "zh");
    const en = suggestAlternative("想买台打印机, 偶尔打印用", "en");
    expect(zh?.id).toBe("printer_borrow");
    expect(en?.id).toBe("printer_borrow");
    expect(zh?.message).toContain(zh!.alternative);
    expect(zh?.message).toContain(zh!.reuse);
    expect(zh?.message).not.toBe(en?.message);
  });

  it("composeMessage 输出: zh 无长英文串, en 无中文", () => {
    const zh = suggestAlternative("笔写完了, 又要买笔", "zh");
    const en = suggestAlternative("my pen is out, time to buy pens again", "en");
    expect(zh?.id).toBe("stationery_refill");
    expect(en?.id).toBe("stationery_refill");
    expect(zh?.message).not.toMatch(/[a-zA-Z]{3,}/);
    expect(en?.message).not.toMatch(/[\u4e00-\u9fff]/);
  });

  it("文案红线: 无碳足迹/环保数值, 无说教/羞辱句式 (学生党预算语境全暖色)", () => {
    for (const entry of GREEN_ALT_ENTRIES_OFFICE) {
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
        expect(text, `${entry.id} ${locale}`).not.toMatch(/你不该|你不应|你应该感到|乱花钱|买不起|小气|抠门|穷学生|guilt|shame on you|you're poor|too poor|cheapskate|broke student/i);
      }
    }
  });

  it("why 字段 digit-free (全局红线)", () => {
    for (const entry of GREEN_ALT_ENTRIES_OFFICE) {
      for (const locale of ["zh", "en"] as const) {
        expect(entry.why[locale], `${entry.id} ${locale}`).not.toMatch(/\d/);
      }
    }
  });
});
