/**
 * green-alt-entries-parenting — 母婴亲子词条 (zh+en 双语)
 *
 * 词条结构见 green-alt-types.ts。顺序追加在 travel 之后 (数组末位)。
 * 本域接住的是「育儿型消费冲动」(童装常新/玩具越买越多/绘本囤书/
 * 大件一步到位/囤纸尿裤促销), 特点是「为孩子好」的情感加成最强——
 * 恰恰最适合绿色示范: 孩子用行动学到的节俭与循环, 比说教深得多。
 *
 * 文案红线 (与既有域同款): 不说教, 无碳足迹数值, 荣誉框架,
 * 绝不暗示「买不起」—— 传递与租借是聪明的选择, 不是委屈孩子。
 *
 * 绿色偏好开关 (symy_green_pref === 'off') 由调用方判断, 词条层不特判。
 */

import type { GreenAlternativeEntry } from './green-alt-types';

export const GREEN_ALT_ENTRIES_PARENTING: readonly GreenAlternativeEntry[] = [
  {
    id: "kids_clothes_pass_on",
    triggers: {
      zh: ["买童装", "童装", "儿童新衣", "给孩子买衣服"],
      en: ["buy kids clothes", "children's clothes", "new outfits for kids", "kids apparel"],
    },
    why: {
      zh: "孩子的身高按季刷新, 一件外套往往只穿一季就短了袖——花在全价新衣上的钱, 摊到每次穿着常常高得惊人, 而循环过的童装几乎不折旧。",
      en: "Kids outgrow clothes by the season — a jacket may fit one winter before the sleeves ride up, so full-price new outfits cost a lot per wear, while passed-on kids' clothes barely depreciate.",
    },
    options: {
      zh: ["亲友传递圈先问一圈", "二手童装挑品牌基础款", "新衣只买仪式感那几件"],
      en: ["Ask the hand-me-down circle first", "Pick sturdy brands secondhand", "Buy new only for milestone pieces"],
    },
    reuseChannel: {
      zh: "亲友同事的孩子大都没几岁, 「上传下」的传递圈几乎是免费的童装库; 闲鱼和小区妈妈群里品牌童装的成色普遍很好, 价格常是原价零头。",
      en: "Friends and coworkers with slightly older kids form a nearly free hand-me-down library; secondhand brand kids' clothes — at a sliver of retail — usually show little wear.",
    },
    alternative: {
      zh: "童装走传递循环: 长得快的年纪, 亲友传递加二手基础款完全够穿, 新衣只留给开学、过年这类仪式感场合——省下的钱按 $25 时薪换算是好几个自由小时, 陪孩子的时间才是最贵的。",
      en: "Keep kids' wardrobes in a pass-on loop: at growth speed, hand-me-downs plus secondhand basics cover it, saving new buys for milestone moments — at $25/hr the savings convert to real free hours, and time with them is the expensive part.",
    },
    reuse: {
      zh: "孩子的旧衣别急着处理: 洗净收好传给更小的孩子, 或在妈妈群里换尺码——你传出去的一箱, 也会变成传回来的一箱。",
      en: "Don't rush outgrown clothes out the door: launder, store, and pass them down or swap sizes in parent groups — the box you send out tends to come back as another.",
    },
    savingsHint: {
      zh: "消费前先看看家里已有的同类物品，也许能满足当下的使用需求。",
      en: "Before buying, check if you already have something similar at home that fits the need.",
    },
  },
  {
    id: "toy_library_borrow",
    triggers: {
      zh: ["买玩具", "新玩具", "玩具车", "给孩子买玩具"],
      en: ["buy toys", "new toys", "kids toys", "toy shopping"],
    },
    why: {
      zh: "玩具的保鲜期常常只有两周: 新鲜感一过就被丢在角落, 下一个「想要」已经在路上。孩子需要的其实是「新刺激」, 不是「新所有权」。",
      en: "Most toys stay fresh for about two weeks before landing in the corner while the next \"want\" is already loading — what kids crave is novelty, not ownership.",
    },
    options: {
      zh: ["先借后买验证真爱", "玩具图书馆办卡", "和邻居定期换玩具"],
      en: ["Borrow first to test true love", "Join a toy library", "Rotate toys with neighbors"],
    },
    reuseChannel: {
      zh: "不少社区图书馆和早教机构带玩具借阅, 一张卡换着玩一整年; 小区里约个「玩具交换日」, 每家出几件, 孩子像过节一样开心。",
      en: "Many community libraries lend toys — one card covers a year of variety — and a neighborhood swap day, each family contributing a few, delights kids like a festival.",
    },
    alternative: {
      zh: "玩具先借后买: 玩具图书馆和交换圈能以极低成本持续供给新鲜感, 只有孩子反复回头玩的那个才值得买回家——把省下的预算按 $25 时薪算, 是给全家换来的自由时间。",
      en: "Borrow toys before buying: toy libraries and swap circles keep novelty flowing at tiny cost, and only the one they keep returning to earns shelf space — at $25/hr, the saved budget buys the family real free time.",
    },
    reuse: {
      zh: "家里沉睡的旧玩具先「重新上架」: 收起来一批, 过几周再拿出来, 孩子对它的新鲜感会重置——零成本的「新玩具」。",
      en: "Re-shelve the dormant toys first: rotate a batch out of sight for a few weeks, and their novelty resets — \"new toys\" at zero cost.",
    },
    savingsHint: {
      zh: "消费前先看看家里已有的同类物品，也许能满足当下的使用需求。",
      en: "Before buying, check if you already have something similar at home that fits the need.",
    },
  },
  {
    id: "picturebook_library_swap",
    triggers: {
      zh: ["买绘本", "童书", "儿童绘本", "囤绘本"],
      en: ["buy picture books", "children's books", "kids books", "picture book shopping"],
    },
    why: {
      zh: "绘本是最典型的「读一遍就过」: 孩子进入下个阅读阶段后, 低幼绘本基本不再翻开。全价囤一柜子, 不如让每本书流动起来。",
      en: "Picture books are read-once by nature — once kids move up a reading level, the toddler shelf rarely reopens. A full-price collection sits; a circulating one keeps getting read.",
    },
    options: {
      zh: ["图书馆借阅为主", "绘本交换角常换常新", "只买孩子点名重读的"],
      en: ["Lean on library borrowing", "Keep a swap shelf fresh", "Buy only the re-read favorites"],
    },
    reuseChannel: {
      zh: "公共图书馆的少儿馆藏远比家里书架丰富, 借书证免费; 幼儿园门口和社区里的绘本交换角, 拿一本换一本, 书架永远在更新。",
      en: "The public library's children's section dwarfs any home shelf and a card is free; swap corners at kindergartens and communities trade book for book, keeping the shelf forever fresh.",
    },
    alternative: {
      zh: "绘本以借为主、买为例外: 图书馆加交换角能覆盖九成阅读量, 只把孩子翻烂了还要听的那几本买回家——省下的购书钱按 $25 时薪换算, 够换来许多个亲子共读的从容夜晚。",
      en: "Borrow picture books as the rule, buy as the exception: the library plus swap corners cover most reading, so you only own the ones worn soft from re-reading — at $25/hr, the saved book budget buys many unhurried bedtime reading nights.",
    },
    reuse: {
      zh: "读过的绘本先别收进箱底: 传给朋友家更小的孩子, 或捐给社区交换角——一本被很多孩子读过的绘本, 价值反而更大。",
      en: "Don't box away finished books: pass them to younger kids or donate to the swap corner — a picture book read by many children carries more worth, not less.",
    },
    savingsHint: {
      zh: "消费前先看看家里已有的同类物品，也许能满足当下的使用需求。",
      en: "Before buying, check if you already have something similar at home that fits the need.",
    },
  },
  {
    id: "baby_gear_rental",
    triggers: {
      zh: ["婴儿车", "安全座椅", "高景观推车", "提篮"],
      en: ["buy a stroller", "baby stroller", "car seat", "high-view pram"],
    },
    why: {
      zh: "婴儿大件的使用窗口以月计: 高景观推车威风一年就换成轻便伞车, 提篮半岁就坐不进。一步到位买全新, 等于为最短的使用期付最贵的钱。",
      en: "Baby big-ticket items live on month-scale windows: the high-view pram rules a year before an umbrella stroller takes over, and the infant bucket is outgrown in months — buying all-new tops the price for the shortest usage.",
    },
    alternative: {
      zh: "婴儿大件先租后买、能租不买: 推车、安全座椅、餐椅这类窗口期用品, 正规渠道的租赁价常是买价的零头, 省下的钱按 $25 时薪换算成自由小时, 够补上好几个睡眠不足的夜晚。",
      en: "Rent big baby gear first: strollers, car seats and high chairs with month-scale windows rent from reputable channels for a fraction of retail — at $25/hr the savings convert to free hours that repay several sleep-short nights.",
    },
    options: {
      zh: ["使用窗口短的大件租赁", "亲友退役件接手", "买二手用完再转手"],
      en: ["Rent short-window gear", "Take over a friend's retired piece", "Buy secondhand, resell after"],
    },
    reuseChannel: {
      zh: "母婴店和线上平台多有婴儿推车、安全座椅的正规租赁, 消毒与安全检测齐全; 身边「刚毕业」的家庭也常有大件急着找下家, 半新品价格极友好。",
      en: "Baby stores and online platforms rent sanitized, safety-checked strollers and seats; families just \"graduating\" out of the phase often hand off big items in near-new condition at friendly prices.",
    },
    reuse: {
      zh: "安全座椅这类涉安件收二手时认准无事故史、没过有效期; 用完别闲置, 转手给下一个家庭——大件在家庭之间流转, 是母婴圈最好的循环。",
      en: "For secondhand car seats, confirm no crash history and unexpired date; when done, pass it along rather than letting it idle — big gear flowing between families is the parent circle's best loop.",
    },
    savingsHint: {
      zh: "消费前先看看家里已有的同类物品，也许能满足当下的使用需求。",
      en: "Before buying, check if you already have something similar at home that fits the need.",
    },
  },
  {
    id: "diaper_promo_math",
    triggers: {
      zh: ["纸尿裤", "囤纸尿裤", "拉拉裤", "大促囤尿裤"],
      en: ["buy diapers", "diaper stockpile", "diaper sale", "pull-up diapers"],
    },
    why: {
      zh: "纸尿裤大促的「按箱囤」最会算计人: 码数却在月月刷新, 囤的 M 码常常没穿完就小了——省下的折扣, 全押进了穿不上的库存里。",
      en: "Diaper case-stack sales prey on the wrong variable: sizes refresh monthly, so the stocked M often runs small before it runs out — the discount gets locked into inventory that no longer fits.",
    },
    options: {
      zh: ["只囤一个码数的量", "先用完再补", "记下孩子当前用量再下单"],
      en: ["Stock only one size ahead", "Finish before replenishing", "Check monthly usage first"],
    },
    reuseChannel: {
      zh: "没拆封又穿不上的码数, 妈妈群里原价转手几乎是秒出; 与其对折甩卖, 不如下次只买一个月的量, 让促销为你打工而不是替你做主。",
      en: "Unopened outgrown packs resell in parent groups within hours — better to buy a month at a time and let sales work for you, not decide for you.",
    },
    alternative: {
      zh: "囤纸尿裤前先做促销数学: 用「月用量乘以还能穿几个月」封顶囤货量, 折扣省下的钱对比穿不上浪费的钱, 再按 $25 时薪换算值几个自由小时——多数时候, 小批量补货才是真划算。",
      en: "Do the promo math before stocking diapers: cap the stockpile at monthly usage times remaining fit weeks, weigh the discount against the waste of outgrown packs, then price it in free hours at $25/hr — most months, small replenishments actually win.",
    },
    reuse: {
      zh: "家里先盘点: 库存的码数、每片的单价、孩子当前的穿戴节奏写在一起, 促销再凶也先看完这张小抄再下单。",
      en: "Take stock first: note stocked sizes, per-piece price and the baby's current pace — read that cheat sheet before any sale tempts the cart.",
    },
    savingsHint: {
      zh: "消费前先看看家里已有的同类物品，也许能满足当下的使用需求。",
      en: "Before buying, check if you already have something similar at home that fits the need.",
    },
  },
];
