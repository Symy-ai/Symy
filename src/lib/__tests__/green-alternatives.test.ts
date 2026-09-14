import { describe, expect, it } from "vitest";

import {
  GREEN_ALTERNATIVES,
  matchGreenAltEntries,
  suggestAlternative,
} from "@/lib/green-alternatives";

describe("green-alternatives 触发", () => {
  const cases: Array<{ id: string; zhQuery: string; enQuery: string }> = [
    {
      id: "ivory_bone_carving",
      zhQuery: "想给长辈买个象牙雕刻摆件",
      enQuery: "thinking of buying an ivory bangle",
    },
    {
      id: "fur",
      zhQuery: "冬天想入手一件貂皮大衣",
      enQuery: "should I get a fur coat this winter?",
    },
    {
      id: "single_use_plastic",
      zhQuery: "囤一批一次性塑料制品划算吗",
      enQuery: "need plastic straws for a party",
    },
    {
      id: "fast_fashion",
      zhQuery: "快时尚又上新了，好想剁手",
      enQuery: "another fast fashion haul is tempting me",
    },
    {
      id: "tissues",
      zhQuery: "家里纸巾用完了，想整箱买抽纸",
      enQuery: "out of paper towels, buying in bulk",
    },
    {
      id: "batteries",
      zhQuery: "遥控器没电了，买几节5号电池",
      enQuery: "need to stock up on batteries",
    },
    {
      id: "tortoiseshell",
      zhQuery: "想要一副玳瑁眼镜框",
      enQuery: "considering a tortoiseshell comb",
    },
    {
      id: "animal_leather",
      zhQuery: "想买个真皮包包",
      enQuery: "eyeing a genuine leather bag",
    },
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
    {
      id: "medicine_expiry_audit",
      zhQuery: "换季了想囤感冒药备着",
      enQuery: "should I stock up on medicine for the cold season",
    },
    {
      id: "contact_lens_supply_pace",
      zhQuery: "直播间又想囤美瞳了",
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

  it("覆盖全部 123 个品类 (wear 4 + home 4 + beauty 5 + electronics 5 + food 5 + apparel 5 + household 5 + subscription 5 + travel 6 + parenting 5 + sports 5 + gifting 6 + furniture 6 + pets 6 + garden 10 + office 10 + digital-content 6 + health-care 5 + repair-care 6 + celebration 8 + pet-first-care 6)", () => {
    expect(GREEN_ALTERNATIVES.map((e) => e.id)).toEqual([
      "ivory_bone_carving",
      "tortoiseshell",
      "fur",
      "animal_leather",
      "single_use_plastic",
      "fast_fashion",
      "tissues",
      "batteries",
      "beauty_refill",
      "solid_cleanser",
      "skincare_hoard",
      "lipstick_makeup",
      "sheet_mask_pile",
      "repair_first",
      "refurb_gadget",
      "secondhand_audio_tablet",
      "trade_in_upgrade",
      "cable_hoard",
      "milk_tea",
      "takeout_meal",
      "bottled_water",
      "coffee_shop",
      "snack_hoarding",
      "new_clothes",
      "limited_sneakers",
      "handbag_rotation",
      "wardrobe_audit",
      "capsule_wardrobe",
      "storage_gadgets",
      "aroma_diffuser",
      "promo_household_stockup",
      "small_appliance",
      "upcycle_decor",
      "subscription_audit",
      "tipping_pause",
      "game_topup_math",
      "activate_before_buy",
      "plan_sharing",
      "gear_rental_first",
      "travel_size_kit",
      "travel_voucher_cooldown",
      "souvenir_three_questions",
      "city_transit_choice",
      "suitcase_reuse_first",
      "kids_clothes_pass_on",
      "toy_library_borrow",
      "picturebook_library_swap",
      "baby_gear_rental",
      "diaper_promo_math",
      "gym_per_visit_math",
      "sportswear_capsule",
      "secondhand_racquet",
      "home_workout_first",
      "supplement_stockup_math",
      "gift_wishlist_first",
      "secondhand_book_gift",
      "handmade_gift",
      "wrap_less_gift",
      "holiday_gift_cooldown",
      "experience_gift_first",
      "repair_reupholster",
      "secondhand_furniture",
      "move_rental_furniture",
      "borrow_rare_tools",
      "mattress_quality_over_cheap",
      "big_ticket_cooldown_72h",
      "pet_food_starter_small",
      "pet_treat_one_kind",
      "pet_supply_reuse_borrow",
      "pet_cleaning_refill_first",
      "pet_toy_single_start",
      "pet_allergy_small_pack",
      "pet_medicine_vet_first",
      "cat_litter_subscription_audit",
      "pet_toy_durable",
      "secondhand_pet_gear_first",
      "pet_food_bulk_math",
      "adopt_dont_shop",
      "garden_tools_borrow",
      "secondhand_pots_first",
      "seeds_over_seedlings",
      "plant_swap_community",
      "compost_over_chemical",
      "water_wise_watering",
      "garden_plant_starter",
      "garden_outdoor_furniture",
      "garden_tool_set",
      "garden_pot_collection",
      "textbook_secondhand",
      "textbook_digital_first",
      "stationery_refill",
      "notebook_reuse",
      "printer_borrow",
      "back_to_school_cooldown",
      "office_stationery_stock",
      "office_printer_supplies",
      "office_furniture_upgrade",
      "office_event_supplies",
      "ebook_repurchase",
      "audiobook_stockpile",
      "course_backlog_first",
      "cloud_storage_declutter",
      "music_repurchase",
      "design_asset_single_buy",
      "medicine_expiry_audit",
      "contact_lens_supply_pace",
      "beauty_device_idle_check",
      "fragrance_rotation",
      "vitamin_duplicate_check",
      "shoe_repair_first",
      "bag_care_repair",
      "clothes_mend_alter",
      "phone_battery_screen_repair",
      "appliance_checkup_repair",
      "bike_maintenance",
      "wedding_decor_rental",
      "wedding_return_gift",
      "birthday_party_experience",
      "festival_decor_reuse",
      "housewarming_open_house",
      "office_gift_exchange",
      "elder_celebration_together",
      "favor_homemade_local",
    ]);
    expect(GREEN_ALTERNATIVES).toHaveLength(123);
    expect(new Set(GREEN_ALTERNATIVES.map((entry) => entry.id)).size).toBe(GREEN_ALTERNATIVES.length);
  });

  it("trigger 词表规模: zh+en 各 ≥15 词条", () => {
    expect(GREEN_ALTERNATIVES.flatMap((e) => e.triggers.zh).length).toBeGreaterThanOrEqual(15);
    expect(GREEN_ALTERNATIVES.flatMap((e) => e.triggers.en).length).toBeGreaterThanOrEqual(15);
  });
});

describe("green-alternatives 不触发", () => {
  it("低环境影响查询返回 null", () => {
    expect(suggestAlternative("想借一本新出的小说", "zh")).toBeNull();
    expect(suggestAlternative("a plain notebook", "en")).toBeNull();
    expect(suggestAlternative("帮我看下这个 pdf 发票", "zh")).toBeNull();
  });

  it("空/空白输入返回 null", () => {
    expect(suggestAlternative("", "zh")).toBeNull();
    expect(suggestAlternative("   ", "en")).toBeNull();
  });

  it("非字符串输入返回 null (纯函数不抛异常)", () => {
    expect(
      suggestAlternative(undefined as unknown as string, "zh"),
    ).toBeNull();
  });
});

describe("green-alternatives 双语", () => {
  it("同一 zh 查询, locale 切换输出语言", () => {
    const zh = suggestAlternative("想买象牙手串", "zh");
    const en = suggestAlternative("想买象牙手串", "en");
    expect(zh).not.toBeNull();
    expect(en).not.toBeNull();
    expect(zh?.id).toBe(en?.id);
    expect(zh?.message).not.toBe(en?.message);
    // zh 文案含中文, 不含 "vegetable ivory"; en 相反
    expect(zh?.message).toContain("植物象牙");
    expect(zh?.message).not.toMatch(/[a-zA-Z]{3,}/);
    expect(en?.message).toContain("vegetable ivory");
    expect(en?.message).not.toMatch(/[\u4e00-\u9fff]/);
  });

  it("中英混排查询也能命中 (匹配同时看 zh+en 词表)", () => {
    const result = suggestAlternative("朋友安利了 faux fur, 想看看真皮草", "zh");
    expect(result?.id).toBe("fur");
  });

  it("大小写不敏感 (en trigger)", () => {
    expect(suggestAlternative("IVORY bracelet", "en")?.id).toBe(
      "ivory_bone_carving",
    );
  });
});

describe("green-alternatives 纯函数性质", () => {
  it("同输入同输出, 无状态", () => {
    const a = suggestAlternative("买皮草", "zh");
    const b = suggestAlternative("买皮草", "zh");
    expect(a).toEqual(b);
  });

  it("每条话术都含替代 + 复用两部分", () => {
    for (const entry of GREEN_ALTERNATIVES) {
      for (const locale of ["zh", "en"] as const) {
        const suggestion = suggestAlternative(
          entry.triggers[locale][0],
          locale,
        );
        expect(suggestion?.alternative).toBe(entry.alternative[locale]);
        expect(suggestion?.reuse).toBe(entry.reuse[locale]);
        expect(suggestion?.message).toContain(entry.reuse[locale]);
      }
    }
  });
});

describe("green-alternatives 卡片字段 (绿色替代卡渲染数据)", () => {
  it("每条词条带 why/options/reuseChannel, options 2-3 个", () => {
    for (const entry of GREEN_ALTERNATIVES) {
      for (const locale of ["zh", "en"] as const) {
        const s = suggestAlternative(entry.triggers[locale][0], locale);
        expect(s?.why).toBe(entry.why[locale]);
        expect(s?.options.length).toBeGreaterThanOrEqual(2);
        expect(s?.options.length).toBeLessThanOrEqual(3);
        expect(s?.reuseChannel).toBe(entry.reuseChannel[locale]);
      }
    }
  });

  it("渠道建议仅 zh 场景给平台名 (闲鱼)", () => {
    const zh = suggestAlternative("想买个真皮包包", "zh");
    const en = suggestAlternative("eyeing a genuine leather bag", "en");
    expect(zh?.reuseChannel).toContain("闲鱼");
    expect(en?.reuseChannel).not.toMatch(/[\u4e00-\u9fff]/);
  });
});

describe("green-alternatives 口语插入语 (batch69-a)", () => {
  it("动宾间插入量词/形容词仍命中 (QA wool-report 发现 #1)", () => {
    expect(suggestAlternative("买个沙发", "zh")?.id).toBe(
      "secondhand_furniture",
    );
    expect(suggestAlternative("想买个新沙发", "zh")?.id).toBe(
      "secondhand_furniture",
    );
    expect(suggestAlternative("买新沙发", "zh")?.id).toBe(
      "secondhand_furniture",
    );
  });

  it("matchGreenAltEntries 同享兜底 (聊天主路径 suggestAlternativeWithPreference 经此)", () => {
    expect(matchGreenAltEntries("买个沙发").map((e) => e.id)).toEqual([
      "secondhand_furniture",
    ]);
  });

  it("否定句现状行为锁定 (子串匹配本不判否定, 不新增否定逻辑)", () => {
    // 现状即命中, 锁定不回归
    expect(suggestAlternative("不想买沙发", "zh")?.id).toBe(
      "secondhand_furniture",
    );
    expect(suggestAlternative("不买沙发", "zh")?.id).toBe(
      "secondhand_furniture",
    );
    // 无宾语否定: 现状 null, 保持 null
    expect(suggestAlternative("不想买", "zh")).toBeNull();
    expect(suggestAlternative("不买了", "zh")).toBeNull();
  });

  it("语义负载 trigger 零回退: 原文先匹配, 归一化不抢命中", () => {
    // 这些 trigger 里的 "新" 是词义的一部分, 若先归一化会被拆坏
    expect(suggestAlternative("想买新课", "zh")?.id).toBe(
      "course_backlog_first",
    );
    expect(suggestAlternative("想买新书", "zh")?.id).toBe(
      "textbook_digital_first",
    );
    expect(suggestAlternative("想换新机", "zh")?.id).toBe("trade_in_upgrade");
    expect(suggestAlternative("想换新美容仪", "zh")?.id).toBe(
      "beauty_device_idle_check",
    );
    expect(suggestAlternative("想换个椅子", "zh")?.id).toBe(
      "office_furniture_upgrade",
    );
  });
});

describe("green-alternatives 文案红线", () => {
  it("全库无羞耻框架文案 (不说教)", () => {
    const banned = /你不该|不应该买|别买|shouldn't buy|should not buy|shame|guilt trip/i;
    for (const entry of GREEN_ALTERNATIVES) {
      for (const locale of ["zh", "en"] as const) {
        const s = suggestAlternative(entry.triggers[locale][0], locale);
        const all = [s?.why, s?.message, s?.reuseChannel, ...(s?.options ?? [])]
          .filter(Boolean)
          .join(" ");
        expect(all).not.toMatch(banned);
      }
    }
  });

  it("why 无数字 (禁止碳足迹数值)", () => {
    for (const entry of GREEN_ALTERNATIVES) {
      for (const locale of ["zh", "en"] as const) {
        expect(entry.why[locale]).not.toMatch(/\d/);
      }
    }
  });
});
