/**
 * green-alt-entries-repair-care — 维修与再利用词条 (zh+en 双语)
 *
 * 词条结构见 green-alt-types.ts。顺序追加在 health-care 之后 (数组末位)。
 * 本域接住的是「坏了/旧了/想换新」背后的维修保养意图: 鞋包修复、缝补改衣、
 * 手机电池与屏幕检修、家电故障排查、自行车保养。叙事是「我会照顾东西,
 * 也会照顾钱」: 修得好也是能力, 不暗示用户贫穷或抠门。
 *
 * 与既有域的分工 (本域只在维修/保养/改造/延寿意图上触发, 不做一般购买拦截):
 *   - furniture 域 repair_reupholster 保有 '沙发翻新'/'椅子修'/'换布面'/'家具翻新',
 *     household 域 small_appliance 保有 '小家电'/'新家电' (购买拦截), 本域只收
 *     在用家电的故障语境 ('洗衣机响'/'冰箱不制冷')
 *   - 裸购买词仍由既有域承接: '球鞋'/'买衣服'→apparel, '手机'/'新手机'→electronics,
 *     '新包'/'包包'→apparel; 本域触发词全部避开这些子串
 *
 * 与 electronics repair_first / home batteries 的词表让位 (既有词条在前先命中,
 * 测试锁定, 本域不抢):
 *   - 裸 '维修'/'repair'/'屏幕碎了'/'broken screen' 留在 electronics repair_first;
 *     本域用 '屏幕摔碎了'/'碎屏了'/'屏幕裂了'/'cracked screen' 承接 (与前者无子串交集)
 *   - 裸 '电池'/'battery' 留在 home batteries (购买语境); 本域用
 *     '电量不耐用了'/'掉电快'/"won't hold a charge" 等不带裸词的口语变体
 *
 * 安全红线: 电器/电池/刹车相关文案只建议官方售后、授权点与专业检修,
 * 不提供动手拆修指导, 不承诺维修结果; 旧机退役指路以旧换新或正规回收。
 * 文案红线 (与既有域同款): 不说教, 无碳足迹数值, 全字段 digit-free,
 * 荣誉框架——「修得好也是能力」; 绝不暗示「你穷」。
 *
 * 绿色偏好开关 (symy_green_pref === 'off') 由调用方判断, 词条层不特判。
 */

import type { GreenAlternativeEntry } from './green-alt-types';

