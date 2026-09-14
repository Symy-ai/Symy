/**
 * Buddy State 共享默认值和常量
 *
 * 单一来源：health-impact.ts, mcp-tools.ts, use-buddy-state.ts, buddy-sync.ts
 * 全部从这里导入，避免默认值漂移。
 */

// 默认 vitality
export const DEFAULT_VITALITY = 72;

// 默认 tokens
export const DEFAULT_TOKENS = 156;

// 默认 health
export const DEFAULT_HEALTH = 'healthy';

// 默认 level
export const DEFAULT_LEVEL = 1;

// 默认 xp
export const DEFAULT_XP = 0;

// 默认 xp_to_next
export const DEFAULT_XP_TO_NEXT = 100;

// 默认 streak
export const DEFAULT_STREAK = 0;

// 默认 dream funds
// 🔧 Bug 7 根因修复: 添加 'Savings' 无上限溢出基金
//   旧代码只有 df-1 (Credit Card Payoff $2000) + df-2 (Iceland Trip $5000)
//   问题: RPC apply_buddy_state_delta 用 LEAST(target, current+delta) clamp current,
//     当 fund.current 达到 target 后, 多余的 savedAmount 被 LEAST 吞掉 →
//     buddy_state.total_saved 持续累加, 但 sum(dreamFunds.current) 不变 → 两者 drift。
//   修复: 加一个 'Savings' 基金 (target=$1,000,000, 实际无上限),
//     RPC 'auto' 逻辑选 "first current<target" fund 时, 当 df-1/df-2 满后会自动选 Savings,
//     多余的 savedAmount 流入 Savings → total_saved 与 sum(dreamFunds.current) 始终一致。
//   Savings 基金也可作为通用储蓄罐 (用户不指定具体目标时存这里)。
export const DEFAULT_DREAM_FUNDS = [
  { id: 'df-1', name: 'Credit Card Payoff', target: 2000, current: 0, emoji: '💳' },
  { id: 'df-2', name: 'Iceland Trip', target: 5000, current: 0, emoji: '🏔️' },
  { id: 'df-savings', name: 'Savings', target: 2147483647, current: 0, emoji: '🏦' },
];

// 🔧 Bug 7: Savings 基金的固定 ID (用于 migration 回填 + RPC 识别)
export const SAVINGS_FUND_ID = 'df-savings';
// 🔧 CL4 fix: Savings 基金 target = PostgreSQL INTEGER 最大值 (2147483647, 约 21 亿)
//   UI 显示 ∞, DB 存最大值 (CHECK 约束 target <= 2147483647)
export const SAVINGS_FUND_TARGET = 2147483647;

// 默认 badges
export const DEFAULT_BADGES: string[] = [];

// 默认 total_saved
export const DEFAULT_TOTAL_SAVED = 0;

// 默认 challenges_completed
export const DEFAULT_CHALLENGES_COMPLETED = 0;

// P1-5: 默认成长阶段
export const DEFAULT_GROWTH_STAGE = 'baby' as const;

// P1-5: 默认个性 (未觉醒)
export const DEFAULT_PERSONALITY = 'unknown' as const;

// P1-5: 默认亲密度
export const DEFAULT_INTIMACY = 0;

// P1-5: 默认日常需求 (满)
export const DEFAULT_DAILY_NEEDS = { clarity: 100, connection: 100 } as const;

// P1-5: 默认主动留言数组
export const DEFAULT_PROACTIVE_MESSAGES: readonly never[] = [];

// P1-5: 日常需求衰减量 (每日)
export const DAILY_NEEDS_DECAY_AMOUNT = 20;

// P1-5: 日常需求补充量
export const NEED_REPLENISH_AMOUNT = {
  clarity: 20,    // See it / Challenge
  connection: 15, // Pet Symy / reflection
} as const;

// P1-5: 成长阶段阈值 (基于 level)
export const GROWTH_STAGE_THRESHOLDS = {
  baby: 1,     // level 1-5
  young: 6,    // level 6-15
  adult: 16,   // level 16-40
  elder: 41,   // level 41+
} as const;

/**
 * 从 vitality 值计算健康等级
 * 单一来源，所有文件统一使用
 */
export type { BuddyHealth } from '@/types/buddy-state';
import type { BuddyHealth } from '@/types/buddy-state';

