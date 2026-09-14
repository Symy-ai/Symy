/**
 * reuse-advisor — 复用优先决策树 (入口, 纯函数)
 *
 * 复用优先 (reuse-first): 二手/租赁能解决的不引导新购; 用户已有物品
 * 能组合的直接给复用方案。源头减购。规则数据在 reuse-categories.ts,
 * 本文件只做匹配 + 里子换算 (省下的钱 → 自由时间小时数)。
 *
 * 用法:
 *   const hint = suggestReuse('想买个电钻', 'zh');
 *   if (hint) 卡片直接渲染 hint.suggestions / hint.hoursLabel;
 *
 * 设计 (与 green-alternatives.ts 同一套路数):
 * - 纯函数, 无 IO, 无状态 — 可在 API route、前端、测试任意复用
 * - trigger 匹配同时看 zh + en 词表; en 词走词边界匹配 (防 "attention"
 *   误中 "tent"), zh 词走包含匹配 (中文无词边界)
 * - locale 只控制输出文案语言, 不控制匹配范围
 * - 里子: typicalSavedAmountUSD (类目均价价差估算) 经 freedom-time 的
 *   moneyToFreedomLabel 官方换算成「约省 X 小时自由时间」— 服务端算好
 *   string 进卡, 前端不重复换算
 *
 * 红线: 不带平台链接/佣金追踪; 不编碳足迹数值; 话术荣誉框架不说教。
 */

import { DEFAULT_HOURLY_RATE, moneyToFreedomLabel } from './freedom-time';
import {
  REUSE_CATEGORIES,
  REUSE_HONEST_NOTE,
  type ReuseCategory,
  type ReuseLocale,
} from './reuse-categories';

export type { ReuseCategory, ReuseLocale };

/** suggestReuse 的输出 — 也是聊天 reuse_hint SSE 事件 / message.reuseHint 的 payload。
 *  locale 相关文案 (categoryLabel/suggestions/hoursLabel/reuseHonestNote) 由
 *  suggestReuse 按 locale 一次性渲染好, 消费方 (前端卡片) 直接展示。 */
export interface ReuseHint {
  /** 命中类目恒为 true (字段保留给未来"不命中也返回"的调用方) */
  shouldSuggestReuse: boolean;
  /** 命中的类目 id */
  category: ReuseCategory;
  /** 类目显示名 (locale 语言) */
  categoryLabel: string;
  /** 复用/已有物品组合建议 (荣誉框架话术, locale 语言) */
  suggestions: string[];
  /** 荣誉注脚 — 夸"会安排", 不说教 (locale 语言) */
  reuseHonestNote?: string;
  /** 「约省 X 小时自由时间」— typicalSavedAmountUSD 经 moneyToFreedomLabel 换算 */
  hoursLabel?: string;
}

/** en trigger 匹配用小写归一化 (与 green-alternatives 一致) */
function normalizeQuery(query: string): string {
  return query.toLowerCase().replace(/\s+/g, ' ').trim();
}

/**
 * ASCII (en) trigger → 词边界 + 容忍复数的正则; zh trigger → 原样包含匹配。
 * 自定义边界 (?<![\w-]) / (?![\w-]): \b 会把 "e-book" 这类连字符词切碎;
 * (?:s|es)? 容忍复数 ("tents"/"drills"), 同时 "attention" 不会误中 "tent"。
 */
function compileTrigger(trigger: string): { zh: string } | { en: RegExp } {
  if (!/^[\x20-\x7E]+$/.test(trigger)) return { zh: trigger };
  const escaped = trigger.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return {
    en: new RegExp(`(?<![\\w-])${escaped}(?:s|es)?(?![\\w-])`, 'i'),
  };
}

interface CompiledRule {
  id: ReuseCategory;
  zhTriggers: readonly string[];
  enPatterns: RegExp[];
}

const COMPILED_RULES: readonly CompiledRule[] = REUSE_CATEGORIES.map((rule) => {
  const compiled = [...rule.triggers.zh, ...rule.triggers.en].map(compileTrigger);
  return {
    id: rule.id,
    zhTriggers: compiled.flatMap((c) => ('zh' in c ? [c.zh] : [])),
    enPatterns: compiled.flatMap((c) => ('en' in c ? [c.en] : [])),
  };
});

function matchRule(normalized: string): ReuseCategory | null {
  const hit = COMPILED_RULES.find(
    (rule) =>
      rule.zhTriggers.some((t) => normalized.includes(t)) ||
      rule.enPatterns.some((p) => p.test(normalized)),
  );
  return hit ? hit.id : null;
}

/**
 * 在购物意图文本里找可复用品类, 命中则给复用建议; 未命中返回 null。
 *
 * 纯函数: 只做字符串匹配 + 表查找, 不读库、不改状态、不抛异常
 * (空/异常输入一律 null)。
 *
 * @param query 用户消息或商品名 (中英混排均可)
 * @param locale 输出文案语言, 默认 zh
 * @param hourlyRate 自由时间换算时薪 (默认 $25/hr, 聊天路由传用户时薪)
 */
export function suggestReuse(
  query: string,
  locale: ReuseLocale = 'zh',
  hourlyRate: number = DEFAULT_HOURLY_RATE,
): ReuseHint | null {
  if (typeof query !== 'string' || query.trim().length === 0) return null;
  const normalized = normalizeQuery(query);
  if (normalized.length === 0) return null;

  const category = matchRule(normalized);
  if (!category) return null;

  const rule = REUSE_CATEGORIES.find((entry) => entry.id === category);
  if (!rule) return null;

  // 里子: 类目价差 → 自由时间 (官方换算; 估算值, 卡内以「约」呈现)
  const rate = Number.isFinite(hourlyRate) && hourlyRate > 0 ? hourlyRate : DEFAULT_HOURLY_RATE;
  const hoursLabel = locale === 'zh'
    ? `约省 ${moneyToFreedomLabel(rule.typicalSavedAmountUSD, 'zh', rate)}自由时间`
    : `≈ ${moneyToFreedomLabel(rule.typicalSavedAmountUSD, 'en', rate)} of freedom time back`;

  return {
    shouldSuggestReuse: true,
    category,
    categoryLabel: rule.label[locale],
    suggestions: [...rule.suggestions[locale]],
    reuseHonestNote: REUSE_HONEST_NOTE[locale],
    hoursLabel,
  };
}
