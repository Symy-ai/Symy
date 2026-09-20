/**
 * health-impact-types — Shared types + pure calculation functions.
 *
 * 🔧 Round 81: extracted from health-impact.ts to break circular dependency.
 *    health-impact.ts ↔ health-impact-legacy.ts was circular (each imported from the other).
 *    Fix: move shared types + pure functions to this file, both import from here.
 *
 * Contains: HealthEventType, TriggerSource, HealthEventInput, HealthEventResult,
 *           BuddyStateRow, VALID_EVENT_TYPES, VALID_TRIGGER_SOURCES,
 *           calculateHealthDelta, calculateNewBadges.
 */

import {
  calculateImpulseDamage,
  calculateRefundBoost,
  calculateMindfulRecovery,
  calculatePassiveRecovery,
} from '@/lib/buddy-defaults';

// Re-export calculation helpers for backward compatibility
export { calculateImpulseDamage, calculateRefundBoost, calculateMindfulRecovery, calculatePassiveRecovery };

// ============================================================
// Types
// ============================================================

export type HealthEventType =
  | 'impulse_damage'
  | 'impulse_confessed'
  | 'mindful_recovery'
  | 'refund_boost'
  | 'challenge_reward'
  | 'challenge_completed'
  | 'challenge_failed'
  | 'passive_recovery'
  | 'drain'
  | 'revive'
  | 'manual_adjustment'
  | 'butterfly_completed'        // 🔧 Round 86: migration 089 buddy companion system
  | 'butterfly_chapter_viewed';  // 🔧 Round 86: migration 089 buddy companion system

export type TriggerSource =
  | 'email_receipt'
  | 'email_refund'
  | 'email_ignore'
  | 'chat_mcp'
  | 'passive_daily'
  | 'token_drain'
  | 'revive_deposit'
  | 'manual'
  | 'deposit_api'
  | 'butterfly_story';           // 🔧 Round 86: migration 089 buddy companion system

export const VALID_EVENT_TYPES: readonly string[] = [
  'impulse_damage', 'impulse_confessed', 'mindful_recovery', 'refund_boost',
  'challenge_reward', 'challenge_completed', 'challenge_failed',
  'passive_recovery', 'drain', 'revive', 'manual_adjustment',
  'butterfly_completed', 'butterfly_chapter_viewed',
] as const;

export const VALID_TRIGGER_SOURCES: readonly string[] = [
  'email_receipt', 'email_refund', 'email_ignore', 'chat_mcp',
  'passive_daily', 'token_drain', 'revive_deposit', 'manual',
  'deposit_api', 'butterfly_story',
] as const;

export interface HealthEventInput {
  userId: string;
  eventType: HealthEventType;
  triggerSource: TriggerSource;
  triggerId?: string;
  description: string;
  metadata?: Record<string, unknown>;
  /** Override the calculated vitality change (optional) */
  vitalityOverride?: number;
  /** Override the calculated token change (optional) */
  tokenOverride?: number;
}

export interface HealthEventResult {
  success: boolean;
  eventId?: string;
  vitalityChange?: number;
  /**
   * 事件应用后的新 vitality 值。
   *
   * 🔧 P0-2 根因修复 (Round 88): 当 success=true 时, newVitality 保证有值。
   *   - atomic RPC path: health-impact.ts 读 result.newVitality, fallback 读 snake_case,
   *     再 fallback 主动 SELECT buddy_state.vitality 回填
   *   - legacy path: 所有 success=true return 都包含 newVitality
   *   - fallback path (applyBuddyStateDelta): result.vitality 保证有值
   *
   * 调用方仍可用 `?? 0` 防御极端情况, 但不应再出现 `?? '?'` 兜底。
   */
  newVitality?: number;
  tokenChange?: number;
  newTokens?: number;
  error?: string;
  /** 标记此结果是幂等去重 (重复 trigger_id), 未应用副作用 */
  deduplicated?: boolean;
}