export function getHealthFromVitality(v: number): BuddyHealth {
  // 🔧 ARCH fix (Round 18 M5): NaN 比较全部 false → 返回 'thriving' (最健康)
  //    根因修复: NaN/非有限数 → 'dormant' (最安全 fallback)
  if (!Number.isFinite(v) || v <= 0) return 'dormant';
  if (v <= 20) return 'critical';
  if (v <= 45) return 'weak';
  if (v <= 75) return 'healthy';
  return 'thriving';
}

/**
 * 被诱导消费惩罚公式 — 单一来源
 *
 * 根据 impulse score 和金额计算 vitality 损伤。
 * 所有路径（email scan, chat MCP, health-events API）统一使用此公式。
 *
 * | Score Range | Base Damage |
 * |-------------|-------------|
 * | 90-100      | -15         |
 * | 80-89       | -10         |
 * | 70-79       | -7          |
 * | 60-69       | -4          |
 * | <60         | 0 (非被诱导)   |
 *
 * 金额加成: >$50: -1, >$100: -3, >$200: -5
 */
export function calculateImpulseDamage(impulseScore: number, amount: number): number {
  let damage = 0;
  if (impulseScore >= 90) damage = -15;
  else if (impulseScore >= 80) damage = -10;
  else if (impulseScore >= 70) damage = -7;
  else if (impulseScore >= 60) damage = -4;
  else return 0;

  if (amount > 200) damage -= 5;
  else if (amount > 100) damage -= 3;
  else if (amount > 50) damage -= 1;

  return damage;
}

/**
 * 退款恢复公式
 */
export function calculateRefundBoost(amount: number): number {
  let boost = 5;
  if (amount > 200) boost += 8;
  else if (amount > 100) boost += 5;
  else if (amount > 50) boost += 3;
  return boost;
}

/**
 * 理性消费恢复公式
 */
export function calculateMindfulRecovery(impulseScore: number): number {
  if (impulseScore >= 80) return 8;
  if (impulseScore >= 60) return 5;
  return 3;
}

/**
 * 被动恢复公式（基于连续天数）
 */
export function calculatePassiveRecovery(streak: number): number {
  if (streak <= 0) return 0;
  return Math.min(streak, 10);
}

// ============================================================
// P1-5: 宠物陪伴感与个性成长系统 — 纯函数
// ============================================================

// eslint-disable-next-line no-duplicate-imports
import type {
  GrowthStage,
  Personality,
  NeedType,
  DailyNeeds,
  HarmonyStatus,
} from '@/types/buddy-state';

/**
 * P1-5: 根据 level 计算 growth_stage
 * - level 1-5:   baby
 * - level 6-15:  young
 * - level 16-40: adult
 * - level 41+:   elder
 */
export function getGrowthStageFromLevel(level: number): GrowthStage {
  if (!Number.isFinite(level) || level < 1) return 'baby';
  if (level >= GROWTH_STAGE_THRESHOLDS.elder) return 'elder';
  if (level >= GROWTH_STAGE_THRESHOLDS.adult) return 'adult';
  if (level >= GROWTH_STAGE_THRESHOLDS.young) return 'young';
  return 'baby';
}

/**
 * P1-5: 验证 growth_stage 字符串
 */
export function isValidGrowthStage(s: string): s is GrowthStage {
  return s === 'baby' || s === 'young' || s === 'adult' || s === 'elder';
}

/**
 * P1-5: 验证 personality 字符串
 */
export function isValidPersonality(s: string): s is Personality {
  return s === 'unknown' || s === 'sage' || s === 'playmate' || s === 'guardian' || s === 'ascetic';
}

/**
 * P1-5: 验证 need_type 字符串
 */
export function isValidNeedType(s: string): s is NeedType {
  return s === 'clarity' || s === 'connection';
}

/**
 * P1-5: clamp 需求值到 0-100
 */
export function clampNeedValue(v: number): number {
  if (!Number.isFinite(v)) return 0;
  return Math.max(0, Math.min(100, Math.round(v)));
}

/**
 * P1-5: clamp intimacy 到 0-100
 */
export function clampIntimacy(v: number): number {
  if (!Number.isFinite(v)) return 0;
  return Math.max(0, Math.min(100, Math.round(v)));
}

/**
 * P1-5: 安全解析 daily_needs JSONB (从 DB 读取)
 * 缺失字段用 DEFAULT_DAILY_NEEDS (100) 填充
 */
