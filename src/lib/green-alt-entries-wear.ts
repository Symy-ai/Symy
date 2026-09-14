/**
 * green-alt-entries-wear — 高环境影响词条: 穿戴/工艺品 (zh+en 双语)
 *
 * 词条结构见 green-alt-types.ts。顺序即匹配优先级 (更具体的品类放前面):
 * 象牙 → 玳瑁 → 皮草 → 动物皮革。"真皮草" 必须先命中皮草而非真皮, 顺序勿动。
 *
 * 文案红线 (评审同款): 不说教 (无 "你不该买"), 无碳足迹数值, 荣誉框架。
 */

import type { GreenAlternativeEntry } from './green-alt-types';

export const GREEN_ALT_ENTRIES_WEAR: readonly GreenAlternativeEntry[] = [
  {
    id: "ivory_bone_carving",
    triggers: {
      zh: ["象牙", "猛犸牙", "骨雕", "牙雕"],
      en: ["ivory", "bone carving", "mammoth tusk"],
    },
    why: {
      zh: "牙雕件的来源往往涉及野生动物，获取过程对种群和生态的压力不小。",
      en: "Carved ivory usually traces back to wildlife sources, which puts real pressure on animal populations and habitats.",
    },
    options: {
      zh: ["橄榄核雕（有「植物象牙」之称）", "竹雕或木质摆件", "木质光珠手串"],
      en: ['Olive-nut carving ("vegetable ivory")', "Bamboo or wood ornaments", "Wooden bead strands"],
    },
    reuseChannel: {
      zh: "想淘二手的话，闲鱼等二手平台常有玩家出手的核雕、竹雕旧作。",
      en: "Secondhand marketplaces often have pre-loved nut and bamboo carvings from hobbyists.",
    },
    alternative: {
      zh: "想要雕刻件的话，橄榄核雕、竹雕是常见替代——有「植物象牙」之称，质感相近，来源是植物，不涉及动物保护问题。",
      en: 'If it\'s a carved piece you\'re after, olive-nut or bamboo carving is the common alternative — nicknamed "vegetable ivory", similar feel, plant-based, no wildlife concerns.',
    },
    reuse: {
      zh: "你手头可能已有的木质手串、竹制或木质摆件，也可以先拿出来看看是否已经满足了那份把玩的需求。",
      en: "You may already have a wooden bead strand or a bamboo/wood ornament at home — check whether it already scratches the same itch before buying new.",
    },
    savingsHint: {
      zh: "把玩的需求不在于占有，而在于那份触碰与欣赏。",
      en: "The joy is in the touch and appreciation, not in ownership.",
    },
  },
  {
    id: "tortoiseshell",
    triggers: {
      zh: ["玳瑁", "玳瑁壳", "玳瑁手串", "玳瑁眼镜框", "玳瑁梳"],
      en: ["tortoiseshell", "tortoise shell", "hawksbill"],
    },
    why: {
      zh: "玳瑁制品来自濒危海龟的背甲，真品的流通本身牵动海洋种群的保护。",
      en: "Genuine tortoiseshell comes from endangered hawksbill turtles, so the real thing carries ocean-conservation weight.",
    },
    options: {
      zh: ["醋酸纤维板材（复刻玳瑁纹理，植物纤维来源）", "竹制梳子或镜框", "再生材质饰品"],
      en: ["Acetate pieces (tortoiseshell look, plant-based)", "Bamboo combs or frames", "Recycled-material accessories"],
    },
    reuseChannel: {
      zh: "玳瑁纹的旧梳子、旧镜框在闲鱼等二手平台很好淘，先淘旧款就挺好。",
      en: "Vintage tortoiseshell-look combs and frames are easy finds on secondhand marketplaces.",
    },
    alternative: {
      zh: "喜欢玳瑁纹理的话，醋酸纤维板材是常见替代——复刻了同款琥珀纹理，来源是植物纤维。",
      en: "If it's the tortoiseshell look you like, acetate is the common alternative — same amber pattern, plant-based.",
    },
    reuse: {
      zh: "你手头可能已有的旧梳子、旧镜框，先拿出来看看，说不定已经够了。",
      en: "You may already have a comb or a pair of frames that does the job — check the drawer first.",
    },
    savingsHint: {
      zh: "消费前先看看家里已有的同类物品，也许能满足当下的使用需求。",
      en: "Before buying, check if you already have something similar at home that fits the need.",
    },
  },
  {
    id: "fur",
    triggers: {
      zh: ["皮草", "貂皮", "裘皮", "狐狸毛领"],
      en: ["fur coat", "fur collar", "fur trim", "real fur", "mink coat"],
    },
    why: {
      zh: "真皮草从养殖到鞣制的资源消耗都比普通面料重，是服装里负担较大的一类。",
      en: "Real fur carries a heavy load — from farming to tanning, it's among the more resource-intensive materials in fashion.",
    },
    options: {
      zh: ["高品质仿皮草", "再生纤维保暖外套", "加厚摇粒绒"],
      en: ["High-quality faux fur", "Recycled-fiber insulated coats", "Heavyweight fleece"],
    },
    reuseChannel: {
      zh: "仿皮草和厚外套在闲鱼、转转上二手选择很多；礼服类也可以试试租赁平台。",
      en: "Secondhand racks have plenty of warm options, and statement outerwear is a natural rental.",
    },
    alternative: {
      zh: "现在的仿皮草和再生纤维外套，保暖和质感已经很接近真皮草，来源也省心。",
      en: "Today's faux fur and recycled-fiber coats get very close to the real thing on warmth and texture, with none of the baggage.",
    },
    reuse: {
      zh: "你手头可能已有的厚外套、摇粒绒，这个冬天大概率还够用，可以先穿一季再决定。",
      en: "You may already have a heavy coat or fleece that will carry you through this winter — wear it another season before deciding.",
    },
    savingsHint: {
      zh: "消费前先看看家里已有的同类物品，也许能满足当下的使用需求。",
      en: "Before buying, check if you already have something similar at home that fits the need.",
    },
  },
  {
    id: "animal_leather",
    triggers: {
      zh: ["真皮", "鳄鱼皮", "蛇皮", "蜥蜴皮", "鸵鸟皮"],
      en: ["real leather", "genuine leather", "exotic leather", "snakeskin", "crocodile", "alligator"],
    },
    why: {
      zh: "动物皮革的鞣制环节耗水且依赖化学制剂，珍稀皮料还叠加野生动物来源的压力。",
      en: "Leather tanning is water- and chemical-intensive, and exotic skins add wildlife-source pressure on top.",
    },
    options: {
      zh: ["帆布或麻纤维包袋", "植物纤维革（菠萝叶、仙人掌纤维）", "再生材质鞋包"],
      en: ["Canvas or hemp-fiber bags", "Plant-based leather (pineapple or cactus fiber)", "Recycled-material shoes and bags"],
    },
    reuseChannel: {
      zh: "包袋鞋履在闲鱼等二手平台选择很多；正式场合的皮具也可以试试租赁平台。",
      en: "Bags and shoes have deep secondhand catalogs, and formal pieces are natural rentals.",
    },
    alternative: {
      zh: "帆布、麻纤维这些耐磨材质，日常通勤的耐用度和质感都够用，重量还更轻。",
      en: "Canvas and hemp weaves hold up well for daily carry — durable, good-looking, and lighter on the shoulders.",
    },
    reuse: {
      zh: "你手头可能已有的旧包旧鞋，护理一下就能再战一季。",
      en: "You may already have bags or shoes that a quick care session would carry another season.",
    },
    savingsHint: {
      zh: "消费前先看看家里已有的同类物品，也许能满足当下的使用需求。",
      en: "Before buying, check if you already have something similar at home that fits the need.",
    },
  },
];
