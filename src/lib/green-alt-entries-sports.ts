/**
 * green-alt-entries-sports — 运动户外词条 (zh+en 双语)
 *
 * 词条结构见 green-alt-types.ts。顺序追加在 parenting 之后 (数组末位)。
 * 本域接住的是「运动型冲动消费」(办卡即健身/装备一次买齐/运动服饰整柜/
 * 球拍上头/补剂囤货), 特点是「为变好而花」的正当感最强, 客单高、冲动强。
 *
 * 与既有域边界: 「健身卡/囤课」类预付卡冲动归 subscription 域
 * activate_before_buy; 本域管年卡次卡数学、服饰、器材与补剂。
 *
 * 文案红线 (与既有域同款): 不说教, 无碳足迹数值, 荣誉框架,
 * 不暗示「消费降级」—— 聪明地花钱是为了更久地运动下去。
 *
 * 绿色偏好开关 (symy_green_pref === 'off') 由调用方判断, 词条层不特判。
 */

import type { GreenAlternativeEntry } from './green-alt-types';

export const GREEN_ALT_ENTRIES_SPORTS: readonly GreenAlternativeEntry[] = [
  {
    id: "gym_per_visit_math",
    triggers: {
      zh: ["健身房年卡", "私教课", "健身年卡", "办卡一年"],
      en: ["gym annual membership", "gym yearly plan", "personal training package", "gym year membership"],
    },
    why: {
      zh: "「办了卡就等于练了」是健身消费最甜的幻觉: 年卡摊到实际去的次数, 单次成本常常贵过次卡数倍——先有出勤, 再有为出勤付的钱。",
      en: "\"The card counts as the workouts\" is fitness spending's sweetest illusion: spread over actual visits, an annual pass often costs multiples of pay-per-visit — attendance should exist before money committed to it.",
    },
    options: {
      zh: ["先按次卡跑一个月", "出勤稳定再升级年卡", "私教按节买不打包"],
      en: ["Run one month on drop-ins", "Upgrade only after steady attendance", "Buy PT sessions, not packages"],
    },
    reuseChannel: {
      zh: "多数健身房提供次卡和月卡试水, 社区运动中心的价格更友好; 私教先买小节数学清楚效果, 再考虑加量——钱跟着出勤走, 不跟着决心走。",
      en: "Most gyms sell drop-in packs for a trial month and community sports centers cost less; buy a few PT sessions to see results before committing — let money follow attendance, not resolve.",
    },
    alternative: {
      zh: "买年卡前先做次卡数学: 每周真实能去几次、次卡年总价对比年卡价, 差额按 $25 时薪换算是几个自由小时——出勤撑得起年卡再买, 撑不起就先让次卡陪你养成习惯。",
      en: "Run the per-visit math before an annual pass: realistic weekly visits, drop-in yearly total versus annual price, with the gap priced in free hours at $25/hr — buy the year only when attendance proves it, and let drop-ins build the habit first.",
    },
    reuse: {
      zh: "翻翻运动软件里的历史出勤记录: 过去三个月真去了多少次, 这个数字不会陪你演戏, 它是选卡型最好的依据。",
      en: "Check your workout app history: how many real visits in the past three months — that number doesn't act, and it's the best basis for choosing a plan.",
    },
    savingsHint: {
      zh: "消费前先看看家里已有的同类物品，也许能满足当下的使用需求。",
      en: "Before buying, check if you already have something similar at home that fits the need.",
    },
  },
  {
    id: "sportswear_capsule",
    triggers: {
      zh: ["运动服", "健身服", "瑜伽服", "买跑步装备"],
      en: ["buy activewear", "athleisure", "workout clothes", "yoga outfit"],
    },
    why: {
      zh: "运动服饰的冲动藏在「新装备等于新开始」里: 可训练看的是出勤, 不是衣柜——套装再新, 也不会替你多去一次健身房。",
      en: "Activewear impulses hide in \"new gear equals a new start\" — but training runs on attendance, not the wardrobe: no outfit does an extra gym visit for you.",
    },
    options: {
      zh: ["两套轮换就够训练", "基础款优先不追联名", "旧的穿坏了再补"],
      en: ["Two rotating sets suffice", "Basics over collabs", "Replace only what's worn out"],
    },
    reuseChannel: {
      zh: "速干面料非常耐穿, 两套轮换能扛住每周多次训练; 想换风格时, 闲鱼上九成新的运动品牌套装价格常是原价零头, 出旧买新几乎不花钱。",
      en: "Technical fabrics last — two rotating sets handle multi-session weeks; when style calls, near-new secondhand sets go for a sliver of retail, so sell old, buy \"new\", netting near zero.",
    },
    alternative: {
      zh: "运动服饰胶囊化: 两套合身的轮换足以支撑稳定训练, 把「再加一套」的钱按 $25 时薪换算成自由小时——衣柜精简一点, 出勤反而更纯粹。",
      en: "Capsule your activewear: two well-fitting rotating sets carry a steady routine, and the \"one more set\" money priced at $25/hr becomes free hours — a leaner wardrobe makes attendance purer.",
    },
    reuse: {
      zh: "先清点运动柜: 常穿的其实就那两三件, 其余都在替冲动站台——让它们重新上岗, 或者转给会穿的人。",
      en: "Audit the activewear drawer first: the same two or three pieces do the work while the rest stand in for impulses — put them back on rotation or pass them to someone who'll wear them.",
    },
    savingsHint: {
      zh: "消费前先看看家里已有的同类物品，也许能满足当下的使用需求。",
      en: "Before buying, check if you already have something similar at home that fits the need.",
    },
  },
  {
    id: "secondhand_racquet",
    triggers: {
      zh: ["羽毛球拍", "网球拍", "二手球拍", "轮滑鞋"],
      en: ["buy a racket", "badminton racket", "tennis racket", "roller skates"],
    },
    why: {
      zh: "新入一个运动就配全新顶配器材, 是热情给冲动上的滤镜: 球拍和轮滑鞋的二手市场极大, 因为「入门即巅峰装备」的闲置多到溢出。",
      en: "Kitting out a brand-new hobby with top-tier gear is enthusiasm's filter on impulse: secondhand racket and skate markets overflow precisely because \"beginner buys pro kit\" ends in shelves of idle equipment.",
    },
    options: {
      zh: ["入门器材买二手", "进阶了再升级", "先借同事的打几次"],
      en: ["Start on secondhand gear", "Upgrade as you progress", "Borrow a coworker's first"],
    },
    reuseChannel: {
      zh: "球馆球友和公司同事里常有人出闲置球拍, 成色好、拍线还能用; 闲鱼上入门到进阶的球拍、轮滑鞋选择极多, 转手价多在半价以下。",
      en: "Court regulars and coworkers often sell idle racquets in good shape with playable strings; secondhand marketplaces stock everything from beginner to advanced rackets and skates, usually well under half price.",
    },
    alternative: {
      zh: "球拍轮滑先买二手: 入门阶段的器材损耗极小, 半价的二手完全够用, 等打法稳定再挑趁手的新拍——省下的差价按 $25 时薪换算, 够换好多次球馆场地费。",
      en: "Buy rackets and skates secondhand first: beginner-stage gear barely wears, half-price used does the job, and the new stick can wait until your game settles — at $25/hr the saved difference covers many court fees.",
    },
    reuse: {
      zh: "身边打球的朋友是最大的「器材库」: 先借一支上手, 感受清楚自己需要什么再买, 退坑时的沉没成本也最小。",
      en: "Friends who play are the biggest gear library: borrow one first, learn what you actually need, and your sunk cost stays smallest if the hobby doesn't stick.",
    },
    savingsHint: {
      zh: "消费前先看看家里已有的同类物品，也许能满足当下的使用需求。",
      en: "Before buying, check if you already have something similar at home that fits the need.",
    },
  },
  {
    id: "home_workout_first",
    triggers: {
      zh: ["跑步机", "家用健身器材", "动感单车", "居家健身器材"],
      en: ["buy a treadmill", "home gym equipment", "exercise bike", "home workout gear"],
    },
    why: {
      zh: "家用大件健身器材是「把决心买回家」: 可客厅的跑步机最常见的归宿是晾衣架——决心不在器材里, 在安排进日程的那一小时里。",
      en: "Big home fitness gear is \"buying resolve and shipping it home\" — yet the living-room treadmill's most common career is clothes rack: resolve lives in the scheduled hour, not the hardware.",
    },
    options: {
      zh: ["先跟练三个月再决定", "小件哑铃起步", "用小区器材和跑步路线"],
      en: ["Follow online workouts for 3 months", "Start with dumbbells", "Use park trails and local gyms"],
    },
    reuseChannel: {
      zh: "跟练视频和自重训练零器材就能入门, 一对可调哑铃几乎覆盖家用需求; 真想添大件, 闲鱼上「九成新跑步机」的挂牌量, 本身就是最诚实的劝退数据。",
      en: "Follow-along videos and bodyweight training need zero gear to start, and one adjustable dumbbell pair covers most home needs; if a big piece still calls, the flood of \"like-new treadmills\" listed secondhand is the most honest cautionary data.",
    },
    alternative: {
      zh: "大件健身器材前先零成本验证: 免费跟练加自重训练坚持满一个季度, 再谈把器材搬回家——省下的几千块按 $25 时薪换算成上百个自由小时, 够上好几年健身房。",
      en: "Validate at zero cost before big fitness gear: a full quarter of free follow-along and bodyweight training earns the equipment purchase — thousands saved, priced at $25/hr, is triple-digit free hours or years of gym visits.",
    },
    reuse: {
      zh: "家里如果已经有闲置的哑铃、弹力带、瑜伽垫, 先让它们重新上岗; 小区里的健身路径和楼梯, 也是现成的免费健身房。",
      en: "If idle dumbbells, bands or a mat already live at home, put them back to work — the neighborhood fitness path and stairs are a ready-made free gym too.",
    },
    savingsHint: {
      zh: "消费前先看看家里已有的同类物品，也许能满足当下的使用需求。",
      en: "Before buying, check if you already have something similar at home that fits the need.",
    },
  },
  {
    id: "supplement_stockup_math",
    triggers: {
      zh: ["蛋白粉", "运动补剂", "囤蛋白粉", "健身补剂"],
      en: ["buy protein powder", "protein supplement", "supplement stockpile", "workout supplements"],
    },
    why: {
      zh: "补剂大促的囤货逻辑经不起一问: 训练量没到, 蛋白粉却先按年囤——过期的库存和喝不完的口味疲劳, 都是折扣换不回的成本。",
      en: "Supplement sales run on stockpile logic that fails one question: training volume hasn't arrived, yet a year of powder has — expiry losses and flavor fatigue cost more than any discount saves.",
    },
    options: {
      zh: ["只囤三个月用量", "口味先买小包装试", "缺的先靠食补"],
      en: ["Stock only 3 months", "Trial flavors in small packs", "Cover gaps with food first"],
    },
    reuseChannel: {
      zh: "日常饮食里的鸡蛋、牛奶、鸡胸和豆制品能覆盖大部分蛋白需求; 补剂是便利补位不是刚需, 大促价再好, 也只对「确实喝得完」的人是折扣。",
      en: "Everyday eggs, milk, chicken and soy cover most protein needs; supplements are a convenience, not a requirement — sale prices are only discounts for people who'll actually finish them.",
    },
    alternative: {
      zh: "囤补剂前先做食补数学: 对比每克蛋白的单价, 日常食物常常不输粉剂; 大促最多囤一个季度的量, 差额按 $25 时薪换算成自由小时——练得科学比囤得便宜更值得花心思。",
      en: "Do the food-first math before stocking supplements: on price per gram of protein, everyday foods often match powder; cap sale stockpiles at one quarter, and price the difference in free hours at $25/hr — smart training deserves the attention more than cheap stockpiling.",
    },
    reuse: {
      zh: "翻翻橱柜里已有的补剂和到期日: 先把快过期的安排进日程喝完, 这比再囤两桶新口味更接近你的训练目标。",
      en: "Check the cabinet's stock and expiry dates first: scheduling the near-expiry tubs into your routine sits closer to your training goals than two new flavors.",
    },
    savingsHint: {
      zh: "消费前先看看家里已有的同类物品，也许能满足当下的使用需求。",
      en: "Before buying, check if you already have something similar at home that fits the need.",
    },
  },
];
