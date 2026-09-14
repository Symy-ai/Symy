/**
 * green-alt-entries-furniture — 家具/大件耐用品词条 (zh+en 双语)
 *
 * 词条结构见 green-alt-types.ts。顺序追加在 gifting 之后 (数组末位)。
 * 本域接住的是「大件耐用品消费冲动」(沙发/书架/床垫/餐桌这类单笔金额
 * 最大的家用采购), 特点是省幅以数十到数百美元计——二手九成新转卖/
 * 搬家期租用/翻新重包覆, 每条都是真金白银的差额。
 *
 * 域内顺序 (匹配即优先级): repair_reupholster 在 secondhand_furniture 之前
 * (「沙发翻新」含「沙发」, 更具体的先命中); mattress_quality_over_cheap 在
 * big_ticket_cooldown_72h 之前 (「便宜家具」含「家具」, 泛化 trigger 垫底,
 * 同 gifting 域「礼物」垫底先例)。
 *
 * 文案红线 (与既有域同款): 不说教, 无碳足迹数值, 荣誉框架,
 * 省钱数学只出现在 suggestion 文案里 ($25 时薪 / 摊到每年框架),
 * 绝不进 share/honor 面, 绝不暗示「买不起」—— 聪明买大件是懂行,
 * 不是将就。
 *
 * 绿色偏好开关 (symy_green_pref === 'off') 由调用方判断, 词条层不特判。
 */

import type { GreenAlternativeEntry } from './green-alt-types';

