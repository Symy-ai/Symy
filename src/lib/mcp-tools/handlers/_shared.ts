import 'server-only'; // 🔧 ARCH fix Round 73: server-only — prevents client bundle leak
/**
 * Shared types, helpers, and delta-RPC infrastructure for MCP tool handlers.
 *
 * Pure extraction from the original monolithic mcp-tools.ts — behavior unchanged.
 */

import { createServerClient } from '@supabase/ssr';
import { parseJsonArray, toJson } from '@/lib/json-helpers';
import {
  DEFAULT_VITALITY,
  DEFAULT_TOKENS,
  DEFAULT_HEALTH,
  DEFAULT_LEVEL,
  DEFAULT_XP,
  DEFAULT_XP_TO_NEXT,
  DEFAULT_STREAK,
  DEFAULT_DREAM_FUNDS,
  DEFAULT_BADGES,
  DEFAULT_TOTAL_SAVED,
  DEFAULT_CHALLENGES_COMPLETED,
  getHealthFromVitality,
} from '@/lib/buddy-defaults';
import { createAdminClient } from '@/lib/supabase-admin';
import { logger } from '@/lib/logger';

// ── Re-export commonly used modules ────────────────────────────────

export { createServerClient } from '@supabase/ssr';
export { createAdminClient } from '@/lib/supabase-admin';
export { logger } from '@/lib/logger';
export { getHealthFromVitality, DEFAULT_DREAM_FUNDS, SAVINGS_FUND_ID, DEFAULT_LEVEL, calculateImpulseDamage } from '@/lib/buddy-defaults';

// ── MCP types (shared across handlers + index) ─────────────────────

export interface MCPTool {
  name: string;
  description: string;
  parameters: {
    type: 'object';
    properties: Record<string, {
      type: string;
      description: string;
      enum?: string[];
    }>;
    required: string[];
  };
}

export interface MCPToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

export interface MCPToolResult {
  toolCallId: string;
  name: string;
  success: boolean;
  result: Record<string, unknown>;
  message: string;
}

// ── Delta types ────────────────────────────────────────────────────

/** Delta params — all increments are additive deltas */
export interface BuddyDeltaParams {
  tokenDelta?: number;
  vitalityDelta?: number;
  xpDelta?: number;
  challengesDelta?: number;
  totalSavedDelta?: number;
  addBadges?: string[];
  dreamFundId?: string;
  dreamFundAmount?: number;
}

/** Delta result — the full buddy_state after applying the delta */
export interface BuddyDeltaResult {
  success: boolean;
  vitality?: number;
  tokens?: number;
  health?: string;
  level?: number;
  xp?: number;
  xpToNext?: number;
  streak?: number;
  dreamFunds?: Array<{ id: string; name: string; target: number; current: number; emoji: string }>;
  badges?: string[];
  totalSaved?: number;
  challengesCompleted?: number;
  error?: string;
}

// ── Handler context — passed to every tool handler ─────────────────

export interface MCPHandlerContext {
  toolCallId: string;
  args: Record<string, unknown>;
  supabase: ReturnType<typeof createServerClient>;
  userId: string;
}

/** Handler signature: takes context, returns MCPToolResult */
export type MCPToolHandler = (ctx: MCPHandlerContext) => Promise<MCPToolResult>;

// ── RPC availability state ─────────────────────────────────────────

// 🔧 架构优化 Round 48: 用 RpcHealth class 替代 module-level mutable flags (Finding 18)
//    旧代码: `export let deltaRpcAvailable` 模块级变量, 用户 A 的 RPC 故障影响所有用户
//    新代码: RpcHealth class instance, per-Vercel-instance 隔离, 可测试
import { deltaRpcHealth } from '@/lib/rpc-health';

// Re-export for backwards compatibility (tests import these)
export const RPC_RETRY_INTERVAL_MS = 10 * 60 * 1000;
export function resetDeltaRpcAvailability(): void {
  deltaRpcHealth.reset();
}

// ── Atomic delta application (BUG-94 Fix) ──────────────────────────

/**
 * Atomically apply buddy_state delta changes (BUG-94 Fix)
 *
 * Uses PostgreSQL RPC function `apply_buddy_state_delta` which does
 * SELECT ... FOR UPDATE to prevent read-modify-write race conditions.
 *
 * Falls back to the legacy getBuddyState+upsertBuddyState pattern
 * if the RPC function is not deployed.
 */