export const GREEN_ALT_ENTRIES_REPAIR_CARE: readonly GreenAlternativeEntry[] = [
  {
    id: "shoe_repair_first",
    triggers: {
      zh: ["修鞋", "换鞋底", "鞋底磨了", "鞋开胶", "鞋跟磨了"],
      en: ["resole", "sole is coming off", "heel is worn down", "shoes came unglued", "polish my shoes"],
    },
    why: {
      zh: "鞋的报废多半从小毛病开始: 鞋跟磨偏、开胶、鞋底磨薄, 直接淘汰等于把还能穿的部分一起丢掉。",
      en: "Shoes rarely fail all at once — a worn heel, loose glue or a thinning sole retires the whole pair while most of it still has miles left.",
    },
    options: {
      zh: ["鞋跟磨偏先配掌, 鞋底磨薄先换底", "开胶送去粘合加固, 不急着淘汰", "换季做一次清洁上油保养"],
      en: ["Resole or add heel taps before retiring the pair", "Re-glue loose seams at a repair stand", "Clean and condition each season"],
    },
    reuseChannel: {
      zh: "换底、粘胶、换跟都是修鞋摊和皮具护理店的日常手艺, 先问清工价再送修; 实在修不了的, 挂上闲鱼出给拿旧鞋改造的手作爱好者。",
      en: "Cobblers handle resoling, re-gluing and heel repairs as everyday work — ask for a quote first; pairs beyond saving still find crafters on secondhand apps.",
    },
    alternative: {
      zh: "先修再换是照顾东西的第一课: 鞋跟、鞋底、开胶都是小工程, 修好的那双往往比新鞋更合脚——修得好也是能力。",
      en: "Repair before replace is step one of caring for your things: heels, soles and loose glue are small jobs, and the fixed pair usually fits better than new — fixing well is a skill.",
    },
    reuse: {
      zh: "鞋柜里那双只是有点磨的鞋, 擦净上油换副鞋带就能重新上岗, 你手头的大概率比想象中耐穿。",
      en: "The pair that's only slightly worn likely needs polish and laces more than replacement — what you own is tougher than it looks.",
    },
    savingsHint: {
      zh: "鞋跟鞋底先修再换, 一次保养换回一整季的出勤, 比急着买新鞋更经得起算。",
      en: "Fix the heel before replacing the pair — one round of care buys another season of wear and adds up in your favor.",
    },
  },
  {
    id: "bag_care_repair",
    triggers: {
      zh: ["包带断了", "换包带", "皮包划伤了", "包五金坏了", "包内衬破了"],
      en: ["bag strap broke", "strap snapped", "scuffed bag", "bag lining tore", "replace the strap"],
    },
    why: {
      zh: "包的退役理由常常只是一根断带、一处划痕或掉漆的五金, 主体和内里其实还好好的。",
      en: "Bags usually retire over a broken strap, one deep scuff or tarnished hardware, while the body and lining still have years in them.",
    },
    options: {
      zh: ["断带换新肩带, 五金找护理店配", "划痕用皮革保养剂养护淡化", "内衬破损交护理店换衬翻新"],
      en: ["Swap in a new strap, match hardware at a care shop", "Condition scuffs with leather care cream", "Have a pro reline worn interiors"],
    },
    reuseChannel: {
      zh: "皮具护理店能换带、换五金、换内衬, 顺带做一次深度清洁; 不想修的旧包擦干净挂上闲鱼, 出给喜欢改造的人也是归宿。",
      en: "Leather care shops swap straps, hardware and linings, often with a deep clean included; a cleaned-up bag you're done with finds easy takers on resale apps.",
    },
    alternative: {
      zh: "包的一生不该被一根断带终结: 换带、养护、换衬都是成熟手艺, 修好的旧包往往比新包更耐用——会照顾东西, 也是会照顾钱包。",
      en: "A bag shouldn't retire over one strap: re-strapping, conditioning and relining are mature trades, and a cared-for bag often outlasts a new one — caring for things is caring for your budget.",
    },
    reuse: {
      zh: "柜子里那只被冷落的包, 擦一遍上点保养剂多半就能回岗, 先轮换起来再看要不要添新。",
      en: "The neglected bag in the closet likely just needs a wipe and some conditioner — rotate it back before adding another.",
    },
    savingsHint: {
      zh: "包带或五金坏了先修先配, 让柜子里的包多服役一轮, 再考虑迎接新的那只。",
      en: "Repair the strap or hardware first and let a closet bag serve another tour before a new one checks in.",
    },
  },
  {
    id: "clothes_mend_alter",
    triggers: {
      zh: ["裤子太长", "改裤脚", "换拉链", "拉链坏了", "衣服开线了"],
      en: ["hem my pants", "trousers too long", "replace the zipper", "zipper slipped", "mend my clothes"],
    },
    why: {
      zh: "太多衣服退场只是因为裤脚长了一截、拉链滑了齿或开了一道线, 布料本身还完好。",
      en: "Plenty of clothes leave over a long hem, a slipped zipper or one open seam, while the fabric itself is still perfectly good.",
    },
    options: {
      zh: ["裤脚改短、腰围收放, 裁缝铺都能做", "拉链更换是小活, 顺带检查别的线缝", "小口先缝住, 精细的交织补师傅处理"],
      en: ["Shorten hems or take in waists at a tailor", "Zipper swaps are small jobs — check other seams while at it", "Stitch small tears now, leave invisible mending to a pro"],
    },
    reuseChannel: {
      zh: "小区裁缝铺和干洗店大多能改裤长、换拉链、缝合开线, 一次小改动常能让整件衣服回到正循环。",
      en: "Neighborhood tailors and dry cleaners handle hemming, zippers and open seams — one small alteration often returns a whole garment to rotation.",
    },
    alternative: {
      zh: "改得合身比买得凑合更体面: 裤长、腰围、拉链都是裁缝铺的常规活, 会缝会改也是能力, 衣橱自然更耐久。",
      en: "Altered-to-fit beats bought-on-impulse: hems, waists and zippers are a tailor's routine, and mending well is a skill that keeps a wardrobe going.",
    },
    reuse: {
      zh: "先翻翻衣架上那几件差点意思的: 多半改一处就能常穿, 你手头的衣橱比购物车里的更懂你。",
      en: "Check the rail of almost-rights first — many need one alteration to become regulars; your closet knows you better than the cart does.",
    },
    savingsHint: {
      zh: "裤子太长先改不是先换, 一次合身的改动换来的是整个换季不用添新。",
      en: "Hem first, replace later — one fitting alteration can carry you through the whole season without new buys.",
    },
  },
  {
    id: "phone_battery_screen_repair",
    triggers: {
      zh: ["电量不耐用了", "掉电快", "屏幕摔碎了", "碎屏了", "屏幕裂了"],
      en: ["cracked screen", "screen is cracked", "shattered my screen", "won't hold a charge", "drains fast"],
    },
    why: {
      zh: "电量衰减和屏幕碎裂是最常见的两处伤, 机身与其余部件往往仍然健康, 整机换新等于替两个零件买单。",
      en: "Tired charge and cracked glass are the two most common wounds — the body and everything else stay healthy, so a full replacement pays for two parts with one device.",
    },
    options: {
      zh: ["先查保修与官方换电池、换屏价", "过保机对比授权维修点报价", "评估后确需换新, 走以旧换新抵一程"],
      en: ["Check warranty and official battery or screen pricing first", "Compare authorized repair quotes once out of warranty", "If replacement truly fits, go through trade-in"],
    },
    reuseChannel: {
      zh: "官方售后和授权维修点都做换电池、换屏, 送修前备份好数据; 评估下来确实不修的, 出二手或以旧换新也比抽屉吃灰强。",
      en: "Official service and authorized shops handle battery and screen swaps — back up your data first; if repair truly doesn't add up, resale or trade-in beats a drawer.",
    },
    alternative: {
      zh: "先评估再换新: 换块电池常常就是大半台新机的顺畅感, 屏幕碎了主体还健康, 修得好也是能力。",
      en: "Evaluate before replacing: a fresh battery often restores most of the snap, and cracked glass doesn't retire a healthy device — fixing well is a skill.",
    },
    reuse: {
      zh: "先给手头这台一次机会: 清理存储、查一下电量健康度, 很多卡了旧了的感受其实只是该检修了。",
      en: "Give the current device one check first: clear storage, look at charge health — much of what feels old is just due for service.",
    },
    savingsHint: {
      zh: "换新之前先要一份维修报价, 电量和屏幕的单点修复, 往往是差价最大的那道算术。",
      en: "Get a repair quote before a new cart — single-point fixes on charge and glass carry the widest gap in the math.",
    },
  },
  {
    id: "appliance_checkup_repair",
    triggers: {
      zh: ["洗衣机响", "洗衣机不启动", "洗衣机不脱水", "冰箱不制冷", "家电不启动"],
      en: ["washing machine is loud", "washer won't start", "fridge not cooling", "appliance won't start", "dishwasher not draining"],
    },
    why: {
      zh: "大家电的异响和不启动多数是零件老化或需要检修的信号, 直接换新等于放弃整台机器里还健康的大部分。",
      en: "Odd noises and no-starts in big appliances usually point to an aged part that needs service — replacing whole writes off most of a machine that's still healthy.",
    },
    options: {
      zh: ["先查保修期, 在保优先约官方检修", "过保请品牌售后或专业检修上门", "检修报价出来再和换新比一比"],
      en: ["Check the warranty first — in-warranty means official service", "Out of warranty, book the brand's service or a professional checkup", "Compare the repair quote against replacement before deciding"],
    },
    reuseChannel: {
      zh: "品牌售后和持证维修师傅能做安全检修, 机器内部的事交给专业的人不带侥幸; 确认退役的旧机走以旧换新或正规回收渠道。",
      en: "Brand service and licensed technicians handle safety checkups — internal electrical work belongs to professionals; retired units go to trade-in or proper recycling.",
    },
    alternative: {
      zh: "家电的健康也值得一次体检: 异响和不启动先约专业检修, 在保的走官方售后, 修得回就再战几年。",
      en: "Appliances deserve a checkup too: odd noises and no-starts start with a professional inspection — official service while in warranty, and a fixed machine serves for years.",
    },
    reuse: {
      zh: "换新前先翻出说明书和保修卡, 确认该检修还是该退休, 让它体面地完成服役。",
      en: "Before shopping, dig out the manual and warranty card and decide whether it's due for service or a dignified retirement.",
    },
    savingsHint: {
      zh: "家电先检修再决定换不换, 在保的走官方售后, 一份检修结论比冲动换新更有底。",
      en: "Service the appliance before deciding on a swap — in warranty, official service first; a checkup verdict beats an impulse replacement.",
    },
  },
  {
    id: "bike_maintenance",
    triggers: {
      zh: ["刹车不行", "刹车坏了", "补胎", "车胎没气", "自行车保养", "电动车保养"],
      en: ["brakes are squealing", "brake pads worn", "flat tire", "chain is rusty", "bike tune-up", "e-bike service"],
    },
    why: {
      zh: "骑行的顺畅度多数取决于保养频率而不是车的新旧: 链条、胎压、刹车线这些小部位决定整车状态。",
      en: "How well a ride feels usually tracks maintenance cadence, not model year — chain, tire pressure and brake lines set the whole machine's state.",
    },
    options: {
      zh: ["定期回车行做保养调校", "胎压补气、链条清洁是日常课", "刹车与电动车电路的事交给专业师傅"],
      en: ["Book regular tune-ups at the shop", "Tire pressure and chain cleaning are the daily routine", "Leave brakes and e-bike wiring to professional hands"],
    },
    reuseChannel: {
      zh: "小区车行和品牌售后点都能做保养、换胎、调刹车; 电动车电路与刹车检修一定走专业渠道, 骑行安全不省这道工序。",
      en: "Local bike shops and brand service points handle tune-ups, tires and brake adjustments; for e-bike wiring and brakes, professional service is the only route — never skip it for safety.",
    },
    alternative: {
      zh: "刹车不行先检修再谈换车: 一次专业调校加一套例行保养, 常常就是像换了辆车一样的全部秘密。",
      en: "Before talking replacement, service the brakes: one professional tune plus a care routine is the whole secret behind that like-new feel.",
    },
    reuse: {
      zh: "先看看楼下那辆: 补气、紧螺丝、链条上油之后多半神清气爽, 会养车的人骑车都更顺。",
      en: "Start with the one you own: air in the tires, chain oiled and bolts snug go a long way — maintained rides simply feel better.",
    },
    savingsHint: {
      zh: "车先保养再考虑换新, 刹车轮胎交给车行, 例行养护把整车的寿命骑出满格。",
      en: "Maintain before you replace — shop-tuned brakes and tires ride the full life out of the machine.",
    },
  },
];
