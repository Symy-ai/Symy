/**
 * green-alt-entries-pets — 宠物用品词条 (zh+en 双语)
 *
 * 词条结构见 green-alt-types.ts。顺序追加在 furniture 之后 (数组末位)。
 * 本域接住的是「为毛孩子花钱」的冲动: 宠物食品囤货、推车/猫爬架等
 * 大件、玩具消耗、猫砂订阅——单笔省幅可观的日常高频品类, 且
 * 「领养替代购买」是绿色叙事里最纯的一条面子。
 *
 * 域内顺序 (匹配即优先级): 具体触发词在前, 泛化词垫底——
 * pet_medicine 最前 ('宠物药品' 含 '宠物'), 其次 cat_litter / pet_toy /
 * secondhand_pet_gear ('宠物用品' 泛化), pet_food_bulk 在
 * adopt_dont_shop 之前 ('买宠物粮' 含 '买宠物'), adopt 垫底
 * (同 gifting 域「礼物」/ furniture 域「买家具」垫底先例)。
 * en 触发词避开裸 'pet' ('carpet' 含 'pet', 会被家具域 carpet 查询
 * 之外的长尾误伤), 一律用复合词。
 *
 * 文案红线 (与既有域同款): 不说教, 无碳足迹数值, 荣誉框架,
 * 省钱数学 (大袋摊薄 / N 个廉价玩具换算) 只进 suggestion 文案,
 * 绝不进 share/honor 面; 药品词条不给医疗建议, 只引导
 * 「先问兽医再买」; 绝不暗示「养不起」——会省着养是负责任,
 * 不是将就。
 *
 * 绿色偏好开关 (symy_green_pref === 'off') 由调用方判断, 词条层不特判。
 */

import type { GreenAlternativeEntry } from './green-alt-types';

