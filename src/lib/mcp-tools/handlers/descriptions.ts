/**
 * MCP 工具 description 多语言生成 — 小象守护版
 *
 * 小象守护规则:
 * - 不用"挑战完成"/"saved" — 用"你守住了" (You held the gate)
 * - 不用"挑战失败" — 这次直接买了，下次先停一停 — 小象不评判, 只守护
 * - 金额必伴随生命翻译: "$35 · 1.8 hours of life"
 * - 简短, 直接, 无评判
 *
 * Letta Agent 从 Context prefix 读 locale + hourly_rate，调用 MCP 工具时传 args。
 */

import type { Locale } from '@/i18n/config';
import { DEFAULT_HOURLY_RATE } from '@/lib/freedom-time';
export type { Locale };

/**
 * 从 MCP 工具参数提取 locale（fallback，优先用 getUserLocale 从 DB 读）
 */
export function getLocaleFromArgs(args: Record<string, unknown>): Locale {
  const locale = args.locale as string | undefined;
  return locale === 'zh' ? 'zh' : 'en';
}

/**
 * 从 MCP 工具参数提取 hourlyRate（用户时薪, 用于生命翻译）
 *
 * 🔧 P0-3 fix: 返回 `undefined`（而非 DEFAULT_HOURLY_RATE）当参数缺失时，
 *    使调用方的 `getHourlyRateFromArgs(args) || await getUserHourlyRate(userId)` 能正确 fallback。
 *    旧代码返回 20（truthy），导致 `||` 永远不触发 fallback → 事件日志始终用 $20/hr 计算，
 *    与聊天路径（正确读取用户 $50/hr）不一致。
 */
export function getHourlyRateFromArgs(args: Record<string, unknown>): number | undefined {
  const rate = args.hourlyRate as number | undefined;
  if (typeof rate === 'number' && rate > 0 && rate <= 10000) return rate;
  return undefined;
}

/**
 * 🔧 P0-3: 共享生命小时数计算函数 — 所有需要计算「生命小时数」的地方必须调用此函数。
 * 禁止在多处各自实现 `amount / hourlyRate`。
 *
 * 🔧 P0-2 fix (2026-07-17): 防御性编程 — 拒绝 NaN/Infinity/极端值。
 *   历史脏数据 (如 "A 00 gaming console · $300 · 0.1h") 的 0.1h 无法用任何
 *   正常时薪解释 ($300/0.1h = $3000/hr, 远超合理范围)。
 *   根因可能是历史 hourlyRate 误传 (如 0.1 而非 25) 或浮点精度问题。
 *   修复: 严格校验输入, 异常输入 fallback 到 DEFAULT_HOURLY_RATE, 并对结果 clamp。
 *
 * @param price  金额（美元, ≥0, 有限数）
 * @param hourlyRate  用户时薪（美元/小时, >0, ≤10000, 有限数）
 * @returns 生命小时数（>=0 的有限数）
 */
export function calcLifeHours(price: number, hourlyRate: number): number {
  // 严格校验 hourlyRate: 必须是有限正数, 且在合理范围 (避免 $0.1/hr 或 $99999/hr 这类异常)
  const isValidRate = (
    typeof hourlyRate === 'number' &&
    Number.isFinite(hourlyRate) &&
    hourlyRate > 0 &&
    hourlyRate <= 10000
  );
  const rate = isValidRate ? hourlyRate : DEFAULT_HOURLY_RATE;

  // 严格校验 price: 必须是有限非负数
  const isValidPrice = (
    typeof price === 'number' &&
    Number.isFinite(price) &&
    price >= 0
  );
  const p = isValidPrice ? price : 0;

  const hours = p / rate;
  // 最终兜底: 确保结果是有限非负数 (防 NaN/Infinity 通过)
  if (!Number.isFinite(hours) || hours < 0) return 0;
  return hours;
}

/**
 * 🔧 P0-2 fix (2026-07-17): 生成生命小时数 snapshot metadata。
 *   事件创建时把 hourly_rate + hours 一起持久化到 metadata,
 *   前端展示时优先用 snapshot (保证历史一致性), 并加 "at $X/hr then" 透明标注。
 *
 *   为什么不重算: 时薪变更后, 历史事件如果按新时薪重算, 会让用户疑惑
 *   "为什么这件事的 hours 变了?" 保留 snapshot 让用户看到「当时是这个时薪算的」。
 *
 * @param amount  金额
 * @param hourlyRate  时薪
 * @returns 含 hourly_rate_snapshot + hours_snapshot 的对象 (可合并到 metadata)
 */
