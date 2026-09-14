/**
 * green-alt-entries-food — 高频日常词条: 食品饮品 (zh+en 双语)
 *
 * 词条结构见 green-alt-types.ts。顺序接 wear/home/beauty/electronics 之后
 * (食品域 trigger 词与其他域无重叠, 追加在数组末位不影响既有优先级)。
 *
 * 文案红线 (与 electronics 同款): 不说教, 无碳足迹数值 (只定性"包装消耗"叙事),
 * 荣誉框架 — 替代是聪明选择不是苦行 ("自带杯人"是身份叙事)。
 * 高频小额累积是复利: 词条直接给省钱替代 (自制/自带/大份分装)。
 *
 * 绿色偏好开关 (symy_green_pref === 'off') 由调用方判断, 词条层不特判。
 */

import type { GreenAlternativeEntry } from './green-alt-types';

export const GREEN_ALT_ENTRIES_FOOD: readonly GreenAlternativeEntry[] = [
  {
    id: "milk_tea",
    triggers: {
      zh: ["奶茶", "果茶", "想点杯奶茶"],
      en: ["bubble tea", "boba", "milk tea", "fruit tea"],
    },
    why: {
      zh: "奶茶果茶是频率最高的包装消耗之一：杯子、封膜、吸管、提袋，一杯一套，喝完即弃。",
      en: "Milk tea is one of the most frequent sources of packaging waste — cup, seal film, straw and bag, a full set per drink, gone in minutes.",
    },
    options: {
      zh: ["自制茶底+鲜奶", "自带杯门店折扣", "减少每周杯数"],
      en: ["Brew your own base with fresh milk", "Bring-your-own-cup discounts", "Fewer cups per week"],
    },
    reuseChannel: {
      zh: "不少连锁门店自带杯立减几元，是长期真实存在的机制，保温杯顺手就能当外带杯。",
      en: "Many chains offer a few off for brought cups — a real standing mechanism; a thermos doubles as your to-go cup.",
    },
    alternative: {
      zh: "自制茶底加鲜奶，甜度和用料自己说了算，成本一杯不到门店零头——「自带杯人」本来就是最会喝的那批人。",
      en: "Homemade base with fresh milk puts sweetness and ingredients in your hands at a fraction of the counter price — bring-your-own-cup regulars are the savviest drinkers around.",
    },
    reuse: {
      zh: "手头的保温杯或随行杯就是你的外带杯，自带杯折扣攒一个月就是一杯免费奶茶。",
      en: "The thermos or tumbler you already own is your to-go cup — a month of bring-your-own discounts adds up to a free drink.",
    },
    savingsHint: {
      zh: "消费前先看看家里已有的同类物品，也许能满足当下的使用需求。",
      en: "Before buying, check if you already have something similar at home that fits the need.",
    },
  },
  {
    id: "takeout_meal",
    triggers: {
      zh: ["点外卖", "外卖", "送餐"],
      en: ["food delivery", "order takeout", "delivery app"],
    },
    why: {
      zh: "一份外卖的包装常超过餐食本身的需要：餐盒、餐具、外袋层层叠叠，多数用一次就进垃圾桶。",
      en: "A single delivery order often ships more packaging than the meal needs — boxes, cutlery and bags layered up, mostly landfilled after one use.",
    },
    options: {
      zh: ["一周 2-3 次集中自炊", "下单勾选「无需餐具」", "和同事拼单减配送"],
      en: ["Batch-cook 2-3 nights a week", "Tick \"no cutlery\" at checkout", "Group orders with colleagues"],
    },
    reuseChannel: {
      zh: "自炊不等于从零开始：周末一次备菜分装，工作日加热即食，和外卖一样省事。",
      en: "Home cooking doesn't mean from scratch nightly — one weekend prep session split into portions reheats as easily as delivery.",
    },
    alternative: {
      zh: "一周固定两三晚自炊，剩下的照点——集中火力比全面戒断更扛得住，餐盒和配送费同步降下来。",
      en: "Fix two or three home-cooked nights a week and order as usual the rest — focused beats going cold turkey, and packaging plus delivery fees drop together.",
    },
    reuse: {
      zh: "家里囤的食材可能已经够两顿晚餐，先开冰箱再看菜单，外卖单自然就短了。",
      en: "Your fridge likely holds two dinners already — open it before opening the app and the order shrinks on its own.",
    },
    savingsHint: {
      zh: "消费前先看看家里已有的同类物品，也许能满足当下的使用需求。",
      en: "Before buying, check if you already have something similar at home that fits the need.",
    },
  },
  {
    id: "bottled_water",
    triggers: {
      zh: ["瓶装水", "买箱水", "矿泉水"],
      en: ["bottled water", "case of water", "mineral water"],
    },
    why: {
      zh: "瓶装水的瓶子运输的是水本身几十分之一的重量，喝完一瓶空一瓶，是家里最快的塑料堆积源。",
      en: "Bottled water trucks around packaging for a product that comes out of the tap — each bottle emptied is another one in the bin, the fastest plastic pile-up at home.",
    },
    options: {
      zh: ["随身滤水杯", "家用滤壶", "自来水煮沸"],
      en: ["A filter bottle on the go", "A countertop filter jug", "Boiled tap water"],
    },
    reuseChannel: {
      zh: "一个滤壶滤芯能过滤上百升水，折算下来比整箱买水便宜一个量级。",
      en: "One jug filter handles hundreds of liters — order-of-magnitude cheaper than cases of bottles.",
    },
    alternative: {
      zh: "滤水杯随身、滤壶在家，水质口感自己可控，随买随喝的人设从「买水」换成「带水」。",
      en: "A filter bottle out and a jug at home put taste and quality in your control — the identity shifts from buying water to carrying it.",
    },
    reuse: {
      zh: "你抽屉里大概率躺着一个闲置水杯或旧滤壶，换个滤芯就能重新上岗。",
      en: "There's almost certainly an idle bottle or old filter jug in a drawer — a fresh cartridge puts it back to work.",
    },
    savingsHint: {
      zh: "消费前先看看家里已有的同类物品，也许能满足当下的使用需求。",
      en: "Before buying, check if you already have something similar at home that fits the need.",
    },
  },
  {
    id: "coffee_shop",
    triggers: {
      zh: ["买咖啡", "连锁咖啡", "想喝拿铁"],
      en: ["coffee shop", "buy coffee", "latte run"],
    },
    why: {
      zh: "连锁咖啡的杯子看似纸做的，内层淋膜让空杯也很难回收，一天一杯一年就是几百个。",
      en: "Coffee-shop cups look like paper but the plastic lining makes even empties hard to recycle — one a day is hundreds a year.",
    },
    options: {
      zh: ["自制挂耳/冷萃瓶", "自带杯折扣", "办公室咖啡角"],
      en: ["Drip bags or cold-brew bottles at home", "Bring-your-own-cup discounts", "The office coffee corner"],
    },
    reuseChannel: {
      zh: "冷萃粉水比一次配好冷藏，早上倒一杯带走，比排队取餐还快；门店自带杯折扣很多连锁常年有效。",
      en: "Mix a cold-brew batch in the fridge and pour one to go — faster than the pickup line; bring-your-own-cup discounts run year-round at many chains.",
    },
    alternative: {
      zh: "挂耳和冷萃瓶把一杯咖啡的成本压到门店几分之一，风味还能自己调——「自带杯打咖啡」是行家动作不是苦行。",
      en: "Drip bags and cold brew cut the per-cup cost to a fraction of the counter — and dialing in your own flavor is a connoisseur's move, not a sacrifice.",
    },
    reuse: {
      zh: "那个买了没怎么用的随行杯正好派上用场，自带杯折扣每次都在替你攒一杯。",
      en: "That barely-used travel mug finally earns its spot — every bring-your-own discount banks toward a free cup.",
    },
    savingsHint: {
      zh: "消费前先看看家里已有的同类物品，也许能满足当下的使用需求。",
      en: "Before buying, check if you already have something similar at home that fits the need.",
    },
  },
  {
    id: "snack_hoarding",
    triggers: {
      zh: ["囤零食", "买零食", "零食囤货"],
      en: ["stock up on snacks", "bulk snacks", "snack haul"],
    },
    why: {
      zh: "囤货价看着划算，但零食有保质期，囤过头的结局常常是尝一口就放过期，钱和食物一起浪费。",
      en: "Bulk pricing looks smart, but snacks expire — over-stocked hauls often end with one bite and the bin, wasting money and food together.",
    },
    options: {
      zh: ["小包装按周配给", "囤货前先盘点存量", "只囤常温耐放的品类"],
      en: ["Small packs rationed weekly", "Inventory check before stocking up", "Only shelf-stable staples in bulk"],
    },
    reuseChannel: {
      zh: "大包装买回家立刻分装成小份，一次拿一包，既控量又保新鲜。",
      en: "Split big packs into small portions the day they arrive — one at a time keeps both appetite and freshness in check.",
    },
    alternative: {
      zh: "按周配给小包装，想吃有得吃、总量守得住——会囤也会管，才是真正的囤货高手。",
      en: "Weekly-rationed small packs mean treats on tap with the total under control — managing the stash is the real bulk-buy skill.",
    },
    reuse: {
      zh: "先清一遍柜子：上一次囤的可能还剩半柜，吃完了再补不迟。",
      en: "Clear the cabinet first — last haul's leftovers may be half the stock; restock when it's actually gone.",
    },
    savingsHint: {
      zh: "消费前先看看家里已有的同类物品，也许能满足当下的使用需求。",
      en: "Before buying, check if you already have something similar at home that fits the need.",
    },
  },
];
