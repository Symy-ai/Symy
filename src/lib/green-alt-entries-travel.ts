/**
 * green-alt-entries-travel — 大额低频词条: 出行与旅行 (zh+en 双语)
 *
 * 词条结构见 green-alt-types.ts。顺序追加在 subscription 之后 (数组末位)。
 * 本域接住的是「出行/旅行型冲动」(装备一次买齐/囤旅行券/纪念品/短途打车/行李箱续用),
 * 特点是「单笔大、冲动窗口短」—— 换算成自由小时数字最震撼的场景,
 * 与既有实物/虚拟域零重叠, 无优先级冲突。
 *
 * 文案红线 (与 subscription 同款): 不说教, 无碳足迹数值, 荣誉框架,
 * 绝不暗示「穷游才对 / 消费降级」—— 绿色出行是清醒选择, 不是委屈自己。
 *
 * 绿色偏好开关 (symy_green_pref === 'off') 由调用方判断, 词条层不特判。
 */

import type { GreenAlternativeEntry } from './green-alt-types';

export const GREEN_ALT_ENTRIES_TRAVEL: readonly GreenAlternativeEntry[] = [
  {
    id: "gear_rental_first",
    triggers: {
      zh: ["买滑雪装备", "买露营装备", "买潜水装备", "户外装备一次买齐"],
      en: ["buy ski gear", "buy camping gear", "buy diving gear", "outdoor gear"],
    },
    why: {
      zh: "滑雪、露营、潜水这类低频装备最容易在「刚上头」时一次买齐：可一年用不了几次的话，买价摊到每次远高于租金，闲置的角落还在默默提醒你那次冲动。",
      en: "Ski, camping and diving gear tempt you to buy the full kit right as the hobby starts — but used only a handful of times a year, the per-trip cost dwarfs rental, and the idle corner keeps reminding you of that impulse.",
    },
    options: {
      zh: ["前 3 次先租后买", "确认一年 ≥3 次再入手", "先借朋友的试一季"],
      en: ["Rent for your first 3 trips", "Buy only after 3 trips a year is proven", "Borrow a friend's kit for a season"],
    },
    reuseChannel: {
      zh: "雪场、营地、潜水店基本都提供装备租赁，价格通常是买价的几十分之一；先租着玩，真迷上了再挑趁手的入手也不迟。",
      en: "Slopes, campgrounds and dive shops nearly all rent gear at a sliver of the purchase price — rent while you explore, and buy well once you're truly hooked.",
    },
    alternative: {
      zh: "低频装备先租后买：一年用不到 3 次的东西，租金加起来往往不到买价零头——用省下的钱多去两次，比把装备供在家里更像真爱这个运动。",
      en: "Rent before buying low-frequency gear: used under 3 times a year, total rent is a fraction of the sticker — spending the savings on extra trips loves the sport more than gear collecting dust.",
    },
    reuse: {
      zh: "身边玩同款运动的朋友、本地俱乐部常常有闲置装备可借可拼，先把手边的资源用起来，你的「三次数」会来得比想象快。",
      en: "Friends and local clubs in the same sport often hold idle gear to borrow or share — tap what's around you first, and your \"three trips\" will arrive faster than you think.",
    },
    savingsHint: {
      zh: "消费前先看看家里已有的同类物品，也许能满足当下的使用需求。",
      en: "Before buying, check if you already have something similar at home that fits the need.",
    },
  },
  {
    id: "travel_size_kit",
    triggers: {
      zh: ["旅行装", "出行买护肤品", "旅游买洗漱", "分装瓶"],
      en: ["travel-size toiletries", "buy toiletries for travel", "travel skincare", "mini shampoo for trip"],
    },
    why: {
      zh: "出行前的「旅行焦虑消费」很隐形：为了几天行程新买整套旅行装，回来就吃灰——其实家里正装加一套分装瓶就能全覆盖。",
      en: "Pre-trip anxiety spending hides in plain sight: a whole new travel-size set bought for a few days, then left to gather dust — your full-size bottles plus one set of mini containers already cover it.",
    },
    options: {
      zh: ["正装分装替代新购", "只补缺的单品", "一套分装瓶反复用"],
      en: ["Decant from full-size instead", "Only buy the missing item", "Reuse one decant kit forever"],
    },
    reuseChannel: {
      zh: "一套十几块的分装瓶可以陪你去很多次远方：正装倒进去就是旅行装，用过洗净晾干，下次出行直接拎包就走。",
      en: "One cheap set of travel containers can follow you for years — decant your full-size products, wash and dry after each trip, and the next departure is grab-and-go.",
    },
    alternative: {
      zh: "出行洗护用分装替代新购：家里的正装灌进分装瓶就是全套旅行装，只为真缺的单品买单——行李更轻，钱包也更轻。",
      en: "Decant instead of rebuying for trips: full-size bottles plus containers make the whole travel kit, so you only pay for what's genuinely missing — lighter luggage, lighter spending.",
    },
    reuse: {
      zh: "上次旅行带回来的酒店小样、之前囤的分装瓶先翻出来清点，多数时候一套出行装备家里早就齐了。",
      en: "Dig out the hotel minis you brought back and the containers from last time — most travel kits are already complete at home.",
    },
    savingsHint: {
      zh: "消费前先看看家里已有的同类物品，也许能满足当下的使用需求。",
      en: "Before buying, check if you already have something similar at home that fits the need.",
    },
  },
  {
    id: "travel_voucher_cooldown",
    triggers: {
      zh: ["囤机票券", "囤酒店券", "大促买旅行券", "机票大促"],
      en: ["buy flight voucher", "hotel deal", "travel voucher deal", "flight sale"],
    },
    why: {
      zh: "大促机票/酒店券的倒计时天生催人：「限时」让人先买后想。可不确定会用的券是负债不是资产——过期作废的钱，比任何折扣都贵。",
      en: "Flash-sale flight and hotel vouchers run on countdowns: \"limited time\" makes you buy first, think later. But a voucher you may never use is a liability, not an asset — money that expires is pricier than any discount.",
    },
    options: {
      zh: ["先定真实出行日期再买", "可退改的券优先", "折扣 < 沉没风险就不买"],
      en: ["Lock real travel dates first", "Prefer refundable vouchers", "Skip if discount < expiry risk"],
    },
    reuseChannel: {
      zh: "把「这年真的会去吗」写成一个具体问题：假期批了吗、同伴定了吗、日期圈出来了吗——三个都有答案，这张券才是资产。",
      en: "Turn \"will I actually go this year?\" into concrete checks: leave approved, companion confirmed, dates circled — only with all three is that voucher an asset.",
    },
    alternative: {
      zh: "囤旅行券前先过冷静期：确认这年真的会去、日期能定下来再买——大促年年有，为不存在的行程省钱，是最好赚也最容易亏的一笔。",
      en: "Cool down before stocking travel vouchers: buy only when the trip is real and datable — sales return every year, and saving money on a trip that never happens is the easiest loss to overlook.",
    },
    reuse: {
      zh: "先翻翻相册里的收藏目的地和已有的券余额：把上次囤的用掉，比再囤一张新的更接近出发。",
      en: "Check your saved-destinations list and outstanding voucher balance first — using the last one you stocked gets you closer to departure than buying a new one.",
    },
    savingsHint: {
      zh: "消费前先看看家里已有的同类物品，也许能满足当下的使用需求。",
      en: "Before buying, check if you already have something similar at home that fits the need.",
    },
  },
  {
    id: "souvenir_three_questions",
    triggers: {
      zh: ["纪念品", "景区购物", "机场免税", "伴手礼"],
      en: ["souvenir", "souvenir shopping", "duty-free shopping", "gift shop"],
    },
    why: {
      zh: "纪念品把「当时的感受」标价出售：风景滤镜、旅程情绪都在为它加成。可回到家，多数纪念品的归宿是抽屉——照片留住的，往往比摆件多。",
      en: "Souvenirs sell the moment back to you: the scenery's soft glow and trip emotions all pad the price. Yet back home most land in a drawer — photos usually hold more of the trip than trinkets do.",
    },
    options: {
      zh: ["「家里放哪」先想好", "「回去会用吗」诚实答", "照片替代摆件"],
      en: ["Ask where it lives at home", "Honest: will you use it?", "Let photos replace trinkets"],
    },
    reuseChannel: {
      zh: "真想带走点什么，选每天会用到的：当地的咖啡豆、调味料、手账贴纸——用一次就想起来一次的地方，才是好纪念。",
      en: "If you want to bring something back, pick what gets used daily — local coffee beans, spices, journal stickers — a place remembered with every use beats a shelf ornament.",
    },
    alternative: {
      zh: "景区/机场纪念品先过三问：家里放哪、回去会用吗、照片够不够——三问都过再买，带回来的是纪念；答不上来，带回来的是杂物。",
      en: "Run souvenirs through three questions: where it lives at home, will you use it, are photos enough — passing all three brings back a keepsake; failing them brings back clutter.",
    },
    reuse: {
      zh: "明信片寄给朋友或未来的自己，是几乎零成本又最不容易吃灰的旅行纪念——写字的三分钟，比挑摆件的半小时更记得住那趟旅程。",
      en: "A postcard to a friend or future-you is the near-zero-cost souvenir that never gathers dust — three minutes of writing will outlast a half-hour of trinket browsing in memory.",
    },
    savingsHint: {
      zh: "消费前先看看家里已有的同类物品，也许能满足当下的使用需求。",
      en: "Before buying, check if you already have something similar at home that fits the need.",
    },
  },
  {
    id: "city_transit_choice",
    triggers: {
      zh: ["打车", "叫车", "短途打车", "打车通勤"],
      en: ["take a taxi", "ride-hailing", "hail a cab", "cab vs subway"],
    },
    why: {
      zh: "市内短途打车贵在「纯边际」：同样一段路，地铁骑行的票价是零头，省差价不牺牲到达——只是少了那扇车门的仪式感。",
      en: "Short city rides hurt at the pure margin: the same distance by subway or bike costs pocket change — you give up nothing but the ceremony of a car door.",
    },
    options: {
      zh: ["3 站以内不打车", "雨天/赶时间才打车", "通勤办张交通卡"],
      en: ["No cab within 3 stops", "Cab only for rain or rush", "Get a transit pass for commutes"],
    },
    reuseChannel: {
      zh: "城市的公共自行车和地铁月卡就是现成的绿色车队：扫码即走、随到随停，通勤成本能压到打车的十分之一。",
      en: "City bike-share and a metro pass are a ready-made green fleet — scan and go, dock anywhere — squeezing commute costs to a tenth of ride-hailing.",
    },
    alternative: {
      zh: "短途出行先看地铁和骑行：3 站以内的路，打车省下的十几分钟常常只是等待换等待——差价按 $25 时薪换算，是几小时实打实的自由时间。",
      en: "Check subway or bike first for short hops: within 3 stops, a cab's saved minutes often just trade one wait for another — at $25/hr the fare difference is real free hours.",
    },
    reuse: {
      zh: "通勤路线固定的话，把打车预算换算成交通月卡+共享单车季卡，剩下的钱足够每周多一杯好咖啡。",
      en: "With a fixed commute, swap the cab budget for a transit pass plus bike-share season card — the change covers a good coffee every week.",
    },
    savingsHint: {
      zh: "消费前先看看家里已有的同类物品，也许能满足当下的使用需求。",
      en: "Before buying, check if you already have something similar at home that fits the need.",
    },
  },
  {
    id: "suitcase_reuse_first",
    triggers: {
      zh: ["行李箱", "旅行箱", "登机箱", "拉杆箱"],
      en: ["suitcase", "luggage", "carry-on"],
    },
    why: {
      zh: "行李箱常是为「想象中的旅程」买的：箱子还没来得及跟上飞机，心动的那趟旅行可能已经换了目的地。而一只好箱子能用很多年，远长于一阵冲动——轮子、拉链、拉杆都可修可换，箱体经年不坏。",
      en: "A new suitcase is often bought for an imagined journey: before the case ever boards a plane, the trip you were excited about may have changed destination. A good case serves for years, far beyond the impulse — wheels, zippers and telescopic handles are all repairable, and the shell lasts.",
    },
    options: {
      zh: ["轮子拉链先修再评估", "二手九成新先上手", "短途先借家人朋友的"],
      en: ["Repair wheels or zippers first", "Try a nearly-new secondhand case", "Borrow one for short trips"],
    },
    reuseChannel: {
      zh: "行李箱是闲鱼上成色最好的品类之一：不少人一次出行后就闲置，九成新的箱子往往半价上下就能到手；维修店换一对轮子通常立等可取，旧箱马上满血复活。",
      en: "Suitcases are among the best-condition finds on secondhand marketplaces: many are listed after a single trip at around half retail, and a repair shop can swap a pair of wheels while you wait, bringing an old case right back to life.",
    },
    alternative: {
      zh: "买新箱子前，先给家里那只一次机会：换对轮子、修好拉链，它还能陪你走很远；真要添置，二手或租来的九成新箱子也完全够用——带着走过路的箱子出发，照样是体面的好故事。",
      en: "Before buying new, give the case you already own one more chance: a fresh pair of wheels and a fixed zipper will carry it for years — and if you truly need one, a nearly-new secondhand or rental case serves just as well. Setting off with a well-traveled case is its own kind of class.",
    },
    reuse: {
      zh: "翻翻储物间和父母家的大柜子：多数家庭都有一只闲置箱子在等下一趟旅行，先借它完成这趟，比新买一只更能验证你到底有多需要。",
      en: "Check your storage closet and the family's cabinets first — most households have an idle case waiting for its next trip; borrowing it for this one is the truest test of how much you actually need a new one.",
    },
    savingsHint: {
      zh: "消费前先看看家里已有的同类物品，也许能满足当下的使用需求。",
      en: "Before buying, check if you already have something similar at home that fits the need.",
    },
  },
];
