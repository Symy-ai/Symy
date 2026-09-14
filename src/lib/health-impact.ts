import 'server-only'; // 🔧 ARCH fix Round 73: server-only — prevents client bundle leak
/**
 * Health Impact Utility
 *
 * Server-side utility that creates health events and updates buddy vitality.
 * This is the core implementation of:
 *   "Your companion's health is tied to your spending habits.
 *    Impulse purchases hurt it, while mindful spending helps it thrive!"
 *
 * BUG-71 FIX: Uses PostgreSQL RPC function `create_health_event_atomic`
 * which does SELECT ... FOR UPDATE to prevent read-modify-write race conditions.
 * All buddy_state reads, vitality calculations, and health_event inserts
 * happen atomically within a single database transaction.
 *
 * Called from:
 * - Email scan/resync routes (automatic impulse damage)
 * - Email receipt PATCH route (refund boost, ignore recovery)
 * - Health events API route (frontend-initiated)
 * - MCP tools (via createHealthEvent for audit trail)
 */

import { createAdminClient } from '@/lib/supabase-admin';
import { toJson } from '@/lib/json-helpers';
import { logger } from '@/lib/logger';
import { sanitizeHealthDescription } from '@/lib/display-sanitize';

// 🔧 Round 81: Shared types + pure functions extracted to health-impact-types.ts
//    to break circular dependency (health-impact ↔ health-impact-legacy).
//    Re-export for backward compatibility — existing imports from health-impact
//    still work.
export {
  calculateImpulseDamage,
  calculateRefundBoost,
  calculateMindfulRecovery,
  calculatePassiveRecovery,
  calculateHealthDelta,
  calculateNewBadges,
  type HealthEventType,
  type TriggerSource,
  type HealthEventInput,
  type HealthEventResult,
  type BuddyStateRow,
  VALID_EVENT_TYPES,
  VALID_TRIGGER_SOURCES,
} from './health-impact-types';

// getHealthFromVitality is re-exported from buddy-defaults (not health-impact-types)
export { getHealthFromVitality } from '@/lib/buddy-defaults';

// Import shared types/functions for internal use
import {
  calculateHealthDelta,
  calculateNewBadges,
  type HealthEventInput,
  type HealthEventResult,
  type BuddyStateRow,
} from './health-impact-types';

// ============================================================
// Fallback: Non-atomic path (used if RPC function is not deployed)
// ============================================================
// 🔧 Round 81: createHealthEventLegacy + checkAndAwardBadgesLegacy extracted
//    to health-impact-legacy.ts (was 756 lines, target <600).
//    Legacy path uses INSERT-then-UPDATE pattern to prevent double damage.

import { createHealthEventLegacy } from './health-impact-legacy';

// ============================================================
// Core: Create Health Event + Update Vitality (ATOMIC - BUG-71 Fix)
// ============================================================

// 🔧 架构优化 Round 48: 用 RpcHealth class 替代 module-level mutable flags (Finding 18)
import { healthEventRpcHealth } from '@/lib/rpc-health';

/**
 * Create a health event and update buddy vitality atomically.
 *
 * BUG-71 FIX: Uses PostgreSQL RPC function `create_health_event_atomic`
 * which does SELECT ... FOR UPDATE to prevent read-modify-write race conditions.
 *
 * Flow:
 * 1. Pre-calculate vitalityChange and tokenChange in TypeScript
 * 2. Call supabase.rpc('create_health_event_atomic', {...})
 *    - SQL function locks buddy_state row (FOR UPDATE)
 *    - Atomically applies changes to vitality/tokens
 *    - Inserts health_event with correct new_vitality
 *    - Handles refund_boost special fields (total_saved, dream_funds)
 *    - Handles badge awards
 * 3. Returns result from SQL function
 *
 * Falls back to legacy non-atomic path if RPC is not deployed.
 */