export function buildLifeHoursSnapshotMeta(amount: number, hourlyRate: number): {
  hourly_rate_snapshot: number;
  hours_snapshot: number;
} {
  const rate = (
    typeof hourlyRate === 'number' &&
    Number.isFinite(hourlyRate) &&
    hourlyRate > 0 &&
    hourlyRate <= 10000
  ) ? hourlyRate : DEFAULT_HOURLY_RATE;
  return {
    hourly_rate_snapshot: rate,
    hours_snapshot: calcLifeHours(amount, rate),
  };
}

/**
 * 格式化生命时间: 金额 → 小时数 (1 decimal)
 * $35 / $25/hr = 1.4 → "1.4 hours"
 * $8 / $25/hr = 0.32 → "0.3 hours" (不到 1 小时仍显示小数)
 *
 * 🔧 P0-3: 内部调用 calcLifeHours 确保计算逻辑统一。
 */
function formatLifeHours(amount: number, hourlyRate: number, locale: Locale): string {
  const hours = calcLifeHours(amount, hourlyRate);
  const hoursStr = hours.toFixed(1);
  return locale === 'zh' ? `${hoursStr} 小时生命` : `${hoursStr} hours of life`;
}

// ============================================================
// complete_challenge description — 小象守护版
// ============================================================

export function challengeCompletedDesc(
  locale: Locale,
  challengeType: string,
  savedAmount: number,
  itemName: string | undefined,
  _tokenReward: number,
  _vitalityReward: number,
  _xpReward: number,
  hourlyRate: number = DEFAULT_HOURLY_RATE,
): string {
  const lifeStr = formatLifeHours(savedAmount, hourlyRate, locale);
  if (locale === 'zh') {
    return `你守住了${itemName ? ` ${itemName}` : ''} · $${savedAmount} · ${lifeStr}`;
  }
  return `You held the gate on${itemName ? ` ${itemName}` : ''} · $${savedAmount} · ${lifeStr}`;
}

/**
 * 🔧 小象守护: 没有"挑战失败" — 这次直接买了，下次先停一停
 * 旧代码: "Challenge failed: boss. Item: iPhone 16 Pro. Vitality decreased."
 * 新代码: "You didn't see iPhone 16 Pro · $999 · 50.0 hours of life"
 * 英文: "X went straight through — next time pause with Symy first"
 * 中文: "这次 X 买得急，下次小象陪你先停一停"
 */
export function challengeFailedDesc(
  locale: Locale,
  _challengeType: string,
  itemName: string | undefined,
  amount: number = 0,
  hourlyRate: number = DEFAULT_HOURLY_RATE,
): string {
  const lifeStr = amount > 0 ? formatLifeHours(amount, hourlyRate, locale) : '';
  if (locale === 'zh') {
    return `这次${itemName ? ` ${itemName}` : ''}买得急，下次小象陪你先停一停${amount > 0 ? ` · $${amount} · ${lifeStr}` : ''}`;
  }
  return `${itemName ? `${itemName} ` : ''}went straight through — next time pause with Symy first${amount > 0 ? ` · $${amount} · ${lifeStr}` : ''}`;
}

// ============================================================
// add_tokens description — 小象守护版
// ============================================================

export function tokensAwardedDesc(
  locale: Locale,
  amount: number,
  reason: string,
  _vitalityBoost: number,
  _xpGain: number,
): string {
  if (locale === 'zh') {
    const reasonMap: Record<string, string> = { survival: '生存', growth: '成长', pleasure: '愉悦' };
    const r = reasonMap[reason] || reason;
    return `+${amount} 代币（${r}）`;
  }
  return `+${amount} tokens (${reason})`;
}

// ============================================================
// add_vitality description — 小象守护版
// ============================================================

export function vitalityAdjustedDesc(
  locale: Locale,
  amount: number,
  newVitality: number | undefined,
  _reason: string,
): string {
  // 🔧 P0-2 fix: nullish coalescing on BOTH locales — old EN path rendered "undefined"
  const newVitStr = newVitality ?? '?';
  if (locale === 'zh') {
    return `守护力 ${amount > 0 ? '+' : ''}${amount} → ${newVitStr}`;
  }
  return `Guard ${amount > 0 ? '+' : ''}${amount} → ${newVitStr}`;
}

// ============================================================
// add_dream_fund_progress description — 小象守护版
// ============================================================

