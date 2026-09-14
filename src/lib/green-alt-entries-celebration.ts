/**
 * green-alt-entries-celebration — 庆典与礼赠消费词条 (zh+en 双语)
 *
 * 词条结构见 green-alt-types.ts。顺序追加在 repair-care 之后 (数组末位)。
 * 本域接住的是「仪式必须体面」型消费: 婚礼布置、回礼喜糖、生日会道具、
 * 节庆装饰、乔迁宴请、办公室交换礼、长辈寿庆、做客伴手。特点是社交
 * 压力最大、最不适合泛泛劝退——恰恰适合先问关系与用途, 再给心意不变、
 * 支出更克制的方案: 租与借、复用与流转、体验与陪伴、手作与本地。
 *
 * 与既有域的让位 (聚合先命中先赢, 本域排末位): 裸 礼物/礼物类词归 gifting,
 * 伴手礼/纪念品归 travel, 家居装饰/买装饰归 household, 搬家租家具/租工具归
 * furniture——本域 trigger 全部是带采购意图的具体复合词, 纯聊婚礼/生日/节日
 * (无布置/用品/宴请语境) 不触发。
 *
 * 文案红线 (与既有域同款): 不说教, 无碳足迹数值, 全字段零数字, 荣誉框架,
 * 绝不暗示「送不起」——心意体面、浪费减少, 体验与手作是更高级的仪式感。
 *
 * 绿色偏好开关 (symy_green_pref === 'off') 由调用方判断, 词条层不特判。
 */

import type { GreenAlternativeEntry } from './green-alt-types';

