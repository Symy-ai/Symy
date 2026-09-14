/**
 * green-alt-entries-health-care — 健康与个护词条 (zh+en 双语)
 *
 * 词条结构见 green-alt-types.ts。顺序追加在 digital-content 之后 (数组末位)。
 * 本域接住的是「为照顾自己而囤」的消费: 家庭药箱临期、隐形眼镜/护理液
 * 超节奏囤量、美容仪闲置后再买同类、香水重复入手、维生素成分重复——
 * 高频发生, 且容易变成临期浪费与闲置支出。叙事是「刚刚好的照顾」:
 * 身体照顾不等于囤积, 不制造外貌焦虑, 不羞辱囤货。
 *
 * 域内顺序: 按「药品 → 佩戴 → 器具 → 香氛 → 内服」排列;
 * 与既有域的重叠词全部让位先注册域 (测试锁定):
 *   - 补剂/蛋白粉系留 sports 域 supplement_stockup_math, 本域不含
 *     '补剂'/'蛋白粉'/'supplement' 子串, 维生素一律带 '维生素'/'vitamin' 边界
 *   - 护肤品囤货/替换装/面膜系留 beauty 域, 本域不收 '囤护肤品'/'refill' 语境
 *   - 宠物药系留 pets 域 pet_medicine_vet_first, 本域药品触发词全部带
 *     人用场景词 ('感冒药'/'退烧药'/'肠胃药'/'常备药'), 不含裸 '药'/'medicine'
 *
 * en 触发词红线: 禁裸 'medicine'/'vitamins'/'perfume' (query 级误伤面太大),
 * 一律用 'stock up on medicine'/'buy vitamins'/'buy perfume' 等带购买动作的
 * 多词形态; 'supplements' 裸词让位 sports 域, 不入本域词表。
 *
 * 触发语义红线: 全部触发词带购买/囤积动作 ('买'/'囤'/'haul'/'stock up'),
 * 纯使用与状态讨论 ('我在吃维生素'/'药箱在哪'/'今天涂防晒'/'美容仪怎么用')
 * 一律不命中 (测试锁定)。
 *
 * 医疗红线: 只做清点、临期先用与就医前不重复囤药的绿色/省钱提示;
 * 文案零剂量、零疗效、零诊断、零用药建议; 过期药品只指路回收点。
 * 文案红线 (与既有域同款): 不说教, 无碳足迹数值, 无金额承诺 (全字段 digit-free),
 * 荣誉框架——「刚刚好的照顾」是体面; 绝不羞辱囤货、不暗示「你穷」。
 *
 * 绿色偏好开关 (symy_green_pref === 'off') 由调用方判断, 词条层不特判。
 */

import type { GreenAlternativeEntry } from './green-alt-types';

