/**
 * green-alt-entries-beauty — 高环境影响词条: 美妆个护 (zh+en 双语)
 *
 * 词条结构见 green-alt-types.ts。顺序接 green-alt-entries-wear/home 之后
 * (穿戴/工艺在前, 家居/日用居中, 美妆个护在后)。
 *
 * 文案红线 (评审同款): 不说教 (无 "你应该/这样才环保"), 无碳足迹数值,
 * 每条含 "面子话术 + 里子省钱点" 两要素 (定性省钱描述, 不编造数字)。
 *
 * 绿色偏好开关 (symy_green_pref === 'off') 由调用方判断, 词条层不特判。
 */

import type { GreenAlternativeEntry } from './green-alt-types';

export const GREEN_ALT_ENTRIES_BEAUTY: readonly GreenAlternativeEntry[] = [
  {
    id: "beauty_refill",
    triggers: {
      zh: ["替换装", "补充装", "粉底 refill", "refill", "补充包"],
      en: ["refill", "refills", "refill pouch", "refill pack"],
    },
    why: {
      zh: "美妆个护的正装瓶身多为塑料或玻璃，空瓶后整瓶丢弃，包装负担就一轮一轮地叠上去。",
      en: "Beauty packaging — mostly plastic or glass — gets tossed whole each time a jar runs out, stacking up round after round.",
    },
    options: {
      zh: ["原品牌替换装/补充装", "支持 refill 的品牌正装瓶", "门店空瓶回收换购"],
      en: ["Brand refill pouches", "Keep-one-jar brands with refill lines", "Store take-back with a swap deal"],
    },
    reuseChannel: {
      zh: "部分品牌专柜和门店有空瓶回收换购活动，闲鱼上也常有全新的补充装低价转让。",
      en: "Some brand counters run empty-jar swap deals, and secondhand apps often list unopened refill pouches cheap.",
    },
    alternative: {
      zh: "同款产品的替换装或补充装内容物一样好用，还少一个空瓶；补充装单价通常也更低。",
      en: "The refill pouch holds the very same product — one less empty jar, and refills usually cost less per use.",
    },
    reuse: {
      zh: "你手头的正装瓶如果还完好，买补充装灌回去就行，不必整瓶换新。",
      en: "If your original jar is still fine, just top it up from a refill — no need to buy the whole bottle new.",
    },
    savingsHint: {
      zh: "消费前先看看家里已有的同类物品，也许能满足当下的使用需求。",
      en: "Before buying, check if you already have something similar at home that fits the need.",
    },
  },
  {
    id: "solid_cleanser",
    triggers: {
      zh: ["洗发皂", "沐浴皂", "洗发饼"],
      en: ["shampoo bar", "conditioner bar", "solid shampoo", "solid conditioner", "soap bar"],
    },
    why: {
      zh: "液体洗护产品大部分是水，配上塑料瓶一路运输，固体版本省掉了这两层负担。",
      en: "Liquid hair and body care is mostly water shipped in plastic — the solid version skips both layers.",
    },
    options: {
      zh: ["固体洗发皂/洗发饼", "固体沐浴皂", "可补充装的皂粉/浓缩洗护"],
      en: ["Shampoo bars", "Body soap bars", "Refillable soap flakes or concentrates"],
    },
    reuseChannel: {
      zh: "手工皂在市集和二手平台常有闲置转让，多块合买更省。",
      en: "Handmade bars are common secondhand finds at markets and swap apps — bundling a few saves more.",
    },
    alternative: {
      zh: "固体洗发皂、沐浴皂洗感和液体版一样，通常更耐用也更便宜，还没有空瓶。",
      en: "Shampoo and soap bars lather just like the liquid ones — they usually last longer, cost less, and leave no empty bottle.",
    },
    reuse: {
      zh: "你手头可能已囤着没用完的洗发水沐浴露，先用完再换固体版也不迟。",
      en: "You may already have shampoo or body wash stashed at home — finish that first before switching to bars.",
    },
    savingsHint: {
      zh: "消费前先看看家里已有的同类物品，也许能满足当下的使用需求。",
      en: "Before buying, check if you already have something similar at home that fits the need.",
    },
  },
  {
    id: "skincare_hoard",
    triggers: {
      zh: ["囤精华", "囤面霜", "精华囤货", "囤护肤品"],
      en: ["stock up on serum", "stocking up on skincare", "skincare haul", "serum haul"],
    },
    why: {
      zh: "护肤品囤多了容易放过期，开封后的活性成分也会随时间衰减，最后多是整瓶丢掉。",
      en: "Overstocked skincare tends to expire — actives fade once opened — and much of it ends up tossed unopened.",
    },
    options: {
      zh: ["按季度小容量补货", "先列手头库存清单再买", "大瓶装分装使用"],
      en: ["Buy small, restock quarterly", "Inventory your shelf before buying", "Decant a large bottle for daily use"],
    },
    reuseChannel: {
      zh: "闲鱼上常有全新未拆的护肤品低价转卖，先淘再看新品也不迟。",
      en: "Secondhand apps often list sealed, unopened skincare below retail — worth a look before buying new.",
    },
    alternative: {
      zh: "小容量按需补货，单价虽然略高，但用完再买的总花销往往比囤货更低。",
      en: "Buying smaller sizes as needed costs a bit more per bottle, but the total spend usually beats overstocking.",
    },
    reuse: {
      zh: "你手头可能已有一瓶未开封的精华或面霜，先翻翻抽屉，也许根本不用买。",
      en: "You may already have an unopened serum or cream in a drawer — dig around first; you might not need to buy at all.",
    },
    savingsHint: {
      zh: "消费前先看看家里已有的同类物品，也许能满足当下的使用需求。",
      en: "Before buying, check if you already have something similar at home that fits the need.",
    },
  },
  {
    id: "lipstick_makeup",
    triggers: {
      zh: ["口红", "唇膏", "彩妆", "眼影盘"],
      en: ["lipstick", "makeup", "eyeshadow palette", "makeup palette"],
    },
    why: {
      zh: "彩妆单支用量其实很慢，抽屉里吃灰的旧色和只试过一次的盘不在少数。",
      en: "A single lipstick takes ages to finish — most drawers hold dust-collecting shades and once-swiped palettes.",
    },
    options: {
      zh: ["多色一盘的彩妆盘", "可替芯口红", "先试小样再入正装"],
      en: ["Multi-shade palettes", "Refillable lipsticks", "Try minis before full sizes"],
    },
    reuseChannel: {
      zh: "闲鱼上几乎全新的大盘彩妆转让很多，价格常是原价的一半以下。",
      en: "Barely-used palettes are plentiful secondhand — often well under half retail.",
    },
    alternative: {
      zh: "一盘多色或可替芯口红能替代好几支单色，单色摊下来的成本更低。",
      en: "One palette or a refillable lipstick replaces several singles — the cost per shade works out lower.",
    },
    reuse: {
      zh: "你手头的旧色号混涂或叠涂就是新色，彩妆抽屉里可能已经藏着下一支。",
      en: "Layer or mix the shades you already own — your makeup drawer may already hold the next one.",
    },
    savingsHint: {
      zh: "消费前先看看家里已有的同类物品，也许能满足当下的使用需求。",
      en: "Before buying, check if you already have something similar at home that fits the need.",
    },
  },
  {
    id: "sheet_mask_pile",
    triggers: {
      zh: ["面膜囤货", "囤面膜", "面膜", "片装面膜"],
      en: ["sheet mask", "sheet masks", "face mask stash", "mask haul"],
    },
    why: {
      zh: "片装面膜多为一次性铝塑包装，难回收，囤多了还容易过保质期。",
      en: "Sheet masks come in foil-plastic singles that are hard to recycle — and stashes tend to expire before use.",
    },
    options: {
      zh: ["罐装涂抹面膜", "可洗的布膜配自有精华", "按月小包补货"],
      en: ["Jarred wash-off masks", "Reusable pads with your own serum", "Small monthly restocks"],
    },
    reuseChannel: {
      zh: "闲鱼上常有整盒未拆的面膜低价转让，先清自己的存货再考虑。",
      en: "Sealed boxes of masks show up cheap secondhand — after you clear your own stash.",
    },
    alternative: {
      zh: "罐装涂抹面膜按次用量更省，一片一片的包装垃圾也少，通常更划算。",
      en: "A jarred mask doles out just what you need — less single-use packaging, and usually cheaper per use.",
    },
    reuse: {
      zh: "你手头可能已经囤了几盒面膜，先清点一下存货，大概率够用很久。",
      en: "You may already have a few boxes stashed — count them first; they'll likely last a while.",
    },
    savingsHint: {
      zh: "消费前先看看家里已有的同类物品，也许能满足当下的使用需求。",
      en: "Before buying, check if you already have something similar at home that fits the need.",
    },
  },
];