export function parseDailyNeeds(raw: unknown): DailyNeeds {
  const fallback: DailyNeeds = { ...DEFAULT_DAILY_NEEDS };
  if (!raw || typeof raw !== 'object') return fallback;
  const obj = raw as Record<string, unknown>;
  return {
    clarity: clampNeedValue(typeof obj.clarity === 'number' ? obj.clarity : Number(obj.clarity) || fallback.clarity),
    connection: clampNeedValue(typeof obj.connection === 'number' ? obj.connection : Number(obj.connection) || fallback.connection),
  };
}

/**
 * P1-5: 补充某个需求, 返回新对象
 */
export function replenishNeed(needs: DailyNeeds, type: NeedType, amount: number): DailyNeeds {
  const clamped = Math.max(0, amount);
  return {
    ...needs,
    [type]: clampNeedValue(needs[type] + clamped),
  };
}

/**
 * P1-5: 衰减所有需求 (每日调用), 返回新对象
 */
export function decayAllNeeds(needs: DailyNeeds, decayAmount: number = DAILY_NEEDS_DECAY_AMOUNT): DailyNeeds {
  const d = Math.max(0, decayAmount);
  return {
    clarity: clampNeedValue(needs.clarity - d),
    connection: clampNeedValue(needs.connection - d),
  };
}

/**
 * P1-5: 根据日常需求派生和谐状态
 * - 2 项都 ≥ 60: harmony (Symy 处于和谐, vitality +5% buff)
 * - 任一 ≤ 30: discomfort (Symy 不适, vitality -5% debuff)
 * - 其他: neutral
 */
export function getHarmonyStatus(needs: DailyNeeds): HarmonyStatus {
  const all = [needs.clarity, needs.connection];
  if (all.every(v => v >= 60)) return 'harmony';
  if (all.some(v => v <= 30)) return 'discomfort';
  return 'neutral';
}

/**
 * P1-5: 用户行为画像 (用于个性推导)
 */
export interface BehaviorProfile {
  challengesCompleted: number;   // 完成挑战数 (I saw it)
  challengesFailed: number;      // 失败次数 (I choose to buy)
  petSymyCount: number;          // Pet Symy 总次数
  gachaCompleted: number;        // Gacha 完成数
  streak: number;                // 连续打卡天数
  reflectionCount: number;       // reflection 输入次数 (有自定义消息)
  totalDays: number;             // 总使用天数
}

/**
 * P1-5: 根据行为画像推导个性
 *
 * 优先级 (从高到低):
 * 1. Ascetic (修行者): streak >= 30 (沉静内敛)
 * 2. Guardian (守护者): challengesFailed >= 3 且 streak >= 7 (温柔包容, 失败但持续回来)
 * 3. Sage (智者): challengesCompleted >= 5 且 reflectionCount >= 3 (话少但深刻)
 * 4. Playmate (玩伴): petSymyCount >= 7 或 gachaCompleted >= 5 (活泼爱玩)
 * 5. 默认: unknown (数据不足, 至少需要 7 天使用)
 *
 * 觉醒条件: totalDays >= 7
 */
export function assessPersonality(profile: BehaviorProfile): Personality {
  // 未满 7 天不觉醒
  if (profile.totalDays < 7) return 'unknown';

  // 1. Ascetic: 连续打卡 30+ 天
  if (profile.streak >= 30) return 'ascetic';

  // 2. Guardian: 失败 3+ 次但持续回来 (streak 7+)
  if (profile.challengesFailed >= 3 && profile.streak >= 7) return 'guardian';

  // 3. Sage: 完成挑战 5+ 且有 reflection 3+
  if (profile.challengesCompleted >= 5 && profile.reflectionCount >= 3) return 'sage';

  // 4. Playmate: Pet 7+ 或 Gacha 完成 5+
  if (profile.petSymyCount >= 7 || profile.gachaCompleted >= 5) return 'playmate';

  // 5. 默认 (7 天到了但数据不足): 给 Sage (中性, 不偏向玩闹)
  return 'sage';
}

/**
 * P1-5: intimacy 变化量计算
 * 不同行为给不同 intimacy 加成
 */
export function calculateIntimacyDelta(action: string): number {
  switch (action) {
    case 'see_it':          return 2;   // 完成 See it
    case 'challenge_passed': return 3;  // 挑战通过
    case 'challenge_failed': return 1;  // 挑战失败 (仍有互动)
    case 'pet_symy':        return 1;   // Pet Symy
    case 'gacha_completed': return 2;   // Gacha 完成
    case 'reflection':      return 2;   // 输入 reflection
    case 'daily_login':     return 1;   // 每日登录
    case 'long_absence':    return -1;  // 长时间未登录 (轻微衰减)
    default:                return 0;
  }
}

