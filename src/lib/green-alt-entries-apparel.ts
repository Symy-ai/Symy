/**
 * green-alt-entries-apparel — 高频日常词条: 服饰鞋包 (zh+en 双语)
 *
 * 词条结构见 green-alt-types.ts。顺序追加在 wear/home/beauty/electronics/food 之后
 * — 服饰域的泛词 (衣服/鞋/包) 排在既有词条后面: "快时尚""打折衣服" 等具体词
 * 仍由 home 域 fast_fashion 先命中, 本域只接住更泛的穿搭冲动。
 *
 * 文案红线 (与 food 同款): 不说教, 无碳足迹数值 (只定性"穿用次数"叙事),
 * 荣誉框架 — 替代是聪明选择不是苦行 ("胶囊衣橱"是身份叙事)。
 * 绝不暗示用户乱花钱: 只谈"衣柜里已有的可能性"。
 *
 * 绿色偏好开关 (symy_green_pref === 'off') 由调用方判断, 词条层不特判。
 */

import type { GreenAlternativeEntry } from './green-alt-types';

export const GREEN_ALT_ENTRIES_APPAREL: readonly GreenAlternativeEntry[] = [
  {
    id: "new_clothes",
    triggers: {
      zh: ["想买衣服", "买衣服", "新衣服", "种草穿搭"],
      en: ["buy clothes", "new clothes", "new outfit", "clothes shopping"],
    },
    why: {
      zh: "冲动下单的衣服往往穿过几次就压箱底，衣橱越满越觉得「没衣服穿」，是典型的循环。",
      en: "Impulse-bought clothes often end up worn a few times then buried — and the fuller the closet, the stronger the \"nothing to wear\" feeling loops.",
    },
    options: {
      zh: ["衣柜盘点后再下单", "基础款+配饰换新造型", "二手平台淘同款"],
      en: ["Audit the closet before checkout", "Restyle basics with accessories", "Hunt the same look secondhand"],
    },
    reuseChannel: {
      zh: "同款基础款在二手平台常有全新转卖，古着市集也值得逛逛，价格常常只有吊牌价零头。",
      en: "The same basics show up unused on secondhand apps, and vintage markets are worth a browse — often a fraction of tag price.",
    },
    alternative: {
      zh: "下单前先翻一遍衣柜，把已有的单品重新搭一遍——多数「想买衣服」的瞬间，其实是「想换造型」，换个搭法就能满足。",
      en: "Flip through the closet before checkout — most \"need new clothes\" moments are really \"need a new look\", and restyling what you own delivers it.",
    },
    reuse: {
      zh: "衣柜深处大概率为相似款式：先试穿搭配一次，配饰换一换就是新造型。",
      en: "There's likely a similar piece deep in the closet — one try-on with different accessories reads as a whole new outfit.",
    },
    savingsHint: {
      zh: "消费前先看看家里已有的同类物品，也许能满足当下的使用需求。",
      en: "Before buying, check if you already have something similar at home that fits the need.",
    },
  },
  {
    id: "limited_sneakers",
    triggers: {
      zh: ["限量球鞋", "球鞋", "联名鞋", "新款鞋"],
      en: ["limited sneakers", "new sneakers", "sneaker drop", "new kicks"],
    },
    why: {
      zh: "限量与联名制造的是稀缺感不是需求，为发售价翻倍买单时，穿的次数未必比鞋柜里现有的多。",
      en: "Limited drops sell scarcity, not need — paying resale multiples rarely means more wears than the pairs already in rotation.",
    },
    options: {
      zh: ["现有鞋款清洁保养翻新", "换鞋带/配鞋垫改风格", "二手平台等热度回落"],
      en: ["Deep-clean and refresh current pairs", "Swap laces or insoles for a new look", "Wait out the hype on secondhand markets"],
    },
    reuseChannel: {
      zh: "一套鞋类清洁保养工具几十元，能把旧鞋洗出近新状态；二手平台热度过后的联名款价格常回落一半。",
      en: "A basic sneaker-care kit refreshes old pairs to near-new for a few bucks; post-hype collabs on resale platforms often drop back to half.",
    },
    alternative: {
      zh: "先给鞋柜里的鞋做一次保养——清洁、换鞋带、配新鞋垫，旧鞋翻新的成就感不输开新盒。",
      en: "Give the current rotation a spa day first — clean, new laces, fresh insoles; reviving a pair feels as good as unboxing one.",
    },
    reuse: {
      zh: "鞋柜里那双「舍不得穿」的鞋，正好拿出来轮换上岗，压箱底才是最大的浪费。",
      en: "That pair you've been \"saving\" belongs in the rotation — sitting in the box is the real waste.",
    },
    savingsHint: {
      zh: "消费前先看看家里已有的同类物品，也许能满足当下的使用需求。",
      en: "Before buying, check if you already have something similar at home that fits the need.",
    },
  },
  {
    id: "handbag_rotation",
    triggers: {
      zh: ["想买包", "新包", "包包", "买包"],
      en: ["new handbag", "buy a bag", "new purse", "designer bag"],
    },
    why: {
      zh: "包是最容易「买新厌旧」的品类：旧包往往还很好用，只是被新色新款转移了注意力。",
      en: "Bags are the classic buy-new-forget-old category — the old one usually works perfectly; a new color just hijacked the attention.",
    },
    options: {
      zh: ["闲置包轮换背", "旧包清洁保养/换肩带", "二手平台出旧入新"],
      en: ["Rotate the bags you own", "Clean or re-strap an old one", "Sell old, buy secondhand"],
    },
    reuseChannel: {
      zh: "皮革保养剂加一条新肩带就能让旧包焕新；闲置包挂上二手平台出掉，换新包的预算就有了。",
      en: "Leather conditioner plus a new strap revives an old bag; listing idle bags on resale platforms funds the next one.",
    },
    alternative: {
      zh: "先把柜子里的包轮换背起来——多数人包柜里躺着的包，比想象中多出好几个「新包」。",
      en: "Rotate through the ones you own first — most closets hold more \"new bags\" than their owners realize.",
    },
    reuse: {
      zh: "那个许久没背的包擦一擦就是新宠，轮换使用比固定背一只更养包。",
      en: "The long-idle bag buffs right back into favorite status — rotation keeps leather happier than daily duty too.",
    },
    savingsHint: {
      zh: "消费前先看看家里已有的同类物品，也许能满足当下的使用需求。",
      en: "Before buying, check if you already have something similar at home that fits the need.",
    },
  },
  {
    id: "wardrobe_audit",
    triggers: {
      zh: ["换季添衣", "换季囤衣", "衣橱换新", "换季购物车"],
      en: ["seasonal wardrobe", "wardrobe refresh", "fall clothes haul", "new season clothes"],
    },
    why: {
      zh: "换季是最容易批量下单的时刻，但去年同季的衣服多数还能穿，囤货换来的常常是重复的基本款。",
      en: "Season changes trigger batch orders, yet last year's same-season clothes mostly still fit — stock-ups usually just duplicate the basics.",
    },
    options: {
      zh: ["换季先做衣柜盘点", "列缺什么清单再买", "只补关键单品"],
      en: ["Audit the closet at season change", "Buy only from a gaps list", "Fill key pieces only"],
    },
    reuseChannel: {
      zh: "盘点出的闲置冬装可以在二手平台出给正好需要的人，腾出空间也回收一部分预算。",
      en: "Idle off-season pieces can go to people who need them via resale apps — freeing space and recouping budget.",
    },
    alternative: {
      zh: "换季第一件事是盘点不是下单：把衣柜过一遍、列出真正缺的单品，购物车通常会自己短一半。",
      en: "Make inventory — not checkout — the first move of the season: walk the closet, list real gaps, and the cart usually halves itself.",
    },
    reuse: {
      zh: "去年的换季衣物翻出来透气除皱，多数可以直接续命这一季。",
      en: "Air out and de-wrinkle last year's pieces — most can carry straight into this season.",
    },
    savingsHint: {
      zh: "消费前先看看家里已有的同类物品，也许能满足当下的使用需求。",
      en: "Before buying, check if you already have something similar at home that fits the need.",
    },
  },
  {
    id: "capsule_wardrobe",
    triggers: {
      zh: ["没衣服穿", "胶囊衣橱", "衣柜里没衣服"],
      en: ["nothing to wear", "capsule wardrobe", "capsule closet"],
    },
    why: {
      zh: "「没衣服穿」几乎从来不是数量问题，是搭配问题——单品够多但互相配不上的衣柜，才会天天显空。",
      en: "\"Nothing to wear\" is almost never a quantity problem — a closet of pieces that don't pair is what reads as empty daily.",
    },
    options: {
      zh: ["胶囊衣橱组合（互搭基础款）", "定一套个人制服", "配饰换风格"],
      en: ["A capsule of mix-and-match basics", "Set a personal uniform", "Change the styling, not the wardrobe"],
    },
    reuseChannel: {
      zh: "胶囊衣橱的起点恰恰是现有衣柜：挑出 20-30 件互搭单品，其余收进收纳箱轮换。",
      en: "A capsule starts exactly where your closet is: pick 20-30 pieces that pair well and rotate the rest into storage.",
    },
    alternative: {
      zh: "试试胶囊衣橱挑战：从现有衣柜挑出能互相搭配的二三十件，一个月内只穿它们——「没衣服穿」的感受会自己消失。",
      en: "Try a capsule challenge: pull 20-30 pieces from your own closet that all work together and wear only those for a month — the \"nothing to wear\" feeling dissolves on its own.",
    },
    reuse: {
      zh: "问题衣柜里被遗忘的单品，换一条裤子或一件外套就能重新入队。",
      en: "Forgotten pieces rejoin the lineup with one different trouser or jacket pairing them.",
    },
    savingsHint: {
      zh: "消费前先看看家里已有的同类物品，也许能满足当下的使用需求。",
      en: "Before buying, check if you already have something similar at home that fits the need.",
    },
  },
];
