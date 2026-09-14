/**
 * green-alt-entries-gifting — 节日送礼词条 (zh+en 双语)
 *
 * 词条结构见 green-alt-types.ts。顺序追加在 sports 之后 (数组末位)。
 * 本域接住的是「送礼型消费冲动」(节日面子压力/随手凑单/包装浪费/
 * 差点忘了的补买), 特点是单笔金额常远超自用品, 且社交属性最强——
 * 恰恰最适合绿色示范: 有心意的替代比标准化礼物更有面子。
 *
 * 文案红线 (与既有域同款): 不说教, 无碳足迹数值, 荣誉框架,
 * 绝不暗示「买不起」—— 体验与手作是更高级的心意, 不是退而求其次。
 *
 * 绿色偏好开关 (symy_green_pref === 'off') 由调用方判断, 词条层不特判。
 */

import type { GreenAlternativeEntry } from './green-alt-types';

export const GREEN_ALT_ENTRIES_GIFTING: readonly GreenAlternativeEntry[] = [
  {
    id: "gift_wishlist_first",
    triggers: {
      zh: ["挑礼物", "选礼物", "不知道送什么", "送礼攻略"],
      en: ["pick a gift", "choose a gift", "gift ideas", "no idea what to gift"],
    },
    why: {
      zh: "「猜错即浪费」是送礼最大的隐性成本: 凭感觉挑十次, 总有几次落空——钱花了, 心意没送到, 物品进了角落。愿望单把命中率从猜测变成确认。",
      en: "Guessing wrong is gifting's biggest hidden cost: out of ten intuition picks, a few always miss — money spent, sentiment lost, object shelved. A wishlist turns hit-rate from guess to certainty.",
    },
    options: {
      zh: ["直接问对方想要什么", "看对方的购物车/收藏夹", "旁敲侧击问身边人"],
      en: ["Just ask what they want", "Check their cart or wishlist", "Ask someone close to them"],
    },
    reuseChannel: {
      zh: "多数电商都有「心愿单」功能, 对方加进去的每一件都是明示的答案; 家人朋友往往也知道ta最近念叨什么——这些情报比任何送礼攻略都准。",
      en: "Most shops have a wishlist feature — every item added is an explicit answer; family and friends usually know what they've been mentioning lately — better intel than any gift guide.",
    },
    alternative: {
      zh: "买礼物前先做愿望单确认: 直接问、看收藏夹、问身边人, 三分钟把「猜」变成「知道」——按 $25 时薪换算, 省下的是反复挑选的纠结时间加上猜错浪费的全额。",
      en: "Confirm the wishlist before buying: ask directly, check saved items, or ask their people — three minutes turns guessing into knowing — at $25/hr that saves both the deliberation time and the full cost of a missed guess.",
    },
    reuse: {
      zh: "自己也立一份愿望单: 让想送你礼物的人有据可依——双向的愿望单, 是社交圈里最省钱的默契。",
      en: "Keep a wishlist of your own too, so gift-givers in your life have something to go on — two-way wishlists are the circle's cheapest mutual hack.",
    },
    savingsHint: {
      zh: "消费前先看看家里已有的同类物品，也许能满足当下的使用需求。",
      en: "Before buying, check if you already have something similar at home that fits the need.",
    },
  },
  {
    id: "secondhand_book_gift",
    triggers: {
      zh: ["送书", "二手书", "绝版书", "旧书"],
      en: ["gift a book", "secondhand books", "out-of-print book", "used books"],
    },
    why: {
      zh: "书是最不怕「二手」的礼物: 内容一字不少, 品相好的旧书几乎与新书无异。而一本绝版书 + 扉页手写赠言, 是加钱也买不到的独一无二。",
      en: "Books fear nothing about being secondhand: every word intact, a well-kept copy reads like new. And an out-of-print title plus a handwritten note on the flyleaf is one-of-a-kind at any price.",
    },
    options: {
      zh: ["绝版书配手写赠言", "品相好的二手书", "自己读过的书签上手记"],
      en: ["Out-of-print title with a handwritten note", "Well-kept secondhand copy", "A book you loved, annotated"],
    },
    reuseChannel: {
      zh: "二手书平台按书名能搜到多个品相档位, 绝版书也常有个人藏家出让; 自己读过的好书直接签上赠语送出, 是零成本的顶配心意。",
      en: "Secondhand book platforms list multiple condition grades per title, and private collectors often part with out-of-print finds; a book you loved, inscribed and given, is top-shelf sentiment at zero cost.",
    },
    alternative: {
      zh: "送书优先二手与绝版: 品相好的旧书价格常是新书零头, 绝版书更是「有钱难买」的心意顶配——扉页一段手写赠言, 让按 $25 时薪算出的差价变成对方眼里无价的独一份。",
      en: "Gift books secondhand first: well-kept used copies run a fraction of new, and out-of-print titles are the thoughtful pick money can't directly buy — a handwritten flyleaf note turns the price gap, at $25/hr, into the one copy in the world that's theirs.",
    },
    reuse: {
      zh: "读过的书别囤在书架上落灰: 挑出适合每位朋友的, 写一句给ta的话送出去——书架清爽了, 每本书都有了第二段人生。",
      en: "Don't let finished books gather shelf dust: match a few to the right friends, inscribe a line each, and send them off — a lighter shelf and a second life for every copy.",
    },
    savingsHint: {
      zh: "消费前先看看家里已有的同类物品，也许能满足当下的使用需求。",
      en: "Before buying, check if you already have something similar at home that fits the need.",
    },
  },
  {
    id: "handmade_gift",
    triggers: {
      zh: ["手工礼物", "自己做礼物", "烘焙送礼", "手作礼物"],
      en: ["handmade gift", "make a gift", "bake a gift", "diy present"],
    },
    why: {
      zh: "标准化礼物的尴尬在于「人人都能买到」: 再贵也是商品目录里的一行。手作礼物反其道而行——世界上只有这一份, 而它只能来自你。",
      en: "Standardized gifts suffer from being buyable by anyone: however pricey, they're a catalog line. Handmade gifts invert that — exactly one exists, and it could only come from you.",
    },
    options: {
      zh: ["一炉手工饼干", "整理一本共同相册", "写一封长信配小物"],
      en: ["A batch of homemade cookies", "A curated shared photo album", "A long letter paired with a small object"],
    },
    reuseChannel: {
      zh: "手作的原料大多家里就有: 面粉黄油、手机里的照片、现成的信纸; 缺的小工具在邻里之间借一借——时间与心思, 就是全部的稀缺成本。",
      en: "Most handmade ingredients are already home: flour and butter, the photos on your phone, stationery on hand; borrow the odd tool from neighbors — time and thought are the only scarce inputs.",
    },
    alternative: {
      zh: "礼物不妨亲手做: 一炉饼干、一本相册的成本常不到成品礼物的一半, 投入的是两三个专注的晚上——按 $25 时薪换算, 这份「时间换心意」的礼物在对方那里往往最被记得。",
      en: "Consider making the gift: cookies or an album often cost less than half a store-bought present, plus a few focused evenings — priced at $25/hr, this time-for-thought gift is usually the one they remember longest.",
    },
    reuse: {
      zh: "手作有副产品: 多烤的一盘饼干分给同事, 相册排版的手艺复用到下一位家人的生日——一次投入, 多次生效。",
      en: "Handmaking has spillover: the extra tray of cookies feeds coworkers, and the album layout skill replays at the next family birthday — one effort, several payouts.",
    },
    savingsHint: {
      zh: "消费前先看看家里已有的同类物品，也许能满足当下的使用需求。",
      en: "Before buying, check if you already have something similar at home that fits the need.",
    },
  },
  {
    id: "wrap_less_gift",
    triggers: {
      zh: ["礼品包装", "礼物包装", "包装纸", "礼盒包装"],
      en: ["gift wrapping", "gift wrap", "wrapping paper", "gift packaging"],
    },
    why: {
      zh: "礼品包装是被设计成「撕开即弃」的消费品: 撕掉的那三秒, 就是它的一生。而一份精心准备的礼物, 好看与否从来不取决于外面那层纸。",
      en: "Gift wrap is engineered to be ripped and tossed: the three seconds of tearing are its whole life. And a well-chosen gift never owed its beauty to the outer layer anyway.",
    },
    options: {
      zh: ["旧布风吕敷包法", "报纸杂志内页折叠", "盒子直接系麻绳"],
      en: ["Wrap in scrap cloth, furoshiki style", "Fold newspaper or magazine pages", "Plain box tied with twine"],
    },
    reuseChannel: {
      zh: "家里现成的「包装库」比想象中大: 收快递的纸盒、旧衣物裁的方巾、攒下的缎带和麻绳; 家政抹布级的旧布洗熨后包礼物, 质感不输专柜丝带。",
      en: "Your home packaging stash is bigger than you think: delivery boxes, squares cut from worn clothes, saved ribbons and twine; even rag-grade cloth, washed and pressed, wraps with boutique-ribbon poise.",
    },
    alternative: {
      zh: "包装做减法: 一次性礼品包装的单价按件算常是十几块, 换成旧布和纸盒几乎为零——按 $25 时薪换算, 省下的是几分钟手工折叠换来的好几个自由小时, 且布料还能被对方再次使用。",
      en: "Subtract the wrap: disposable gift packaging runs double digits per set, while scrap cloth and a saved box run near zero — a few minutes of folding converts, at $25/hr, into real free hours, and the cloth gets reused by the recipient too.",
    },
    reuse: {
      zh: "收到礼物时把包装也收下: 缎带卷好、纸盒压平、漂亮的手提袋叠起来——下一次送礼, 你的「包装库」就绪, 零成本零浪费。",
      en: "Keep the packaging when you receive: roll the ribbon, flatten the box, fold the nice bag — next time you give, your wrap stash is ready at zero cost and zero waste.",
    },
    savingsHint: {
      zh: "消费前先看看家里已有的同类物品，也许能满足当下的使用需求。",
      en: "Before buying, check if you already have something similar at home that fits the need.",
    },
  },
  {
    id: "holiday_gift_cooldown",
    triggers: {
      zh: ["差点忘了买礼物", "补买礼物", "圣诞礼物", "新年礼物"],
      en: ["forgot a gift", "last-minute gift", "christmas gift shopping", "holiday shopping rush"],
    },
    why: {
      zh: "「差点忘了」是节日消费最贵的四个字: 临期补买没有比价空间, 凑单抬价、加急运费、将就的选择——每一项都在为拖延付费。",
      en: "\"Almost forgot\" is the most expensive phrase in holiday spending: last-minute buys have no comparison room — padded add-ons, rush shipping, settled-for choices — each one a fee for the delay.",
    },
    options: {
      zh: ["48小时冷静期后再决定", "补位用体验型礼物", "先送手写卡片稳住场面"],
      en: ["Sit on it 48 hours before deciding", "Fill the gap with an experience gift", "Hand over a handwritten card first"],
    },
    reuseChannel: {
      zh: "真临期也别慌: 手写卡片 + 一顿饭的邀约当天就能成礼; 家里囤的茶叶、酒、没拆的礼物都能救场——救场如送礼, 心意分不打折。",
      en: "Truly last-minute? A handwritten card plus a dinner invitation is a same-day gift; stocked tea, a bottle, an unopened present all save the day — a stand-in done warmly scores full marks for thought.",
    },
    alternative: {
      zh: "节日前后 48 小时是补买冷静期: 「差点忘了」的礼物先不急着下单, 用卡片和邀约稳住场面, 过了窗口再决定要不要买——按 $25 时薪换算, 躲开的凑单与加急溢价常常是好几个自由小时。",
      en: "Treat the 48 hours around the holiday as a re-buy cooldown: for the almost-forgotten gift, hold the moment with a card and an invitation, then decide after the window — at $25/hr, dodged add-on padding and rush premiums often amount to several free hours.",
    },
    reuse: {
      zh: "给明年的自己留一手: 节日一过, 把「今年谁收到了什么」记一笔——明年同一时间, 你是那个最早从容备礼的人。",
      en: "Leave next-year-you a note: once the holiday passes, jot down who received what — same time next year, you'll be the one who prepared earliest and calmest.",
    },
    savingsHint: {
      zh: "消费前先看看家里已有的同类物品，也许能满足当下的使用需求。",
      en: "Before buying, check if you already have something similar at home that fits the need.",
    },
  },
  {
    id: "experience_gift_first",
    triggers: {
      zh: ["买礼物", "送礼物", "节日礼物", "生日礼物", "礼物"],
      en: ["buy a gift", "birthday gift", "holiday gift", "gift for", "present for"],
    },
    why: {
      zh: "礼物多为「猜的」: 凭印象挑的实物, 对方碍于情面收下, 转头就吃灰。而一顿饭、一场展览、一次陪伴, 当场就被消费成回忆——不留闲置, 只留故事。",
      en: "Most physical gifts are guesses: bought on vague impressions, politely received, then left to gather dust. A meal, a show, an afternoon together gets consumed into memory on the spot — no clutter, just a story.",
    },
    options: {
      zh: ["一顿好饭代替物件", "一起看展/看演出", "陪对方做一件ta想做的事"],
      en: ["A good meal instead of an object", "A show or exhibition together", "Company for something they've wanted to do"],
    },
    reuseChannel: {
      zh: "体验型礼物的「渠道」就是对方的日程: 提前一周约好时间, 比任何快递都准时; 手写一张卡片写清安排, 仪式感不输礼盒。",
      en: "The only channel an experience needs is their calendar: book a slot a week ahead — more punctual than any courier — and handwrite a card with the plan for full gift-box ceremony.",
    },
    alternative: {
      zh: "送礼优先考虑体验型: 一顿饭、一次陪伴、一场演出, 均价常常低于像样的实物礼物, 却几乎不会浪费——省下的差价按 $25 时薪换算, 够换来一段两个人共度的自由时间。",
      en: "Lead with experience gifts: a meal, an outing, a show often costs less than a decent physical present and almost never goes to waste — at $25/hr the price gap converts into free hours the two of you actually share.",
    },
    reuse: {
      zh: "家里先翻一翻: 去年收到的、还没拆的礼物里, 有没有恰好适合这次转赠的 (在卡片上写明心意即可)——让闲置物流动起来, 也是环保。",
      en: "Look around first: among last year's still-unwrapped gifts there may be one that fits this occasion perfectly (say so on the card) — keeping idle gifts circulating is the greenest move.",
    },
    savingsHint: {
      zh: "消费前先看看家里已有的同类物品，也许能满足当下的使用需求。",
      en: "Before buying, check if you already have something similar at home that fits the need.",
    },
  },
];