export async function applyBuddyStateDelta(
  userId: string,
  params: BuddyDeltaParams,
): Promise<BuddyDeltaResult> {
  const { supabase, error: adminError } = createAdminClient();
  if (!supabase) {
    logger.error('[MCP] applyBuddyStateDelta: No admin client available');
    return { success: false, error: adminError || 'No admin client' };
  }

  // 🔧 架构优化: 用 RpcHealth.shouldTry() 替代手动 flag + time check
  if (!deltaRpcHealth.shouldTry()) {
    return applyBuddyStateDeltaLegacy(supabase, userId, params);
  }

  // Try the atomic RPC path
  try {
    const { data, error: rpcError } = await supabase.rpc('apply_buddy_state_delta', {
      p_user_id: userId,
      p_token_delta: params.tokenDelta ?? 0,
      p_vitality_delta: params.vitalityDelta ?? 0,
      p_xp_delta: params.xpDelta ?? 0,
      p_challenges_delta: params.challengesDelta ?? 0,
      p_total_saved_delta: params.totalSavedDelta ?? 0,
      p_add_badges: params.addBadges ?? [],
      p_dream_fund_id: params.dreamFundId ?? null,
      p_dream_fund_amount: params.dreamFundAmount ?? 0,
      p_level_override: null,
      p_xp_to_next_override: null,
      p_xp_override: null,
    });

    if (rpcError) {
      // If the RPC function doesn't exist, mark as unavailable and fall back
      if (rpcError.message?.includes('Could not find the function') ||
          rpcError.message?.includes('does not exist') ||
          rpcError.code === '42883') { // undefined function
        logger.warn('[MCP] apply_buddy_state_delta RPC not deployed, falling back to legacy path');
        deltaRpcHealth.markFailed();
        return applyBuddyStateDeltaLegacy(supabase, userId, params);
      }
      logger.error('[MCP] apply_buddy_state_delta RPC error:', rpcError.message);
      return { success: false, error: rpcError.message };
    }

    // Mark RPC as available for future calls
    deltaRpcHealth.markAvailable();

    // Parse the JSONB result from the SQL function
    const result = data as Record<string, unknown>;

    if (result.success === false) {
      logger.error('[MCP] apply_buddy_state_delta RPC returned error:', result.error);
      return { success: false, error: result.error as string };
    }

    return {
      success: true,
      vitality: result.vitality as number,
      tokens: result.tokens as number,
      health: result.health as string,
      level: result.level as number,
      xp: result.xp as number,
      xpToNext: result.xp_to_next as number,
      streak: result.streak as number,
      dreamFunds: result.dream_funds as BuddyDeltaResult['dreamFunds'],
      badges: parseJsonArray<string>(result.badges, []),
      totalSaved: result.total_saved as number,
      challengesCompleted: result.challenges_completed as number,
    };
  } catch (err) {
    // 🔧 ARCH fix (Round 11 H1 — catch 块未记录 deltaRpcLastFailTime 导致 10 分钟重试永不触发):
    //    旧代码: catch 块设 deltaRpcAvailable=false 但不更新 deltaRpcLastFailTime。
    //    后果: 第一次 catch 后, deltaRpcLastFailTime 仍是 0 (或上次"function not found"的时间),
    //    Date.now() - 0 永远 > 10min → 每次调用都重试 RPC, 但 RPC 又会 throw → 又 catch →
    //    实际表现为 "永远走 legacy 路径 + 每次多一次失败的 RPC 调用", 性能 -10%。
    //    根因修复: catch 块也记录失败时间, 让 10 分钟重试机制正常工作。
    //    另: 只对 transient 错误 (网络/超时) 走 legacy; permanent 错误 (function not found)
    //    应立即降级且不重试。当前实现统一降级 + 10min 重试, 简化但安全。
    logger.error('[MCP] apply_buddy_state_delta RPC threw, falling back to legacy:', err);
    deltaRpcHealth.markFailed();
    
    return applyBuddyStateDeltaLegacy(supabase, userId, params);
  }
}

// ── Legacy fallback: Non-atomic delta application ──────────────────

/**
 * Legacy non-atomic implementation — used as fallback when the
 * apply_buddy_state_delta RPC function is not yet deployed.
 *
 * WARNING: This path is susceptible to the BUG-94 race condition.
 * It should only be used temporarily until the migration is applied.
 */
