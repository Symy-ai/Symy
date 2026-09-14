/**
 * green-alt-entries-garden — 园艺绿植词条 (zh+en 双语)
 *
 * 词条结构见 green-alt-types.ts。顺序追加在 pets 之后 (数组末位)。
 * 本域接住的是「把阳台/院子变成绿洲」的置办冲动: 工具多为低频闲置
 * (一年用不了几次, 借/共享最优), 花盆在搬家和换盆季大量淘汰,
 * 种子和扦插近乎零成本——园艺是绿色叙事最纯的展示性品类,
 * 换苗/堆肥自带社交传播面。
 *
 * 域内顺序 (匹配即优先级): 具体触发词在前, 泛化词垫底——
 * garden_tools 最前且持有泛词「园艺」/「gardening」('园艺工具'
 * 含 '园艺', 同词条无害); '浇水壶' 在 water_wise 的 '浇水' 之前
 * (浇水的壶是工具); secondhand_pots 的 '花盆' 在 plant_swap 的
 * '买花' 之前 ('买花盆' 含 '花盆' 也含 '买花', 具体者先中);
 * seeds_over_seedlings 的 '买苗' 先于 plant_swap 的泛 '买绿植'。
 * en 触发词避开裸 'plant'/'pot' ('planted' 含 'plant' 的长尾误伤),
 * 一律用复合词 ('garden tools'/'flower pots'/'buy seedlings')。
 *
 * 文案红线 (与既有域同款): 不说教, 无碳/环保数值, 荣誉框架,
 * 省钱数学 (工具日租金对买价、种子对成苗价差) 只进 suggestion
 * 文案, 绝不进 share/honor 面; 堆肥词条只做定性环保表述,
 * 不给任何碳/减排数值; 等待发芽本身是园艺乐趣, 不暗示「等不起」。
 *
 * 绿色偏好开关 (symy_green_pref === 'off') 由调用方判断, 词条层不特判。
 */

import type { GreenAlternativeEntry } from './green-alt-types';

