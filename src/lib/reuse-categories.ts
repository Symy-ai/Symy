/**
 * reuse-categories — 复用优先规则表 (表驱动, zh+en 双语)
 *
 * 复用优先 (reuse-first) 的数据文件: 当用户的购物意图能被二手/租赁/
 * 已有物品组合满足时, 给复用方案而不是引导新购。源头减购 — 比"买绿的"
 * 更绿的是"不买新的"。
 *
 * 覆盖高频类目 (每类一个典型价差估算 typicalSavedAmountUSD):
 *   - 工具/设备 (电钻/投影仪/帐篷/礼服/相机) → 租赁
 *   - 书籍/教材 → 二手 + 电子版
 *   - 家具/大件 → 二手优先
 *   - 派对/一次性用品 → 已有物品组合方案
 *   - 婴儿用品 (使用期短) → 亲友流转
 *
 * 语气遵循荣誉框架 (honor framing): 夸"会安排", 绝不说教, 不提碳数值,
 * 不羞耻化购买。trigger 匹配同时看 zh + en 词表 (用户可能中英混说:
 * "买个 drill")。纯数据文件, 匹配逻辑在 reuse-advisor.ts。
 */

export type ReuseLocale = 'zh' | 'en';

/** 覆盖的高频复用类目 id */
export type ReuseCategory =
  | 'tool_rental'
  | 'books_media'
  | 'furniture_big'
  | 'party_disposable'
  | 'baby_gear';

export interface ReuseCategoryRule {
  /** 类目 id (测试/日志用) */
  id: ReuseCategory;
  /** 类目显示名 — 复用卡标题旁的品类徽章 */
  label: Record<ReuseLocale, string>;
  /** trigger 词表 — zh/en 双语, 匹配时两个语言都查 */
  triggers: Record<ReuseLocale, readonly string[]>;
  /** 荣誉框架建议话术 — 每条一句话, 复用卡逐条渲染 */
  suggestions: Record<ReuseLocale, readonly string[]>;
  /**
   * 类目典型价差估算 (USD 等效, 硬编码方向感) — 全新购均价与复用路径
   * (租赁几次/二手/已有物品组合按 0 计) 的差。是估算不是报价, 卡内
   * 一律以「约」标注 (hoursLabel 由 moneyToFreedomLabel 换算)。
   */
  typicalSavedAmountUSD: number;
}