export async function applyBuddyStateDeltaLegacy(
  supabase: NonNullable<ReturnType<typeof createAdminClient>['supabase']>,
  userId: string,
  params: BuddyDeltaParams,
): Promise<BuddyDeltaResult> {
  const current = await getBuddyStateForRead(supabase, userId);
  if (!current) {
    return { success: false, error: `No buddy state found for user ${userId}` };
  }

  const newVitality = Math.max(0, Math.min(100, Number(current.vitality) + (params.vitalityDelta ?? 0)));
  const newTokens = Math.max(0, Number(current.tokens) + (params.tokenDelta ?? 0));
  const newXp = Math.max(0, Number(current.xp) + (params.xpDelta ?? 0));
  const xpToNext = Number(current.xp_to_next);
  const leveledUp = newXp >= xpToNext;
  const finalXp = leveledUp ? newXp - xpToNext : newXp;
  const finalXpToNext = leveledUp ? Math.floor(xpToNext * 1.3) : xpToNext;
  const finalLevel = leveledUp ? Number(current.level) + 1 : Number(current.level);
  const newChallenges = Math.max(0, Number(current.challenges_completed) + (params.challengesDelta ?? 0));
  const newTotalSaved = Math.max(0, Number(current.total_saved) + (params.totalSavedDelta ?? 0));
  const newHealth = getHealthFromVitality(newVitality);

  // Badges: merge new badges (deduplicated)
  const currentBadges = (current.badges as string[]) || [];
  const addBadges = params.addBadges ?? [];
  const mergedBadges = [...new Set([...currentBadges, ...addBadges])];

  // 🔧 Round 126: dream_funds JSONB column dropped — legacy path no longer writes dream_funds to buddy_state
  //    Dream fund updates now go through the dream_funds table (via applyBuddyStateDelta RPC or direct UPDATE)
  //    This legacy path only updates buddy_state fields (vitality, tokens, etc.), not dream_funds
  const now = new Date().toISOString();
  const row = {
    user_id: userId,
    vitality: newVitality,
    tokens: newTokens,
    health: newHealth,
    level: finalLevel,
    xp: finalXp,
    xp_to_next: finalXpToNext,
    streak: Number(current.streak ?? DEFAULT_STREAK),
    badges: toJson(mergedBadges),
    total_saved: newTotalSaved,
    challenges_completed: newChallenges,
    last_drain_at: String(current.last_drain_at ?? now),
    updated_at: now,
  };

  const { error } = await supabase
    .from('buddy_state')
    .upsert(row, { onConflict: 'user_id' });

  if (error) {
    logger.error('[MCP] applyBuddyStateDeltaLegacy upsert error:', error.message);
    return { success: false, error: error.message };
  }

  return {
    success: true,
    vitality: newVitality,
    tokens: newTokens,
    health: newHealth,
    level: finalLevel,
    xp: finalXp,
    xpToNext: finalXpToNext,
    streak: Number(current.streak ?? DEFAULT_STREAK),
    // 🔧 Round 126: dreamFunds removed from legacy result (JSONB column dropped)
    //    Dream fund data is now read from dream_funds table, not buddy_state JSONB
    badges: mergedBadges,
    totalSaved: newTotalSaved,
    challengesCompleted: newChallenges,
  };
}

// ── Idempotency: Dedup check for challenge/dream-fund operations ────

/**
 * In-memory lock to prevent concurrent execution of the same tool with same params.
 * Even with DB-level dedup, two concurrent requests within the same serverless instance
 * can both pass the dedup check before either writes the event. This lock ensures only
 * one execution at a time within the same instance.
 *
 * Returns true if this is a duplicate (should skip), false if this is the first (should proceed).
 * The lock is automatically released after the handler completes.
 *
 * 🔧 ARCH fix (Round 11 H3 — Vercel 多实例下 in-memory Set 失效):
 *    旧代码: const inProgressToolCalls = new Set<string>(); 是模块级, 每个 Vercel 实例独立。
 *    两个并发 MCP 调用落在不同实例 → 都通过 isToolCallInProgress 检查 → 都执行。
 *    health_events 表的 (user_id, trigger_source, trigger_id) 唯一索引捕获重复,
 *    但 impulse_events 表无唯一索引 → 两条记录都插入 (审计污染)。
 *    根因修复: in-memory Set 仍保留 (单实例内防并发), 但加 acquireLock fallback
 *    跨实例防护。acquireLock 用 distributed_locks 表 (Postgres-based, 跨实例一致)。
 *    若 acquireLock 失败 (DB 错误), fail-open 走旧路径 (in-memory Set 仍生效)。
 *
 * 🔧 2026-07-15 (ARCH-3 #6 修复): Set → Map<string, number> with TTL
 *    旧代码: Set<String> — 如果 handler throw before finally, key 永久留在 Set
 *    → 该 (userId, tool, params) 组合在该 Vercel 实例上永久阻塞
 *    修复: Map<lockKey, timestamp>, 5 分钟 TTL 自动过期清理
 */
const inProgressToolCalls = new Map<string, number>();
const TOOL_CALL_TTL_MS = 5 * 60 * 1000; // 5 分钟

