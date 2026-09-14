import { describe, expect, it } from "vitest";

import { GREEN_ALT_ENTRIES_PET_FIRST_CARE } from "@/lib/green-alt-entries-pet-first-care";
import { suggestAlternative } from "@/lib/green-alternatives";
import { greenAltCategoryOf, isKnownGreenAltEntry } from "@/lib/green-alt-category";

describe("green-alt-entries-pet-first-care 结构", () => {
  it("id 唯一且注册到 category/known-set", () => {
    const ids = GREEN_ALT_ENTRIES_PET_FIRST_CARE.map((entry) => entry.id);
    expect(ids).toEqual([
      "pet_food_starter_small",
      "pet_treat_one_kind",
      "pet_supply_reuse_borrow",
      "pet_cleaning_refill_first",
      "pet_toy_single_start",
      "pet_allergy_small_pack",
    ]);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) {
      expect(greenAltCategoryOf(id)).toBe("pet-first-care");
      expect(isKnownGreenAltEntry(id)).toBe(true);
    }
  });

  it("双语字段完整, savingsHint 六条互不相同且无金额/碳/数字收益", () => {
    for (const locale of ["zh", "en"] as const) {
      const hints = GREEN_ALT_ENTRIES_PET_FIRST_CARE.map((entry) => entry.savingsHint[locale]);
      expect(new Set(hints).size).toBe(hints.length);
      for (const entry of GREEN_ALT_ENTRIES_PET_FIRST_CARE) {
        expect(entry.why[locale]).not.toMatch(/\d/);
        expect(entry.savingsHint[locale]).toContain("{hours}");
        expect(entry.savingsHint[locale]).not.toMatch(/碳|carbon|kg|gram|\$/i);
        expect(entry.triggers[locale].length).toBeGreaterThanOrEqual(3);
        expect(entry.options[locale].length).toBeGreaterThanOrEqual(2);
        expect(entry.options[locale].length).toBeLessThanOrEqual(3);
        for (const field of [entry.why, entry.options, entry.reuseChannel, entry.alternative, entry.reuse, entry.savingsHint]) {
          expect(field[locale].length).toBeGreaterThan(0);
        }
      }
    }
  });

  it("每个 trigger 在上下文查询中命中所属词条且不与既有域冲突", () => {
    for (const entry of GREEN_ALT_ENTRIES_PET_FIRST_CARE) {
      for (const locale of ["zh", "en"] as const) {
        for (const trigger of entry.triggers[locale]) {
          const query = locale === "zh" ? `第一次养宠物，想${trigger}` : `first time pet owner, want to ${trigger}`;
          const result = suggestAlternative(query, locale);
          expect(result, `${locale} trigger "${trigger}"`).not.toBeNull();
          expect(result!.id, `${locale} trigger "${trigger}"`).toBe(entry.id);
        }
      }
    }
  });
});

describe("green-alt-entries-pet-first-care 触发", () => {
  const cases: Array<{ id: string; zhQuery: string; enQuery: string }> = [
    { id: "pet_food_starter_small", zhQuery: "第一次养猫要买什么粮", enQuery: "first time cat owner food list" },
    { id: "pet_supply_reuse_borrow", zhQuery: "刚接小狗回家先囤点东西", enQuery: "stock up on puppy supplies" },
    { id: "pet_treat_one_kind", zhQuery: "猫咪零食先买十种试试", enQuery: "buy lots of cat treats for my new cat" },
    { id: "pet_cleaning_refill_first", zhQuery: "刚接幼猫回家，除味剂囤一大箱", enQuery: "stock up on pet wipes for my new kitten" },
    { id: "pet_toy_single_start", zhQuery: "第一次养狗狗玩具先买一件", enQuery: "new puppy toys buy lots" },
    { id: "pet_allergy_small_pack", zhQuery: "猫疑似食物过敏，低敏粮囤大袋", enQuery: "cat allergy food bulk trial" },
  ];

  it.each(cases)("zh 触发: $id", ({ id, zhQuery }) => {
    expect(suggestAlternative(zhQuery, "zh")?.id).toBe(id);
  });

  it.each(cases)("en 触发: $id", ({ id, enQuery }) => {
    expect(suggestAlternative(enQuery, "en")?.id).toBe(id);
  });
});

describe("green-alt-entries-pet-first-care 不误伤", () => {
  it("医疗、比较、训练和普通成熟养宠问题返回 null", () => {
    expect(suggestAlternative("猫生病了怎么办", "zh")).toBeNull();
    expect(suggestAlternative("A粮和B粮哪个好", "zh")).toBeNull();
    expect(suggestAlternative("怎么训练狗定点上厕所", "zh")).toBeNull();
    expect(suggestAlternative("my dog needs training for potty breaks", "en")).toBeNull();
    expect(suggestAlternative("which dog food is better, A or B", "en")).toBeNull();
    expect(suggestAlternative("my cat is sick, what should I do", "en")).toBeNull();
  });

  it("office、health、celebration、digital-content 交叉词仍归原域", () => {
    expect(suggestAlternative("开学季清单式满减要不要跟", "zh")?.id).toBe("back_to_school_cooldown");
    expect(suggestAlternative("顺便囤隐形眼镜", "zh")?.id).toBe("contact_lens_supply_pace");
    expect(suggestAlternative("办公室交换规则怎么定", "zh")?.id).toBe("office_gift_exchange");
    expect(suggestAlternative("想再囤一本电子书", "zh")?.id).toBe("ebook_repurchase");
    expect(suggestAlternative("office gift exchange with puppy toys", "en")?.id).toBe("office_gift_exchange");
    expect(suggestAlternative("stock up on contact lenses and cat food", "en")?.id).toBe("contact_lens_supply_pace");
  });
});