/** 顺序即匹配优先级 — 更具体的品类放前面 */
export const REUSE_CATEGORIES: readonly ReuseCategoryRule[] = [
  {
    id: 'tool_rental',
    label: { zh: '工具·设备', en: 'Tools & gear' },
    triggers: {
      zh: [
        '电钻', '打孔', '冲击钻', '投影仪', '投影机', '帐篷', '露营装备',
        '礼服', '晚礼服', '西装', '相机', '单反', '微单', '摄像机',
        '音响', '打磨机', '电锯', '梯子', '热风枪', '洗地机',
      ],
      en: [
        'drill', 'power tool', 'projector', 'tent', 'camping gear',
        'tuxedo', 'evening gown', 'camera', 'dslr', 'camcorder',
        'speaker', 'ladder', 'sander', 'chainsaw', 'pressure washer',
      ],
    },
    suggestions: {
      zh: [
        '这类一年用不上几次的装备，租一次通常只要一杯奶茶钱——会借力的人最会安排。',
        '租来的用完就还，家里不用腾地方收纳，也不用惦记保养和配件。',
      ],
      en: [
        "Gear you'll use a few times a year rents for pocket change — the savviest people build whole projects on rentals.",
        "Return it when done: no storage space, no maintenance, no drawer of accessories you'll never touch again.",
      ],
    },
    typicalSavedAmountUSD: 95,
  },
  {
    id: 'books_media',
    label: { zh: '书籍·教材', en: 'Books & textbooks' },
    triggers: {
      zh: [
        '买书', '这套书', '教材', '课本', '教科书', '辅导书', '工具书',
        '原版书', '绘本', '小说', '漫画', '考研书',
      ],
      en: [
        'book', 'textbook', 'novel', 'paperback', 'hardcover', 'kindle',
        'e-book', 'ebook', 'course reading', 'reading list',
      ],
    },
    suggestions: {
      zh: [
        '书是二手流转最快的品类——多抓鱼、闲鱼（海外 eBay）通常半价以内，看完还能再转出去。',
        '不少书有电子版，通勤排队翻几页正合适，纸书钱直接省下。',
      ],
      en: [
        'Books move fastest secondhand — used bookstores, eBay, or campus swaps often come in under half price, and you can pass the copy on when done.',
        'Many titles have e-book versions — perfect for the commute, and the paper copy stays on the shelf (and off the receipt).',
      ],
    },
    typicalSavedAmountUSD: 12,
  },
  {
    id: 'furniture_big',
    label: { zh: '家具·大件', en: 'Furniture & big items' },
    triggers: {
      zh: [
        '家具', '沙发', '床垫', '衣柜', '餐桌', '书架', '床架', '床头柜',
        '冰箱', '洗衣机', '跑步机', '按摩椅',
      ],
      en: [
        'furniture', 'sofa', 'couch', 'mattress', 'wardrobe', 'dining table',
        'bookshelf', 'bed frame', 'nightstand', 'fridge', 'refrigerator',
        'washing machine', 'treadmill',
      ],
    },
    suggestions: {
      zh: [
        '大件家具在二手市场常常是全新一半的价——很多人搬家急出，成色意外地好。',
        '接手二手大件前先量好电梯和门宽、约好车：搬运安排利落，省下的才真正落袋。',
      ],
      en: [
        'Secondhand furniture often goes for half of new — people moving out sell near-mint pieces in a hurry.',
        'Measure doorways and elevators and line up transport before you commit: a smooth move is what keeps the savings.',
      ],
    },
    typicalSavedAmountUSD: 250,
  },
  {
    id: 'party_disposable',
    label: { zh: '派对·一次性用品', en: 'Party & disposables' },
    triggers: {
      zh: [
        '派对', '聚会布置', '生日布置', '派对装饰', '气球', '拉旗', '横幅',
        '纸盘', '一次性餐具', '一次性杯子', '彩带', '拍照道具',
      ],
      en: [
        'party supplies', 'party decoration', 'birthday party', 'balloon',
        'banner', 'paper plate', 'disposable tableware', 'confetti',
        'photo booth prop',
      ],
    },
    suggestions: {
      zh: [
        '布置前先盘点家里已有的：串灯 + 玻璃罐 + 旧海报，氛围感往往比一次性拉旗还出彩。',
        '餐具直接用家里的碗碟，混搭反而有风格；散场后洗一洗，不用扔掉一整箱。',
      ],
      en: [
        'Scout what you already own before shopping: string lights + jars + old posters out-style any one-time banner.',
        'Serve on your everyday dishes — the mix-and-match look reads as intentional, and nothing goes in the bin after.',
      ],
    },
    typicalSavedAmountUSD: 45,
  },
  {
    id: 'baby_gear',
    label: { zh: '婴儿用品', en: 'Baby gear' },
    triggers: {
      zh: [
        '婴儿车', '推车', '婴儿床', '安全座椅', '宝宝餐椅', '餐椅',
        '婴儿用品', '宝宝用品', '吸奶器', '婴儿背带', '爬行垫',
      ],
      en: [
        'baby gear', 'stroller', 'pram', 'crib', 'bassinet', 'high chair',
        'car seat', 'baby carrier', 'breast pump', 'baby monitor', 'play mat',
      ],
    },
    suggestions: {
      zh: [
        '婴儿车、餐椅这类使用期就几个月的，是亲友间流转最多的——干净消毒后和全新没差别。',
        '二手的转手也容易：宝宝长得快，上一家刚用完的成色往往比想象好得多。',
      ],
      en: [
        'Strollers and high chairs get used for a few months — hand-me-downs and secondhand are near-new once sanitized.',
        'Barely-used baby gear resells easily: babies outgrow things fast, so the previous owner barely broke it in.',
      ],
    },
    typicalSavedAmountUSD: 130,
  },
];

/**
 * 荣誉注脚 (reuseHonestNote) — 卡底一句话, 把复用框成"会安排"的荣誉,
 * 不说教不羞耻。共享文案 (非 per-类目), locale 取词。
 */
export const REUSE_HONEST_NOTE: Record<ReuseLocale, string> = {
  zh: '你在做对的事——源头少买一件，比买任何「绿色新品」都更进一步。',
  en: "You're doing it right — skipping the new purchase goes further than any 'green' new one.",
};
