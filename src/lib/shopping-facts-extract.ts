/**
 * shopping-facts 提取器 — 确定性模式匹配, 零 LLM (batch25-b, 简报设计决策 #1)
 *
 * shopping-facts.ts 头注释预告的"后续批次"落地件: 从聊天用户消息纯文本里
 * 确定性提取购物事实 (尺码/预算/偏好), 交 buildShoppingFact 过滤后返回。
 * 风格照抄 green-rules.ts: 纯函数、零依赖、表驱动词表、防误伤注释。
 *
 * 铁律 (commerce-agents, 源头 OPEN QUESTIONS #1):
 *   提取器输入仅 role='user' 的消息 content — 本模块无法自证 role, 由调用方
 *   (chat route) 保证只喂 userContent; 任何 assistant/tool 载荷进场 = 打回。
 *
 * 防误伤边界 (v1, 确定性可单测):
 *   - 注入防御: content 含 [Context: / <message> / IMPORTANT: / 工具载荷标签 /
 *     超长无空格串等 prompt 载荷特征 → 整条丢弃, 一个 fact 都不提。
 *   - 否定句: "不喜欢皮革" 提取为 preference: dislike (value 原文存短语,
 *     commerce-agents 惯例), 不误提为正面偏好; dislike 规则先于 like 匹配。
 *   - 单条消息最多 3 条 facts 防刷屏; 重叠命中取更具体的规则。
 *   - 价格提及 ≠ 预算 ("这双鞋 500 块" 无预算触发词, 不提)。
 *   - 已知损耗 (upsert 单槽覆盖, 见 README 同批报告): 预算取最新值 (正确),
 *     偏好 prefer/dislike 各单槽取最新, 尺码按品类分槽 (size_shoe/size_top/
 *     size_pants/size), 同槽后写覆盖前写。
 */

import {
  buildShoppingFact,
  type ShoppingFact,
  type ShoppingFactCategory,
} from './shopping-facts';

/** 单条消息最多提取条数 — 防刷屏 (简报设计决策) */
export const MAX_FACTS_PER_MESSAGE = 3;

