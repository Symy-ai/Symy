/**
 * green-alt-entries-electronics — 高环境影响词条: 3C 数码 (zh+en 双语)
 *
 * 词条结构见 green-alt-types.ts。顺序接 wear/home/beauty 之后
 * (穿戴/工艺在前, 家居/日用居中, 美妆个护再后, 数码大件最后)。
 * 域内顺序: 维修在前 ("手机屏幕碎了" 先命中维修而非换新)。
 *
 * 文案红线 (与 beauty 同款): 不说教, 无碳足迹数值 (只定性 e-waste 叙事),
 * 每条含 "面子话术 + 里子省钱点" 两要素 (定性省钱描述, 不编造数字)。
 *
 * 绿色偏好开关 (symy_green_pref === 'off') 由调用方判断, 词条层不特判。
 */

import type { GreenAlternativeEntry } from './green-alt-types';

export const GREEN_ALT_ENTRIES_ELECTRONICS: readonly GreenAlternativeEntry[] = [
  {
    id: "repair_first",
    triggers: {
      zh: ["屏幕碎了", "官方维修", "修一下手机", "维修"],
      en: ["broken screen", "get it repaired", "repair", "fix my phone"],
    },
    why: {
      zh: "数码设备的大多数故障只坏在屏幕或电池一个部件上，为单点故障换整机，是电子废弃物里最可惜的一类。",
      en: "Most gadget failures come down to a single part — screen or battery — and swapping the whole device for one broken part is the most avoidable kind of e-waste.",
    },
    options: {
      zh: ["官方售后换屏/换电池", "授权维修点", "自助维修计划 (如厂商自修件)"],
      en: ["Official screen or battery service", "Authorized repair shops", "Self-repair programs with maker parts"],
    },
    reuseChannel: {
      zh: "过保机器可以去授权维修点或口碑好的第三方，报价通常比官价友好。",
      en: "Out of warranty, authorized shops or well-reviewed independents usually quote friendlier than official rates.",
    },
    alternative: {
      zh: "修而不是换，是老玩家最认的长期主义：一次换电池续命两三年，成本远低于新机。",
      en: "Repair over replace is the long-term move veterans respect — one battery swap adds two or three years at a fraction of a new device.",
    },
    reuse: {
      zh: "先备份再送修，碎屏机数据都还在，修好就是完全可用的一台机器。",
      en: "Back it up first, then send it in — the data on a cracked-screen device survives, and once fixed it's a fully usable machine.",
    },
    savingsHint: {
      zh: "消费前先看看家里已有的同类物品，也许能满足当下的使用需求。",
      en: "Before buying, check if you already have something similar at home that fits the need.",
    },
  },
  {
    id: "refurb_gadget",
    triggers: {
      zh: ["笔记本电脑", "笔记本", "新手机", "手机"],
      en: ["laptop", "macbook", "iphone", "new phone"],
    },
    why: {
      zh: "电脑和手机是家里最重的电子件，生产环节的资源投入远超使用期，整机提前淘汰意味着这些都跟着提前作废。",
      en: "Laptops and phones carry the heaviest embedded footprint of household electronics — retiring one early writes off all of that ahead of schedule.",
    },
    options: {
      zh: ["官方翻新版 (refurb)", "上一代机型", "厂商官翻旗舰店"],
      en: ["Certified refurbished units", "Last year's model", "Maker's own refurb store"],
    },
    reuseChannel: {
      zh: "闲鱼和官翻渠道都有成色很好的上代机型，验机宝验完再收更稳。",
      en: "Secondhand marketplaces and maker refurb stores both list well-kept last-gen units — check with a verifier service first.",
    },
    alternative: {
      zh: "官翻机和上一代机型做的是同一批活，长期主义玩家的经典选择，价格通常低一大截。",
      en: "A certified refurb or last-gen model does the exact same job — a long-term gear nerd's classic move, usually a good chunk cheaper.",
    },
    reuse: {
      zh: "你手头这台如果只是慢了点，清个内存换块电池往往能再战两年，未必需要整机换新。",
      en: "If yours is just feeling slow, clearing storage or a fresh battery often buys another two years — a full replacement may not be needed.",
    },
    savingsHint: {
      zh: "消费前先看看家里已有的同类物品，也许能满足当下的使用需求。",
      en: "Before buying, check if you already have something similar at home that fits the need.",
    },
  },
  {
    id: "secondhand_audio_tablet",
    triggers: {
      zh: ["蓝牙耳机", "耳机", "平板"],
      en: ["earbuds", "airpods", "tablet", "ipad"],
    },
    why: {
      zh: "耳机和平板是个头小但换代最勤的电子件，真无线耳机还内置电池，坏了整副报废，很难单独维修。",
      en: "Earbuds and tablets get refreshed most often for their size — and true-wireless buds have built-in batteries that doom the whole pair when they die.",
    },
    options: {
      zh: ["二手平台 95 新以上", "上代旗舰耳机", "可换电池/换耳垫的型号"],
      en: ["Secondhand listings rated 95% or better", "Last-gen flagship buds", "Models with replaceable batteries or pads"],
    },
    reuseChannel: {
      zh: "闲鱼上 95 新耳机和平板转让极多，很多是冲动购入几乎没用过的。",
      en: "Secondhand apps are full of 95%-new buds and tablets — often impulse buys barely touched.",
    },
    alternative: {
      zh: "二手和上代旗舰的音素质感都在线，换个好壳贴个好膜，用起来和全新没差别。",
      en: "Secondhand and last-gen flagships still sound and feel right — with a good case and screen film, they're indistinguishable from new in use.",
    },
    reuse: {
      zh: "抽屉里那副旧耳机可能只是耳垫老化，换副耳垫清洁一下就能复活。",
      en: "That old pair in your drawer may just have worn pads — new pads and a clean can bring them right back.",
    },
    savingsHint: {
      zh: "消费前先看看家里已有的同类物品，也许能满足当下的使用需求。",
      en: "Before buying, check if you already have something similar at home that fits the need.",
    },
  },
  {
    id: "trade_in_upgrade",
    triggers: {
      zh: ["以旧换新", "换新机", "新机发布", "升级换代"],
      en: ["trade in", "trade-in", "new model just dropped", "upgrade my phone"],
    },
    why: {
      zh: "发布会后的换新冲动大多来自「想拥有新东西」而不是「旧的不好用」，整机提前退役就是提前产生的电子废弃物。",
      en: "Post-launch upgrade urges mostly come from wanting the new thing, not needing it — retiring a working device early is e-waste created ahead of time.",
    },
    options: {
      zh: ["以旧换新抵扣差价", "延后一代再换", "把旧机给家人续用"],
      en: ["Trade in to offset the gap", "Wait one generation", "Pass the old one to family"],
    },
    reuseChannel: {
      zh: "官方以旧换新和闲鱼都能给旧机估值，两边比价再决定出手渠道。",
      en: "Official trade-in programs and secondhand apps both value old devices — compare both before choosing.",
    },
    alternative: {
      zh: "真要换就用以旧换新把旧机价值吃回来，或者干脆延后一代——差价留在自己口袋里，旧机也多服役一段时间。",
      en: "If you do upgrade, trade in to reclaim the old device's value — or simply wait a generation: the gap stays in your pocket and the old unit serves longer.",
    },
    reuse: {
      zh: "你现在的机器去年的旗舰也才一年，性能对大多数日常完全够用，先问问自己卡在哪了。",
      en: "Your current phone was last year's flagship — still plenty for daily use. Ask yourself what's actually slowing you down.",
    },
    savingsHint: {
      zh: "消费前先看看家里已有的同类物品，也许能满足当下的使用需求。",
      en: "Before buying, check if you already have something similar at home that fits the need.",
    },
  },
  {
    id: "cable_hoard",
    triggers: {
      zh: ["数据线", "充电线", "买根线"],
      en: ["charging cable", "usb-c cable", "lightning cable", "new cable"],
    },
    why: {
      zh: "抽屉里的旧线材大多还能用，新线买来常常只是颜色和新头的区别，旧线就成了闲置废弃物。",
      en: "Drawer cables mostly still work — a new one is often just a color or connector whim away, leaving the old ones as idle waste.",
    },
    options: {
      zh: ["复用家里现有线材", "第三方认证兼容款", "多合一编织线一根顶三根"],
      en: ["Reuse what's in the drawer", "Certified third-party compatibles", "One braided multi-connector instead of three"],
    },
    reuseChannel: {
      zh: "闲鱼上全新的第三方认证线常有低价，原装溢价不一定值得。",
      en: "Sealed certified third-party cables go cheap secondhand — the OEM premium isn't always worth it.",
    },
    alternative: {
      zh: "认证兼容款过同样的安全标准，价格常是原装的一半以下；一根多合一能替掉三根单头线。",
      en: "Certified compatibles pass the same safety standards, often under half the OEM price — and one multi-connector replaces three singles.",
    },
    reuse: {
      zh: "先把抽屉里的线理一遍，你大概率已经有一根能用的，只是忘了。",
      en: "Sort through your drawer first — odds are you already own one that works; it's just forgotten.",
    },
    savingsHint: {
      zh: "消费前先看看家里已有的同类物品，也许能满足当下的使用需求。",
      en: "Before buying, check if you already have something similar at home that fits the need.",
    },
  },
];
