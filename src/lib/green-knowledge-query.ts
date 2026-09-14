/**
 * green-knowledge-query — 绿色知识问答意图检测 (纯函数, 零 IO)
 *
 * 与 green-alt-detect (购买意图拦截) 语义互补: 那是"用户想买→拦", 这是"用户想懂→教"。
 * 用户在 chat 里问绿色知识 ("refurb 值得买吗"/"二手平台靠谱吗") 时, 从现有
 * green-alternatives 词条库检索匹配词条, 供 chat route 把词条内容注入 Letta 上下文。
 *
 * 匹配规则 (三层, 按序短路):
 * 1. 泛化价值问句 (值得买/该不该买/worth buying) → 知识问句, 不算购买意图
 * 2. 购买意图标记 (想买/买个/want to buy...) → 返回 null, 交给既有 green-alt-detect 链路
 * 3. 疑问指示词 + 品类词 (现有 triggers + 本文件 KNOWLEDGE_TRIGGERS 问句形态词) → 命中
 *
 * 不修改 green-alternatives.ts 注册表与现有 entries 文件 — trigger 扩展
 * (knowledgeTriggers 等价物) 全部放在本文件的 KNOWLEDGE_TRIGGERS 表里。
 */

import { GREEN_ALTERNATIVES } from './green-alternatives';
import type { GreenLocale } from './green-alt-types';

/** 疑问指示词 — 消息里出现才算"知识型提问" (zh/en 各自匹配, 与 locale 无关) */
const QUESTION_INDICATORS = {
  zh: [
    '值得买吗', '值得吗', '值不值得', '靠谱吗', '是什么', '什么是', '什么叫',
    '怎么样', '好不好', '有必要吗', '该不该', '介绍下', '讲讲', '区别',
    '推荐吗', '环保吗', '可持续吗', '优缺点', '有什么讲究', '吗？', '吗?',
  ],
  en: [
    'worth it', 'is it worth', 'what is', 'what are', 'what does', 'how about',
    'should i', 'should we', 'reliable', 'tell me about', 'difference between',
    'a good idea', 'eco-friendly', 'sustainable', 'pros and cons', '?',
  ],
} as const;

/** 泛化价值问句 — "买"字出现在问句结构里, 语义是求评估不是求下单 */
const GENERIC_WORTH_RE = /值得买|值不值得买|该不该买|要不要买|买哪种|买哪个|买什么|划算吗|值得入手|worth buying|worth getting/;

/** 购买意图标记 — 命中则整体让位给 green-alt-detect 拦截链路 */
const PURCHASE_INTENT_RE = /想买|要买|打算买|准备买|计划买|买个|买一[个只台部副颗张块]|入手|下单|剁手|换新机|want to buy|going to buy|gonna buy|buy (a|an|the|some|new) |buying (a|an|the|some|new) |thinking of buying|planning to buy|i'm buying|买 ?[a-z0-9]|下单购买/;

/**
 * 问句形态知识触发词 — 各词条 triggers 之外的补充词表 (只读复用现有注册表, 不改 entries)。
 * key = 词条 id; 未列出的词条只用现有 triggers 参与知识匹配。
 */