/** 注入载荷特征: 命中任一 → 整条消息丢弃 (简报注入防御; 在 green-rules 之外多覆盖工具标签) */
const INJECTION_MARKERS: RegExp[] = [
  /\[\s*context\s*:/i,
  /<\s*\/?\s*message\s*>/i,
  /\bimportant\s*:/i,
  /\binstruction\s*:/i,
  /\blanguage\s+lock\b/i,
  /\[\s*current\s+turn\b/i,
  /<\s*\/?\s*(?:tool_result|tool_call|function_results?)\s*>/i,
  /\b(?:system|assistant|tool)\s*:/i,
];

/** 超长无空格串 (base64/opaque token/压缩载荷): 64+ 连续拉丁数字符号 — 中文正文不受影响 */
const OPAQUE_RUN_PATTERN = /[A-Za-z0-9+/=_-]{64,}/;

/** 尺码品类分槽词表: 鞋/上装/下装, 附近 ±8 字符命中即分槽 (key 防跨品类覆盖) */
const SIZE_SLOT_RULES: Array<{ slot: string; keywords: RegExp }> = [
  { slot: 'size_shoe', keywords: /鞋|shoes?|sneakers?|boots?|runners?/i },
  { slot: 'size_top', keywords: /上衣|衣服|衬衫|t恤|t恤|卫衣|外套|衫|sweater|shirts?|t-?shirts?|tees?|jackets?|hoodies?|coats?/i },
  { slot: 'size_pants', keywords: /裤|jeans|pants|trousers|leggings|shorts/i },
];

/** 偏好材料词表 (zh+en, 长词在前防 "organic cotton" 被 "cotton" 截胡) */
const PREFERENCE_MATERIALS_ZH =
  '有机棉|再生棉|纯棉|全棉|棉质|棉麻|亚麻|蚕丝|真丝|羊绒|羊毛|真皮|皮革|皮草|羽绒|尼龙|涤纶|化纤|塑料|硅胶|竹纤维|莫代尔|莱赛尔|麂皮|漆皮|人造革|仿皮';
// en 交替顺序: 多词短语先于单词 ("vegan leather" 先于 "leather", "faux fur" 先于 "fur")
const PREFERENCE_MATERIALS_EN =
  'organic cotton|vegan leather|faux leather|vegan materials?|faux fur|recycled polyester|secondhand items?|bamboo fabric|alpaca wool|cashmere|merino wool|linen|silk|wool|leather|suede|fur|down|feather|nylon|polyester|velvet|denim|cotton|secondhand';

interface ExtractRule {
  lang: 'zh' | 'en';
  category: ShoppingFactCategory;
  /** key 槽位; 'auto-size' = 按上下文品类分槽, 'prefer'/'dislike' = 偏好极性槽 */
  slot: string;
  regex: RegExp;
}

/**
 * 规则表 (zh/en 双语; dislike 先于 like — "不喜欢" 内含 "喜欢" 子串,
 * 先匹配先占 span, 重叠去重自然防双提)。
 */
const EXTRACT_RULES: ExtractRule[] = [
  // === 尺码 zh ===
  {
    lang: 'zh',
    category: 'size',
    slot: 'auto-size',
    regex: /(?:穿|尺码(?:是|为)?|码数|鞋码)\s*([1-9][0-9](?:\.[05])?)\s*(?:码|号)/g,
  },
  {
    lang: 'zh',
    category: 'size',
    slot: 'auto-size',
    // 身高体重 → 码: "175cm 70kg 穿 L" (更具体, 排在裸字母码之前抢 span)
    regex: /1[5-9][0-9]\s*cm[^。,，]{0,10}[3-9][0-9]\s*kg[^。,，]{0,10}(?:穿|选|码数)\s*(XXS|XXXL|XS|XXL|XL|[SML])\s*(?:码)?(?![A-Za-z])/g,
  },
  {
    lang: 'zh',
    category: 'size',
    slot: 'auto-size',
    // (?![A-Za-z]) 防误伤: "买 MacBook"/"穿 MLB 的衣服" 不提 (字母码后不能再跟拉丁字母)
    regex: /(?:穿|尺码(?:是|为)?|码数|选|买)\s*(XXS|XXXL|XS|XXL|XL|[SML])\s*(?:码|号)?(?![A-Za-z])/g,
  },
  // === 尺码 en ===
  {
    lang: 'en',
    category: 'size',
    slot: 'auto-size',
    regex: /\b(?:EU|EUR|US|UK)\s*([1-9][0-9](?:\.[05])?)\b/gi,
  },
  {
    lang: 'en',
    category: 'size',
    slot: 'auto-size',
    regex: /\bsize\s*(XXS|XXXL|XS|XXL|XL|[SML]|[1-9][0-9](?:\.[05])?)\b/gi,
  },
  // === 预算 zh (触发词必须出现 — 价格提及不等于预算) ===
  {
    lang: 'zh',
    category: 'budget',
    slot: 'budget',
    regex: /预算\s*(?:不超过|至多|最多|最高|在|为|是)?\s*[￥¥]?\s*[0-9]{2,7}\s*(?:元|块|人民币|刀)?\s*(?:以内|之内|以下|左右)?/g,
  },
  {
    lang: 'zh',
    category: 'budget',
    slot: 'budget',
    regex: /(?:最多|至多|不超过|不能超过|控制在)\s*(?:花|付|出)?\s*[￥¥]?\s*[0-9]{2,7}\s*(?:元|块|人民币|刀)?/g,
  },
  // === 预算 en ===
  {
    lang: 'en',
    category: 'budget',
    slot: 'budget',
    regex: /\bbudget(?:\s+is|\s+of)?\s*(?:up\s+to|under|below|around|max)?\s*[$￥¥]?\s*[0-9]{2,7}(?:\.[0-9]{1,2})?\b(?:\s*(?:usd|cny|rmb|yuan|dollars?|bucks))?/gi,
  },
  {
    lang: 'en',
    category: 'budget',
    slot: 'budget',
    regex: /\b(?:within|under|below|up\s+to|no\s+more\s+than|at\s+most|less\s+than)\s*[$￥¥]?\s*[0-9]{2,7}(?:\.[0-9]{1,2})?\b/gi,
  },
  // === 偏好 (dislike 先于 like 占 span) ===
  {
    lang: 'zh',
    category: 'preference',
    slot: 'dislike',
    regex: new RegExp(
      `(?:不喜欢|不要|别买|不想买|不想穿|讨厌|避开|排斥|受不了|拒绝)\\s*(${PREFERENCE_MATERIALS_ZH})`,
      'g',
    ),
  },
  {
    lang: 'en',
    category: 'preference',
    slot: 'dislike',
    regex: new RegExp(
      `\\b(?:don'?t like|do not like|don'?t want|do not want|never buy|never wear|hate|avoid|can'?t stand|allergic to)\\s+(${PREFERENCE_MATERIALS_EN})\\b`,
      'gi',
    ),
  },
  {
    lang: 'zh',
    category: 'preference',
    slot: 'prefer',
    regex: new RegExp(
      `(?:喜欢|偏爱|偏好|更爱|最爱|只买|只想买|只挑|倾向于)\\s*(${PREFERENCE_MATERIALS_ZH})`,
      'g',
    ),
  },
  {
    lang: 'en',
    category: 'preference',
    slot: 'prefer',
    regex: new RegExp(
      `\\b(?:prefer|prefers|love|loves|like|only buy|only wear|favourite material is|favorite material is)\\s+(${PREFERENCE_MATERIALS_EN})\\b`,
      'gi',
    ),
  },
];

/** zh/en 双语都扫 (用户中英混杂是常态); locale 只决定规则优先序 */
export function extractShoppingFacts(
  text: unknown,
  locale: 'en' | 'zh' = 'en',
): ShoppingFact[] {
  if (typeof text !== 'string') return [];
  const content = text.trim();
  if (content.length < 2) return [];

  // 注入防御: 载荷特征命中 → 整条丢弃 (宁可漏提, 不让 prompt 载荷混进偏好库)
  if (INJECTION_MARKERS.some((pattern) => pattern.test(content))) return [];
  if (OPAQUE_RUN_PATTERN.test(content)) return [];

  // locale 优先序: 主语言规则先跑, 同分时先到先得 (单消息 ≤3 条的名额分配)
  const orderedRules = [
    ...EXTRACT_RULES.filter((rule) => rule.lang === locale),
    ...EXTRACT_RULES.filter((rule) => rule.lang !== locale),
  ];

  interface Candidate {
    category: ShoppingFactCategory;
    slot: string;
    value: string;
    start: number;
    end: number;
    priority: number;
  }
  const candidates: Candidate[] = [];

  for (let priority = 0; priority < orderedRules.length; priority++) {
    const rule = orderedRules[priority];
    const regex = new RegExp(rule.regex.source, rule.regex.flags);
    let match: RegExpExecArray | null;
    while ((match = regex.exec(content)) !== null) {
      if (match[0].length === 0) break; // 空匹配防死循环
      const start = match.index;
      const end = start + match[0].length;
      let slot = rule.slot;
      if (slot === 'auto-size') {
        // 品类词窗口: 前看 8 / 后看 16 ("size M running shoes" 的 shoes 在后 9-14 字符处)
        const contextWindow = content.slice(Math.max(0, start - 8), Math.min(content.length, end + 16));
        slot = SIZE_SLOT_RULES.find((family) => family.keywords.test(contextWindow))?.slot ?? 'size';
      }
      // value 原文存短语 (整段匹配, 折行/多空白由 buildShoppingFact 卫生化压平)
      candidates.push({ category: rule.category, slot, value: match[0], start, end, priority });
    }
  }

  // 重叠去重 (高优先级规则先占 span) + 同值去重 + 单消息上限
  candidates.sort((a, b) => a.priority - b.priority);
  const taken: Array<{ start: number; end: number }> = [];
  const seen = new Set<string>();
  const facts: ShoppingFact[] = [];
  for (const candidate of candidates) {
    if (facts.length >= MAX_FACTS_PER_MESSAGE) break;
    if (taken.some((span) => candidate.start < span.end && candidate.end > span.start)) continue;
    const dedupKey = `${candidate.category}|${candidate.slot}|${candidate.value}`;
    if (seen.has(dedupKey)) continue;
    const fact = buildShoppingFact({
      category: candidate.category,
      key: candidate.slot,
      value: candidate.value,
    });
    if (!fact) continue; // 长度/形状过滤不过 → 跳过该条 (批量提取永不因单条脏数据失败)
    seen.add(dedupKey);
    taken.push({ start: candidate.start, end: candidate.end });
    facts.push(fact);
  }
  return facts;
}
