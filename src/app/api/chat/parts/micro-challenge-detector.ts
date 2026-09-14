/**
 * micro-challenge-detector — chat 内微型守护挑战卡提案 (服务端 part, 纯函数)
 *
 * 陪伴叙事: 用户聊到明确购买意图 + 可识别品类时, 小象递上一张 24 小时微挑战卡
 * ("今天不买新衣服, 明天告诉我感觉")。与 green_alt/reuse_hint 同路数: 发 Letta 前
 * 预检, 命中时 SSE 流最前注入 micro_challenge 事件 / 非流式 JSON microChallenge 字段。
 *
 * 触发克制 (红线):
 * - 消息必须含明确购买意图词 — 闲聊零触发
 * - 品类必须命中守护账本的品类词表 (normalizeInterceptCategory), 'default' 不发起
 * - 同一品类 7 天内已发起过 → 频控不发
 *
 * 绿色守护开关 (symy_green_pref) 由调用方判断 — off 时不调用本文件, 整卡静默。
 */

import { normalizeInterceptCategory } from '@/features/butterfly/green-alt-copy';
import type {
  MicroChallengeCategory,
  MicroChallengeHistoryEntry,
  MicroChallengeProposal,
} from '@/types/micro-challenge';

/** 同品类冷却窗口: 7 天内不重复发起 */
export const MICRO_CHALLENGE_COOLDOWN_MS = 7 * 24 * 60 * 60 * 1000;

/** 可发起微挑战的品类 (与守护账本 InterceptCategory 对齐, 'default' 排除) */
const MICRO_CATEGORIES: readonly MicroChallengeCategory[] = ['electronics', 'clothing', 'beauty', 'home', 'food'];

/** 明确购买意图词 — zh 走包含匹配, en 走词边界匹配 (防 "buyer's remorse" 外的误中太宽) */
const PURCHASE_INTENT_ZH: readonly string[] = ['买', '下单', '剁手', '想入手', '购物车', '囤货'];
const PURCHASE_INTENT_EN: readonly RegExp[] = [
  /(?<![\w-])(?:buy|buys|buying|bought)(?![\w-])/i,
  /(?<![\w-])(?:purchase|purchasing)(?![\w-])/i,
  /(?<![\w-])(?:order|ordering|checkout)(?![\w-])/i,
  /(?<![\w-])add\s+to\s+cart(?![\w-])/i,
  /(?<![\w-])(?:splurging|splurge)(?![\w-])/i,
];

/** 是否含明确购买意图 (纯函数, 空输入 false) */
export function hasPurchaseIntent(userContent: string): boolean {
  if (typeof userContent !== 'string' || userContent.trim().length === 0) return false;
  const normalized = userContent.toLowerCase().replace(/\s+/g, ' ').trim();
  return (
    PURCHASE_INTENT_ZH.some((w) => normalized.includes(w)) ||
    PURCHASE_INTENT_EN.some((p) => p.test(normalized))
  );
}

export interface DetectMicroChallengeInput {
  userContent: string;
  /** 最近已发起的微挑战 (频控用; 缺省/空数组 = 无历史) */
  recentMicroChallenges?: readonly MicroChallengeHistoryEntry[];
  /** 可注入时钟 (测试用), 缺省 Date.now */
  now?: number;
}

/**
 * 预检用户消息, 命中时返回微挑战卡提案, 否则 null。
 * 纯函数: 只做字符串匹配 + 历史比对, 不读库、不改状态、不抛异常。
 */
export function detectMicroChallenge(input: DetectMicroChallengeInput): MicroChallengeProposal | null {
  const { userContent, recentMicroChallenges, now } = input;
  if (!hasPurchaseIntent(userContent)) return null;

  const rawCategory = normalizeInterceptCategory(userContent);
  const category = MICRO_CATEGORIES.find((c) => c === rawCategory);
  if (!category) return null;

  const currentTime = typeof now === 'number' ? now : Date.now();
  const inCooldown = (recentMicroChallenges ?? []).some(
    (entry) =>
      entry &&
      entry.category === category &&
      typeof entry.initiatedAt === 'number' &&
      currentTime - entry.initiatedAt < MICRO_CHALLENGE_COOLDOWN_MS,
  );
  if (inCooldown) return null;

  return {
    category,
    titleKey: `chat.microChallenge.body.${category}`,
    durationHours: 24,
  };
}

/** micro_challenge SSE 事件的 payload 形状 (consume-ai-stream 按 type 分发) */
export interface MicroChallengeSseEvent {
  type: 'micro_challenge';
  microChallenge: MicroChallengeProposal;
}

export function microChallengeSseEvent(proposal: MicroChallengeProposal): MicroChallengeSseEvent {
  return { type: 'micro_challenge', microChallenge: proposal };
}
