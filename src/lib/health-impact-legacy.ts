/**
 * health-impact-legacy — Non-atomic fallback path for createHealthEvent.
 *
 * 🔧 Round 81: extracted from health-impact.ts (was 756 lines, target <600).
 *    Contains: createHealthEventLegacy + checkAndAwardBadgesLegacy.
 *    Used as fallback when create_health_event_atomic RPC is not deployed.
 *
 * 🔧 ARCH fix (Round 19 H5-audit1): Legacy path uses INSERT-then-UPDATE pattern
 *    (not UPDATE-then-INSERT) to prevent double damage on concurrent calls.
 *    UNIQUE constraint on health_events(trigger_source, trigger_id) serves as
 *    distributed lock — only one concurrent caller successfully INSERTs.
 */

import 'server-only';

import { createAdminClient } from '@/lib/supabase-admin';
import { toJson } from '@/lib/json-helpers';
import { logger } from '@/lib/logger';
import { sanitizeHealthDescription } from '@/lib/display-sanitize';
import {
  DEFAULT_VITALITY,
  DEFAULT_TOKENS,
// eslint-disable-next-line @typescript-eslint/no-unused-vars
  DEFAULT_DREAM_FUNDS,
  getHealthFromVitality,
} from '@/lib/buddy-defaults';
import type { BuddyHealth } from '@/types/buddy-state';
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import type { Json } from '@/lib/database.types';
import {
  calculateHealthDelta,
  calculateNewBadges,
  type HealthEventInput,
  type HealthEventResult,
  type HealthEventType,
  type BuddyStateRow,
} from './health-impact-types';

// Re-export BuddyStateRow for consumers that import from legacy file
export type { BuddyStateRow };

/**
 * Legacy non-atomic path — INSERT health_event then UPDATE buddy_state.
 * Used as fallback when create_health_event_atomic RPC is not deployed.
 *
 * Order matters: INSERT first (UNIQUE constraint = distributed lock),
 * UPDATE buddy_state only if INSERT succeeds.
 */
