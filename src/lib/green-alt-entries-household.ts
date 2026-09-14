/**
 * green-alt-entries-household — 高频日常词条: 居家生活 (zh+en 双语)
 *
 * 词条结构见 green-alt-types.ts。顺序追加在 apparel 之后 (数组末位)。
 * 与 home 域 (一次性塑料/纸巾/电池) 的边界: 本域接住的是「居家改善型冲动」
 * (收纳/香薰/小家电/装饰), 具体日用品词 (纸巾/电池) 仍由 home 域先命中。
 *
 * 文案红线 (与 food 同款): 不说教, 无碳足迹数值, 荣誉框架。
 * 促销囤货只算「折扣真相」经济账, 不做道德评判。
 *
 * 绿色偏好开关 (symy_green_pref === 'off') 由调用方判断, 词条层不特判。
 */

import type { GreenAlternativeEntry } from './green-alt-types';

export const GREEN_ALT_ENTRIES_HOUSEHOLD: readonly GreenAlternativeEntry[] = [
  {
    id: "storage_gadgets",
    triggers: {
      zh: ["收纳神器", "收纳盒", "收纳柜", "置物架"],
      en: ["storage organizer", "organizing gadgets", "storage bins", "shelf organizer"],
    },
    why: {
      zh: "收纳神器解决的是「放不下」，但根源常是「留太多」——先买的收纳，往往只是把闲置换个姿势藏起来。",
      en: "Organizers solve \"no room\", but the root is usually \"too much kept\" — buying storage first just hides the idle stuff in a tidier pose.",
    },
    options: {
      zh: ["先断舍离再收纳", "用现有纸箱/抽屉分区", "一进一出维持总量"],
      en: ["Declutter before containerizing", "Zone drawers and boxes you own", "One-in-one-out to hold the line"],
    },
    reuseChannel: {
      zh: "快递纸箱剪开加旧布一包，就是免费的分格收纳；玻璃罐咖啡罐天然适合装干货小物。",
      en: "A delivery box wrapped in scrap cloth makes free divided storage; glass jars and coffee tins are natural dry-goods containers.",
    },
    alternative: {
      zh: "先做一轮断舍离再谈收纳——东西少下来之后，你会发现需要的收纳工具比想象中少得多。",
      en: "Declutter a round before buying any organizer — once less stuff remains, you'll need far fewer containers than expected.",
    },
    reuse: {
      zh: "家里的纸袋、鞋盒、玻璃罐先排上用场，分区收纳未必需要新买任何东西。",
      en: "Paper bags, shoeboxes and jars can do the zoning first — organized storage may not require buying anything new.",
    },
    savingsHint: {
      zh: "消费前先看看家里已有的同类物品，也许能满足当下的使用需求。",
      en: "Before buying, check if you already have something similar at home that fits the need.",
    },
  },
  {
    id: "aroma_diffuser",
    triggers: {
      zh: ["香薰", "香薰蜡烛", "精油香薰", "香氛机"],
      en: ["scented candle", "aroma diffuser", "reed diffuser", "home fragrance"],
    },
    why: {
      zh: "香薰是典型的低单价高频次品类：瓶子、蜡杯和扩香藤条消耗得快，囤的香味常常还没用完就腻了。",
      en: "Home fragrance is the classic low-price-high-frequency category — jars, cups and reeds churn fast, and stocked scents bore before they empty.",
    },
    options: {
      zh: ["天然精油减量使用", "柑橘皮/干花自制香氛", "用完一瓶再开新的"],
      en: ["Natural essential oils used sparingly", "DIY citrus-peel or dried-flower scent", "Finish one bottle before opening the next"],
    },
    reuseChannel: {
      zh: "空蜡杯洗净就是收纳小物罐；几滴精油兑水装进旧喷雾瓶，就是随手香氛喷雾。",
      en: "Rinsed candle jars become small-item storage; a few drops of essential oil in water in an old spray bottle makes instant room mist.",
    },
    alternative: {
      zh: "天然精油滴几滴在扩香木或旧蜡杯里，用量自己控制、味道自己调——比整柜香薰蜡烛更省也更耐闻。",
      en: "A few drops of natural oil on diffuser wood or in an old jar puts dosage and blend in your hands — cheaper and longer-lived than a cabinet of candles.",
    },
    reuse: {
      zh: "没用完的香薰先集中用完再补新香型，空瓶空罐正好做下一轮的容器。",
      en: "Finish the half-used scents before adding new ones — the empties become next round's containers.",
    },
    savingsHint: {
      zh: "消费前先看看家里已有的同类物品，也许能满足当下的使用需求。",
      en: "Before buying, check if you already have something similar at home that fits the need.",
    },
  },
  {
    id: "promo_household_stockup",
    triggers: {
      zh: ["促销囤货", "囤日用品", "囤洗衣液", "大促囤货"],
      en: ["stock up on household", "bulk household supplies", "stockpile deals"],
    },
    why: {
      zh: "促销囤货的秘密是：折扣再大，用不完就是净支出——日用品占地、有保质期，囤过头的部分等于原价打了水漂。",
      en: "The stock-up secret: any discount on stuff you never finish is net loss — household goods take space, some expire, and overstock is money poured out at full price.",
    },
    options: {
      zh: ["按月用量算折扣真相", "只囤耐放刚需品", "错过大促等下次"],
      en: ["Do the per-month-usage math on the deal", "Bulk only shelf-stable staples", "Let a sale pass — another always comes"],
    },
    reuseChannel: {
      zh: "家里在用的那瓶洗衣液先看看还剩多少：多数促销时点的存量，其实够撑到下一次促销。",
      en: "Check how much of the current bottle is left first — at most sale moments your stock likely lasts to the next sale.",
    },
    alternative: {
      zh: "下单前按家庭月用量算一遍折扣真相：省下的钱除以多占的资金和空间，很多「三件八折」其实并不划算。",
      en: "Run the per-month-usage math before checkout: divide the savings by the cash and space tied up — many \"30% off 3-pack\" deals don't survive it.",
    },
    reuse: {
      zh: "储物柜深处大概率还有上次囤的存货，用掉一件再补一件，促销不追也不会断档。",
      en: "The back of the storage cabinet likely holds last haul's stock — use one, replace one, and skipping a sale still won't run you dry.",
    },
    savingsHint: {
      zh: "消费前先看看家里已有的同类物品，也许能满足当下的使用需求。",
      en: "Before buying, check if you already have something similar at home that fits the need.",
    },
  },
  {
    id: "small_appliance",
    triggers: {
      zh: ["小家电", "新家电", "空气炸锅", "破壁机"],
      en: ["small appliance", "kitchen gadget", "air fryer", "blender"],
    },
    why: {
      zh: "功能单一的小家电是闲置率最高的品类之一：新鲜感过了，台面和柜子就被「只用过几次」的机器占满。",
      en: "Single-purpose gadgets top the idle charts — once the novelty fades, counters and cabinets fill with machines used a handful of times.",
    },
    options: {
      zh: ["多功能合一机型", "先借用/租用试水", "现有设备组合替代"],
      en: ["One multi-function unit", "Borrow or rent to try first", "Combine gear you already own"],
    },
    reuseChannel: {
      zh: "朋友同事家大概率躺着一台闲置的同款，先借一周试试真实使用频率；二手平台的小家电也常年低价流通。",
      en: "A friend likely owns the very machine idle — borrow it a week to test real usage; small appliances also circulate cheap on resale apps year-round.",
    },
    alternative: {
      zh: "优先选多功能合一的机型，一台顶几台的台面和预算——下单前先想清楚「一周会真用几次」。",
      en: "Favor multi-function units that earn their counter space and budget — before checkout, settle the question \"how many real uses per week?\"",
    },
    reuse: {
      zh: "烤箱、电饭煲、灶台加起来能覆盖多数小家电的功能，先翻翻说明书里的隐藏菜谱。",
      en: "Oven, rice cooker and stovetop cover most gadget functions — dig the hidden recipes out of their manuals first.",
    },
    savingsHint: {
      zh: "消费前先看看家里已有的同类物品，也许能满足当下的使用需求。",
      en: "Before buying, check if you already have something similar at home that fits the need.",
    },
  },
  {
    id: "upcycle_decor",
    triggers: {
      zh: ["装饰改造", "家居装饰", "软装改造", "买装饰"],
      en: ["home decor", "redecorating", "room makeover", "buy decorations"],
    },
    why: {
      zh: "装饰改造的冲动往往来自「想换个心情」，但新装饰品带来的新鲜感衰减得很快，旧物改造反而更有参与感。",
      en: "Redecorating urges usually come from wanting a mood shift — new decor's freshness fades fast, while upcycling keeps the maker's pride.",
    },
    options: {
      zh: ["旧物改造（瓶罐/木箱/布料）", "重新布局现有家具", "绿植扦插免费添绿"],
      en: ["Upcycle jars, crates and fabric", "Re-arrange existing furniture", "Propagate plants for free greenery"],
    },
    reuseChannel: {
      zh: "玻璃瓶缠麻绳是花瓶，旧木箱叠起来是边几，淘汰的衣物裁开就是桌旗——改造素材家里现成就有。",
      en: "A twine-wrapped bottle is a vase, stacked crates a side table, retired clothing a table runner — the materials are already at home.",
    },
    alternative: {
      zh: "先把现有物品换位重组一轮：家具挪位、画框互换、绿植换房间，零成本的改造常常比新装饰更有效。",
      en: "Recompose what you own first — move furniture, swap frames, rotate plants between rooms; zero-cost makeovers often outperform new decor.",
    },
    reuse: {
      zh: "上一次改造的半成品和闲置素材箱先翻出来，很可能这次的心情就靠它们完成。",
      en: "Dig out last makeover's leftovers and the idle materials box — this mood shift may be finished with exactly those.",
    },
    savingsHint: {
      zh: "消费前先看看家里已有的同类物品，也许能满足当下的使用需求。",
      en: "Before buying, check if you already have something similar at home that fits the need.",
    },
  },
];