export async function createHealthEvent(input: HealthEventInput): Promise<HealthEventResult> {
  const { supabase, error: adminError } = createAdminClient();
  if (!supabase) {
    logger.error('[Health Impact] No admin client available');
    return { success: false, error: adminError || 'No admin client' };
  }

  // 🔧 Bug A debug: 记录 createHealthEvent 调用
  logger.info('[Health Impact] createHealthEvent called:', {
    eventType: input.eventType,
    triggerId: input.triggerId,
    userId: input.userId.substring(0, 8),
  });

  // 🔧 架构优化: 用 RpcHealth.shouldTry() 替代手动 flag + time check
  if (!healthEventRpcHealth.shouldTry()) {
    return createHealthEventLegacy(input);
  }

  // Pre-calculate vitality and token changes
  // For passive_recovery, we need the streak from buddy_state
  // The SQL function will do its own calculation atomically, but we need
  // the streak value for passive_recovery. Read it here (non-critical if stale
  // since streak only changes once per day).
  // For badge-eligible events, we also need current badges.
  let buddyStateForCalc: Partial<BuddyStateRow> | null = null;
  const needsBuddyState = input.eventType === 'passive_recovery' ||
    input.eventType === 'mindful_recovery' ||
    input.eventType === 'refund_boost';

  if (needsBuddyState) {
    const { data: bs } = await supabase
      .from('buddy_state')
      .select('streak, badges')
      .eq('user_id', input.userId)
      .maybeSingle<Partial<BuddyStateRow>>();
    buddyStateForCalc = bs ?? null;
  }

  // Calculate health delta (pure TypeScript calculation)
  const { vitalityChange: calcVitalityChange, tokenChange: calcTokenChange } = calculateHealthDelta(input, buddyStateForCalc);

  // Apply overrides
  let vitalityChange = calcVitalityChange;
  let tokenChange = calcTokenChange;
  if (input.vitalityOverride !== undefined) {
    vitalityChange = input.vitalityOverride;
  }
  if (input.tokenOverride !== undefined) {
    tokenChange = input.tokenOverride;
  }

  // Calculate new badges to award
  const badges = buddyStateForCalc?.badges;
  const newBadges = calculateNewBadges(input.eventType, badges);

  // Refund amount (for refund_boost special handling)
  const refundAmount = input.eventType === 'refund_boost'
    ? Number(input.metadata?.amount || 0)
    : 0;

  // Try the atomic RPC path
  try {
    // 🔧 M3 fix: 不再硬编码 'df-1' — 传真实 dreamFundId 或 null
    // 之前: 'df-1' 用于 PostgreSQL RPC 重载解析 (11-param vs 10-param)
    // 现在: 传真实 fundId (如果有), 否则传 null (RPC 内部处理)
    // 如果 RPC 重载解析失败, 需要删除旧的 10-param 版本 (migration 011)
    const dreamFundId = input.metadata?.dreamFundId as string || null;
    const { data, error: rpcError } = await supabase.rpc('create_health_event_atomic', {
      p_user_id: input.userId,
      p_event_type: input.eventType,
      p_vitality_change: vitalityChange,
      p_token_change: tokenChange,
      p_trigger_source: input.triggerSource,
      p_trigger_id: input.triggerId || null,
      p_description: sanitizeHealthDescription(input.description),
      p_metadata: toJson(input.metadata || {}),
      p_refund_amount: refundAmount,
      p_new_badges: newBadges,
      p_dream_fund_id: dreamFundId ?? undefined,
    });

    if (rpcError) {
      // 🔧 Bug A debug: 记录 RPC 错误
      logger.warn('[Health Impact] RPC error:', rpcError.message, 'code:', rpcError.code);
      // If the RPC function doesn't exist, mark as unavailable and fall back
      if (rpcError.message?.includes('Could not find the function') ||
          rpcError.message?.includes('does not exist') ||
          rpcError.code === '42883') { // undefined function
        logger.warn('[Health Impact] Atomic RPC not deployed, falling back to legacy path');
        healthEventRpcHealth.markFailed();
        // 🔧 BUG-110 fix: 记录失败时间，允许定期重试
        
        return createHealthEventLegacy(input);
      }
      // 🔧 2026-07-15 (ARCH deep audit #4): Differentiate RPC errors instead of
      //    blanket fallback. Old code fell back to legacy on ANY RPC error, masking
      //    real bugs (migration drift, RLS policy changes, permission issues).
      //    Fix: only fallback on "function/table missing" (42P01/42883).
      //    Other errors fail-closed to surface real bugs.
      const code = rpcError.code;
      if (code === '42703') {
        // Column missing = migration drift — fallback + log for ops investigation
        logger.error('[Health Impact] RPC column missing (migration drift!), falling back to legacy:', rpcError.message);
        healthEventRpcHealth.markFailed();
        return createHealthEventLegacy(input);
      }
      if (code === '23505') {
        // Unique violation = duplicate event, not an error
        logger.info('[Health Impact] RPC dedup hit (23505), skipping');
        return { success: true, deduplicated: true, eventId: undefined, newVitality: 0, newTokens: 0 };
      }
      // For all other errors (42501 permission, syntax, etc.) — fail closed
      // to surface the real bug instead of masking it with legacy fallback
      logger.error('[Health Impact] RPC error (NOT falling back, surfacing bug):', rpcError.message, 'code:', code);
      return {
        success: false,
        error: `RPC error ${code}: ${rpcError.message}`,
        newVitality: 0,
        newTokens: 0,
      };
    }

    // Mark RPC as available for future calls
    healthEventRpcHealth.markAvailable();

    // Parse the JSONB result from the SQL function
    const result = data as Record<string, unknown>;

    if (result.success === false) {
      // 🔧 P0 fix (migration 030): RPC 返回逻辑错误时也走 legacy fallback
      // 之前只在 RPC 抛异常时才 fallback，RPC 返回 {success:false} 直接返回失败
      // 导致 createHealthEvent 静默失败，Health Log 永远为空
      logger.error('[Health Impact] Atomic RPC returned error, falling back to legacy:', result.error);
      return createHealthEventLegacy(input);
    }

    // 🔧 Bug A debug: RPC 成功
    logger.info('[Health Impact] RPC success, eventId:', result.eventId, 'deduplicated:', result.deduplicated);

    // 🔧 ARCH fix (Round 12 audit C1): 读取 RPC 返回的 camelCase 字段 (非 snake_case)
    //    旧代码读 result.event_id / result.new_vitality / result.new_tokens → 全部 undefined
    //    (RPC 返回 eventId / newVitality / newTokens, 见 migration 049/051)。
    //    另: RPC 不返回 vitality_change / token_change, 从 input 推算。
    //    另: 读取 deduplicated 字段 (migration 051 新增), 让调用方知道是否跳过了 delta。
    // 🔧 ARCH fix Round 75 (Finding 33): 当 deduplicated=true 时, RPC 未应用 delta.
    //    旧代码: 返回 calculated vitalityChange/tokenChange (非零) → 调用方误以为应用了.
    //    根因修复: deduplicated=true 时返回 0 (delta 未应用).
    const isDeduplicated = result.deduplicated as boolean | undefined;

    // 🔧 P0-2 根因修复 (Round 88): newVitality / newTokens 必须有值, 否则 Book of seeing 显示 "→ ?"
    //   旧代码: `newVitality: result.newVitality as number | undefined` 直接透传, 不校验。
    //   问题: 如果 RPC 版本不匹配 (旧 migration 返回 snake_case new_vitality) 或字段缺失,
    //         result.newVitality 为 undefined → record_impulse.ts 的 `?? '?'` 兜底成 '?' → UI 显示 "vitality -8 → ?"
    //   根因修复:
    //   1. 优先读 camelCase (migration 049+)
    //   2. fallback 读 snake_case (migration 030 及更早)
    //   3. 若两者都无, 主动 SELECT buddy_state.vitality 回填 (保证 success=true 一定有 newVitality)
    let resolvedNewVitality: number | undefined;
    let resolvedNewTokens: number | undefined;

    // Step 1: camelCase (preferred)
    if (typeof result.newVitality === 'number' && Number.isFinite(result.newVitality)) {
      resolvedNewVitality = result.newVitality;
    } else if (typeof result.new_vitality === 'number' && Number.isFinite(result.new_vitality)) {
      // Step 2: snake_case fallback (旧 RPC 兼容)
      logger.warn('[Health Impact] RPC returned snake_case new_vitality (migration < 049), using fallback:', result.new_vitality);
      resolvedNewVitality = result.new_vitality;
    }

    if (typeof result.newTokens === 'number' && Number.isFinite(result.newTokens)) {
      resolvedNewTokens = result.newTokens;
    } else if (typeof result.new_tokens === 'number' && Number.isFinite(result.new_tokens)) {
      resolvedNewTokens = result.new_tokens;
    }

    // Step 3: 若 newVitality 仍缺失, 主动 SELECT buddy_state 回填
    //   这是最后防线 — 确保 success=true 一定伴随有效 newVitality, 不依赖调用方 `?? '?'` 兜底
    if (resolvedNewVitality === undefined) {
      logger.warn('[Health Impact] RPC success but newVitality missing in result, actively fetching buddy_state.vitality as fallback');
      try {
        const { data: bsFallback, error: bsFallbackError } = await supabase
          .from('buddy_state')
          .select('vitality, tokens')
          .eq('user_id', input.userId)
          .maybeSingle<{ vitality: number; tokens: number }>();
        if (!bsFallbackError && bsFallback) {
          resolvedNewVitality = Number(bsFallback.vitality);
          if (resolvedNewTokens === undefined) {
            resolvedNewTokens = Number(bsFallback.tokens);
          }
          logger.info('[Health Impact] Fallback SELECT succeeded, newVitality:', resolvedNewVitality);
        } else if (bsFallbackError) {
          logger.error('[Health Impact] Fallback SELECT failed:', bsFallbackError.message);
        }
      // safe to ignore: non-critical background operation, error already logged
      } catch (selectErr) {
                            // safe to ignore: non-critical background operation, error already logged
        logger.error('[Health Impact] Fallback SELECT threw:', selectErr);
      }
    }

    return {
      success: true,
      eventId: result.eventId as string | undefined,
      deduplicated: isDeduplicated,
      vitalityChange: isDeduplicated ? 0 : vitalityChange,
      newVitality: resolvedNewVitality,
      tokenChange: isDeduplicated ? 0 : tokenChange,
      newTokens: resolvedNewTokens,
    };
  } catch (err) {
    // If RPC fails unexpectedly, fall back to legacy
    logger.error('[Health Impact] Atomic RPC threw, falling back to legacy:', err);
    healthEventRpcHealth.markFailed();
    // 🔧 BUG-110 fix: 记录失败时间，允许定期重试
    
    return createHealthEventLegacy(input);
  }
}

