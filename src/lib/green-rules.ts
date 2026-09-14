/**
 * 绿色消费规则引擎 — 商品卡绿色信号评估（纯函数，零依赖）
 *
 * 战略背景：绿色环保外壳 + 省钱防斩杀内里。绿色分数只做定性启发（关键词命中），
 * 绝不编造具体碳足迹数值。
 *
 * 评分规则（表驱动，词表 en+zh）：
 * - 每张卡用 标题+品类+子品类 匹配绿色词表，命中一个 flag 计该 flag 的 weight，
 *   总分封顶 100。
 * - 用户查询本身命中绿色词表 → 所有卡获得 GREEN_QUERY_INTENT_BONUS 加成（搜索意图
 *   是绿色语境），只加一次，不重复计分。
 * - 高环境影响品类（象牙/皮草/一次性/塑料等）命中卡片文本 → non_green_flag。
 *   查询命中非绿词不给卡打标——卡是否非绿只看卡自己。
 * - 非"X-free/无X/仿X"否定短语先剔除，避免把 "plastic-free"/"仿皮草" 误判为非绿。
 * - ASCII 关键词按整词边界匹配（"fur" 不会误中 "furniture"），中文按子串匹配。
 */

/** 参与绿色评估的卡片段落（ProductCardData 结构兼容，零依赖不 import） */
export interface GreenSignalCardInput {
  title: string;
  category?: string;
  subcategory?: string;
}

/** 每张卡的绿色评估结果（与入参 cards 顺序一一对应） */
export interface GreenSignal {
  /** 0-100，定性启发分，非碳足迹数值 */
  green_score: number;
  /** 命中的绿色标签 */
  green_flags: string[];
  /** 高环境影响品类命中（温和引导给绿色替代，不打红X） */
  non_green_flag: boolean;
}

export interface GreenFlagRule {
  flag: string;
  /** 该 flag 单独命中的加分 */
  weight: number;
  /** en+zh 关键词表 */
  keywords: string[];
}

export interface NonGreenRule {
  category: string;
  keywords: string[];
}

/**
 * 绿叶徽章门槛：green_score >= 60 判为 high 档（绿色优选 / Green pick，见 green-level.ts）。
 * 权重表设计成：二手/租赁(70)、再生/有机(65)、可降解/可持续/天然材质(60)
 * 单独命中即可上徽章；可重复使用/认证(55) 需叠加或搭绿色搜索意图。
 */
export const GREEN_SCORE_BADGE_THRESHOLD = 60;

/** 用户查询本身含绿色关键词时，每张卡的意图加成 */
export const GREEN_QUERY_INTENT_BONUS = 10;

/**
 * 用户查询本身的绿色意图（独立于卡片文本；不参与分档/排序/徽章，只驱动引导语）。
 * 与 evaluateGreenSignal 的意图加成分支同词表（GREEN_FLAG_RULES），纯提取零行为差。
 */
export function queryHasGreenIntent(query: string): boolean {
  const trimmed = typeof query === 'string' ? query : '';
  return trimmed.length > 0 && GREEN_FLAG_RULES.some((rule) => hits(trimmed, rule.keywords));
}

export const GREEN_FLAG_RULES: GreenFlagRule[] = [
  {
    flag: 'secondhand',
    weight: 70,
    keywords: [
      '二手', '翻新', '闲置', '古着', '旧货', '循环利用',
      // 注意：不放裸 'used' — 会误中营销语 "used by pros"
      'secondhand', 'second-hand', 'second hand', 'pre-owned', 'preowned',
      'refurbished', 'renewed', 'vintage',
    ],
  },
  {
    flag: 'rental',
    weight: 70,
    // 注意：不放裸 'rent' — 会误中 rent-to-own（那仍是购买，不算绿色租赁）
    keywords: ['租赁', '租借', '出租', '租用', 'rental', 'for rent', 'rent-a'],
  },
  {
    flag: 'recycled_material',
    weight: 65,
    keywords: ['再生', '回收', 'recycled', 'recyclable', 'upcycled'],
  },
  {
    flag: 'organic_material',
    weight: 65,
    keywords: ['有机', 'organic'],
  },
  {
    flag: 'biodegradable',
    weight: 60,
    keywords: ['可降解', '生物降解', '可堆肥', 'biodegradable', 'compostable'],
  },
  {
    flag: 'sustainable',
    weight: 60,
    keywords: ['环保', '可持续', '低碳', 'sustainable', 'eco-friendly', 'eco friendly', 'earth-friendly'],
  },
  {
    flag: 'natural_material',
    weight: 60,
    keywords: [
      '竹', '棉', '亚麻', '棉麻', '实木', '原木', '麻布',
      'bamboo', 'cotton', 'linen', 'hemp', 'solid wood',
    ],
  },
  {
    flag: 'reusable',
    weight: 55,
    keywords: [
      '可重复使用', '重复使用', '替换装', '补充装', '可换芯',
      'reusable', 'refillable', 'refill',
    ],
  },
  {
    flag: 'certified',
    weight: 55,
    keywords: [
      '认证', '一级能效', '节能', '能源之星', '公平贸易',
      'certified', 'certification', 'fsc', 'gots', 'ecocert',
      'energy star', 'energy efficient', 'fair trade',
    ],
  },
  {
    flag: 'durable',
    weight: 40,
    keywords: [
      '耐用', '经久', '耐磨', '终身质保', '终身保修',
      'durable', 'long-lasting', 'long lasting', 'sturdy', 'lifetime warranty',
    ],
  },
];