export const GREEN_ALT_ENTRIES_FURNITURE: readonly GreenAlternativeEntry[] = [
  {
    id: "repair_reupholster",
    triggers: {
      zh: ["沙发翻新", "椅子修", "换布面", "家具翻新"],
      en: ["reupholster", "reupholstering", "reupholster the couch", "couch makeover", "sofa refresh"],
    },
    why: {
      zh: "大件的「旧」常常只是「面」旧: 框架还结实, 磨损的是布面、坐垫和腿。为最耐用的部分没坏而换掉整件, 是大件消费里最常见的浪费——翻新只换掉真正旧的那一层。",
      en: "A big piece often only looks old on the surface: the frame is solid, the fabric and cushion are what wore. Replacing the whole item because its longest-lasting part hasn't broken is classic big-ticket waste — reupholstering swaps only the layer that actually aged.",
    },
    options: {
      zh: ["沙发重包覆换新面料", "椅子换腿/加固修整", "自己动手刷漆翻新木面"],
      en: ["Re-cover the sofa in fresh fabric", "New legs or a joint fix for the chair", "Sand and repaint the wood yourself"],
    },
    reuseChannel: {
      zh: "本地家具维修店多提供上门评估, 重包覆按面料档位报价; 耐磨布料也可以自己买来找裁缝加工——旧家具的骨架, 就是翻新的全部本钱。",
      en: "Local furniture repair shops usually do on-site quotes, with reupholstering priced by fabric grade; hard-wearing cloth can also be bought and taken to a tailor — the old frame is the entire capital a refresh needs.",
    },
    alternative: {
      zh: "换大件前先问翻新: 重包覆或换腿的成本常远低于整件换新, 而且最合你家的那件家具——已经在你家了。按 $25 时薪换算, 省下的差额是一整段不用为大件攒钱的自由时间。",
      en: "Price the refresh before the replacement: re-covering or re-legging a piece usually runs far below buying new, and the piece that already fits your home is already in it. At $25/hr, the difference saved is a long stretch of time you don't spend saving up for furniture.",
    },
    reuse: {
      zh: "翻新过的大件反而更有故事: 一张重包覆的旧沙发, 是「会过日子」的实体证明——下一个想换新大件的时刻, 先想起这次翻新的手感。",
      en: "A refreshed piece carries a story better than a new one: a re-covered old sofa is physical proof you know how to make things last — and that memory is what surfaces at the next urge to replace.",
    },
    savingsHint: {
      zh: "消费前先看看家里已有的同类物品，也许能满足当下的使用需求。",
      en: "Before buying, check if you already have something similar at home that fits the need.",
    },
  },
  {
    id: "secondhand_furniture",
    triggers: {
      zh: ["买沙发", "书架", "餐桌", "衣柜", "床架", "二手家具"],
      en: ["buy a sofa", "buy a couch", "buy a bookshelf", "buy a dining table", "buy a wardrobe", "secondhand furniture"],
    },
    why: {
      zh: "家具是二手市场最繁荣的品类: 搬家、换城市、换风格, 每天都有九成新的大件急着找下家。全新家具的「未拆封溢价」在家具上格外不值——木头不介意上一个主人。",
      en: "Furniture is the busiest secondhand category of all: moves, relocations, restyles put near-mint big pieces on the market daily. The unopened-box premium matters least here — wood doesn't mind its previous owner.",
    },
    options: {
      zh: ["二手平台按图搜同款", "本地急转的九成新大件", "展样/尾单折扣家具"],
      en: ["Search the same model on resale platforms", "Near-mint pieces from local urgent moves", "Floor-sample or last-piece discounts"],
    },
    reuseChannel: {
      zh: "二手家具平台按城市过滤, 多数卖家包送货; 急转的大件常附原购买凭证——同款同材质, 价格常是全新的一半以下, 划痕藏在靠墙的那一面。",
      en: "Resale platforms filter by city and many sellers include delivery; urgent-move listings often come with the original receipt — same model, same material, frequently under half of new, with the scratch facing the wall.",
    },
    alternative: {
      zh: "大件家具先看二手再谈全新: 九成新转卖的差价常以百美元计, 按摊到每年的框架算, 一件能用十年的书架, 二手入手等于白用头几年——省幅是全品类最大的一条。",
      en: "Check secondhand before new for big furniture: the gap on near-mint resales often runs to hundreds of dollars; spread over years, a bookshelf that lasts a decade bought used means the first few years are effectively free — the biggest single saving of any category.",
    },
    reuse: {
      zh: "用完的大件别当废品扔: 挂上二手平台拍照转卖, 让它去下一个家继续站岗——你回血, 它延寿, 下一个人省幅照拿。",
      en: "When a big piece's time with you ends, photograph it and list it rather than trashing it — you recoup cash, it gains years, and the next buyer pockets the same gap you once did.",
    },
    savingsHint: {
      zh: "消费前先看看家里已有的同类物品，也许能满足当下的使用需求。",
      en: "Before buying, check if you already have something similar at home that fits the need.",
    },
  },
  {
    id: "move_rental_furniture",
    triggers: {
      zh: ["搬家买家具", "短租家具", "临时住买家具", "过渡期家具"],
      en: ["furniture for a short stay", "renting furniture", "furniture rental", "temporary apartment furniture"],
    },
    why: {
      zh: "短住期买全新大件是「双损」: 入住时全价买, 离开时贱价卖——两头的差价都由你出。家具在生命周期里最掉价的就是转手那一刻, 而短住恰恰买在最高点、卖在最低点。",
      en: "Buying new big pieces for a short stay is a double loss: full price moving in, fire-sale price moving out — you fund both gaps. Furniture takes its steepest drop at resale, and a short stay buys the peak and sells the trough.",
    },
    options: {
      zh: ["家具月租套餐", "二手买入·离开时原价转出", "只带床和桌的极简过渡"],
      en: ["Monthly furniture rental packages", "Buy secondhand, resell at par when leaving", "A minimal transition: just bed and desk"],
    },
    reuseChannel: {
      zh: "家具租赁服务按月计费, 送装撤一条龙, 租期结束一件不带走; 短住城市也总有「上一个人刚走」的急转家具, 进出同价的大件, 等于免费用了几个月。",
      en: "Furniture rental services bill monthly with delivery, setup and pickup bundled — nothing to take along when the lease ends; and every short-stay city has just-left urgent listings, where buying and reselling at par means months of use for free.",
    },
    alternative: {
      zh: "住期不确定就租不买: 月租费按 $25 时薪换算, 常只是几个小时每月, 而它买断的是「搬走时不用处理大件」的轻松——双损的差价, 换成了拎包即走的自由。",
      en: "When the stay length is uncertain, rent instead of buy: at $25/hr the monthly fee often amounts to a few hours, and it buys out the whole headache of disposing big pieces on departure — the double-loss gap converts into leave-with-a-suitcase freedom.",
    },
    reuse: {
      zh: "短住积累的是「轻装生活」的手感: 一次租期下来你会发现真正离不开的大件不过两三件——这个清单, 值得带回长住的家。",
      en: "A short stay teaches light living: by the end of one rental term you'll find only two or three big pieces you truly rely on — a list worth carrying back to your permanent home.",
    },
    savingsHint: {
      zh: "消费前先看看家里已有的同类物品，也许能满足当下的使用需求。",
      en: "Before buying, check if you already have something similar at home that fits the need.",
    },
  },
  {
    id: "borrow_rare_tools",
    triggers: {
      zh: ["电钻", "梯子", "蒸汽清洁机", "地毯清洗机", "租工具"],
      en: ["buy a power drill", "buy a ladder", "steam cleaner", "carpet cleaner", "tool rental"],
    },
    why: {
      zh: "有些工具一年只用一次, 却按十年寿命收费: 电钻打完那几个孔、梯子挂完那盏灯, 剩下的三百多天都在储物间里替你保管折旧。低频工具的价值在「用」, 不在「有」。",
      en: "Some tools get used once a year but charge by a ten-year life: after the drill sinks those screws and the ladder hangs that lamp, the other three-hundred-odd days are just storage depreciation. For rare tools the value is in using, not owning.",
    },
    options: {
      zh: ["邻里社区借一次", "五金店按天租", "和朋友拼单共有"],
      en: ["Borrow once from neighbors", "Rent by the day at the hardware store", "Co-own with a friend"],
    },
    reuseChannel: {
      zh: "社区群和邻里 App 里借工具几乎有求必应——每家都有个吃灰的电钻; 租赁店按天计价, 押金原退; 拼单共有的话, 连储物空间都省下一半。",
      en: "Community groups and neighbor apps answer tool requests almost every time — every household owns a dust-gathering drill; rental stores bill by the day with deposits refunded; co-owning even splits the storage space.",
    },
    alternative: {
      zh: "低频工具借不买: 一次租金按 $25 时薪换算常不到一小时工时, 而省下的是整机的买价加上它未来十年的角落——家里少一件大工具, 就多一平米的生活。",
      en: "Borrow the rare tools: a day's rental at $25/hr often runs under an hour of work-time, while what's saved is the full purchase price plus a decade of corner space — one fewer bulky tool is one more square meter of living room.",
    },
    reuse: {
      zh: "借过两三次还想要的工具, 才是真需求——那时再买, 是被验证过的决定; 而借出你家闲置工具的那一刻, 你就是社区里最靠谱的那间「工具图书馆」。",
      en: "A tool you've borrowed two or three times and still want is a verified need — buying then is a tested decision; and the moment you lend out your own idle tools, you become the neighborhood's most reliable tool library.",
    },
    savingsHint: {
      zh: "消费前先看看家里已有的同类物品，也许能满足当下的使用需求。",
      en: "Before buying, check if you already have something similar at home that fits the need.",
    },
  },
  {
    id: "mattress_quality_over_cheap",
    triggers: {
      zh: ["买床垫", "便宜家具", "拼多多家具", "低价家具"],
      en: ["buy a mattress", "cheap furniture", "budget mattress"],
    },
    why: {
      zh: "耐用品的便宜常是「按年摊薄」后的贵: 一件三年就散架的低价货, 换两次的钱和麻烦, 多过一次买对的。耐用品每天用八小时 (床垫) 或用十年 (好桌椅), 单价高低的账要按使用年限摊开算。",
      en: "Cheap durables often turn expensive once amortized: a low-price piece that fails in three years costs more money and hassle across two replacements than buying right once. Durables serve eight hours a day (a mattress) or a decade (good tables and chairs) — the math belongs on a per-year basis, not the price tag.",
    },
    options: {
      zh: ["床垫认准可换面/长质保款", "实木框架好过贴皮板材", "二手九成新 + 新床垫的组合"],
      en: ["Mattresses with flippable sides and long warranties", "Solid wood frames over veneer board", "Secondhand near-mint frame plus a new mattress"],
    },
    reuseChannel: {
      zh: "耐用品的「省钱姿势」是会挑: 框架结构可以从二手市场挑九成新的实木件 (木头不介意旧), 直接接触身体的床垫则值得买新买好——耐用的钱花在刀刃上。",
      en: "The frugal move for durables is knowing where to spend: frames can be near-mint solid wood from the resale market (wood doesn't mind old), while anything your body rests on directly deserves new and good — durability money aimed at the edge that matters.",
    },
    alternative: {
      zh: "耐用品按「摊到每年」挑, 不按标价挑: 把价格除以预期使用年限, 再乘以你每天的使用时长, 贵的那件常常反而便宜——好床垫一天摊下来不到一杯奶茶, 差床垫的腰酸可没法摊薄。",
      en: "Pick durables by cost-per-year, not sticker price: divide by expected service life and weigh the daily hours, and the pricier piece often comes out cheaper — a good mattress amortizes to less than a daily coffee, while a bad one's backache doesn't amortize at all.",
    },
    reuse: {
      zh: "买对的耐用品会替你省掉整个「换便宜货循环」: 十年不操心的一张床, 胜过三年一换的三张——时间才是这里最贵的成本。",
      en: "A durably right purchase buys out the whole cheap-replacement loop: one bed you don't think about for a decade beats three swapped every three years — time is the priciest cost in that equation.",
    },
    savingsHint: {
      zh: "消费前先看看家里已有的同类物品，也许能满足当下的使用需求。",
      en: "Before buying, check if you already have something similar at home that fits the need.",
    },
  },
  {
    id: "big_ticket_cooldown_72h",
    triggers: {
      zh: ["买家具", "下单大件", "装修采购", "家具打折"],
      en: ["furniture shopping", "big purchase", "buying furniture", "furniture sale"],
    },
    why: {
      zh: "大件是最不需要冲动的消费: 单价高、退货麻烦、风格绑定了未来几年的家。而促销与样板间恰恰冲着「当场定」设计——一个三天冷静窗, 是大件专属的保险丝。",
      en: "Big purchases deserve impulse the least: high price, painful returns, and a look that binds your home for years. Yet sales and showrooms are engineered for decide-now — a three-day cooldown is the fuse big tickets come with.",
    },
    options: {
      zh: ["72小时冷静期后再下单", "同款比价二手与官翻", "回家量尺寸+画平面图"],
      en: ["Sit on it 72 hours before ordering", "Price the same piece secondhand or floor-sample", "Go home, measure, sketch the floor plan"],
    },
    reuseChannel: {
      zh: "冷静窗里能做的功课很多: 量好尺寸画张平面图 (多大的沙发都拦不过卷尺), 同款在二手平台搜一圈看真实行情——带着这些数据回去, 「限时折扣」的说服力会自己塌掉。",
      en: "The cooldown window holds real homework: measure and sketch the floor plan (no sofa beats a tape measure), and check the same model's resale listings for true market price — armed with that data, the limited-time pitch collapses on its own.",
    },
    alternative: {
      zh: "大件下单前给自己 72 小时: 冷静窗过半促销常就结束了, 而你发现根本不亏——按 $25 时薪换算, 这三天功课换来的比价差额与「确认真的需要」, 是大件里最值的一笔。",
      en: "Give yourself 72 hours before any big order: the sale usually expires before the window does, and it turns out you lose nothing — at $25/hr, three days of homework buying a verified need at the compared-best price is the best line item in any big purchase.",
    },
    reuse: {
      zh: "每一次冷静期后仍然买下的大件, 都是「确认过的心头好」——家里每一件都经得起 72 小时的追问, 这本身就是一种硬核的断舍离。",
      en: "Every big piece still bought after the cooldown is a confirmed keeper — a home where everything survives 72 hours of questioning is hardcore decluttering in its own right.",
    },
    savingsHint: {
      zh: "消费前先看看家里已有的同类物品，也许能满足当下的使用需求。",
      en: "Before buying, check if you already have something similar at home that fits the need.",
    },
  },
];
