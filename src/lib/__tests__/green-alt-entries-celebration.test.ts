import { describe, expect, it } from "vitest";

import { GREEN_ALT_ENTRIES_CELEBRATION } from "@/lib/green-alt-entries-celebration";
import { suggestAlternative } from "@/lib/green-alternatives";
import { greenAltCategoryOf, isKnownGreenAltEntry } from "@/lib/green-alt-category";

describe("green-alt-entries-celebration 结构", () => {
  it("id 唯一且含 celebration 域标记 (greenAltCategoryOf)", () => {
    const ids = GREEN_ALT_ENTRIES_CELEBRATION.map((e) => e.id);
    expect(ids).toEqual([
      "wedding_decor_rental",
      "wedding_return_gift",
      "birthday_party_experience",
      "festival_decor_reuse",
      "housewarming_open_house",
      "office_gift_exchange",
      "elder_celebration_together",
      "favor_homemade_local",
    ]);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) {
      expect(greenAltCategoryOf(id)).toBe("celebration");
      expect(isKnownGreenAltEntry(id)).toBe(true);
    }
  });

  it("每条 zh/en 关键词各 ≥3, 双语字段非空, options 2-3 个", () => {
    for (const entry of GREEN_ALT_ENTRIES_CELEBRATION) {
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

  it("savingsHint 不千篇一律: 8 条 zh 互异且 en 互异", () => {
    const zh = GREEN_ALT_ENTRIES_CELEBRATION.map((e) => e.savingsHint.zh);
    const en = GREEN_ALT_ENTRIES_CELEBRATION.map((e) => e.savingsHint.en);
    expect(new Set(zh).size).toBe(zh.length);
    expect(new Set(en).size).toBe(en.length);
  });

  it("trigger 与既有 19 域零冲突: 每个新 trigger 只归属 celebration 词条", () => {
    for (const entry of GREEN_ALT_ENTRIES_CELEBRATION) {
      for (const locale of ["zh", "en"] as const) {
        for (const trigger of entry.triggers[locale]) {
          // 裸 trigger 作为查询即需命中本条 (任何既有 trigger 子串抢命中都会在此暴露)
          const result = suggestAlternative(trigger, locale);
          expect(result, `${locale} trigger "${trigger}"`).not.toBeNull();
          expect(result!.id, `${locale} trigger "${trigger}"`).toBe(entry.id);
        }
      }
    }
  });
});

describe("green-alt-entries-celebration 触发", () => {
  // 每条 ≥2 个 zh 采购触发 query + ≥2 个 en (验收标准: 每条 zh/en 各至少 2 个)
  const cases: Array<{ id: string; zhQueries: string[]; enQueries: string[] }> = [
    {
      id: "wedding_decor_rental",
      zhQueries: ["婚礼布置的拱门背景板想自己买一套", "婚宴布置的桌花怎么选"],
      enQueries: ["wedding decorations keep getting pricier", "need wedding decor ideas for the venue"],
    },
    {
      id: "wedding_return_gift",
      zhQueries: ["喜糖要订多少份才够", "婚礼回礼选什么不落俗套"],
      enQueries: ["how many wedding favors should we order", "return gifts for guests that people actually keep"],
    },
    {
      id: "birthday_party_experience",
      zhQueries: ["女儿的生日派对想办得难忘一点", "周末要办生日会, 清单怎么列"],
      enQueries: ["planning a birthday party without piles of props", "birthday party supplies list is getting long"],
    },
    {
      id: "festival_decor_reuse",
      zhQueries: ["圣诞装饰买新的还是用去年的", "新年装饰想换个氛围"],
      enQueries: ["holiday decorations every year a new set", "christmas decorations storage is overflowing"],
    },
    {
      id: "housewarming_open_house",
      zhQueries: ["下周办乔迁宴, 东西要备多少", "入伙宴想请邻居们热闹一下"],
      enQueries: ["hosting a housewarming party next weekend", "an open house party for the new place"],
    },
    {
      id: "office_gift_exchange",
      zhQueries: ["部门抽签交换怎么定规则", "同事交换不想再收马克杯了"],
      enQueries: ["the secret santa draw needs rules", "office gift swap budget feels silly"],
    },
    {
      id: "elder_celebration_together",
      zhQueries: ["爷爷过大寿, 全家想办得隆重些", "奶奶做寿送什么能被记住"],
      enQueries: ["grandpa birthday coming up, want it special", "parents anniversary dinner ideas"],
    },
    {
      id: "favor_homemade_local",
      zhQueries: ["去朋友家蹭饭想带点随手礼", "回老家想带点特产礼盒给同事"],
      enQueries: ["bring a hostess gift to the dinner tonight", "a regional gift box for the neighbors"],
    },
  ];

  it.each(cases.map((c) => ({ ...c, locale: "zh" as const })).flatMap((c) =>
    c.zhQueries.map((q) => ({ id: c.id, locale: c.locale, query: q })),
  ))("zh 触发: $id — $query", ({ id, query }) => {
    const result = suggestAlternative(query, "zh");
    expect(result).not.toBeNull();
    expect(result?.id).toBe(id);
  });

  it.each(cases.map((c) => ({ ...c, locale: "en" as const })).flatMap((c) =>
    c.enQueries.map((q) => ({ id: c.id, locale: c.locale, query: q })),
  ))("en 触发: $id — $query", ({ id, query }) => {
    const result = suggestAlternative(query, "en");
    expect(result).not.toBeNull();
    expect(result?.id).toBe(id);
  });
});

describe("green-alt-entries-celebration 不误伤与让位", () => {
  it("近邻负例: 提到婚礼/生日/节庆但不涉采购的句子不触发本域", () => {
    expect(suggestAlternative("表姐的婚礼定在秋天, 好期待", "zh")).toBeNull();
    expect(suggestAlternative("朋友的婚礼来宾都到了", "zh")).toBeNull();
    expect(suggestAlternative("今天我生日, 约了老朋友吃饭", "zh")).toBeNull();
    expect(suggestAlternative("过年最期待全家围一桌", "zh")).toBeNull();
    expect(suggestAlternative("他家常来常往, 上周刚搬完家", "zh")).toBeNull();
    expect(suggestAlternative("同事中午又约了饭, 人很好", "zh")).toBeNull();
    expect(suggestAlternative("爷爷奶奶身体硬朗, 天天遛弯", "zh")).toBeNull();
    expect(suggestAlternative("这座城的特产是桂花糕, 街边现做", "zh")).toBeNull();
  });

  it("纯闲聊 (en) 不触发本域", () => {
    expect(suggestAlternative("my cousin's wedding is next spring", "en")).toBeNull();
    expect(suggestAlternative("we are planning a birthday dinner for dad", "en")).toBeNull();
    expect(suggestAlternative("the holiday lights downtown look lovely", "en")).toBeNull();
    expect(suggestAlternative("our neighbors just moved in upstairs", "en")).toBeNull();
  });

  it("既有 gifting 词条让位不变: 含 礼物 的 query 仍命中 gifting 域", () => {
    expect(suggestAlternative("朋友生日快到了, 得去买个生日礼物", "zh")?.id).toBe("experience_gift_first");
    expect(suggestAlternative("完全不知道送什么, 有什么挑礼物的好办法", "zh")?.id).toBe("gift_wishlist_first");
    expect(suggestAlternative("平安夜才想起差点忘了买圣诞礼物", "zh")?.id).toBe("holiday_gift_cooldown");
    expect(suggestAlternative("friend's birthday is coming, need a birthday gift", "en")?.id).toBe("experience_gift_first");
  });

  it("既有 travel/office/furniture 相邻词条回归不变", () => {
    // travel 拥有裸 伴手礼/纪念品; 本域不抢
    expect(suggestAlternative("旅游时买点伴手礼送朋友", "zh")?.id).toBe("souvenir_three_questions");
    // office 测试锁定的句子: 送书当乔迁礼仍归 gifting 的二手书
    expect(suggestAlternative("想送书给朋友当乔迁礼", "zh")?.id).toBe("secondhand_book_gift");
    // furniture 拥有 搬家买家具/租工具; 乔迁宴词条不扩词抢接
    expect(suggestAlternative("搬家买家具想一步到位", "zh")?.id).toBe("move_rental_furniture");
    expect(suggestAlternative("装修要买电钻, 用完就闲置", "zh")?.id).toBe("borrow_rare_tools");
  });

  it("household 家居装饰与 parenting 玩具回归不变", () => {
    expect(suggestAlternative("想给房间来点新家居装饰", "zh")?.id).toBe("upcycle_decor");
    expect(suggestAlternative("想给孩子买玩具当生日惊喜", "zh")?.id).toBe("toy_library_borrow");
  });
});

describe("green-alt-entries-celebration 双语与红线", () => {
  it("同一 zh 查询, locale 切换输出语言", () => {
    const zh = suggestAlternative("婚礼布置想自己买一套", "zh");
    const en = suggestAlternative("婚礼布置想自己买一套", "en");
    expect(zh?.id).toBe("wedding_decor_rental");
    expect(en?.id).toBe("wedding_decor_rental");
    expect(zh?.message).toContain(zh!.alternative);
    expect(zh?.message).toContain(zh!.reuse);
    expect(zh?.message).not.toBe(en?.message);
  });

  it("composeMessage 输出: zh 无长英文串, en 无中文", () => {
    for (const entry of GREEN_ALT_ENTRIES_CELEBRATION) {
      const zh = suggestAlternative(entry.triggers.zh[0], "zh");
      const en = suggestAlternative(entry.triggers.en[0], "en");
      expect(zh?.id, entry.id).toBe(entry.id);
      expect(en?.id, entry.id).toBe(entry.id);
      expect(zh?.message, entry.id).not.toMatch(/[a-zA-Z]{3,}/);
      expect(en?.message, entry.id).not.toMatch(/[\u4e00-\u9fff]/);
    }
  });

  it("全字段 digit-free: 庆典文案零数值 (无金额承诺/无碳足迹/无席数)", () => {
    for (const entry of GREEN_ALT_ENTRIES_CELEBRATION) {
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

  it("文案红线: 无羞辱式送礼叙事, 不暗示用户穷", () => {
    const banned = /你不该|不应该买|别买|乱花钱|买不起|小气|抠门|浪费钱|guilt|shame|you're poor|too poor|cheapskate|wasteful|shouldn't buy|stingy|cheap out/i;
    for (const entry of GREEN_ALT_ENTRIES_CELEBRATION) {
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

  it("荣誉感叙事在位: 「心意体面」框架贯穿婚礼与长辈词条", () => {
    const joined = GREEN_ALT_ENTRIES_CELEBRATION
      .flatMap((e) => [e.alternative.zh, e.alternative.en])
      .join(" ");
    expect(joined).toContain("体面");
    expect(joined).toContain("considered");
  });
});