/** Buddy state row shape from Supabase */
export interface BuddyStateRow {
  user_id: string;
  vitality: number;
  tokens: number;
  health: string;
  level: number;
  xp: number;
  xp_to_next: number;
  streak: number;
  dream_funds: Array<{ id: string; name: string; target: number; current: number; emoji: string }> | null;
  badges: string[] | null;
  total_saved: number;
  challenges_completed: number;
  last_drain_at: string;
  updated_at: string;
}

// ============================================================
// Health Delta Calculation (shared between atomic and legacy paths)
// ============================================================

interface HealthDelta {
  vitalityChange: number;
  tokenChange: number;
}

/**
 * Calculate vitality and token changes based on event type.
 * Pure calculation — does not touch the database.
 * Used by both the atomic RPC path (for pre-calculation)
 * and the legacy fallback path.
 */
export function calculateHealthDelta(
  input: HealthEventInput,
  buddyState: Partial<BuddyStateRow> | null,
): HealthDelta {
  let vitalityChange = 0;
  let tokenChange = 0;

  switch (input.eventType) {
    case 'impulse_damage': {
      const metadata = input.metadata || {};
      const impScore = Number(metadata.impulseScore ?? 60);
      const impAmount = Number(metadata.amount ?? 0);
      vitalityChange = calculateImpulseDamage(
        Number.isFinite(impScore) ? impScore : 60,
        Number.isFinite(impAmount) ? impAmount : 0,
      );
      tokenChange = -1;
      break;
    }
    case 'impulse_confessed': {
      const metadata = input.metadata || {};
      const confScore = Number(metadata.impulseScore ?? 60);
      const confAmount = Number(metadata.amount ?? 0);
      vitalityChange = Math.round(calculateImpulseDamage(
        Number.isFinite(confScore) ? confScore : 60,
        Number.isFinite(confAmount) ? confAmount : 0,
      ) * 0.7); // 30% less damage for honesty
      tokenChange = -1;
      break;
    }
    case 'mindful_recovery': {
      const metadata = input.metadata || {};
      const mindfulScore = Number(metadata.impulseScore ?? 60);
      vitalityChange = calculateMindfulRecovery(Number.isFinite(mindfulScore) ? mindfulScore : 60);
      tokenChange = 2;
      break;
    }
    case 'refund_boost': {
      const metadata = input.metadata || {};
      const refundAmount = Number(metadata.amount ?? 0);
      vitalityChange = calculateRefundBoost(Number.isFinite(refundAmount) ? refundAmount : 0);
      tokenChange = 3;
      break;
    }
    case 'challenge_reward': {
      vitalityChange = 0;
      break;
    }
    case 'challenge_failed': {
      // 纯审计事件 — 挑战状态机转换, 不直接影响 vitality
      vitalityChange = 0;
      break;
    }
    case 'passive_recovery': {
      vitalityChange = calculatePassiveRecovery(Number(buddyState?.streak || 0));
      break;
    }
    case 'drain': {
      vitalityChange = -1;
      tokenChange = -1;
      break;
    }
    case 'revive': {
      vitalityChange = 30;
      break;
    }
    case 'manual_adjustment': {
      vitalityChange = 0;
      break;
    }
  }

  return { vitalityChange, tokenChange };
}

// ============================================================
// Badge Calculation (for RPC path — returns badges to add)
// ============================================================

/**
 * Determine which new badges should be awarded for this event.
 * Returns an array of badge names to add (empty if none).
 */
export function calculateNewBadges(
  eventType: HealthEventType,
  currentBadges: string[] | null | undefined,
): string[] {
  const badges = currentBadges || [];
  const newBadges: string[] = [];

  switch (eventType) {
    case 'mindful_recovery': {
      if (!badges.includes('impulse_shield')) {
        newBadges.push('impulse_shield');
      }
      break;
    }
    case 'refund_boost': {
      if (!badges.includes('first_save')) {
        newBadges.push('first_save');
      }
      break;
    }
    default:
      break;
  }

  return newBadges;
}
