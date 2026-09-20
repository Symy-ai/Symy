/**
 * Buddy State Types — canonical type definitions
 *
 * 🔧 架构优化: 消除层级违反 — lib 不应从 hooks/components 导入类型
 *    旧代码: src/lib/demo-data.ts 从 @/hooks/use-buddy-state 导入 BuddyState
 *    修复: 类型定义移到 src/types/, hooks/lib/components 都从这里导入
 *
 * P1-5 扩展: 加 GrowthStage / Personality / DailyNeeds / ProactiveMessage 类型
 */

/** Buddy health status — derived from vitality score */
export type BuddyHealth = 'thriving' | 'healthy' | 'weak' | 'critical' | 'dormant';

/** Dream fund — user's savings goal */
export interface DreamFund {
  id: string;
  name: string;
  target: number;
  current: number;
  emoji: string;
  /** sort_order from DB (null = 0) */
  sortOrder?: number | null;
}

/** P1-5: Symy 成长阶段 — 基于 level 派生, 持久化到 DB */
export type GrowthStage = 'baby' | 'young' | 'adult' | 'elder';

/** P1-5: Symy 个性 — 第 7 天觉醒, 基于用户行为推导 */
export type Personality = 'unknown' | 'sage' | 'playmate' | 'guardian' | 'ascetic';

/** P1-5: 日常需求类型 */
export type NeedType = 'clarity' | 'connection';

/** P1-5: 日常需求 — 2 个维度, 0-100, 每日衰减 */
export interface DailyNeeds {
  clarity: number;       // 清晰度 — See it / Challenge 补充
  connection: number;    // 连接 — Pet Symy / reflection 输入补充
}

/** P1-5: Symy 和谐状态 — 基于日常需求派生 */
export type HarmonyStatus = 'harmony' | 'neutral' | 'discomfort';

/** P1-5: 主动留言触发类型 */
export type ProactiveMessageTrigger =
  | 'morning_checkin'
  | 'evening_reflection'
  | 'long_absence'
  | 'streak_milestone'
  | 'challenge_completed'
  | 'challenge_failed'
  | 'low_vitality'
  | 'high_vitality'
  | 'personality_awakened'
  | 'growth_stage_up';

/** P1-5: 主动留言 */
export interface ProactiveMessage {
  id: string;
  trigger: ProactiveMessageTrigger;
  textKey: string;          // i18n key
  textFallback: string;     // i18n 缺失时的 fallback
  createdAt: string;        // ISO timestamp
  read: boolean;
}

/** Buddy state — the AI companion's state shown in UI */
export interface BuddyState {
  vitality: number;
  tokens: number;
  health: BuddyHealth;
  level: number;
  xp: number;
  xpToNext: number;
  streak: number;
  dreamFunds: DreamFund[];
  badges: string[];
  /** Completed invitations — powers the Guardian Covenant badge progress. */
  invitedCount?: number;
  totalSaved: number;
  challengesCompleted: number;
  lastHealingKitAt: string | null;
  version: number;
  // P1-5: 宠物陪伴感与个性成长系统
  growthStage: GrowthStage;
  personality: Personality;
  intimacy: number;
  dailyNeeds: DailyNeeds;
  proactiveMessages: ProactiveMessage[];
  personalityAwakenedAt: string | null;
  lastActiveAt: string | null;
}

/** Health event — audit record for buddy state changes */
export interface HealthEvent {
  id: string;
  eventType: string;
  vitalityChange: number;
  newVitality: number;
  tokenChange: number;
  triggerSource: string;
  triggerId: string | null;
  description: string;
  metadata: Record<string, unknown>;
  createdAt: string;
}