const KNOWLEDGE_TRIGGERS: Record<string, { zh: readonly string[]; en: readonly string[] }> = {
  refurb_gadget: {
    zh: ['翻新机', '官翻', '翻新', '二手平台', '二手'],
    en: ['refurb', 'refurbished', 'renewed', 'secondhand', 'used', 'pre-owned'],
  },
  repair_first: {
    zh: ['修还是换', '值得修吗', '修好还是换新'],
    en: ['repair or replace', 'worth repairing', 'right to repair', 'fix or replace'],
  },
  secondhand_audio_tablet: {
    zh: ['二手耳机', '二手平板'],
    en: ['used earbuds', 'used tablet', 'used ipad'],
  },
  trade_in_upgrade: {
    zh: [],
    en: ['trade-in worth'],
  },
  cable_hoard: {
    zh: ['多合一线'],
    en: ['braided cable', 'multi connector cable'],
  },
  fast_fashion: {
    zh: ['快时尚品牌'],
    en: ['fast fashion', 'shein', 'zara'],
  },
  single_use_plastic: {
    zh: ['一次性用品', '减塑'],
    en: ['single use', 'single-use', 'plastic free'],
  },
  ivory_bone_carving: {
    zh: ['象牙制品', '植物象牙'],
    en: ['ivory', 'bone carving'],
  },
  tortoiseshell: {
    zh: ['玳瑁制品'],
    en: ['tortoiseshell', 'hawksbill'],
  },
  fur: {
    zh: ['皮草制品', '人造皮草'],
    en: ['real fur', 'faux fur'],
  },
  animal_leather: {
    zh: ['真皮制品', ' vegan 皮'],
    en: ['leather vs', 'vegan leather'],
  },
  beauty_refill: {
    zh: ['补充装'],
    en: ['refill'],
  },
  solid_cleanser: {
    zh: ['固体皂', '皂块'],
    en: ['shampoo bar', 'soap bar', 'solid cleanser'],
  },
  batteries: {
    zh: ['充电电池', '干电池'],
    en: ['rechargeable batteries', 'aa batteries'],
  },
  tissues: {
    zh: ['手帕'],
    en: ['handkerchief'],
  },
  new_clothes: {
    zh: ['衣服断舍离', '穿搭'],
    en: ['clothes declutter', 'restyling'],
  },
  limited_sneakers: {
    zh: ['球鞋保养', '鞋类清洁'],
    en: ['sneaker care', 'clean sneakers'],
  },
  handbag_rotation: {
    zh: ['包包轮换', '闲置包'],
    en: ['bag rotation', 'idle bags'],
  },
  wardrobe_audit: {
    zh: ['衣柜盘点'],
    en: ['closet audit', 'closet inventory'],
  },
  capsule_wardrobe: {
    zh: ['胶囊衣橱'],
    en: ['capsule wardrobe'],
  },
  storage_gadgets: {
    zh: ['断舍离收纳'],
    en: ['declutter before organizing'],
  },
  aroma_diffuser: {
    zh: ['天然香薰', '精油'],
    en: ['essential oils'],
  },
  promo_household_stockup: {
    zh: ['囤货划算吗', '促销囤货'],
    en: ['bulk buying worth'],
  },
  small_appliance: {
    zh: ['多功能小家电'],
    en: ['multi-function appliance'],
  },
  upcycle_decor: {
    zh: ['旧物改造'],
    en: ['upcycling', 'upcycle'],
  },
};

