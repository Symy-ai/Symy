/**
 * green-alt-entries-subscription — 无痛高频词条: 订阅与虚拟消费 (zh+en 双语)
 *
 * 词条结构见 green-alt-types.ts。顺序追加在 household 之后 (数组末位)。
 * 本域接住的是「订阅/虚拟消费型冲动」(自动续费/打赏/充值/囤卡/单开会员),
 * 特点是「无痛小额、长期吸血」—— 与实物域零重叠, 无优先级冲突。
 *
 * 文案红线 (与 food/household 同款): 不说教, 无碳足迹数值, 荣誉框架,
 * 绝不暗示「你穷」—— 基调一律是「清醒/主动选择」。
 *
 * 绿色偏好开关 (symy_green_pref === 'off') 由调用方判断, 词条层不特判。
 */

import type { GreenAlternativeEntry } from './green-alt-types';

export const GREEN_ALT_ENTRIES_SUBSCRIPTION: readonly GreenAlternativeEntry[] = [
  {
    id: "subscription_audit",
    triggers: {
      zh: ["自动续费", "订阅会员", "会员续费", "续费", "自动扣费", "忘了取消", "无故扣费"],
      en: ["auto-renewal", "subscription renewal", "renew my subscription", "monthly subscription"],
    },
    why: {
      zh: "订阅的特点是「无痛小额、长期吸血」：每笔都不疼，但一年下来往往比一次大额冲动更贵，而且连续两月没用的会员，大概率不会再用了。",
      en: "Subscriptions bill small and painless but drain long — a year of them often costs more than one big impulse buy, and a membership unused two months running rarely comes back.",
    },
    options: {
      zh: ["季度盘点一次自动续费", "连续两月未用即退订", "改用月付代替年付试水"],
      en: ["Audit auto-renewals quarterly", "Cancel anything unused two months", "Trial with monthly, not annual"],
    },
    reuseChannel: {
      zh: "手机的应用商店和支付设置里都能一键看到全部自动续费清单，退订入口也在那里，十分钟即可完成一轮盘点。",
      en: "Your app store and payment settings list every auto-renewal in one place — cancel buttons included; a full audit takes ten minutes.",
    },
    alternative: {
      zh: "每季度给所有自动续费做一次「会员体检」：连续两个月没打开的，直接退订——留下的钱是实打实的月费×12。",
      en: "Run a quarterly subscription audit: anything unopened for two straight months gets canceled — the money kept is real monthly fees times twelve.",
    },
    reuse: {
      zh: "真想看的剧可以等完结后单月开一次会员追完再退，比常年挂着划算得多。",
      en: "For shows you truly follow, wait until a season ends, subscribe one month, binge, then cancel — far cheaper than keeping it year-round.",
    },
    savingsHint: {
      zh: "消费前先看看家里已有的同类物品，也许能满足当下的使用需求。",
      en: "Before buying, check if you already have something similar at home that fits the need.",
    },
  },
  {
    id: "tipping_pause",
    triggers: {
      zh: ["打赏", "刷礼物", "直播间充值"],
      en: ["send a tip", "livestream gift", "tipping streamer"],
    },
    why: {
      zh: "直播间打赏冲动来自氛围：灯光、节奏、主播的一句感谢都在推着你上头——但「冲动大哥」的排面过去后，钱和后悔都留给了自己。",
      en: "Livestream tipping rides the moment — lights, pacing and a shout-out all push the rush, but the \"big spender\" glow fades and only the bill and regret stay.",
    },
    options: {
      zh: ["先离开直播间 10 分钟再决定", "设单月打赏上限", "关掉支付免密"],
      en: ["Step away 10 minutes before deciding", "Set a monthly tipping cap", "Turn off one-tap payment"],
    },
    reuseChannel: {
      zh: "想表达喜欢可以先用免费的方式：点亮灯牌、发弹幕、剪一条二创——主播同样看得见你的支持。",
      en: "Support has free channels too — badges, chat messages, a fan clip — the streamer sees those just as clearly.",
    },
    alternative: {
      zh: "想打赏时先退出直播间 10 分钟再决定：真值得的支持过 10 分钟还在，气氛推着的冲动多半就散了——清醒的支持才最有分量。",
      en: "Leave the stream for 10 minutes before tipping: support that still feels right afterward is real; momentum pushed by the moment usually evaporates — sober support carries the most weight.",
    },
    reuse: {
      zh: "如果只是这期内容好，先点个收藏或关注，等月底再决定要不要为它花钱，主动权回到自己手里。",
      en: "If it's just one great stream, bookmark and follow now, then decide at month's end whether it earns money — the choice stays in your hands.",
    },
    savingsHint: {
      zh: "消费前先看看家里已有的同类物品，也许能满足当下的使用需求。",
      en: "Before buying, check if you already have something similar at home that fits the need.",
    },
  },
  {
    id: "game_topup_math",
    triggers: {
      zh: ["游戏充值", "抽卡", "氪金", "充值皮肤"],
      en: ["in-game purchase", "game top-up", "buy skins", "gacha pulls"],
    },
    why: {
      zh: "充值界面刻意抹掉钱的实感：点数、宝石、宝箱都在缓冲「这是真钱」的直觉——一笔大额充值换算成实物或工作时间后，感受完全不同。",
      en: "Top-up screens are built to blur money: points, gems and loot boxes buffer the \"this is real cash\" instinct — a big top-up translated into goods or work hours feels entirely different.",
    },
    options: {
      zh: ["充值前换算成等值实物", "换算成自由小时（时薪 $25）", "设单月氪金上限"],
      en: ["Convert the top-up into goods", "Convert into free hours ($25/hr)", "Set a monthly gaming cap"],
    },
    reuseChannel: {
      zh: "想抽的卡先看实测概率视频或论坛拆解帖过过瘾，再决定这期池子值不值得真金下场。",
      en: "Scratch the pull itch with probability breakdown videos and forum threads first, then decide whether the banner deserves real money.",
    },
    alternative: {
      zh: "充值前做一道换算题：这笔钱等于几个等值实物、或按 $25 时薪等于几小时自由时间——换算完还想充，再充不迟。",
      en: "Do the conversion before topping up: what goods does it equal, or at $25/hr how many hours of your freedom — if it still feels worth it after the math, go ahead.",
    },
    reuse: {
      zh: "仓库里攒的道具、皮肤、免费抽数往往比记忆中多，先清一遍存量，这期的「想要」可能已经握在手里。",
      en: "Inventory hoards, skins and free pulls usually outnumber memory — clear the stockpile first; this round's \"want\" may already be in hand.",
    },
    savingsHint: {
      zh: "消费前先看看家里已有的同类物品，也许能满足当下的使用需求。",
      en: "Before buying, check if you already have something similar at home that fits the need.",
    },
  },
  {
    id: "activate_before_buy",
    triggers: {
      zh: ["健身卡", "办健身卡", "买网课", "囤课"],
      en: ["gym membership", "buy a course", "online course", "stock up on courses"],
    },
    why: {
      zh: "健身卡和网课是「买下的瞬间就满足了自律想象」的品类：卡的激活率常年惨淡，新的决心总在旧卡还没用完时就上线。",
      en: "Gym cards and online courses satisfy the self-discipline fantasy at checkout — activation rates stay dismal, and new resolutions launch while old cards still hold unused sessions.",
    },
    options: {
      zh: ["旧卡没用完不办新卡", "先排进日程再下单", "按次付费试水"],
      en: ["No new card till the old one's done", "Schedule it before you buy", "Pay per session to start"],
    },
    reuseChannel: {
      zh: "翻一下买过的网课账户和健身房会员余额：多半还有没看完的章节和没用完的课时，先把囤的激活起来。",
      en: "Check your course accounts and gym app balance — there are likely unwatched chapters and unused sessions; activate the stockpile first.",
    },
    alternative: {
      zh: "买新卡/新课之前先激活旧的：把已囤的课时排进下周日程，用完再买——先兑现上一次的决心，比再买一次决心实在得多。",
      en: "Before a new card or course, activate the old one — schedule the sessions already paid for and buy only when they run out; honoring the last resolution beats buying a new one.",
    },
    reuse: {
      zh: "跟朋友换课、拼教练体验课，或用免费跟练视频先验证自己真的会去，再为下一张卡花钱。",
      en: "Swap courses with friends, share trial sessions, or prove the habit with free follow-along videos before paying for the next card.",
    },
    savingsHint: {
      zh: "消费前先看看家里已有的同类物品，也许能满足当下的使用需求。",
      en: "Before buying, check if you already have something similar at home that fits the need.",
    },
  },
  {
    id: "plan_sharing",
    triggers: {
      zh: ["开会员", "视频会员", "音乐会员", "单开会员"],
      en: ["video subscription", "music subscription", "streaming plan", "sign up for premium"],
    },
    why: {
      zh: "视频、音乐、网盘这类会员几乎都有家庭组方案：同样的服务，拼车分摊后每人往往只要单开价格的几分之一，却常被「懒得组」白白多付。",
      en: "Video, music and storage plans almost all offer family tiers: the same service split among members often costs a fraction of solo price, yet many pay full just to skip organizing it.",
    },
    options: {
      zh: ["家庭组拼车分摊", "与朋友共享账号", "按刚需保留 1-2 个"],
      en: ["Split a family plan", "Share an account with friends", "Keep only 1-2 you truly use"],
    },
    reuseChannel: {
      zh: "家人、室友、靠谱朋友就是现成的拼车对象：家庭组人数上限通常 5-6 人，凑满一车单价立刻砍到底。",
      en: "Family, roommates and trusted friends are ready carpool-mates — family tiers usually seat 5-6, and a full car drops the per-head price to the floor.",
    },
    alternative: {
      zh: "续费视频/音乐会员前先看看家庭组：同样内容、同样清晰度，拼车价常常只有单开的零头——同样的体验，更清醒的价钱。",
      en: "Before renewing a video or music plan, check the family tier: same content, same quality, often a fraction of solo price — same experience, soberer price.",
    },
    reuse: {
      zh: "先盘点手机里已有的会员：重叠功能的只留一个拼车版，其余退订，钱包和收藏夹都会更清爽。",
      en: "Audit the memberships already on your phone: keep one shared plan where features overlap, cancel the rest — wallet and watchlist both get lighter.",
    },
    savingsHint: {
      zh: "消费前先看看家里已有的同类物品，也许能满足当下的使用需求。",
      en: "Before buying, check if you already have something similar at home that fits the need.",
    },
  },
];