export async function createHealthEventLegacy(input: HealthEventInput): Promise<HealthEventResult> {
  const { supabase, error: adminError } = createAdminClient();
  if (!supabase) {
    logger.error('[Health Impact] No admin client available');
    return { success: false, error: adminError || 'No admin client' };
  }

  // 1. Get current buddy state
  const { data: current, error: fetchError } = await supabase
    .from('buddy_state')
    .select('*')
    .eq('user_id', input.userId)
    .maybeSingle<BuddyStateRow>();

  if (fetchError) {
    logger.error('[Health Impact] Failed to fetch buddy_state:', fetchError.message);
    return { success: false, error: fetchError.message };
  }

  // If no buddy state exists, create it first
  // BUG FIX: Use INSERT instead of UPSERT to avoid overwriting existing data.
  let buddyState: BuddyStateRow | null = current;
  if (!buddyState) {
    const now = new Date().toISOString();
    const defaultState = {
      user_id: input.userId,
      vitality: DEFAULT_VITALITY,
      tokens: DEFAULT_TOKENS,
      health: 'healthy' as const,
      level: 1,
      xp: 0,
      xp_to_next: 100,
      streak: 0,
      // 🔧 Round 126: dream_funds JSONB column dropped — no longer in insert
      badges: toJson([]),
      total_saved: 0,
      challenges_completed: 0,
      last_drain_at: now,
      updated_at: now,
    };
    const { data: newData, error: insertError } = await supabase
      .from('buddy_state')
      .insert(defaultState)
      .select()
      .maybeSingle<BuddyStateRow>();

    if (insertError || !newData) {
      // Insert might fail if row was created by a concurrent call.
      // Re-read the existing row instead of erroring out.
      logger.warn('[Health Impact] buddy_state insert failed (likely race), re-reading:', insertError?.message);
      const { data: existingData, error: reReadError } = await supabase
        .from('buddy_state')
        .select('*')
        .eq('user_id', input.userId)
        .maybeSingle<BuddyStateRow>();

      if (reReadError || !existingData) {
        logger.error('[Health Impact] Failed to re-read buddy_state after insert failure:', reReadError?.message);
        return { success: false, error: reReadError?.message || 'Failed to get buddy state' };
      }
      buddyState = existingData;
    } else {
      buddyState = newData;
    }
  }

  // 2. Calculate vitality and token changes
  const calc = calculateHealthDelta(input, buddyState);
  let { vitalityChange, tokenChange } = calc;

  // Apply overrides if provided (overrides calculated value)
  if (input.vitalityOverride !== undefined) {
    vitalityChange = input.vitalityOverride;
  }
  if (input.tokenOverride !== undefined) {
    tokenChange = input.tokenOverride;
  }

  // 3. Apply changes (clamped to 0-100)
  const currentVitality = Number(buddyState?.vitality ?? DEFAULT_VITALITY);
  const currentTokens = Number(buddyState?.tokens ?? DEFAULT_TOKENS);
  const newVitality = Math.max(0, Math.min(100, currentVitality + vitalityChange));
  const newTokens = Math.max(0, currentTokens + tokenChange);
  const newHealth = getHealthFromVitality(newVitality);

  // 🔧 ARCH fix (Round 19 H5-audit1): 先 INSERT health_event (原子去重)
  const healthEvent = {
    user_id: input.userId,
    event_type: input.eventType,
    vitality_change: vitalityChange,
    new_vitality: newVitality,
    token_change: tokenChange,
    trigger_source: input.triggerSource,
    trigger_id: input.triggerId || null,
    description: sanitizeHealthDescription(input.description),
    metadata: toJson(input.metadata || {}),
  };

  const { data: eventData, error: eventError } = await supabase
    .from('health_events')
    .insert(healthEvent)
    .select('id')
    .maybeSingle<{ id: string }>();

  if (eventError) {
    // 23505 = unique_violation → 并发调用者已应用伤害, 幂等返回
    if (eventError.code === '23505' && input.triggerId) {
      logger.info(`[Health Impact] Legacy dedup: trigger_id ${input.triggerId} already processed (race detected via UNIQUE constraint), skipping`);
      const { data: existing } = await supabase
        .from('health_events')
        .select('id')
        .eq('user_id', input.userId)
        .eq('trigger_source', input.triggerSource)
        .eq('trigger_id', input.triggerId)
        .maybeSingle<{ id: string }>();
      // 🔧 ARCH fix Round 75 (Finding 33): deduplicated=true → return 0 delta (not applied)
      // 🔧 P0-2 fix: include newVitality so callers can render correct values
      return { success: true, deduplicated: true, eventId: existing?.id, vitalityChange: 0, tokenChange: 0, newVitality: currentVitality, newTokens: currentTokens };
    }
    // 其他错误 → 真失败, 不更新 buddy_state (避免无 event 记录的伤害)
    logger.error('[Health Impact] Failed to insert health_event:', eventError.message, 'code:', eventError.code);
    return { success: false, error: eventError.message };
  }

  if (!eventData) {
    logger.error('[Health Impact] health_event INSERT returned no data and no error');
    return { success: false, error: 'Unknown insert failure' };
  }

  // INSERT 成功 → 现在可以安全 UPDATE buddy_state
  // 4. Prepare update data
  const updateData: Record<string, unknown> = {
    vitality: newVitality,
    tokens: newTokens,
    health: newHealth,
    updated_at: new Date().toISOString(),
  };

  // For refund_boost, also add to totalSaved
  // 🔧 Round 126: dream_funds JSONB column dropped — dream fund updates now go through
  //    dream_funds table directly (via /api/buddy/dream-funds PATCH or applyBuddyStateDelta RPC)
  //    This legacy code only updates total_saved, not dream_funds
  if (input.eventType === 'refund_boost') {
    const metadata = input.metadata || {};
    const refundAmount = Number(metadata.amount || 0);
    updateData.total_saved = Number(buddyState?.total_saved || 0) + refundAmount;
  }

  const { error: updateError } = await supabase
    .from('buddy_state')
    .update(updateData as Partial<{ vitality: number; tokens: number; health: BuddyHealth; updated_at: string; total_saved: number }>)
    .eq('user_id', input.userId);

  if (updateError) {
    // health_event 已插入, buddy_state 未更新 → 状态不一致
    // 比双倍伤害好 (少扣 vitality 比多扣更易恢复, passive_recovery 可补偿)
    logger.error('[Health Impact] Failed to update buddy_state (health_event already inserted):', updateError.message);
    return {
      success: true,
      eventId: eventData.id,
      vitalityChange,
      newVitality,
      tokenChange,
      newTokens,
    };
  }

  // 5. Check for badge awards
  await checkAndAwardBadgesLegacy(supabase, input.userId, input.eventType, buddyState);

  logger.info('[Health Impact] Legacy INSERT + UPDATE success, eventId:', eventData.id);
  return {
    success: true,
    eventId: eventData.id,
    vitalityChange,
    newVitality,
    tokenChange,
    newTokens,
  };
}

/**
 * Legacy Badge Awards (for fallback path only).
 * Checks if new badges should be awarded based on event type + current badges.
 */
export async function checkAndAwardBadgesLegacy(
  supabase: NonNullable<ReturnType<typeof createAdminClient>['supabase']>,
  userId: string,
  eventType: HealthEventType,
  currentBuddyState: BuddyStateRow | null,
): Promise<void> {
  const currentBadges = currentBuddyState?.badges || [];
  const newBadges = calculateNewBadges(eventType, currentBadges);

  if (newBadges.length > 0) {
    const allBadges = [...currentBadges, ...newBadges.filter((b) => !currentBadges.includes(b))];
    await supabase
      .from('buddy_state')
      .update({ badges: toJson(allBadges), updated_at: new Date().toISOString() })
      .eq('user_id', userId);
  }
}