/** 词条展示名 (chip 用) — 未列出的词条回退到 id */
const KNOWLEDGE_LABELS: Record<string, Record<GreenLocale, string>> = {
  refurb_gadget: { zh: '翻新机', en: 'Refurbished' },
  repair_first: { zh: '维修优先', en: 'Repair first' },
  secondhand_audio_tablet: { zh: '二手数码', en: 'Secondhand' },
  trade_in_upgrade: { zh: '以旧换新', en: 'Trade-in' },
  cable_hoard: { zh: '线材复用', en: 'Cable reuse' },
  fast_fashion: { zh: '快时尚', en: 'Fast fashion' },
  single_use_plastic: { zh: '一次性塑料', en: 'Single-use plastic' },
  tissues: { zh: '纸巾替代', en: 'Tissue swaps' },
  batteries: { zh: '电池选择', en: 'Batteries' },
  ivory_bone_carving: { zh: '象牙制品', en: 'Ivory' },
  tortoiseshell: { zh: '玳瑁制品', en: 'Tortoiseshell' },
  fur: { zh: '皮草', en: 'Fur' },
  animal_leather: { zh: '动物皮革', en: 'Leather' },
  beauty_refill: { zh: '补充装', en: 'Refills' },
  solid_cleanser: { zh: '固体皂', en: 'Solid cleanser' },
  skincare_hoard: { zh: '囤货美妆', en: 'Skincare hoard' },
  lipstick_makeup: { zh: '口红美妆', en: 'Lipstick' },
  sheet_mask_pile: { zh: '面膜囤货', en: 'Sheet masks' },
  new_clothes: { zh: '买衣冲动', en: 'Clothes impulse' },
  limited_sneakers: { zh: '球鞋降温', en: 'Sneaker hype' },
  handbag_rotation: { zh: '包袋轮换', en: 'Bag rotation' },
  wardrobe_audit: { zh: '衣柜盘点', en: 'Closet audit' },
  capsule_wardrobe: { zh: '胶囊衣橱', en: 'Capsule wardrobe' },
  storage_gadgets: { zh: '先减后收', en: 'Declutter first' },
  aroma_diffuser: { zh: '香薰替代', en: 'Home fragrance' },
  promo_household_stockup: { zh: '囤货算账', en: 'Bulk-buy math' },
  small_appliance: { zh: '小家电', en: 'Small appliances' },
  upcycle_decor: { zh: '旧物改造', en: 'Upcycling' },
};

/** 单轮最多引用的词条数 — 防一条消息命中过多词条撑爆上下文 */
const MAX_KNOWLEDGE_HITS = 3;

function normalizeText(text: string): string {
  return text.toLowerCase().replace(/\s+/g, ' ').trim();
}

function hasQuestionIndicator(normalized: string): boolean {
  return QUESTION_INDICATORS.zh.some((q) => normalized.includes(q.toLowerCase()))
    || QUESTION_INDICATORS.en.some((q) => normalized.includes(q.toLowerCase()));
}

function matchEntryTriggers(normalized: string, id: string, zh: readonly string[], en: readonly string[]): boolean {
  const knowledge = KNOWLEDGE_TRIGGERS[id];
  const all = [...zh, ...en, ...(knowledge ? [...knowledge.zh, ...knowledge.en] : [])];
  return all.some((t) => normalized.includes(t.toLowerCase()));
}

/** 词条展示名 (locale 语言); 未登记的词条回退到 id (chip 仍可展开内容) */
export function greenKnowledgeLabel(id: string, locale: GreenLocale): string {
  return KNOWLEDGE_LABELS[id]?.[locale] ?? id;
}

/**
 * 检测用户消息是否为绿色知识型提问。
 *
 * 命中 → 返回匹配到的词条 id 列表 (按注册表顺序, 最多 MAX_KNOWLEDGE_HITS 个);
 * 未命中 / 购买意图优先 / 空输入 → null。
 * 纯函数: 只做字符串匹配, 绿色偏好开关由调用方判断。
 *
 * 边界 (测试锚点):
 * - 'refurb 值得买吗' / 'is buying refurbished worth it' → 命中 refurb_gadget
 * - '我想买个新的 iPad' / '买 ivory 手镯靠谱吗' → null (购买意图, 走 green-alt-detect)
 */
export function matchGreenKnowledge(query: string): string[] | null {
  if (typeof query !== 'string' || query.trim().length === 0) return null;
  const normalized = normalizeText(query);
  if (normalized.length === 0) return null;
  if (!hasQuestionIndicator(normalized)) return null;
  if (GENERIC_WORTH_RE.test(normalized)) {
    // 泛化价值问句按知识问答处理 — 但仍需品类词才命中 (下面统一判断)
  } else if (PURCHASE_INTENT_RE.test(normalized)) {
    return null;
  }
  const hits = GREEN_ALTERNATIVES
    .filter((entry) => matchEntryTriggers(normalized, entry.id, entry.triggers.zh, entry.triggers.en))
    .map((entry) => entry.id)
    .slice(0, MAX_KNOWLEDGE_HITS);
  return hits.length > 0 ? hits : null;
}