export const GREEN_ALT_ENTRIES_PETS: readonly GreenAlternativeEntry[] = [
  {
    id: "pet_medicine_vet_first",
    triggers: {
      zh: ["宠物药", "宠物药品", "宠物保健品", "驱虫药囤", "宠物营养品"],
      en: ["pet medicine", "pet meds", "dog supplements", "cat supplements", "pet vitamins"],
    },
    why: {
      zh: "宠物的药和保健品不是囤货型消费: 剂量随体重、年龄和状态变化, 囤下的常常还没喂完就已经不对症了。这类东西的价值在「对症」, 不在「拥有」——而判断对症与否的, 只有兽医。",
      en: "Pet medicines and supplements aren't stockpile goods: dosages shift with weight, age and condition, and a stocked-up bottle often no longer fits before it's finished. Their value lies in matching the need, not in being owned — and only a vet can judge that match.",
    },
    options: {
      zh: ["先约兽医确认必要性", "按疗程开药不囤整瓶", "保健品问过 vet 再决定"],
      en: ["Confirm with the vet before buying", "Fill by treatment course, not by bottle", "Ask the vet before any supplement"],
    },
    reuseChannel: {
      zh: "下次体检时把想买的药和保健品列成清单带去, 让兽医逐项划掉或确认——没被划掉的那一两样, 才是值得买的; 囤药的抽屉, 大多数家庭最后都变成了过期药回收站。",
      en: "Bring your list of intended meds and supplements to the next check-up and let the vet cross items off or confirm them — the one or two that survive are the ones worth buying; most stocked pet-medicine drawers end up as expired-medication drop-offs.",
    },
    alternative: {
      zh: "药和保健品先问兽医再下单: 一次问诊的费用, 常低于一瓶不对症药的买价, 更别说囤了几瓶的钱。这里省的不是药钱, 是「猜着买」的钱——对症的才是值得花的。",
      en: "Ask the vet before ordering meds or supplements: one consultation often costs less than a single mismatched bottle, let alone several stocked up. What's saved here isn't care money — it's guess-buying money; only what fits the need is worth spending.",
    },
    reuse: {
      zh: "「先问再买」养成的判断力会一直陪着你: 几轮下来你自然知道哪些是必需、哪些是货架焦虑——这份清单感, 比整柜保健品更护得住毛孩子。",
      en: "The ask-first habit builds judgment that stays: after a few rounds you'll know what's essential and what's shelf anxiety — that list-sense protects your companion better than a full supplement cabinet.",
    },
    savingsHint: {
      zh: "消费前先看看家里已有的同类物品，也许能满足当下的使用需求。",
      en: "Before buying, check if you already have something similar at home that fits the need.",
    },
  },
  {
    id: "cat_litter_subscription_audit",
    triggers: {
      zh: ["猫砂订阅", "猫砂囤", "猫砂"],
      en: ["cat litter subscription", "litter delivery", "cat litter bulk"],
    },
    why: {
      zh: "猫砂是典型的「按月订阅最容易过量」的品类: 用量随猫只数、猫砂盆数量和换砂习惯浮动, 订阅却按固定节奏发货——多出来的不是优惠, 是阳台上的库存和受潮的风险。",
      en: "Cat litter is the classic over-subscribed staple: usage swings with the number of cats, boxes and changing habits, while subscriptions ship on a fixed cadence — the surplus isn't a bargain, it's balcony inventory with a dampness risk.",
    },
    options: {
      zh: ["按实际用量算好再定订阅节奏", "先记录两周的实际换砂量", "大袋单买替代固定订阅"],
      en: ["Match the subscription cadence to real usage", "Track two weeks of actual usage first", "Buy big bags à la carte instead of fixed delivery"],
    },
    reuseChannel: {
      zh: "先花两周记录每次换砂的量, 折算出月用量再回去调订阅频率——多数人调完会发现降一档刚好; 已经囤多的, 密封桶保存能撑很久, 不必急着再续。",
      en: "Log every litter change for two weeks, convert to a monthly figure, then go adjust the subscription frequency — most people find one notch down fits exactly; what's already stocked keeps fine in a sealed bin, no rush to renew.",
    },
    alternative: {
      zh: "订阅前先算用量: 用「实际月用量 × 送货周期」倒推该订的档位, 而不是被「订越多单价越低」带着走——省的不是猫砂钱, 是为折扣多囤的那几袋, 加上阳台那块放别的东西更值的地。",
      en: "Audit before subscribing: derive the tier from actual monthly usage times delivery cadence, not from the bigger-pack-better-price pitch — the saving isn't on litter itself but on the extra bags bought for a discount, plus the balcony corner that could hold something better.",
    },
    reuse: {
      zh: "把订阅节奏调到「刚好够用」之后, 你会爱上这种不被库存推着走的感觉——空出来的阳台角, 放猫窝比放猫砂库存可爱多了。",
      en: "Once the cadence is dialed to just-enough, you'll like not being pushed around by inventory — and the freed balcony corner holds a cat bed far better than litter stock.",
    },
    savingsHint: {
      zh: "消费前先看看家里已有的同类物品，也许能满足当下的使用需求。",
      en: "Before buying, check if you already have something similar at home that fits the need.",
    },
  },
  {
    id: "pet_toy_durable",
    triggers: {
      zh: ["宠物玩具", "猫玩具", "狗玩具", "逗猫棒", "咬胶玩具"],
      en: ["dog toys", "chew toys", "cat toys", "interactive pet toy"],
    },
    why: {
      zh: "廉价宠物玩具是「分钟级消耗品」: 猫狗的破坏力按咬合算, 不按价格算——便宜玩具往往开局十分钟就碎, 碎片还有误食风险。玩具的钱, 花在耐咬上才算花对了。",
      en: "Cheap pet toys are minute-scale consumables: a pet's destructiveness scales with jaw strength, not price — a flimsy toy often dies within minutes of unboxing, shards and swallowing risk included. Toy money is spent right only when it buys durability.",
    },
    options: {
      zh: ["一根耐咬的经典款替代一打廉价款", "漏食玩具/益智玩具耐玩度高", "纸箱和绳结的免费快乐"],
      en: ["One durable classic instead of a dozen flimsy ones", "Puzzle feeders that outlast everything", "The free joy of cardboard boxes and rope knots"],
    },
    reuseChannel: {
      zh: "挑玩具认「耐咬等级」和材质说明, 天然橡胶、厚帆布这类经典材质是被无数颗牙验证过的; 而纸箱、纸团、绳结这些免费的, 恰恰是猫狗长期票选的最爱——玩具的尽头是包装箱。",
      en: "Check bite-rating and material labels: natural rubber and heavy canvas are classics proven by generations of teeth; and the free options — boxes, paper balls, rope knots — keep topping pets' own polls. The endgame of every toy box is the shipping carton.",
    },
    alternative: {
      zh: "买玩具按「换算成廉价玩具个数」来比价: 一根耐咬款的价钱约等于好几个廉价款, 但寿命是它们的许多倍——摊到每小时的玩耍成本, 耐用品便宜得多, 而且碎片少一件, 误食风险就少一分。",
      en: "Price toys in cheap-toy equivalents: one durable piece costs about a handful of flimsy ones yet outlasts them many times over — per hour of play it's far cheaper, and every shard that never existed is a swallowing risk that never happens.",
    },
    reuse: {
      zh: "耐咬玩具是「传家玩具」: 玩具箱里那几件磨圆了边还没坏的经典款, 是毛孩子真正的心头好——少而耐用, 玩具箱也清爽。",
      en: "Durable toys become heirlooms: the few rounded-edge classics still intact at the bottom of the toy basket are the true favorites — fewer and tougher makes for a tidier basket too.",
    },
    savingsHint: {
      zh: "消费前先看看家里已有的同类物品，也许能满足当下的使用需求。",
      en: "Before buying, check if you already have something similar at home that fits the need.",
    },
  },
  {
    id: "secondhand_pet_gear_first",
    triggers: {
      zh: ["宠物推车", "猫爬架", "狗笼", "宠物围栏", "宠物用品"],
      en: ["pet stroller", "cat tree", "dog crate", "pet gate", "secondhand pet gear"],
    },
    why: {
      zh: "宠物大件是二手市场里的「半价货架」: 推车、猫爬架、围栏这些大件, 猫狗长大或离家后就进了闲鱼, 骨架完好、只是落了点毛——耐用品折损低, 而猫砂和抓板留下的使用痕迹, 恰恰是猫狗不介意的部分。",
      en: "Pet gear is the half-price shelf of the secondhand market: strollers, cat trees and gates land on resale the moment a pet grows up or a family moves on — frame intact, just some fur. Durable gear depreciates little, and the wear that comes with it is exactly the part cats and dogs never mind.",
    },
    options: {
      zh: ["二手平台收九成新大件", "本地养宠家庭急转的围栏/笼", "自制品实木猫爬架"],
      en: ["Near-mint gear from resale platforms", "Urgent-move listings from local pet families", "Build a solid-wood cat tree yourself"],
    },
    reuseChannel: {
      zh: "闲鱼和本地养宠群是宠物大件的集散地: 猫爬架、狗笼常半价以下急转, 附原包装的不在少数; 收回家消毒晾晒就能用——而自家大件退役时, 拍照挂出还能回血, 让它去下一只猫那里继续服役。",
      en: "Resale apps and local pet groups are the gear clearinghouse: cat trees and crates go urgent at half price or less, original packaging often included; disinfect and air-dry on arrival — and when your own gear retires, photo and list it to recoup cash for its next tour of duty.",
    },
    alternative: {
      zh: "宠物大件先看二手再谈全新: 推车、爬架这类耐用品的二手差价常以几十上百计, 摊到使用年限上几乎是白捡——省下的差额, 够买好几袋好粮, 毛孩子对此毫不在意见证者的数量。",
      en: "Check secondhand before new for pet gear: the resale gap on strollers and trees often runs to tens or hundreds, spread over service life it's nearly free — the difference covers quite a few bags of good food, and your pet has never once counted witnesses.",
    },
    reuse: {
      zh: "二手大件的故事更好讲: 「这只爬架的上一只猫熬过了整个童年」——用得住的东西在养宠圈自带信用, 你转手时也一样。",
      en: "Secondhand gear tells the better story: the tree whose previous cat outgrew an entire kittenhood — things that last carry their own reputation in pet circles, and yours will too when you pass it on.",
    },
    savingsHint: {
      zh: "消费前先看看家里已有的同类物品，也许能满足当下的使用需求。",
      en: "Before buying, check if you already have something similar at home that fits the need.",
    },
  },
  {
    id: "pet_food_bulk_math",
    triggers: {
      zh: ["猫粮", "狗粮", "宠物粮", "宠物食品"],
      en: ["dog food bulk", "cat food bulk", "pet food bulk", "big bag dog food"],
    },
    why: {
      zh: "粮食的大袋划算, 但划算的前提是「吃得完」: 干粮开封后风味和营养都在走下坡, 囤过头的那几袋, 省下的单价差全赔在变质里。囤货数学的解不是「买最大」, 是「按食速买刚好」。",
      en: "Big bags win on unit price, but only if they get finished: kibble slides downhill in flavor and nutrition once opened, and the overstocked bags give back their entire unit-price saving to staleness. The math's answer isn't the biggest bag — it's the bag matched to eating speed.",
    },
    options: {
      zh: ["按月食速算好克数再选袋型", "大袋分装冷冻/密封保存", "和同宠家庭拼单大袋"],
      en: ["Match bag size to monthly consumption", "Split big bags into sealed portions", "Split a big bag with another pet family"],
    },
    reuseChannel: {
      zh: "翻翻喂食记录算出月食速, 对照开封保质期倒推最大安全袋型——多数家庭算完会降一档; 真想拿大袋差价, 和同小区养宠家庭拼单分装, 单价省到、库存风险对半。",
      en: "Pull the feeding log, get monthly consumption, and work back from the opened-bag shelf life to the largest safe size — most households land one size down; to still capture the big-bag gap, split one with a nearby pet family and halve the staleness risk while keeping the unit price.",
    },
    alternative: {
      zh: "囤粮前先做除法: 大小袋的单价差摊到每月固然好看, 但再乘上「开封后能吃多久」这道折扣, 超过食速的袋型都在倒贴——买刚刚好吃完的那袋, 差价才真正落袋。",
      en: "Do the division before stocking up: the unit-price gap spread over a month looks fine, but multiplied by how long an opened bag actually stays good, any bag beyond eating speed pays you backward — buy the size that finishes just in time and the gap actually lands in your pocket.",
    },
    reuse: {
      zh: "「按食速买粮」是养宠入门的第一课手感: 这套「算完再囤」的思路, 换到猫砂、零食、日用品上全都通用——一次学会, 终身受用。",
      en: "Buying by eating speed is lesson one of pet keeping: the calculate-before-stocking instinct transfers straight to litter, treats and daily staples — learned once, useful for the whole tenure.",
    },
    savingsHint: {
      zh: "消费前先看看家里已有的同类物品，也许能满足当下的使用需求。",
      en: "Before buying, check if you already have something similar at home that fits the need.",
    },
  },
  {
    id: "adopt_dont_shop",
    triggers: {
      zh: ["买宠物", "想养宠物", "买一只猫", "买一只狗", "宠物店买猫狗"],
      en: ["buy a pet", "buy a puppy", "buy a kitten", "pet store puppy", "adopt don't shop"],
    },
    why: {
      zh: "想迎接一只毛孩子时, 「买」只是渠道之一, 而且常常不是最好的那个: 救助站和领养机构里, 等一个家的猫狗和店里的同样可爱, 多数还完成了体检和绝育。领养不是将就, 是给一个已经在等的生命一个家。",
      en: "When a companion animal is calling, buying is only one channel and often not the best one: in shelters and rescue groups, cats and dogs waiting for a home are every bit as lovable, most already health-checked and spayed. Adopting isn't settling — it's giving a home to a life already waiting for one.",
    },
    options: {
      zh: ["本地救助站/领养日看看", "领养机构申请流程了解", "先做寄养家庭试试相处"],
      en: ["Visit local shelters and adoption days", "Learn the rescue-group application process", "Foster first to see how you fit"],
    },
    reuseChannel: {
      zh: "领养渠道比想象中近: 城市救助站的公众号、宠物医院的领养角、领养日活动, 都能遇见等家的猫狗; 先寄养再领养的家庭也越来越多——给彼此一个试用期, 是最负责任的开始。",
      en: "Adoption is closer than you think: shelter accounts, vet-clinic adoption corners and adoption-day events all host waiting cats and dogs; foster-to-adopt families keep growing too — a trial period for both sides is the most responsible start there is.",
    },
    alternative: {
      zh: "把「买一只」的预算换算一下: 领养的公益费用常只是店价的一小部分, 而且多数含体检和绝育——省下的差额, 正好变成头几个月的粮和窝。更体面的是这件事本身: 你不是消费了一只动物, 你认领了一个家人。",
      en: "Convert the buy-a-pet budget: an adoption fee is usually a small fraction of store price, health check and spay often included — the difference funds the first months of food and bedding. And the better math is the act itself: you didn't purchase an animal, you claimed a family member.",
    },
    reuse: {
      zh: "「领养代替购买」是养宠圈最硬核的荣誉勋章: 领养家庭的故事自带温度, 而你家的这位「编外家庭成员」, 会用余生的迎接仪式证明这个决定有多值。",
      en: "Adopt-don't-shop is the highest honor badge in pet circles: an adoption story carries its own warmth, and your newest family member will spend a lifetime of homecoming greetings proving what the decision was worth.",
    },
    savingsHint: {
      zh: "消费前先看看家里已有的同类物品，也许能满足当下的使用需求。",
      en: "Before buying, check if you already have something similar at home that fits the need.",
    },
  },
];