export const GREEN_ALT_ENTRIES_GARDEN: readonly GreenAlternativeEntry[] = [
  {
    id: "garden_tools_borrow",
    triggers: {
      zh: ["园艺工具", "剪枝剪", "浇水壶", "铲子耙子", "园艺"],
      en: ["garden tools", "pruning shears", "garden hose", "watering can", "gardening supplies"],
    },
    why: {
      zh: "园艺工具是典型的低频闲置: 修枝剪一年开春用一回, 起苗铲一季碰不了几次——买齐一套的钱, 大多数时间都在储藏室里吃灰。工具的价值在使用的那几个小时, 不在归属。",
      en: "Garden tools are classic low-frequency clutter: pruning shears come out once at winter's end, a spade barely once a season — a full set spends most of its life gathering dust in storage. A tool's value lives in the hours it's used, not in being owned.",
    },
    options: {
      zh: ["先向有院子的邻居借一轮", "社区工具房/共享工具角看看", "只买高频用的那一件"],
      en: ["Borrow a round from a neighbor with a yard", "Check a community tool library", "Buy only the one you'll use weekly"],
    },
    reuseChannel: {
      zh: "小区业主群和园艺群是工具共享的天然池子: 剪枝剪、耙子这类「一年几回」的工具, 邻里间轮着用绰绰有余; 真要买的只留最顺手的那件——而你家那件退役时, 挂群里一喊就有人接。",
      en: "Neighborhood and gardening groups are natural tool pools: shears and rakes used a few times a year circulate easily between neighbors; keep only the one that fits your hand — and when it retires, one shout in the group finds it a next home.",
    },
    alternative: {
      zh: "置办工具前先算使用频率: 一年用两三次的工具, 借或租的成本远低于买价, 还不占储藏室——省下的钱留给土壤和苗, 那才是年年有产出的投资。",
      en: "Price tools by how often you'll use them: something needed a few times a year costs far less borrowed or rented than bought, storage space included — leave the savings for soil and seedlings, the investments that actually compound.",
    },
    reuse: {
      zh: "「借得到就不买」的园艺圈自带人情味: 借过一次剪枝剪的邻居, 下季会来问你分不分扦插苗——工具共享往往是换苗友谊的开场。",
      en: "A garden circle that borrows grows friendships too: the neighbor who lent you shears will come asking for cuttings next season — tool sharing is often how plant-swap friendships begin.",
    },
    savingsHint: {
      zh: "消费前先看看家里已有的同类物品，也许能满足当下的使用需求。",
      en: "Before buying, check if you already have something similar at home that fits the need.",
    },
  },
  {
    id: "secondhand_pots_first",
    triggers: {
      zh: ["花盆", "陶盆", "加仑盆", "种菜盆", "花盆架"],
      en: ["flower pots", "terracotta pots", "planter boxes", "plant pots", "raised bed kits"],
    },
    why: {
      zh: "花盆是二手市场的「搬家季倾泻」品类: 换盆淘汰的、搬家用不上的、入坑又退坑的, 大量完好花盆以白菜价流出让——陶盆和加仑盆摔不坏也过不了时, 二手的痕迹恰是养过花的证明。",
      en: "Pots are the moving-season flood of the secondhand market: outgrown repots, moving-day castoffs, hobby-exit giveaways — plenty of intact pots flow out for pocket change. Terracotta and grow bags neither break by sitting nor go out of style, and a bit of residue just proves something once grew well in them.",
    },
    options: {
      zh: ["二手平台收搬家急转的盆", "本地园艺群收闲置盆", "旧物改造: 桶/罐/木箱钻孔"],
      en: ["Grab moving-sale pots on resale apps", "Collect idle pots from local garden groups", "Drill drainage into old buckets, tins and crates"],
    },
    reuseChannel: {
      zh: "闲鱼和本地园艺群常年有人半卖半送花盆, 搬家季尤其密集; 收回家刷洗暴晒就能用。自家淘汰的盆也别扔——擦干净挂出去, 新手正好低价起步, 盆的轮回比盆的价钱有意思。",
      en: "Resale apps and local garden groups run near-constant pot giveaways, densest around moving season; scrub and sun them and they're ready. And when your own pots are outgrown, don't bin them — clean and list them so a beginner starts cheap; a pot's next life beats its price tag.",
    },
    alternative: {
      zh: "买盆前先看二手: 完好花盆的二手价常只是新零头, 一次收十几个也花不了多少——省下的差额换成好土和缓释肥, 花的感受比盆直接得多。",
      en: "Check secondhand before new pots: intact used pots often go for a sliver of retail, a dozen for pocket change — swap the difference for good soil and slow-release feed, which the plants notice far more than the pot.",
    },
    reuse: {
      zh: "「旧盆养新苗」是园艺圈的默契: 一只用过的陶盆比崭新塑料盆更有园龄——你转手时它带着故事, 收来时也一样。",
      en: "Old pot, new seedling is a gardener's wink: a weathered terracotta pot has more garden seniority than shiny plastic — it carries a story when you pass it on, just as it did when you took it in.",
    },
    savingsHint: {
      zh: "消费前先看看家里已有的同类物品，也许能满足当下的使用需求。",
      en: "Before buying, check if you already have something similar at home that fits the need.",
    },
  },
  {
    id: "seeds_over_seedlings",
    triggers: {
      zh: ["买苗", "菜苗", "成苗", "番茄苗", "草莓苗"],
      en: ["buy seedlings", "vegetable seedlings", "tomato seedlings", "herb seedlings", "buy starts"],
    },
    why: {
      zh: "一包种子的价钱常常买不到一棵成苗, 而里面的棵数以十计: 从育苗开始的价差, 是园艺里最划算的一笔换算。更妙的是等待本身——从破土到第一片真叶, 恰恰是园艺最上头的部分。",
      en: "A seed packet often costs less than a single started plant, yet holds a dozen lives: the price gap between seed and seedling is gardening's best exchange rate. And the waiting is the good part — from first sprout to first true leaf is precisely what makes gardening addictive.",
    },
    options: {
      zh: ["香草/叶菜从种子开始", "和邻居拼一包种子分播", "买苗只留给难发芽的木本"],
      en: ["Start herbs and greens from seed", "Split one seed packet with neighbors", "Save bought starts for slow-germinating woody plants"],
    },
    reuseChannel: {
      zh: "先从最好发芽的下手: 生菜、罗勒、小葱, 撒下去一周就破土, 新手也有正反馈; 种子开封后密封冷藏能放很久, 拼一包分着播最划算。发不动的再考虑买苗, 那时你也知道自己卡在哪一步了。",
      en: "Begin with the eager sprouters: lettuce, basil, scallions break ground within a week, instant feedback for a beginner; sealed and refrigerated, an opened packet keeps for years, so splitting one with neighbors is the best deal. Buy starts only for what refuses to sprout — by then you'll know exactly which step beat you.",
    },
    alternative: {
      zh: "下单成苗前先看价差: 一棵苗的价钱够好几包种子, 而一包能播出一整排——哪怕只成活一部分, 摊下来每棵的成本也低得多。多付的买的不是苗, 是跳过等待; 而等待恰是这份爱好免费的部分。",
      en: "Before ordering starts, run the comparison: one seedling funds several seed packets, and one packet sows a whole row — even with losses, the per-plant cost lands far lower. The premium isn't buying a plant, it's buying out of the wait; and the wait is the part this hobby gives away free.",
    },
    reuse: {
      zh: "自己育苗会攒下「播种的手感」: 什么时候该浇、什么时候该晒, 一季下来自然懂——这份手感, 是买成苗永远带不来的。",
      en: "Starting from seed accrues the feel of it: when to water, when to sun — a season in and you just know. That instinct is something no purchased seedling ever ships with.",
    },
    savingsHint: {
      zh: "消费前先看看家里已有的同类物品，也许能满足当下的使用需求。",
      en: "Before buying, check if you already have something similar at home that fits the need.",
    },
  },
  {
    id: "plant_swap_community",
    triggers: {
      zh: ["换苗", "赠苗", "扦插", "买花"],
      en: ["plant swap", "swap cuttings", "plant cuttings", "buy houseplants", "buy plants"],
    },
    why: {
      zh: "绿植圈最硬的通货不是钱, 是扦插: 一盆长疯了的绿萝能剪出好几份, 多肉掉落的叶子自己就生根——你想买的那些, 很可能正有人在群里求送出。养得太好, 本身就是富余。",
      en: "The hardest currency among plant people isn't money, it's cuttings: one overgrown pothos yields several starts, a dropped succulent leaf roots on its own — what you're about to buy, someone in the group is likely begging to give away. Growing things too well is itself a surplus.",
    },
    options: {
      zh: ["本地换苗群/换苗日看看", "用自家扦插换想要的品种", "接手退坑花友的整批转让"],
      en: ["Check local plant-swap groups and meetups", "Trade your own cuttings for what you want", "Take over a exiting hobbyist's whole batch"],
    },
    reuseChannel: {
      zh: "城市里的换苗活动、园艺群和办公室绿植角, 都是免费绿植的集散地: 剪一段、换一盆、认领一株, 品种还常比花市的新奇。你多余的剪枝别扔——插水里发根, 下次活动就是你的入场券。",
      en: "City plant swaps, gardening groups and office plant corners are the free-greenery exchange: snip a bit, trade a pot, adopt a plant, often with varieties newer than the garden center's. Don't bin your extra cuttings — root them in water and they're your ticket to the next swap.",
    },
    alternative: {
      zh: "下单绿植前先逛一次换苗群: 想要的品种多半有人多到求送, 一段扦插的成本近乎为零——省下的不是小钱, 是发现「我的下一盆可以不用买」这条循环的入口。",
      en: "Browse a swap group before checkout: someone usually has your wish-list species in surplus, practically begging it off their hands, and a cutting costs next to nothing — what you save isn't spare change, it's the discovery that your next plant didn't need to be bought at all.",
    },
    reuse: {
      zh: "「这盆是跟楼下阿姨换的」比「这盆是买的」好听多了: 换来的每盆绿植都连着一段邻里故事, 阳台因此不只是阳台, 是个小型社交场。",
      en: "This one came from a trade with the lady downstairs beats I bought it: every swapped plant carries a neighbor's story, and a balcony becomes more than a balcony — a small social scene.",
    },
    savingsHint: {
      zh: "消费前先看看家里已有的同类物品，也许能满足当下的使用需求。",
      en: "Before buying, check if you already have something similar at home that fits the need.",
    },
  },
  {
    id: "compost_over_chemical",
    triggers: {
      zh: ["化肥", "营养土", "肥料", "堆肥"],
      en: ["chemical fertilizer", "buy fertilizer", "plant fertilizer", "compost bin", "start composting"],
    },
    why: {
      zh: "厨余和落叶在自然界本来就是土壤的口粮: 果皮菜叶沤上一季, 就是植物最认的肥。化肥见效快, 但长期单用会让土越养越瘦——肥料的问题, 答案在你家的垃圾桶里。",
      en: "Kitchen scraps and fallen leaves are soil's natural diet: fruit peels and veggie trimmings, rested a season, become the feed plants recognize best. Chemical fertilizer acts fast, but soil fed on it alone grows thinner over the years — the answer to the fertilizer question sits in your own trash bin.",
    },
    options: {
      zh: ["阳台堆肥桶沤厨余", "落叶杂草腐熟当覆盖", "买肥只做追肥补充"],
      en: ["Ferment kitchen scraps in a balcony compost bin", "Rot leaves and clippings into mulch", "Keep bought feed only as a top-up"],
    },
    reuseChannel: {
      zh: "从最简单的开始: 一个带盖堆肥桶, 果皮菜叶剪碎拌点土, 腐熟后混进盆土就是好肥; 落叶直接覆盖盆面, 保水又缓释。垃圾减量、土变肥, 一件事的两面——园艺群里搜「堆肥」, 各家有各家的土办法。",
      en: "Start simple: a lidded compost bin, chopped peels and trimmings folded into some soil, and once rotted it blends straight into potting mix; fallen leaves laid on the surface mulch and feed at once. Less waste, richer soil — two faces of one act. Search compost in any gardening group and every household has its own folk method.",
    },
    alternative: {
      zh: "买化肥前先算一笔顺手的账: 你每周丢掉的果皮菜叶, 沤出来就是免费的肥, 还顺手给垃圾减了量——买的肥当补充, 自家堆肥当家, 一个生长季下来土会告诉你差别。",
      en: "Before buying fertilizer, run the convenient math: the peels you discard each week rot into free feed while trimming your waste bin — keep bought feed as the supplement and home compost as the staple, and within a growing season the soil itself will tell you the difference.",
    },
    reuse: {
      zh: "会堆肥的阳台自带循环感: 厨余进去、腐殖质出来、绿植吃掉——这套小闭环, 是把「绿色生活」四个字过成日常的最短路径。",
      en: "A composting balcony runs its own little cycle: scraps in, humus out, plants fed — this small closed loop is the shortest path to living the words green life daily.",
    },
    savingsHint: {
      zh: "消费前先看看家里已有的同类物品，也许能满足当下的使用需求。",
      en: "Before buying, check if you already have something similar at home that fits the need.",
    },
  },
  {
    id: "water_wise_watering",
    triggers: {
      zh: ["浇花", "浇水", "自动浇花", "雨水收集"],
      en: ["watering schedule", "rain barrel", "drip irrigation", "water my plants", "watering the garden"],
    },
    why: {
      zh: "浇水的钱不在水上, 在「浇错的水」上: 正午一浇大半蒸发, 天天一浇根就变懒。把浇水挪到清晨、让雨水接个班, 植物喝得更多, 你却用得更少——这是园艺里少有的「少即是多」。",
      en: "The cost of watering isn't the water — it's the wasted watering: a midday soak mostly evaporates, and a daily sprinkle teaches roots to stay lazy. Move watering to early morning and put rainwater on shift, and the plants drink better while you use less — gardening's rare case of less being more.",
    },
    options: {
      zh: ["清晨浇水替代正午", "阳台放桶收集雨水", "盆面铺覆盖物保水"],
      en: ["Water at dawn instead of midday", "Keep a balcony barrel for rain", "Mulch pot surfaces to hold moisture"],
    },
    reuseChannel: {
      zh: "两个零成本的习惯先试起来: 浇水改到清晨或傍晚, 蒸发少、吸收多; 阳台角落放个桶接雨水, 淘米水晾一晚也行——都不是钱的事, 是顺手的事。铺一层树皮或干叶在盆面, 浇水间隔还能再拉长。",
      en: "Try two zero-cost habits first: shift watering to dawn or dusk, when less evaporates and more soaks in; park a barrel on the balcony for rain, or let rice-rinse water sit overnight — matters of habit, not money. A layer of bark or dry leaves on the surface stretches the interval between waterings even further.",
    },
    alternative: {
      zh: "想上自动浇灌设备之前, 先把免费的习惯用满: 清晨浇水加雨水收集, 大部分阳台场景就够了——设备省的是时间, 习惯省的是水和钱, 后者不用下单。",
      en: "Before buying automatic irrigation, max out the free habits first: dawn watering plus rain collection covers most balcony setups — the device saves you time, the habit saves water and money, and only one of those requires checkout.",
    },
    reuse: {
      zh: "「看天浇水」的老手感会沉淀成你的园艺直觉: 叶子稍蔫是渴, 土面发白是该浇——读懂这些, 比任何定时器都准。",
      en: "Water-by-reading weather ripens into gardener's instinct: a slightly droopy leaf means thirsty, a pale dry surface means now — reading those beats any timer ever sold.",
    },
    savingsHint: {
      zh: "消费前先看看家里已有的同类物品，也许能满足当下的使用需求。",
      en: "Before buying, check if you already have something similar at home that fits the need.",
    },
  },
  {
    id: "garden_plant_starter",
    triggers: {
      zh: ["买盆栽", "买多肉", "植物采购"],
      en: ["buy a plant", "buy a potted plant", "buy flowers", "garden plant", "flowers"],
    },
    why: {
      zh: "新植物最诱人的时刻永远是花市和苗圃货架, 但家里的光照和位置未必跟得上热情。先用一段枝条、一包种子或一株小苗试住几天, 兴趣确认了再添置。",
      en: "New plants are most tempting on the nursery shelf, though home light and space may not match the enthusiasm. Let a cutting, seed packet or small start audition for a few days before adding more.",
    },
    options: {
      zh: ["先向花友要一段扦插", "从一包种子开始", "确认家里光照再选品种"],
      en: ["Ask a plant friend for a cutting", "Start with one seed packet", "Match the species to your light first"],
    },
    reuseChannel: {
      zh: "本地换苗群和园艺角常有「多到求送」的品种, 一段枝条泡水就生根。真的想从小带大, 种子和叶插是成本最低的入口, 也最容易判断你是不是真的喜欢这件事。",
      en: "Local swap groups and office plant corners often hold surplus varieties begging for homes, and one cutting roots in water. If you want to raise a plant from the start, seeds and leaf cuttings are the cheapest audition for the hobby itself.",
    },
    alternative: {
      zh: "下单之前先看一眼家里的空位和光照: 新手从好活品种的小盆开始, 活稳了再扩展。想省预算, 一段扦插就能开启下一盆, 不必一次买满一面植物墙。",
      en: "Check your open spots and light before checkout: begin with one easy small pot, then expand after it settles in. A single cutting can open the next pot without budgeting for a full green wall.",
    },
    reuse: {
      zh: "从一段枝条养到成株, 你会自然摸清它的脾气——浇水、光照、换盆都不再靠猜。这种和植物一起攒出来的手感, 比一次买回一排成品更扎实。",
      en: "Growing one cutting into a full plant teaches its moods naturally — watering, light and repotting stop being guesses. That accrued feel is sturdier than bringing home a whole row of finished plants.",
    },
    savingsHint: {
      zh: "消费前先看看家里已有的同类物品，也许能满足当下的使用需求。",
      en: "Before buying, check if you already have something similar at home that fits the need.",
    },
  },
  {
    id: "garden_outdoor_furniture",
    triggers: {
      zh: ["户外桌椅", "露台家具", "庭院家具", "户外沙发", "阳台家具", "露台桌椅"],
      en: ["outdoor furniture", "patio furniture", "garden furniture", "deck furniture", "balcony furniture"],
    },
    why: {
      zh: "户外家具最难的是季节和天气: 雨季要收, 冬天要藏, 真正坐在外面的日子往往比想象短。先用现有椅子试一个季节, 再决定要不要专门置办一套。",
      en: "Outdoor furniture is ruled by season and weather: rain means storing, winter means hiding, and actual time outside is often shorter than imagined. Trial one season with chairs you own before commissioning a dedicated set.",
    },
    options: {
      zh: ["现有椅凳先试一个季节", "二手平台收急转套装", "只补最常用的一两件"],
      en: ["Trial one season with current seating", "Pick up an urgent resale set", "Add only the one or two pieces you'll use"],
    },
    reuseChannel: {
      zh: "搬家季和入冬前的二手平台常有整套户外家具急转, 价格友好且已被天气验证过。先测使用频率, 频率高再买耐用品, 频率低就借或租。",
      en: "Moving season and early winter fill resale platforms with urgent outdoor sets, kindly priced and already weather-tested. Measure your usage first, buy durable pieces for frequent evenings, borrow or rent for occasional ones.",
    },
    alternative: {
      zh: "先从「今晚真的会坐出去吗」判断需求: 一把耐用的椅子加一张可折叠小桌, 常常比整套沙发更被用上。等户外习惯稳定了, 再按空位补齐。",
      en: "Start from whether you'll truly sit out tonight: one durable chair plus a folding table often sees more use than a full sofa set. Once the outdoor habit settles, fill the remaining gaps.",
    },
    reuse: {
      zh: "一套轻量、可收纳的户外配置更适配真实生活: 天气好时几步搬出去, 雨季收进角落。用得上的舒适, 比常年占地的气派更长久。",
      en: "A light, storable outdoor setup fits real life better: a few steps outside in good weather, tucked into a corner through the rainy season. Comfort you actually use outlasts an imposing set that owns the yard year-round.",
    },
    savingsHint: {
      zh: "消费前先看看家里已有的同类物品，也许能满足当下的使用需求。",
      en: "Before buying, check if you already have something similar at home that fits the need.",
    },
  },
  {
    id: "garden_tool_set",
    triggers: {
      zh: ["草坪修剪机", "割草机", "花园工具", "修枝剪刀"],
      en: ["garden tool set", "lawn mower", "garden shears", "outdoor tool kit"],
    },
    why: {
      zh: "套装看起来一步到位, 实际高频常用的只有两三件。先列出真会做的活, 再决定是借、租还是只买单件——工具的账要按使用次数算。",
      en: "A boxed set looks complete, yet only two or three pieces work weekly. List the jobs you'll actually do before deciding among borrowing, renting or buying one single tool — the math runs on uses.",
    },
    options: {
      zh: ["列清单后只买高频单件", "大件设备按次租借", "邻居/社区工具共享"],
      en: ["Buy only frequent single tools after listing jobs", "Rent big equipment per use", "Share neighbor or community tools"],
    },
    reuseChannel: {
      zh: "割草机和修剪机这类大件, 一年使用次数常常一只手数得完, 租赁和邻里共享更划算。小工具先借一轮, 用出偏好后再买那一两件顺手的。",
      en: "Mowers and trimmers often run a handful of times a year, so rental and neighbor sharing carry the math. Borrow small tools first, then buy the one or two that fit your hand after real use.",
    },
    alternative: {
      zh: "下单前把「可能会做」变成「确定会做」: 清单上每个月至少一次的活, 配单件工具; 一年一两次的, 交给租赁。套装省的是选择, 不是钱。",
      en: "Turn might-do into will-do before checkout: jobs at least monthly earn a single tool, once-or-twice-yearly jobs belong to rental. A set spares choosing, not spending.",
    },
    reuse: {
      zh: "一两件用顺手的专业工具, 比整套半新不旧更让人愿意干活。工具少而精, 收纳和保养也更简单。",
      en: "One or two well-fitted tools make the work more inviting than a half-used set. Fewer, better tools also stay easier to store and maintain.",
    },
    savingsHint: {
      zh: "消费前先看看家里已有的同类物品，也许能满足当下的使用需求。",
      en: "Before buying, check if you already have something similar at home that fits the need.",
    },
  },
  {
    id: "garden_pot_collection",
    triggers: {
      zh: ["花器", "多肉盆不够", "买整套花器"],
      en: ["ceramic planter", "succulent pot", "plant pot set", "buy planters", "outdoor planters"],
    },
    why: {
      zh: "花盆最容易越买越多: 换盆季一批, 风格心动一批, 搬家时又整批淘汰。先数清在用和闲置的数量, 再决定缺的是盆还是想要。",
      en: "Pots multiply quietly: a batch at repotting season, another for a style crush, then a whole batch lost in a move. Count those in use and idle first, then decide whether the gap is need or want.",
    },
    options: {
      zh: ["先清点闲置花盆", "旧桶罐钻孔改造", "二手收搬家急转"],
      en: ["Inventory idle pots first", "Drill drainage into old buckets and tins", "Take moving-sale pots secondhand"],
    },
    reuseChannel: {
      zh: "园艺群和二手平台常年有人整批转让花盆, 多数只是旧土需要清洗。奶粉罐、木箱和饮料瓶钻孔后也能当育苗盆, 先把现有容器用起来。",
      en: "Garden groups and resale platforms carry whole batches year-round, usually needing only a wash after old soil. Drilled tins, crates and bottles also start seedlings while existing containers wait.",
    },
    alternative: {
      zh: "买新盆前先按「实际要换几盆」列数: 数量对上再买, 风格不同意的旧盆可用套盆解决。给植物一个能排水的家比颜值更早发生作用。",
      en: "Before new pots, list how many plants truly need repotting: buy against that count, and solve style disagreements with a cachepot. Drainage serves the plant before appearance does.",
    },
    reuse: {
      zh: "统一材质和色系的旧盆会比杂乱新盆更耐看。让每一批容器都物尽其用, 阳台也自然少一些堆放压力。",
      en: "Old pots unified by material and color outlast mixed new ones visually. Let every batch of containers finish its work and the balcony keeps less stacking pressure.",
    },
    savingsHint: {
      zh: "消费前先看看家里已有的同类物品，也许能满足当下的使用需求。",
      en: "Before buying, check if you already have something similar at home that fits the need.",
    },
  },
];