/** 清理过期的 lock entries (防止 Map 无限增长) */
function pruneExpiredLocks(): void {
  const now = Date.now();
  for (const [key, timestamp] of inProgressToolCalls.entries()) {
    if (now - timestamp > TOOL_CALL_TTL_MS) {
      inProgressToolCalls.delete(key);
    }
  }
}

export function isToolCallInProgress(lockKey: string): boolean {
  pruneExpiredLocks(); // 每次检查时清理过期 entries
  if (inProgressToolCalls.has(lockKey)) {
    return true; // Duplicate in progress
  }
  inProgressToolCalls.set(lockKey, Date.now());
  return false; // First call, proceed
}

export function releaseToolCallLock(lockKey: string): void {
  inProgressToolCalls.delete(lockKey);
}

/**
 * 🔧 Round 11 H3: 跨实例分布式锁 (可选 — 单实例时退化为 in-memory Set)。
 *    返回 true = 拿到锁 (应继续), false = 锁被占 (应跳过)。
 *    失败时 fail-open 返回 true (不阻塞业务, in-memory Set 仍提供单实例防护)。
 *
 *    注意: 此函数是 async, 而 isToolCallInProgress 是 sync。
 *    为保持调用方代码不变 (sync 调用), 此函数作为可选增强, 由调用方在适当位置调用。
 *    若调用方未调用, 仅依赖 in-memory Set (向后兼容)。
 */
export async function acquireDistributedToolCallLock(lockKey: string, ttlMs: number = 30_000): Promise<boolean> {
  try {
    const { acquireLock } = await import('@/lib/distributed-lock');
    return await acquireLock(lockKey, ttlMs, true); // failClosed=true
      // safe to ignore: non-critical background operation, error already logged
  } catch {
            // safe to ignore: non-critical background operation, error already logged
    // distributed-lock 模块加载失败或 DB 错误 — fail-open (in-memory Set 仍生效)
    return true;
  }
}

export async function releaseDistributedToolCallLock(lockKey: string): Promise<void> {
  try {
    const { releaseLock } = await import('@/lib/distributed-lock');
    await releaseLock(lockKey);
  } catch {
    // 释放失败 — TTL 自动过期, 不影响正确性
  }
}

/**
 * Check if a recent health_event with the same dedup key exists.
 * PostgreSQL write idempotency — prevents duplicate buddy_state updates if AI
 * happens to call the same tool twice (e.g., two parallel `complete_challenge` calls
 * with identical args). This is DB-level protection, not AI-error compensation.
 *
 * Uses health_events.trigger_id as primary dedup key.
 * Falls back to matching by description prefix (for events created by old code without triggerId).
 * Time window: 60 seconds for description-prefix fallback only.
 *
 * 🔧 ARCH fix (Round 30 AUDIT-6 HIGH-1): trigger_id check is now PERMANENT (no time window)
 *    旧代码: 60s window on trigger_id check → hourly bucket triggerIds bypass after 60s → reward farming
 *    根因修复: trigger_id 是永久 UNIQUE 约束, 不需要时间窗口。只有 description-prefix
 *    fallback 需要 60s 窗口 (旧代码创建的事件没有 triggerId, 需要时间限制防误匹配)。
 *
 * Returns true if duplicate found (should skip), false otherwise.
 * 🔧 2026-07-15: Fails CLOSED (returns true) on error to prevent reward farming.
 *    Old code failed open (returned false = "allow operation") on DB errors,
 *    which meant during a Supabase outage, both original + retry calls would
 *    pass dedup check → double reward application. Better to skip a legitimate
 *    operation (rare, only during outage) than allow double rewards (exploitable).
 */
export async function isDuplicateHealthEvent(
  userId: string,
  dedupKey: string,
  descriptionPrefix?: string,
  windowMs: number = 60_000,
): Promise<boolean> {
  const { supabase, error } = createAdminClient();
  if (error || !supabase) {
    logger.warn('[MCP] dedup check: no admin client, FAILING CLOSED (treating as duplicate to prevent double-reward)');
    return true;
  }

  // 🔧 HIGH-1 fix: Primary check — NO time window (trigger_id is permanent UNIQUE)
  const { data: dedupMatch, error: queryError } = await supabase
    .from('health_events')
    .select('id')
    .eq('user_id', userId)
    .eq('trigger_id', dedupKey)
    .limit(1);

  if (queryError) {
    logger.warn('[MCP] dedup check query failed, FAILING CLOSED (treating as duplicate):', queryError.message);
    return true;
  }

  if (dedupMatch && dedupMatch.length > 0) {
    return true; // Found by dedup key — permanently blocked
  }

  // Fallback check: match by description prefix (for events without triggerId)
  // This catches events created by old code (e.g., production during preview testing)
  // 🔧 HIGH-1: description-prefix fallback KEEPS time window (prevent false positives on old data)
  if (descriptionPrefix && descriptionPrefix.length > 10) {
    const since = new Date(Date.now() - windowMs).toISOString();
    const { data: descMatch } = await supabase
      .from('health_events')
      .select('id')
      .eq('user_id', userId)
      .gte('created_at', since)
      .like('description', `${descriptionPrefix}%`)
      .limit(1);

    if (descMatch && descMatch.length > 0) {
      logger.info(`[MCP] dedup check: found duplicate by description prefix "${descriptionPrefix.substring(0, 40)}..."`);
      return true;
    }
  }

  return false;
}

