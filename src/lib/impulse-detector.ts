export interface ImpulseEvent {
  id: string;
  platform: string;
  item: string;
  amount: number;
  timestamp: Date;
  category: string;
  isLivestream: boolean;
  isFlashSale: boolean;
  impulseScore: number;
  reasons: string[];
  /**
   * 🔧 PM-NEW-33 fix: 事件子类型, 用于显示不同图标
   * - 'impulse_purchase' (默认): 冲动消费 (receipt, actionable)
   * - 'refund_processed': 退款完成 (receipt, refunded)
   * - 'challenge_completed': 挑战完成 (health_event)
   * - 'challenge_failed': 挑战失败 (health_event)
   * - 'healing_kit': 治愈包使用 (health_event, future)
   */
  subType?: 'impulse_purchase' | 'refund_processed' | 'challenge_completed' | 'challenge_failed' | 'healing_kit';
}

export interface ImpulseRuleResult {
  score: number;
  reasons: string[];
}

const IMPULSIVE_CATEGORIES = [
  'Fashion & Accessories',
  'Beauty & Skincare',
  'Snacks & Treats',
  'Home Decor',
  'Phone Accessories',
  'Fitness Gadgets',
  'Novelty Items',
  'Collectibles',
];

const FLASH_SALE_KEYWORDS = [
  'flash sale',
  'limited time',
  'limited stock',
  'only today',
  'hurry',
  'last chance',
  'ending soon',
  'special offer',
  'deal of the day',
  'while supplies last',
  'doorbuster',
  'lightning deal',
  'today only',
  'final hours',
];

export function calculateImpulseScore(
  event: Omit<ImpulseEvent, 'impulseScore' | 'reasons' | 'id'>,
  previousEvents: ImpulseEvent[],
  averageOrderAmount: number
): ImpulseRuleResult {
  // Bug #4 修复：添加基础分 30，确保正常购买也有分数（而非全部 0）
  // 每一笔购买都有一定的被诱导可能性，0 分会让系统无法工作
  let score = 30;
  const reasons: string[] = ['Purchase detected'];

  // Rule 1: Late night (22:00-06:00) +30
  // 🔧 ARCH fix (Round 22 M1 — getHours() 用服务器时区, 应该用 UTC 避免时区不一致):
  //    Vercel 服务器是 UTC, getHours() 返回 UTC 小时。但用户可能在 UTC+8 (中国) — 凌晨 2 点
  //    的购买在 UTC 是 18:00 (前一天), 不被标记为深夜购买。
  //    根因修复: 用 getUTCHours() 明确用 UTC (与 Vercel 服务器一致)。
  //    注: 未来应从 profiles.timezone 读取用户时区, 但目前 UTC 是合理的默认 (比 getHours 更明确)。
  const hour = event.timestamp.getUTCHours();
  if (hour >= 22 || hour < 6) {
    score += 30;
    reasons.push('Late night purchase (22:00-06:00)');
  }

  // Rule 2: Amount > 2x average +20
  if (averageOrderAmount > 0 && event.amount > averageOrderAmount * 2) {
    score += 20;
    reasons.push(`Amount $${event.amount.toFixed(2)} exceeds 2x average ($${averageOrderAmount.toFixed(2)})`);
  }

  // Rule 3: Rapid orders (2+ in 1hr) +25
  const oneHourAgo = new Date(event.timestamp.getTime() - 60 * 60 * 1000);
  const recentOrders = previousEvents.filter(
    (e) => e.timestamp >= oneHourAgo && e.timestamp <= event.timestamp
  );
  if (recentOrders.length >= 1) {
    score += 25;
    reasons.push(`${recentOrders.length + 1} orders in the last hour`);
  }

  // Rule 4: Flash sale keywords +15
  if (event.isFlashSale) {
    score += 15;
    reasons.push('Flash sale / limited time offer detected');
  }

  // Rule 5: Impulsive category +10
  if (IMPULSIVE_CATEGORIES.includes(event.category)) {
    score += 10;
    reasons.push(`Impulsive category: ${event.category}`);
  }

  // Rule 6: Livestream purchase (TikTok) +20
  if (event.isLivestream) {
    score += 20;
    reasons.push('Livestream purchase detected');
  }

  // Cap at 100
  score = Math.min(score, 100);

  return { score, reasons };
}

// BUG-290 fix: 返回 CSS 自定义属性，支持 Light/Dark 双主题
// 之前返回硬编码 hex 颜色，在 Light Mode 下不可见
export function getScoreColor(score: number): string {
  if (score < 30) return 'var(--score-green, #27AE60)';
  if (score <= 60) return 'var(--score-yellow, #F39C12)';
  return 'var(--guard-gold, #B8860B)';
}

export function getScoreLabel(score: number, t?: (key: string) => string): string {
  if (score < 30) return t ? t('impulseDetector.scoreLabels.low') : 'Clean pass';
  if (score <= 60) return t ? t('impulseDetector.scoreLabels.moderate') : 'Worth another look';
  return t ? t('impulseDetector.scoreLabels.high') : 'Guard moment';
}

export function getImpulseLevel(score: number): 'stable' | 'alert' | 'success' {
  if (score > 60) return 'alert';
  if (score < 30) return 'success';
  return 'stable';
}

// 🔧 架构优化 (2026-06-30): localizeReasons 已删除 (死代码, 无 consumer)
// 之前: 把英文 reason 翻译为 i18n key, 但无任何文件 import 此函数

export { FLASH_SALE_KEYWORDS, IMPULSIVE_CATEGORIES };