export const GREEN_ALT_ENTRIES_CELEBRATION: readonly GreenAlternativeEntry[] = [
  {
    id: "wedding_decor_rental",
    triggers: {
      zh: ["婚礼布置", "婚庆用品", "婚礼装饰", "婚宴布置"],
      en: ["wedding decorations", "wedding decor", "wedding supplies"],
    },
    why: {
      zh: "婚礼装饰大多为一场仪式定制: 花艺拱门、背景板、桌花, 散场即闲置。租赁让同一批物件流转于多场喜事, 体面不减, 堆积不成。",
      en: "Wedding decor is built for a single afternoon: arches, backdrops, centerpieces — all idle by nightfall. Renting lets one set of pieces flow through many celebrations, and the ceremony loses nothing.",
    },
    options: {
      zh: ["拱门与背景板按场租用", "桌花选盆栽, 会后送亲友带走", "请柬电子化, 席卡手写"],
      en: ["Rent the arch and backdrop per event", "Potted centerpieces that guests take home", "E-vites plus handwritten place cards"],
    },
    reuseChannel: {
      zh: "婚庆公司多有布置租赁档期表, 本地花艺工作室可谈只租不订; 上一场用过的拱门和灯串, 在闲鱼和本地婚品转让群里常能以很友好的价接手。",
      en: "Wedding stylists keep rental calendars, and local florists often rent without a booking minimum; arches and light strands from a recent wedding circulate on secondhand marketplaces and local resale groups at a gentle price.",
    },
    alternative: {
      zh: "布置先问租再想买: 拱门、灯串、桌花按场租用, 会后原样归还——省下整套采购的大头, 也免了散场后无处安放的大件, 场面一样体面周到。",
      en: "Ask about rentals before buying decor: arch, light strands and centerpieces rented by the event and returned as-is — the bulk spend and the post-party storage problem both disappear, and the day looks just as considered.",
    },
    reuse: {
      zh: "家里过节攒的灯串、朋友婚礼剩下的桌牌架, 都能进你的仪式库存; 这场办完, 把可再用的物件转让或送出, 让它们赶赴下一场喜事。",
      en: "Light strands saved from holidays and stands left from a friend's wedding join your ceremony stash; when yours wraps, pass them on so they reach the next celebration.",
    },
    savingsHint: {
      zh: "大件布置先查租赁档期再考虑采购，散场后不添闲置。",
      en: "Check rental availability for big decor before buying, so nothing idles after the day.",
    },
  },
  {
    id: "wedding_return_gift",
    triggers: {
      zh: ["婚礼回礼", "喜糖", "喜饼", "回礼小物"],
      en: ["wedding favors", "return gifts for guests", "party favor bags"],
    },
    why: {
      zh: "回礼是按席数乘出来的开销: 盒装喜糖喜饼大多当晚就被拆完或转手, 留下的只有空盒。把心意放进能被吃完、用完的小物里, 甜度不减, 剩余归零。",
      en: "Return gifts multiply seat by seat: boxed chocolates and pastries are unwrapped or re-gifted the same night, leaving only the empty box. Put the sentiment into something consumed to the last bite — same sweetness, nothing left over.",
    },
    options: {
      zh: ["散装喜糖配可循环小罐", "本地茶点或蜂蜜小瓶装", "以新人名义的捐赠答谢卡"],
      en: ["Bulk candy in returnable tins", "Local tea bites or mini honey jars", "A thank-you card carrying a donation in the couple's name"],
    },
    reuseChannel: {
      zh: "本地食品市集和烘焙坊能散装称重、自带罐子现装; 捐赠答谢卡走正规公益平台的礼赠通道, 证书当场可取, 比礼盒更有讲头。",
      en: "Bulk bins at local food markets and bakeries let you fill your own tins by weight; charity platforms offer gifting channels with a certificate ready on the spot — a story no boxed favor tells.",
    },
    alternative: {
      zh: "回礼选能被吃掉或被记住的: 散装糖果配可循环小罐, 或以新人名义送出一份捐赠心意——宾客带走的不再是拆完即弃的礼盒, 而是一份有名字的甜。",
      en: "Choose favors that get eaten or remembered: bulk sweets in returnable tins, or a donation made in the couple's name — guests carry home a named sweetness, not a box destined for the bin.",
    },
    reuse: {
      zh: "订婚剩下的糖果罐、多订的茶叶收进「回礼库存」; 下一场喜事或年节, 它们就是现成的心意。",
      en: "Tins left from the engagement and extra tea from the ceremony stock your favor shelf; the next celebration or festival finds its gifts ready-made.",
    },
    savingsHint: {
      zh: "回礼备能被吃完用完的小物，心意到了，包装不留。",
      en: "Pick favors that finish edible or useful — the thought stays, the packaging doesn't.",
    },
  },
  {
    id: "birthday_party_experience",
    triggers: {
      zh: ["生日派对", "办生日会", "生日会准备"],
      en: ["birthday party", "birthday party supplies", "birthday party planning"],
    },
    why: {
      zh: "生日会的开销大头常是纸拉旗、气球和主题餐具: 拍照一晚上, 留存好多年。场面感来自流程与陪伴, 不来自一堆只能用一次的道具。",
      en: "The big line item of a birthday party is often paper banners, balloons and themed tableware: photographed for one evening, kept for years. The atmosphere comes from the plan and the people, not single-use props.",
    },
    options: {
      zh: ["主题靠灯光与布置创意, 不靠一次性道具", "餐具用家里的, 或成套租", "礼物堆改成一起做一件事"],
      en: ["Theme via lighting and clever setup, not disposables", "Use home tableware or rent a matching set", "Swap the gift pile for one shared activity"],
    },
    reuseChannel: {
      zh: "派对道具租赁店按套出租拉旗、灯串和蛋糕台; 社区群里常有家庭转手成套生日道具, 闲鱼按「生日道具」能搜到, 一套道具可以流转很多个生日。",
      en: "Party rental shops rent banners, lights and cake stands by the set; parent groups and secondhand marketplaces pass full birthday kits along, one set serving many birthdays.",
    },
    alternative: {
      zh: "生日会先把体验排在道具前面: 一场手工课、一次近郊野餐、一顿亲手做的晚餐, 记忆浓度远高于一屋子拉旗——道具能租则租, 会后归还, 场面照样热闹。",
      en: "Put the experience ahead of the props: a craft workshop, a picnic afternoon, a home-cooked dinner — far more memory per hour than a room of banners. Rent the props you need and return them after; the party stays lively all the same.",
    },
    reuse: {
      zh: "去年生日会的灯串和字母灯收进箱子, 今年换个配色就焕然一新; 蛋糕台的木托盘, 平日也是很好的水果盘。",
      en: "Last year's light strand and letter lights restyle with a new palette; the cake stand's wooden tray doubles as a fruit platter on ordinary days.",
    },
    savingsHint: {
      zh: "生日会先定体验清单，道具按租借补齐，热闹不打折。",
      en: "Plan the experiences first, rent the props to match — the fun loses nothing.",
    },
  },
  {
    id: "festival_decor_reuse",
    triggers: {
      zh: ["节日装饰", "圣诞装饰", "新年装饰", "春节装饰"],
      en: ["holiday decorations", "christmas decorations", "new year decorations"],
    },
    why: {
      zh: "节庆装饰是「每年都想换新」的消费: 去年的拉花和灯串其实完好, 换个挂法就是新氛围。节日感来自仪式动作, 而不是每年一箱新的塑料。",
      en: "Festival decor runs on the urge to refresh: last year's garlands and light strands are intact, and a new arrangement reads as new. The festivity lives in the ritual, not in another box of plastic each year.",
    },
    options: {
      zh: ["灯串拉花收好来年复用", "和朋友交换装饰换新鲜感", "大件门饰走租赁或社区共享"],
      en: ["Store garlands and lights for next year", "Swap decorations with friends for novelty", "Rent or share the big door pieces"],
    },
    reuseChannel: {
      zh: "收纳时按节日分袋并拍照记账, 来年一目了然; 节后社区置换群和闲鱼常有九成新装饰转手, 节前租社区共享装饰箱也省心。",
      en: "Store by holiday in labeled bags with a photo inventory for next year; after each festival near-new decorations circulate on resale groups, and community shared-decor boxes rent out before the season.",
    },
    alternative: {
      zh: "节庆装饰走复用为主、换新为辅: 灯串年年亮, 拉花换挂法, 只补一两件真正的心头好——节日气氛不减, 节后也不用再腾柜子。",
      en: "Make festival decor reuse-first, refresh-second: the same lights year after year, garlands re-hung a new way, plus one or two true favorites — the season feels full and no cabinet fills up after it.",
    },
    reuse: {
      zh: "过节第一件事是开装饰箱而不是购物车: 先盘点有什么, 再决定补什么——很多年份, 你只缺一条新彩带。",
      en: "Let the season open with the decor box, not the shopping cart: inventory first, top-ups second — some years all you need is one new ribbon.",
    },
    savingsHint: {
      zh: "节前先开装饰箱盘点再补缺，年年有新鲜感。",
      en: "Open the decoration box before the season, then decide the top-ups — novelty every year without the haul.",
    },
  },
  {
    id: "housewarming_open_house",
    triggers: {
      zh: ["乔迁宴", "入伙宴", "温居宴", "乔迁请客"],
      en: ["housewarming party", "housewarming feast", "open house party"],
    },
    why: {
      zh: "乔迁宴最容易为撑场面临时采购: 一次性餐具、专用锅具、成打的饮料, 宴毕全成废品。新家的第一场热闹, 更配得上一个不添杂物的开始。",
      en: "Housewarming parties invite last-minute bulk buys: disposable tableware, single-purpose pots, drinks by the crate — all waste by midnight. A new home's first celebration deserves a start without the clutter.",
    },
    options: {
      zh: ["餐具锅具向邻居朋友借或按套租", "桌椅不够走社区共享或短租", "菜单按能吃完设计, 剩菜打包送客"],
      en: ["Borrow or rent tableware and pots", "Source extra chairs via community sharing or short rental", "Plan the menu to finish clean, pack leftovers for guests"],
    },
    reuseChannel: {
      zh: "邻里群和社区群借桌椅碗凳的成功率很高; 宴会餐具按套短租的店在大城市不难找; 闲鱼上婚礼后的成套餐具转手价友好, 用完还能再转出去。",
      en: "Neighborhood and community groups lend tables, chairs and dishes at a high hit rate; banquet tableware rents by the set in most cities; wedding-surplus dinner sets resell gently and pass on again after.",
    },
    alternative: {
      zh: "乔迁宴按借与租先向来备: 桌椅向邻里借, 餐具按套租, 剩菜装进客人的打包盒——第一场宴请散场后, 新家依然清爽, 人情反而更厚。",
      en: "Stock the housewarming by borrowing and renting first: chairs from neighbors, tableware by the set, leftovers packed into guests' boxes — when the party ends the new home stays uncluttered and the goodwill runs deeper.",
    },
    reuse: {
      zh: "宴后把这场借了谁家什么记下来, 下次对方办事你来还人情; 若发现自家常办宴, 再考虑添置一套属于自己的成套餐具。",
      en: "After the party, note what you borrowed from whom — the favor returns at their next event; if hosting turns out to be a habit, then consider a set of your own.",
    },
    savingsHint: {
      zh: "宴客器具先借先租，散场后新家不堆一次性杂物。",
      en: "Borrow and rent the hosting kit, so the new home stays free of single-use clutter.",
    },
  },
  {
    id: "office_gift_exchange",
    triggers: {
      zh: ["抽签交换", "同事交换", "办公室交换"],
      en: ["secret santa", "gift exchange", "office gift swap"],
    },
    why: {
      zh: "交换礼最怕硬凑: 为凑预算买的马克杯和相框, 下场多为抽屉吃灰。规则定得好, 每个人花得少、收得准, 惊喜与玩笑一点不少。",
      en: "Gift exchanges fail on filler: mugs and frames bought to hit a budget end up drawer-bound. A good rule set means everyone spends less, lands right, and keeps every bit of the fun.",
    },
    options: {
      zh: ["抽签后互填愿望单, 按单准备", "预算设低档, 手写卡片当主角", "主题定为消耗品: 好茶、咖啡、零食"],
      en: ["Draw names, then fill in wishlists to work from", "Set the budget low and let handwritten cards carry it", "Theme it consumable: good tea, coffee, snacks"],
    },
    reuseChannel: {
      zh: "交换规则用共享文档一次敲定: 愿望单链接、预算档位、消耗品白名单; 抽签用手机上的抽签小工具, 零成本也零纸张。",
      en: "Settle the rules once in a shared doc: wishlist links, budget tier, consumables whitelist; draw names with any free online drawer — no paper, no cost.",
    },
    alternative: {
      zh: "交换礼把规则聊在采购前面: 愿望单让猜变准, 消耗品主题让每份礼物都被用掉——花得更少, 收到的却件件称心, 这是办公室里体面的默契。",
      en: "Talk rules before anyone shops: wishlists turn guessing into hitting, and a consumables theme means every gift gets used — less spent, every present lands, the office keeps its classy little ritual.",
    },
    reuse: {
      zh: "收到的好茶转进办公室茶水角共享; 去年的礼品袋和丝带收好, 今年交换直接上岗。",
      en: "Fine teas you receive join the office tea corner; last year's gift bags and ribbons wait in the drawer and go straight back to work this year.",
    },
    savingsHint: {
      zh: "交换前先定愿望单与主题，让预算都花在称心上。",
      en: "Agree on wishlists and a theme before buying, so the budget lands on delight.",
    },
  },
  {
    id: "elder_celebration_together",
    triggers: {
      zh: ["过大寿", "做寿", "寿宴", "金婚"],
      en: ["grandpa birthday", "grandma birthday", "parents anniversary", "golden anniversary"],
    },
    why: {
      zh: "给长辈的庆祝最容易被「贵重」绑架: 高价补品与摆件, 常常吃不得也用不上。长辈真正稀罕的, 是被安排得妥帖的一天和被记得的细节。",
      en: "Celebrations for elders get held hostage by price tags: pricey tonics and ornaments they won't eat or use. What elders treasure is a well-arranged day and details remembered.",
    },
    options: {
      zh: ["陪长辈把心爱的老物件送去保养翻新", "全家合办家宴, 每人出一道菜", "老照片整理成册, 当天讲给全家听"],
      en: ["Take their beloved old pieces out for restoration care", "A family feast where everyone cooks one dish", "Turn old photos into an album and tell the stories"],
    },
    reuseChannel: {
      zh: "老物件翻新找老手艺人或品牌售后都放心, 修好的手表、缝补的旗袍在寿宴上亮相, 比任何新品都体面; 家宴用家里或社区活动室, 热闹不打折。",
      en: "Trusted restorers and brand service desks handle beloved old pieces; a serviced watch or mended garment at the banquet outclasses anything new; home or the community hall hosts the feast with no loss of warmth.",
    },
    alternative: {
      zh: "给长辈的礼走陪伴与修复优先: 送去保养的老手表、整理成册的老照片、一桌全家动手的家宴——寿星记得住的从来不是价格, 而是你们把ta放在心上。",
      en: "Lead with company and restoration for elders: the old watch serviced, the photo album bound, a feast the whole family cooked — what stays with them is never the price, it's being placed at the center of your care.",
    },
    reuse: {
      zh: "长辈留下的物件本身就是库房: 老桌椅修一修焕然一新, 老餐具逢年过节摆出来就是传承——最好的纪念是让它们继续被用。",
      en: "Elders' own things are the treasury: old furniture renewed with care, heirloom tableware set out each festival — the best tribute is continued use.",
    },
    savingsHint: {
      zh: "给长辈的庆祝先想陪伴与翻新，心意落在被记得的细节里。",
      en: "Build elders' celebrations on company and restoration, letting care live in remembered details.",
    },
  },
  {
    id: "favor_homemade_local",
    triggers: {
      zh: ["随手礼", "特产礼盒", "伴手小物"],
      en: ["hostess gift", "omiyage", "regional gift box"],
    },
    why: {
      zh: "做客与探望的手信常败给过度包装: 硬壳礼盒占了分量, 内容却单薄。一小罐亲手做的、一份本地现买的, 反而更像特意为你准备的。",
      en: "Host and visit gifts lose to overpackaging: rigid boxes weigh more than their contents. A small homemade jar or a fresh local buy reads far more like something chosen just for you.",
    },
    options: {
      zh: ["自家厨房的小批量点心或果酱", "本地市集散装现买, 自配素色包装", "手写卡片写清产地与故事"],
      en: ["Small-batch treats or jam from your kitchen", "Bulk buys from the local market in plain wrap", "A handwritten card on the origin and the story"],
    },
    reuseChannel: {
      zh: "本地市集和农户直供店能散装买土产, 自带罐子现装; 家里常备的素色纸盒和麻绳就是包装间; 玻璃罐洗净循环用, 越用越顺手。",
      en: "Local markets and farm shops sell bulk regional goods — bring jars and fill them on the spot; plain boxes and twine at home are the wrap; glass jars wash and cycle, handier each round.",
    },
    alternative: {
      zh: "伴手小物走手作与本地: 一罐自己熬的酱、市集现称的点心, 配手写卡片——分量不大, 心意浓度却最高, 也省去了层层礼盒的开销。",
      en: "Go handmade and local for small gifts: a jar of your own preserve, market-fresh sweets by weight, a handwritten card — light in weight, top in thought, without the layered-box markup.",
    },
    reuse: {
      zh: "收到的漂亮罐子洗净收进伴手柜, 下一次手作直接装; 出远门带回的散装小食分装成小份, 就是好几份现成的随手礼。",
      en: "Pretty jars received get washed into the favor cupboard, ready for the next batch; regional snacks from a trip portioned into small packs become several ready-made gifts.",
    },
    savingsHint: {
      zh: "手信选本地现买或亲手做，分量不大心意足。",
      en: "Buy local and fresh or make it yourself — small in size, rich in thought.",
    },
  },
];
