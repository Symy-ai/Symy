/**
 * chat-drift-guard — chat 话术漂移护栏
 *
 * 背景: AI 在连续对话中可能漂回促销/购买推动话术。
 * 本文件提供纯函数检测 + 替换映射，不依赖 DOM/React/网络。
 *
 * 约定:
 * - 命中漂移时返回对应守护叙事 fallback（来自 i18n 配置）。
 * - 同时记录本地日志事件 {ts, turnId, driftType, replacement}。
 * - 默认 fail-open：检测失败/无匹配时返回 null。
 */

import { logger } from './logger';

/** 已知漂移话术关键词/句式（大小写不敏感，按行匹配） */
const DRIFT_PATTERNS: Array<{ type: string; regex: RegExp }> = [
  {
    type: 'sales_push',
    regex:
      /\b(limited[ -]time offer|flash sale|buy now|order now|don't miss out|hurry|exclusive deal|special pricing|today only|clearance|discount code|coupon|promo code|free shipping on orders|deal of the day|doorbuster|act now|sale ends|% off|percent off)\b/i,
  },
  {
    type: 'urgency_pressure',
    regex:
      /\b(only \d+ left|selling fast|almost gone|stock is low|limited stock|while supplies last|last chance|final hours|ends tonight|ends today|countdown|almost sold out)\b/i,
  },
  {
    type: 'purchase_pressure',
    regex:
      /\b(you should buy|you need to buy|best time to buy|you can't miss|add to cart now|complete your purchase|checkout now|claim this offer|redeem this deal|grab it now|get it before)\b/i,
  },
  {
    type: 'promotional_imperative',
    regex:
      /\b(save big|big savings|massive discount|huge discount|best price|lowest price|price drop|price cut|markdown|special offer|limited offer|bonus offer|free gift|free bonus|extra savings|instant savings|deal alert|hot deal)\b/i,
  },
];

/** 漂移类型 → 守护叙事 fallback */
export const DRIFT_REPLACEMENTS: Record<string, string> = {
  sales_push: 'This moment is yours to choose — not to rush.',
  urgency_pressure: 'The clock is loud. Your choice doesn’t need to be.',
  purchase_pressure: 'You already know what matters. The rest can wait.',
  promotional_imperative: 'Savings that feel like pressure aren’t savings.',
};

/**
 * applyDriftGuard — 对单条 AI 回复执行漂移检测
 *
 * @param content 原始回复文本
 * @param turnId 本轮对话标识（用于日志关联）
 * @returns 命中时返回 driftType，未命中返回 null
 */
export function applyDriftGuard(content: string, turnId: string): string | null {
  if (!content || !content.trim()) {
    return null;
  }

  const trimmed = content.trim();
  for (const pattern of DRIFT_PATTERNS) {
    if (pattern.regex.test(trimmed)) {
      const replacement = DRIFT_REPLACEMENTS[pattern.type] || trimmed;
      logger.warn('[chat-drift-guard] drift detected', {
        ts: new Date().toISOString(),
        turnId,
        driftType: pattern.type,
        replacement,
      });
      return pattern.type;
    }
  }

  return null;
}
