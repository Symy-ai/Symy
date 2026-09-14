/**
 * category-query-detector — "这个月奶茶拦截了几次" 分类问句检测 (纯函数, batch58-c)
 *
 * savings-query-detector (57-c) 的维度细化: 问句里既要有品类词 (奶茶/外卖/
 * 衣服…, 归一到五类之一) 又要有问数字形态 (几次/多少)。命中时上层不走
 * Letta, 改走 canned 分类对账卡 (parts/category-query-turn.ts)。
 *
 * 触发克制 (红线):
 * - 品类词归一不到五类 (含 other) → 不命中, 回落到 57-c 原有月度总答
 * - 更强购物意图让路 (与 57-c 同款排除)
 * - "帮别人问" (朋友/同事…想问) 不触发 — 账是本人的账
 * - zh 走包含匹配, en 走词边界; 时间窗默认 thisMonth (周界与 57-c 同约定)
 */

import type { SavingsQueryWindow } from '@/types/savings-query';
import type { DimensionQueryCategory } from '@/types/dimension-query';

export interface CategoryQueryIntent {
  window: SavingsQueryWindow;
  category: DimensionQueryCategory;
}

/** 更强购物意图让路 (与 57-c savings-query-detector 同款) */
const YIELD_ZH: readonly RegExp[] = [
  /(该不该买|该买.{0,6}吗|要不要买|值得买吗)/,
  /还是.{1,24}(好|值|划算|呢|吗|\?|？)/,
];
const YIELD_EN: readonly RegExp[] = [
  /(?<![\w-])(?:should i buy|is it worth|worth buying)(?![\w-])/i,
  /\svs\.?\s/i,
];

/** 帮别人问不触发 (第三人称求问, 账不是本人的) */
const ASKING_FOR_OTHERS = /(朋友|同事|同学|家人|别人|她|他们)/;

/** 问数字形态 — 与品类词联合才命中 */
const QUERY_ZH = /(拦截|拦了|拦下|守护|省|花).{0,6}(几(次|回|单)|多少|多吗)/;
const QUERY_EN = /\bhow (?:many|much|often)\b.{0,60}\b(?:skip|skipped|stopped|blocked|intercepted|guarded|saved|spend|spent)\b/i;

/** 品类词表 (zh 包含匹配 / en 词边界); 命中多类取最长词命中的那类 */
const CATEGORY_KEYWORDS: ReadonlyArray<{ category: DimensionQueryCategory; zh: readonly string[]; en: readonly RegExp[] }> = [
  {
    category: 'food',
    zh: ['奶茶', '外卖', '咖啡', '零食', '饮料', '吃的', '食品', '生鲜', '夜宵', '甜点', '蛋糕'],
    en: [/milk ?tea|bubble ?tea|takeout|takeaway|coffee|snacks?|drinks?|food|groceries|desserts?/i],
  },
  {
    category: 'clothing',
    zh: ['衣服', '服装', '鞋', '裤', '裙', '外套', '穿搭', '买衣'],
    en: [/clothes|clothing|fashion|outfits?|shoes?|jackets?/i],
  },
  {
    category: 'electronics',
    zh: ['电子', '数码', '电器', '手机', '耳机', '电脑', '游戏机'],
    en: [/electronics|gadgets?|phones?|laptops?|headphones?|consoles?|tech/i],
  },
  {
    category: 'beauty',
    zh: ['美妆', '护肤', '化妆品', '口红', '香水', '彩妆'],
    en: [/beauty|skincare|makeup|cosmetics|lipsticks?/i],
  },
  {
    category: 'home',
    zh: ['家居', '家具', '收纳', '清洁', '纸巾', '日用品'],
    en: [/furniture|home decor|cleaning|tissues?|home goods/i],
  },
];

/** 时间窗 (顺序: 上周/上月 先于 本周/本月; 默认 thisMonth, 与 57-c 同约定) */
const WINDOW_ZH: ReadonlyArray<{ re: RegExp; window: SavingsQueryWindow }> = [
  { re: /上周|上一周/, window: 'lastWeek' },
  { re: /本周|这周|这一周/, window: 'thisWeek' },
  { re: /上个?月/, window: 'lastMonth' },
  { re: /本月|这个月|这月/, window: 'thisMonth' },
];
const WINDOW_EN: ReadonlyArray<{ re: RegExp; window: SavingsQueryWindow }> = [
  { re: /(?<![\w-])last week(?![\w-])/i, window: 'lastWeek' },
  { re: /(?<![\w-])(?:this|the past|past) week(?![\w-])/i, window: 'thisWeek' },
  { re: /(?<![\w-])last month(?![\w-])/i, window: 'lastMonth' },
  { re: /(?<![\w-])(?:this|the) month(?![\w-])/i, window: 'thisMonth' },
];

/**
 * 品类归一: 全串扫词, 多类命中取最长关键词; 无命中返回 null (回落 57-c)。
 * batch59-c 起导出 — follow-up-query 的裸品类词追问复用同一张词表 (单源)。
 */
export function resolveCategoryFromText(normalized: string): DimensionQueryCategory | null {
  let best: { category: DimensionQueryCategory; len: number } | null = null;
  for (const { category, zh, en } of CATEGORY_KEYWORDS) {
    for (const word of zh) {
      if (!normalized.includes(word)) continue;
      if (!best || word.length > best.len) best = { category, len: word.length };
    }
    for (const re of en) {
      const m = re.exec(normalized);
      if (!m) continue;
      if (!best || m[0].length > best.len) best = { category, len: m[0].length };
    }
  }
  return best?.category ?? null;
}

/**
 * 检测分类问句。命中返回 {window, category}, 未命中返回 null。
 * 纯函数: 只做字符串匹配, 不读状态不抛异常, 非字符串/空输入恒 null。
 */
export function detectCategoryQuery(userContent: string): CategoryQueryIntent | null {
  if (typeof userContent !== 'string' || userContent.trim().length === 0) return null;
  const normalized = userContent.toLowerCase().replace(/\s+/g, ' ').trim();

  if (YIELD_ZH.some((p) => p.test(normalized)) || YIELD_EN.some((p) => p.test(normalized))) return null;
  if (ASKING_FOR_OTHERS.test(normalized)) return null;

  const isZhQuery = QUERY_ZH.test(normalized);
  const isEnQuery = QUERY_EN.test(normalized);
  if (!isZhQuery && !isEnQuery) return null;

  const category = resolveCategoryFromText(normalized);
  if (!category) return null;

  let window: SavingsQueryWindow | null = null;
  for (const { re, window: w } of WINDOW_ZH) {
    if (re.test(normalized)) {
      window = w;
      break;
    }
  }
  if (!window) {
    for (const { re, window: w } of WINDOW_EN) {
      if (re.test(normalized)) {
        window = w;
        break;
      }
    }
  }
  return { window: window ?? 'thisMonth', category };
}
