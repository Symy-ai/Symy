/**
 * guard-intensity — 守护强度三档 (batch48-a) 的纯函数 SSOT
 *
 * 档位语义 (荣誉框架, 零羞辱表述):
 * - gentle   点到为止: 只发一次替代建议, 不追问, 不推挑战
 * - balanced 默认, 与现状行为逐字节一致 (prompt 不注入指令行, 拦截卡不加尾句)
 * - strict   严格守护: prompt 注入主动追问 + 24h 微挑战引导; 拦截卡尾部追加挑战入口
 *
 * 持久化: localStorage ('symy-guard-intensity', 见 hooks/use-guard-intensity.ts),
 * 与绿色守护开关同一零 DDL 通路 — 服务端经 chat 请求 body.guardIntensity 感知。
 *
 * 本文件零依赖 (仅类型导入), 服务端 prompt 组装与前端拦截卡共用。
 */

import type { MicroChallengeCategory } from '@/types/micro-challenge';

export type GuardIntensity = 'gentle' | 'balanced' | 'strict';

export const DEFAULT_GUARD_INTENSITY: GuardIntensity = 'balanced';

export const GUARD_INTENSITIES: readonly GuardIntensity[] = ['gentle', 'balanced', 'strict'];

export function isGuardIntensity(value: unknown): value is GuardIntensity {
  return typeof value === 'string' && (GUARD_INTENSITIES as readonly string[]).includes(value);
}

/** 缺失/损坏输入 → balanced (与现状一致的降级语义) */
export function normalizeGuardIntensity(value: unknown): GuardIntensity {
  return isGuardIntensity(value) ? value : DEFAULT_GUARD_INTENSITY;
}

/**
 * Letta turn-context 的档位指令行。
 * balanced 返回空串 (prompt 组装处 filter(Boolean) 掉) — 保证默认档行为与
 * 现状逐字节一致 (AC2 回归锚点)。
 */
export function buildGuardIntensityPromptLine(level: GuardIntensity): string {
  switch (level) {
    case 'gentle':
      return '[GUARD INTENSITY: gentle — the user prefers minimal interruption. Offer ONE alternative suggestion, then stop. Do NOT repeat the suggestion, do NOT ask follow-up questions, and do NOT propose challenges in this turn.]';
    case 'strict':
      return '[GUARD INTENSITY: strict — the user chose strict guarding as an honor stance, so be more proactive. After the alternative suggestion, follow up with one short check-in question, and if they hesitate, warmly invite a 24-hour micro challenge ("要不要来个 24 小时小挑战？"). Still zero shame framing — guarding is an honor, never a lecture.]';
    default:
      return '';
  }
}

/** 拦截卡 (GreenAltCard) 是否追加 24h 微挑战入口尾句 — 仅 strict */
export function shouldShowChallengeInvite(level: GuardIntensity): boolean {
  return level === 'strict';
}

/** gentle 档隐藏采纳确认追问行; balanced/strict 保持现状 (AC2 回归锚点) */
export function shouldShowAdoptConfirm(level: GuardIntensity): boolean {
  return level !== 'gentle';
}

/**
 * 绿色替代卡 id → 微挑战品类映射 (strict 尾句入口复用既有 MicroChallengeCard)。
 * 覆盖 green-alt-entries-* 已注册的全部 id; 未知 id 保守映射 'home'
 * (24h 微挑战文案对任何品类都不含羞辱表述, 错档不伤体验)。
 */
export function greenAltIdToMicroChallengeCategory(id: string): MicroChallengeCategory {
  if (/^(beauty_refill|solid_cleanser|skincare_hoard|lipstick_makeup|sheet_mask_pile)$/.test(id)) return 'beauty';
  if (/^(repair_first|refurb_gadget|secondhand_audio_tablet|trade_in_upgrade|cable_hoard)$/.test(id)) return 'electronics';
  if (/^(milk_tea|takeout_meal|bottled_water|coffee_shop|snack_hoarding)$/.test(id)) return 'food';
  if (/^(fast_fashion|fur)$/.test(id)) return 'clothing';
  return 'home';
}