// ============================================================
// Batch: Process Multiple Receipts' Health Impact
// ============================================================

export interface ReceiptHealthInput {
  receiptId: string;
  platform: string;
  amount: number;
  impulseScore: number;
  itemName?: string;
}

/**
 * Process health impact for multiple new impulse receipts at once.
 * Called from email scan/resync routes after batch inserting receipts.
 *
 * Each receipt is processed individually through createHealthEvent(),
 * which now uses the atomic RPC path. This means even concurrent
 * calls to processReceiptsHealthImpact from different sources
 * won't cause data races.
 */
export async function processReceiptsHealthImpact(
  userId: string,
  receipts: ReceiptHealthInput[],
): Promise<HealthEventResult[]> {
  const results: HealthEventResult[] = [];

  // 🔧 Bug 28 fix: 获取用户 locale, 用于生成多语言 description
  //   旧代码: 硬编码英文 description → 中文模式新生成事件仍英文
  //   修复: 用 getUserLocale 读用户语言偏好, 生成对应语言的 description
  const { getUserLocale } = await import('@/lib/mcp-tools/handlers/_shared');
  const { impulseDamageDesc } = await import('@/lib/mcp-tools/handlers/descriptions');
  const { getUserHourlyRate } = await import('@/lib/user-hourly-rate');
  const userLocale = await getUserLocale(userId);
  const userHourlyRate = await getUserHourlyRate(userId);

  for (const receipt of receipts) {
    // Only process impulse receipts (score >= 60)
    if (receipt.impulseScore < 60) continue;

    const result = await createHealthEvent({
      userId,
      eventType: 'impulse_damage',
      triggerSource: 'email_receipt',
      triggerId: receipt.receiptId,
      // 🔧 Bug 28 fix: 用多语言函数替代硬编码英文
      // 🔧 镜子哲学 fix: 加入生命翻译 (金额 → 小时数)
      description: impulseDamageDesc(userLocale, receipt.amount, receipt.platform, receipt.itemName, userHourlyRate),
      metadata: {
        impulseScore: receipt.impulseScore,
        amount: receipt.amount,
        platform: receipt.platform,
        itemName: receipt.itemName,
      },
    });

    results.push(result);
  }

  return results;
}

// ============================================================
// Utility: Reset RPC availability (for testing)
// ============================================================

/**
 * Reset the RPC availability flag.
 * Useful for testing or after deploying the migration.
 */
// 🔧 架构优化 (2026-06-30): resetRpcAvailability 已删除 (死代码, 无 consumer)