export function dreamFundProgressDesc(
  locale: Locale,
  amount: number,
  fundName: string,
  progress: number,
  _badgeAwarded: boolean,
  hourlyRate: number = DEFAULT_HOURLY_RATE,
): string {
  const lifeStr = formatLifeHours(amount, hourlyRate, locale);
  if (locale === 'zh') {
    return `向"${fundName}"存入 $${amount} · ${lifeStr} · 进度 ${progress}%`;
  }
  return `Added $${amount} to "${fundName}" · ${lifeStr} · ${progress}%`;
}

// ============================================================
// add_badge description — 小象守护版
// ============================================================

export function badgeUnlockedDesc(
  locale: Locale,
  badgeName: string,
): string {
  if (locale === 'zh') {
    return `徽章：${badgeName}`;
  }
  return `Badge: ${badgeName}`;
}

// ============================================================
// record_impulse description — 小象守护版
// ============================================================

export function impulseRecordedDesc(
  locale: Locale,
  amount: number,
  platform: string,
  impulseScore: number,
  vitalityPenalty: number,
  _newVitality?: number | undefined,
  hourlyRate: number = DEFAULT_HOURLY_RATE,
): string {
  const lifeStr = formatLifeHours(amount, hourlyRate, locale);
  // 🔧 P0-2 ROOT CAUSE FIX: Remove "→ newVitality" from description entirely.
  //   Why: newVitality is NOT available when description is generated (it's
  //   computed inside createHealthEvent RPC). Passing undefined → "undefined"
  //   string in DB. The UI already shows vitalityChange separately via
  //   event.vitalityChange, so the "→ X" in description is redundant AND buggy.
  //   The newVitality field is available in the health event data (event.newVitality)
  //   for any UI that needs it.
  if (locale === 'zh') {
    if (impulseScore < 60) {
      return `你守住了 $${amount}（${platform}）· ${lifeStr}`;
    }
    // 🔧 P2-2 fix: "清晰度" → "心情" (与 Buddy 页面 "Symy 心情" UI 一致)
    return `这次买得急，下次小象陪你先停一停 · $${amount}（${platform}）· ${lifeStr} · 心情 ${vitalityPenalty > 0 ? '-' : ''}${vitalityPenalty}`;
  }
  if (impulseScore < 60) {
    return `You held the gate on $${amount} on ${platform} · ${lifeStr}`;
  }
  // 🔧 P2-2 fix: "clarity" → "mood" (与 Buddy 页面 "Symy mood" UI 一致)
  return `This one went straight through — next time pause with Symy first · $${amount} on ${platform} · ${lifeStr} · mood ${vitalityPenalty > 0 ? '-' : ''}${vitalityPenalty}`;
}

// ============================================================
// Email receipt event descriptions — 小象守护版
// ============================================================

/**
 * 诱导消费伤害事件描述 (email scan 检测到 score >= 60 的收据时)
 */
export function impulseDamageDesc(
  locale: Locale,
  amount: number,
  platform: string,
  itemName?: string,
  hourlyRate: number = DEFAULT_HOURLY_RATE,
): string {
  const lifeStr = formatLifeHours(amount, hourlyRate, locale);
  if (locale === 'zh') {
    return `这次${itemName ? ` ${itemName}` : ''}买得急，下次小象陪你先停一停 · $${amount.toFixed(2)} · ${lifeStr}（${platform}）`;
  }
  return `${itemName ? `${itemName} ` : ''}went straight through — next time pause with Symy first · $${amount.toFixed(2)} · ${lifeStr} (${platform})`;
}

/**
 * 退款恢复事件描述 (用户标记 receipt 为 refunded 时)
 */
export function refundBoostDesc(
  locale: Locale,
  amount: number,
  platform: string,
  itemName?: string,
  hourlyRate: number = DEFAULT_HOURLY_RATE,
): string {
  const lifeStr = formatLifeHours(amount, hourlyRate, locale);
  if (locale === 'zh') {
    return `退款到账${itemName ? ` ${itemName}` : ''} · $${amount.toFixed(2)} · ${lifeStr}（${platform}）`;
  }
  return `Refund received${itemName ? ` ${itemName}` : ''} · $${amount.toFixed(2)} · ${lifeStr} (${platform})`;
}

/**
 * 理性消费恢复事件描述 (用户标记 receipt 为 ignored 且 score >= 60 时)
 */
export function mindfulRecoveryDesc(
  locale: Locale,
  amount: number,
  platform: string,
  hourlyRate: number = DEFAULT_HOURLY_RATE,
): string {
  const lifeStr = formatLifeHours(amount, hourlyRate, locale);
  if (locale === 'zh') {
    return `你守住了 $${amount.toFixed(2)} · ${lifeStr}（${platform}）`;
  }
  return `You held the gate on $${amount.toFixed(2)} · ${lifeStr} (${platform})`;
}