export const GREEN_ALT_ENTRIES_HEALTH_CARE: readonly GreenAlternativeEntry[] = [
  {
    id: "medicine_expiry_audit",
    triggers: {
      zh: ["囤感冒药", "囤退烧药", "囤肠胃药", "囤常备药", "药品囤货"],
      en: ["stock up on medicine", "medicine stockpile", "stockpiling medicine", "hoarding cold medicine", "buy medicine in bulk"],
    },
    why: {
      zh: "药箱里的存货往往比记忆中多, 大促凑单和换季备着, 容易放过有效期, 最后整盒原样丢掉。",
      en: "Cabinet stock runs deeper than memory — promo bundles and seasonal backups often outlive their dates and get tossed unopened.",
    },
    options: {
      zh: ["先清点药箱再决定买不买", "临期的放在顺手位置先用", "小包装按季补, 不囤年量"],
      en: ["Inventory the cabinet before buying", "Front the near-expiry boxes", "Restock small each season, not by the year"],
    },
    reuseChannel: {
      zh: "过期和临期药品别随生活垃圾丢弃, 很多社区药店和医院药房设有药品回收点, 顺手清掉库存更安心。",
      en: "Many community pharmacies run medicine take-back points — expiring stock goes there, not into the household trash.",
    },
    alternative: {
      zh: "买药前先做一次药箱清点: 把临期的挪到最顺手的位置优先用, 就诊开药时先说明家里已有的库存, 不重复囤同一种。",
      en: "Before buying medicine, audit the cabinet: front the near-expiry boxes, and tell the clinic what you already have so nothing gets double-stocked.",
    },
    reuse: {
      zh: "你手头的药箱大概率已经备着常用款, 先清点再下单, 刚刚好的照顾不靠数量堆出来。",
      en: "Your cabinet likely already covers the basics — count it before checkout; just-right care isn't built on quantity.",
    },
    savingsHint: {
      zh: "下单药品前先清点药箱, 临期的先用, 别让抽屉深处的存货悄悄过期又迎来新的一盒。",
      en: "Count the cabinet before ordering: use the near-expiry boxes first, so nothing quietly expires in a drawer as a new one arrives.",
    },
  },
  {
    id: "contact_lens_supply_pace",
    triggers: {
      zh: ["囤美瞳", "囤隐形眼镜", "美瞳囤货", "隐形眼镜囤货", "护理液囤"],
      en: ["stock up on contact lenses", "contact lens stockpile", "hoarding contact lenses", "buy contacts in bulk", "colored contacts haul"],
    },
    why: {
      zh: "隐形眼镜和护理液都有使用期限, 直播间凑单囤下的整年用量, 往往用不到一半就过了期。",
      en: "Lenses and solution both carry shelf lives — a year's haul from a livestream deal usually expires before you finish half of it.",
    },
    options: {
      zh: ["按佩戴节奏按月补货", "先清点现有库存再下单", "小包装常买常新代替整年囤量"],
      en: ["Restock monthly to your wear rhythm", "Count your stash before ordering", "Small steady batches over a year's stock"],
    },
    reuseChannel: {
      zh: "囤多了的未拆封美瞳可以在闲置平台转给用得上的人, 开封过的镜片和护理液别转手也别收; 补货按自己的节奏小批量买。",
      en: "Unopened spare lenses can move to someone who'll use them via secondhand listings — never pass on opened ones; then restock in small batches.",
    },
    alternative: {
      zh: "按佩戴节奏补货比凑单囤货更划算: 镜片和护理液都有有效期, 小批量常买常新, 比整年囤量用得完、花得省。",
      en: "Buying to your wear rhythm beats bulk hauls: lenses and solution expire, so small steady batches cost less in the end than a year's stock you can't finish.",
    },
    reuse: {
      zh: "先翻翻化妆盒和抽屉: 散落的日抛和赠品小瓶护理液清点一下, 也许这个月都不用买。",
      en: "Raid the vanity drawer first: stray dailies and gift-size solution often add up to a month you don't need to buy.",
    },
    savingsHint: {
      zh: "补镜片前先清点手头库存, 按佩戴节奏小批量买, 让每一副都在有效期内完成使命。",
      en: "Count your lens stock before restocking and buy small to your rhythm — every pair finishes its term within date.",
    },
  },
  {
    id: "beauty_device_idle_check",
    triggers: {
      zh: ["买美容仪", "入手美容仪", "美容仪换新", "换新美容仪", "囤美容仪"],
      en: ["buy a beauty device", "buying a beauty gadget", "beauty device upgrade", "another facial device"],
    },
    why: {
      zh: "美容仪最常见的状态不是坏掉, 是闲置: 上一台还在抽屉里吃灰, 新款的种草已经安排上了。",
      en: "The most common state of a beauty device isn't broken — it's idle: the last one is still gathering dust while the new model's hype rolls in.",
    },
    options: {
      zh: ["先重启闲置的那台用满一个月", "列出手头仪器清单再决定", "门店护理先体验再考虑购入"],
      en: ["Revive the idle one for a month first", "List what you own before deciding", "Book a salon session before buying"],
    },
    reuseChannel: {
      zh: "成色好的闲置美容仪在二手平台很抢手, 出掉吃灰的那台, 差价够好几次门店护理; 附上配件和说明书更容易出手。",
      en: "Well-kept idle devices sell briskly secondhand — the one gathering dust can fund several salon sessions; listings with original accessories move fastest.",
    },
    alternative: {
      zh: "想换新美容仪前先给旧的那台一个机会: 充上电连续用满一个月, 还想升级再买不迟——仪器的价值在次数里, 不在发布会上。",
      en: "Before upgrading, give the current device one more chance: a full month of real use; upgrade only if it still falls short — a device's worth lives in sessions, not launches.",
    },
    reuse: {
      zh: "你手头可能已经有一台闲置的仪器, 先把它从抽屉里请出来, 刚刚好的照顾往往已经在你家里。",
      en: "You may already own an idle device — take it back out of the drawer; just-right care often already lives at home.",
    },
    savingsHint: {
      zh: "下单新款美容仪前, 先给抽屉里的旧机器一个月出勤, 再决定要不要让它退休。",
      en: "Before ordering the new model, give the old device a month of attendance — then decide if it truly earns retirement.",
    },
  },
  {
    id: "fragrance_rotation",
    triggers: {
      zh: ["买香水", "囤香水", "入手香水", "再买香水", "重复买香水"],
      en: ["buy perfume", "buying cologne", "perfume haul", "stocking up on perfume", "repurchase perfume"],
    },
    why: {
      zh: "香水大瓶装用到腻是常态: 同款喷到中途就审美疲劳, 柜子里留下的半瓶往往比空瓶多。",
      en: "Big bottles outlast affection: novelty runs out before the juice does, and half-finished flanks outnumber empties on most shelves.",
    },
    options: {
      zh: ["小容量或分装先试", "两三瓶轮换代替重复入手同款", "空瓶之后再迎接下一瓶"],
      en: ["Travel sizes and decants first", "Rotate two or three instead of repeat-buying one", "Finish a bottle before the next"],
    },
    reuseChannel: {
      zh: "分装小样在二手平台和香味社群里流转很多, 先试嗅再决定正装; 成色好的闲置香水转手也容易找到新主人。",
      en: "Decants circulate widely on secondhand apps and fragrance communities — try a vial before the full bottle; well-kept bottles resell easily too.",
    },
    alternative: {
      zh: "让柜子里的香水轮换上岗而不是重复入手同款: 小容量更划算, 空瓶再补, 每一瓶都物尽其用。",
      en: "Let the bottles you own rotate instead of repeat-buying the same scent: smaller sizes cost less, and a finished bottle earns its replacement.",
    },
    reuse: {
      zh: "你手头的柜子里也许已经有一瓶被遗忘的香水, 翻出来轮换着用, 「新味道」可能已经在家里。",
      en: "A forgotten bottle may already sit in your cabinet — rotate it back in; the \"new scent\" may already be at home.",
    },
    savingsHint: {
      zh: "想入新香水前先清点柜子, 让旧瓶轮换上岗, 空瓶之后再迎接新的味道。",
      en: "Before a new perfume, audit the shelf and rotate the old bottles back in — welcome the next scent only after an empty bottle.",
    },
  },
  {
    id: "vitamin_duplicate_check",
    triggers: {
      zh: ["买维生素", "囤维生素", "维生素囤货", "买复合维生素", "又买维生素"],
      en: ["buy vitamins", "vitamin stockpile", "stocking up on vitamins", "another bottle of vitamins", "buy a multivitamin"],
    },
    why: {
      zh: "复合维生素的成分表高度重叠, 柜子里几瓶同时开封, 常常这瓶没吃完那瓶又拆新, 过期成了默认结局。",
      en: "Multivitamin labels overlap heavily — several open bottles later, the newest unseals before the last one finishes, and expiry becomes the default ending.",
    },
    options: {
      zh: ["先吃完手头的再买新的", "对照成分表查重复", "一瓶开口, 不叠瓶"],
      en: ["Finish current bottles first", "Compare labels for overlaps", "One open bottle at a time — no stacking"],
    },
    reuseChannel: {
      zh: "囤多的未拆封维生素在闲置平台常有转让, 先淘再买; 顺手对照一下手头几瓶的成分表, 重叠的先吃完。",
      en: "Sealed spares circulate on secondhand apps — look there before retail; and compare labels across your open bottles, finishing the overlaps first.",
    },
    alternative: {
      zh: "买维生素前先做一次成分对照: 想买的和手头没吃完的往往成分重叠, 先吃完再买, 照顾和开销都更清爽。",
      en: "Before buying vitamins, cross-check labels: what you're eyeing usually overlaps what's still open at home — finish first, buy later; care and spending both stay tidy.",
    },
    reuse: {
      zh: "柜子里没吃完的那几瓶就是现成的库存, 先见底再开新, 刚刚好的照顾不靠瓶数。",
      en: "The unfinished bottles already are your stock — empty them before unsealing a new one; just-right care isn't counted in bottles.",
    },
    savingsHint: {
      zh: "拆新瓶之前先看看柜子里开了封的, 成分重叠的几瓶先见底, 别让它们排队过期。",
      en: "Before unsealing a new bottle, check the open ones — finish the overlapping stock first instead of letting them queue for expiry.",
    },
  },
];
