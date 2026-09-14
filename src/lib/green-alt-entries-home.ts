/**
 * green-alt-entries-home — 高环境影响词条: 家居/日用 (zh+en 双语)
 *
 * 词条结构见 green-alt-types.ts。顺序接 green-alt-entries-wear.ts 之后
 * (穿戴/工艺在前, 家居/日用在后)。
 *
 * 文案红线 (评审同款): 不说教 (无 "你不该买"), 无碳足迹数值, 荣誉框架。
 */

import type { GreenAlternativeEntry } from './green-alt-types';

export const GREEN_ALT_ENTRIES_HOME: readonly GreenAlternativeEntry[] = [
  {
    id: "single_use_plastic",
    triggers: {
      zh: ["一次性塑料", "塑料袋", "一次性杯子", "一次性餐具", "塑料吸管", "保鲜膜", "塑料瓶", "塑料包装", "一次性餐盒", "保鲜袋", "快递打包袋", "外卖打包盒", "吸管"],
      en: [
        "disposable plastic",
        "single-use plastic",
        "plastic bag",
        "plastic straw",
        "plastic cutlery",
        "plastic cup",
        "plastic wrap",
        "cling film",
        "takeout container",
        "plastic bottles",
        "plastic packaging",
        "bulk plastic",
      ],
    },
    why: {
      zh: "一次性塑料制品往往用几分钟就丢弃，大部分难以回收，最后多是填埋或焚烧。",
      en: "Single-use plastics live for minutes but linger far longer — most never get recycled and end up landfilled or burned.",
    },
    options: {
      zh: ["不锈钢或玻璃耐用款", "竹木质餐具", "硅胶保鲜袋"],
      en: ["Stainless-steel or glass durables", "Bamboo/wood cutlery", "Silicone storage bags"],
    },
    reuseChannel: {
      zh: "耐用杯壶不必买全新的，闲鱼上常有未拆封的转卖，先淘二手就很划算。",
      en: "Durable bottles and jars are easy secondhand finds — often barely used at all.",
    },
    alternative: {
      zh: "不锈钢或玻璃的耐用版能用很多年，摊到每次的使用成本反而更低。",
      en: "A stainless-steel or glass durable version lasts for years — cheaper per use over time.",
    },
    reuse: {
      zh: "你手头可能已有的水杯、玻璃罐、餐具，先翻出来用，多半不必新买。",
      en: "You may already have a water bottle, glass jar, or cutlery at home — dig those out first; you likely don't need to buy new.",
    },
    savingsHint: {
      zh: "消费前先看看家里已有的同类物品，也许能满足当下的使用需求。",
      en: "Before buying, check if you already have something similar at home that fits the need.",
    },
  },
  {
    id: "fast_fashion",
    triggers: {
      zh: ["快时尚", "爆款", "上新", "打折衣服", "直播间的衣服"],
      en: ["fast fashion", "fashion haul", "trendy clothes", "flash sale clothes"],
    },
    why: {
      zh: "快时尚的更新节奏快，单件衣服的穿着次数往往不多，水耗和废弃量都跟着涨。",
      en: "Fast fashion's rapid cycles mean each piece gets worn fewer times, and water use and textile waste climb with it.",
    },
    options: {
      zh: ["经典基础款", "二手古着", "有机棉或再生纤维服饰"],
      en: ["Classic basics", "Secondhand vintage", "Organic-cotton or recycled-fiber apparel"],
    },
    reuseChannel: {
      zh: "同款基础款在闲鱼上常有全新转卖，古着也可以去线下市集逛逛。",
      en: "Secondhand apps and vintage shops are great first stops for the same looks.",
    },
    alternative: {
      zh: "经典款或二手古着往往更耐穿，风格也不容易过季，单价折到每次穿着很划算。",
      en: "Classic cuts or secondhand vintage tend to last longer and stay in style — cost per wear works out far better.",
    },
    reuse: {
      zh: "你手头可能已有的基础款，换个搭配就是新造型，衣橱里可能已经藏着答案。",
      en: "You may already have the basics — restyled, they read as a new outfit. Your closet may already hold the answer.",
    },
    savingsHint: {
      zh: "消费前先看看家里已有的同类物品，也许能满足当下的使用需求。",
      en: "Before buying, check if you already have something similar at home that fits the need.",
    },
  },
  {
    id: "tissues",
    triggers: {
      zh: ["纸巾", "抽纸", "面巾纸", "餐巾纸", "卷纸"],
      en: ["tissue", "tissues", "paper towel", "paper napkin", "napkins"],
    },
    why: {
      zh: "纸巾多用原木浆一次性使用，砍伐和制浆的负担都压在森林上。",
      en: "Most tissues are single-use virgin wood pulp — the harvest and pulping burden lands on forests.",
    },
    options: {
      zh: ["棉手帕", "竹浆或再生浆纸巾", "FSC 认证纸品"],
      en: ["Cotton handkerchiefs", "Bamboo or recycled-pulp tissues", "FSC-certified paper products"],
    },
    reuseChannel: {
      zh: "棉手帕在二手平台和杂货小铺都能低价入手，多买几条换着用更省。",
      en: "A small stack of handkerchiefs is a cheap find at secondhand and zero-waste shops.",
    },
    alternative: {
      zh: "棉手帕洗了能用很久，长期比整箱抽纸省得多，垃圾也少。",
      en: "A cotton handkerchief survives many washes — cheaper than a steady stream of packs and far less waste.",
    },
    reuse: {
      zh: "你手头可能已有的旧棉T恤，剪一剪就是现成的擦手布、抹布。",
      en: "You may already have an old cotton tee — cut up, it makes instant rags and hankies.",
    },
    savingsHint: {
      zh: "消费前先看看家里已有的同类物品，也许能满足当下的使用需求。",
      en: "Before buying, check if you already have something similar at home that fits the need.",
    },
  },
  {
    id: "batteries",
    triggers: {
      zh: ["电池", "干电池", "纽扣电池", "5号电池", "7号电池"],
      en: ["battery", "batteries", "disposable battery", "button cell"],
    },
    why: {
      zh: "一次性电池用完即弃，处理不当时其中的重金属会给土壤和水体添负担。",
      en: "Disposable batteries get tossed after one run; mishandled heavy metals burden soil and water.",
    },
    options: {
      zh: ["充电电池配充电器", "USB 直充锂电池"],
      en: ["Rechargeables with a charger", "USB-rechargeable lithium cells"],
    },
    reuseChannel: {
      zh: "充电电池套装在二手平台常有闲置转让，先问清循环次数就好。",
      en: "Secondhand listings often have barely-used rechargeable kits — just ask about the cycle count.",
    },
    alternative: {
      zh: "充电电池配充电器能循环用几百次，单次成本远低于一次性电池。",
      en: "Rechargeable batteries with a charger cycle hundreds of times — far cheaper per use than disposables.",
    },
    reuse: {
      zh: "你手头可能已有的旧充电电池，先翻出来测一下，也许还能再战。",
      en: "You may already have rechargeables in a drawer — test them first; they may still have plenty of cycles left.",
    },
    savingsHint: {
      zh: "消费前先看看家里已有的同类物品，也许能满足当下的使用需求。",
      en: "Before buying, check if you already have something similar at home that fits the need.",
    },
  },
];
