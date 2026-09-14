/**
 * duplicate-purchase-detect — duplicate-purchase precheck intent (pure function).
 *
 * Matches only explicit “should I buy another / I already have one / do we have X
 * at home” questions. Stronger flows (sell, gift, knowledge, comparison, list)
 * are excluded before matching so this card never steals their intent.
 */

import type { DuplicatePrecheckCategory } from '@/types/duplicate-purchase';

export interface DuplicatePurchaseIntent {
  itemTitle: string;
  category: DuplicatePrecheckCategory;
}

interface ItemRule {
  category: DuplicatePrecheckCategory;
  zh: readonly RegExp[];
  en: readonly RegExp[];
}

const ITEM_RULES: readonly ItemRule[] = [
  {
    category: 'electronics',
    zh: [/手机线|数据线|充电线|充电宝|耳机/],
    en: [/(?<![\w-])(?:phone cable|charging cable|usb-c cable|lightning cable|power bank|headphones?)(?![\w-])/i],
  },
  {
    category: 'food',
    zh: [/调味[品料]|香料|酱油|醋|盐|油/],
    en: [/(?<![\w-])(?:seasoning|spices?|soy sauce|vinegar|cooking oil)(?![\w-])/i],
  },
  {
    category: 'home',
    zh: [/收纳[盒箱柜架]|整理[盒箱]|储物[盒箱]/],
    en: [/(?<![\w-])(?:storage boxes|storage box|storage bins|storage bin|organizers|containers)(?![\w-])/i],
  },
  {
    category: 'other',
    zh: [/会员|订阅|教材|课本|礼品包装|包装纸/],
    en: [/(?<![\w-])(?:membership|subscription|textbooks?|gift wrap(?:ping)?|wrapping paper)(?![\w-])/i],
  },
];

const EXCLUDED_ZH = /转让|卖掉|出售|送人|送给|什么是|为什么|怎么选|如何选|推荐|攻略|区别|还是|vs\.?|对比|比起|这些|清单|都要|你好|哈哈|天气/;
const EXCLUDED_EN = /(?:^|\W)(?:sell|selling|give away|gift to|what is|why is|how to choose|recommend|compare|versus|vs\.?|shopping list)(?:\W|$)/i;

const DUPLICATE_ZH: readonly RegExp[] = [
  /还有必要(?:再)?(?:买|囤|续)/,
  /还有(?:必要|需要)(?:再)?(?:开|订)/,
  /要不要(?:再)?(?:买|囤|续)/,
  /还要不要再(?:开|买)/,
  /已经(?:有|买了|囤了).{0,18}(?:还要|还能|要不要|需要|可以)?(?:再)?(?:买|囤|续)/,
  /家里(?:有没有|还有).{1,20}(?:吗|么)/,
];

const DUPLICATE_EN: readonly RegExp[] = [
  /already (?:have|own) .{0,48}(?:buy|get|renew|another|more)/i,
  /should i (?:get|buy) another/i,
  /do i (?:really )?need (?:another|more) /i,
  /should i (?:buy|get|renew) .{0,48} if i already have/i,
  /do (?:we|i) (?:already )?have .{0,48}at home/i,
];

function normalize(value: string): string {
  return value.toLowerCase().replace(/\s+/g, ' ').trim();
}

function cleanTitle(value: string): string {
  const cleaned = value.replace(/^[的这那个只份张瓶盒箱个种\s]+/, '').replace(/[。！？?！，,、\s]+$/, '');
  return cleaned.length > 0 && cleaned.length <= 32 ? cleaned : 'it';
}

function extractItem(text: string): string {
  const zh = [
    /家里(?:有没有|还有)(.{1,20}?)(?:吗|么)/,
    /已经(?:有|买了|囤了)(.{1,20}?)(?:了)?(?:[,，?？]|还要|还能|要不要|需要|可以|$)/,
    /(?:还要不要再买|还有必要(?:再)?买|要不要(?:再)?买)(.{1,20})/,
  ];
  for (const pattern of zh) {
    const match = text.match(pattern);
    if (match?.[1]) return cleanTitle(match[1]);
  }

  const en = [
    /already (?:have|own) (?:a|an|the|my)? ?(.*?)(?:,| but| do| should| if| yet|\?|$)/i,
    /need (?:another|more) (.*?)(?:\?|$)/i,
    /do (?:we|i) (?:already )?have (?:a|an|the)? ?(.*?)(?: at home)?(?:\?|$)/i,
  ];
  for (const pattern of en) {
    const match = text.match(pattern);
    if (match?.[1]) return cleanTitle(match[1]);
  }
  return 'it';
}

function categoryFor(text: string): DuplicatePrecheckCategory {
  for (const rule of ITEM_RULES) {
    if (rule.zh.some((pattern) => pattern.test(text))) return rule.category;
    if (rule.en.some((pattern) => pattern.test(text))) return rule.category;
  }
  return 'other';
}

export function detectDuplicatePurchase(userContent: string): DuplicatePurchaseIntent | null {
  if (typeof userContent !== 'string' || userContent.trim().length === 0) return null;
  const text = normalize(userContent);
  if (EXCLUDED_ZH.test(text) || EXCLUDED_EN.test(text)) return null;
  const isDuplicate = DUPLICATE_ZH.some((pattern) => pattern.test(text)) || DUPLICATE_EN.some((pattern) => pattern.test(text));
  if (!isDuplicate) return null;
  return { itemTitle: extractItem(text), category: categoryFor(text) };
}