export const NON_GREEN_RULES: NonGreenRule[] = [
  { category: 'ivory', keywords: ['象牙', 'ivory'] },
  { category: 'fur', keywords: ['皮草', '貂皮', '狐狸毛', '兔毛', 'fur', 'mink', 'angora'] },
  { category: 'disposable', keywords: ['一次性', 'disposable', 'single-use', 'single use'] },
  { category: 'plastic', keywords: ['塑料', 'plastic'] },
  {
    category: 'exotic_leather',
    keywords: ['鳄鱼皮', '鳄鱼', '蛇皮', '蜥蜴皮', '鸵鸟皮', '珍稀皮革', 'exotic leather', 'snakeskin', 'crocodile', 'alligator'],
  },
];

/** 否定短语：出现在卡文本里先剔除，避免绿色替代品被误打非绿标 */
export const NON_GREEN_NEGATION_PHRASES = [
  'plastic-free', 'plastic free', 'bpa-free', 'bpa free', 'fur-free', 'fur free',
  'faux fur', 'vegan fur', 'pvc-free', 'pvc free',
  '无塑料', '非塑料', '不含塑料', '无皮草', '非皮草', '仿皮草', '人造皮草', '不含象牙',
];

const ASCII_KEYWORD = /^[\x20-\x7E]+$/;
const asciiRegexCache = new Map<string, RegExp>();
const negationRegexCache: RegExp[] = [];

function escapeRegExp(keyword: string): string {
  return keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function stripNonGreenNegations(text: string): string {
  if (negationRegexCache.length !== NON_GREEN_NEGATION_PHRASES.length) {
    negationRegexCache.length = 0;
    for (const phrase of NON_GREEN_NEGATION_PHRASES) {
      negationRegexCache.push(new RegExp(escapeRegExp(phrase), 'gi'));
    }
  }
  return negationRegexCache.reduce((acc, regex) => acc.replace(regex, ' '), text);
}

function containsKeyword(text: string, keyword: string): boolean {
  if (!ASCII_KEYWORD.test(keyword)) return text.includes(keyword);
  let regex = asciiRegexCache.get(keyword);
  if (!regex) {
    regex = new RegExp(`\\b${escapeRegExp(keyword)}\\b`, 'i');
    asciiRegexCache.set(keyword, regex);
  }
  return regex.test(text);
}

function hits(text: string, keywords: string[]): boolean {
  return keywords.some((keyword) => containsKeyword(text, keyword));
}

function cardText(card: GreenSignalCardInput): string {
  return [card.title, card.category, card.subcategory]
    .filter((part): part is string => typeof part === 'string' && part.length > 0)
    .join(' ');
}

/**
 * 评估每张商品卡的绿色信号。返回数组与 cards 顺序一一对应。
 * 纯函数：不修改入参，无 IO，无依赖。
 */
export function evaluateGreenSignal(
  query: string,
  cards: readonly GreenSignalCardInput[],
): GreenSignal[] {
  const queryIntent = queryHasGreenIntent(query);

  return cards.map((card) => {
    const text = stripNonGreenNegations(cardText(card));

    const green_flags: string[] = [];
    let green_score = 0;
    for (const rule of GREEN_FLAG_RULES) {
      if (hits(text, rule.keywords)) {
        green_flags.push(rule.flag);
        green_score += rule.weight;
      }
    }
    if (queryIntent) green_score += GREEN_QUERY_INTENT_BONUS;
    green_score = Math.max(0, Math.min(100, green_score));

    return {
      green_score,
      green_flags,
      non_green_flag: NON_GREEN_RULES.some((rule) => hits(text, rule.keywords)),
    };
  });
}