// ── Read-only: Get buddy_state ─────────────────────────────────────

/**
 * Get user's current buddy_state (read-only)
 * Auto-creates initial row if not exists.
 *
 * Do NOT use this for write operations — use applyBuddyStateDelta() instead.
 */
export async function getBuddyStateForRead(
  supabase: ReturnType<typeof createServerClient> | NonNullable<ReturnType<typeof createAdminClient>['supabase']>,
  userId: string,
): Promise<Record<string, unknown> | null> {
  const { data, error: selectError } = await supabase
    .from('buddy_state')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle();

  if (data) return data;

  // First access: auto-create initial buddy_state
  // BUG-91 fix: Use INSERT instead of UPSERT to avoid overwriting existing data.
  logger.info('[MCP] getBuddyStateForRead: no existing row for user', userId, ', auto-creating... selectError:', selectError?.message || 'none');
  const now = new Date().toISOString();
  const initialRow = {
    user_id: userId,
    vitality: DEFAULT_VITALITY,
    tokens: DEFAULT_TOKENS,
    health: DEFAULT_HEALTH,
    level: DEFAULT_LEVEL,
    xp: DEFAULT_XP,
    xp_to_next: DEFAULT_XP_TO_NEXT,
    streak: DEFAULT_STREAK,
    dream_funds: DEFAULT_DREAM_FUNDS,
    badges: DEFAULT_BADGES,
    total_saved: DEFAULT_TOTAL_SAVED,
    challenges_completed: DEFAULT_CHALLENGES_COMPLETED,
    last_drain_at: now,
    updated_at: now,
  };

  const { data: newData, error: insertError } = await supabase
    .from('buddy_state')
    .insert(initialRow)
    .select()
    .maybeSingle();

  if (insertError || !newData) {
    logger.warn('[MCP] getBuddyStateForRead insert failed (likely race), re-reading:', insertError?.message);
    const { data: existingData, error: reReadError } = await supabase
      .from('buddy_state')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle();

    if (reReadError || !existingData) {
      logger.error('[MCP] getBuddyStateForRead: failed to re-read after insert failure:', reReadError?.message);
      return null;
    }
    return existingData;
  }

  logger.info('[MCP] getBuddyStateForRead: auto-created row for user', userId, 'SUCCESS');
  return newData;
}

// ============================================================
// N73 fix: 从 profiles 表读用户 locale
// ============================================================

/**
 * 从 profiles 表读取用户 locale（用于 MCP handler 生成对应语言的 description）
 * @returns 'zh' | 'en'（默认 'en'）
 */
export async function getUserLocale(userId: string): Promise<'zh' | 'en'> {
  const { supabase } = createAdminClient();
  if (!supabase) return 'en';

  try {
    // 🔧 FIX-TS: 显式断言 result.data 类型，绕过 Supabase 类型推断在某些版本下
    // 可能返回 never 的 bug（具体原因不明，可能与 _shared.ts 中其他 supabase 用法类型污染有关）
    const result = await supabase
      .from('profiles')
      .select('locale')
      .eq('id', userId)
      .maybeSingle() as { data: { locale: string | null } | null };

    const locale = result.data?.locale;
    return (locale === 'zh') ? 'zh' : 'en';
      // safe to ignore: non-critical background operation, error already logged
  } catch (err) {
                  // safe to ignore: non-critical background operation, error already logged
    // 🔧 ARCH fix (Round 43 LOW-4 — 失败静默返回 'en', 中文用户看到英文 description):
    //    旧代码 catch {} 完全静默。DB 错误时中文用户的 health_event description 会变成英文。
    //    根因修复: logger.warn (仍返回 'en' 不阻塞主流程)。
    logger.warn('[MCP _shared] getUserLocale failed, returning default en:', err);
    return 'en';
  }
}
