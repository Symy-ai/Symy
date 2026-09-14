import 'server-only'; // 🔧 ARCH fix Round 73: server-only — prevents client bundle leak
/**
 * Distributed Lock — Serverless-safe deduplication & rate limiting
 *
 * Replaces in-memory Map-based locks that don't work across Vercel instances.
 * Uses Supabase as the persistence layer with TTL-based expiration.
 *
 * Two primitives:
 * 1. `acquireLock(key, ttlMs)` — Mutual exclusion (one active operation per key)
 * 2. `checkRateLimit(key, maxHits, windowMs)` — Rate limiting (N hits per window)
 *
 * Both are safe for serverless: state lives in Supabase, not in-process memory.
 */

import { createClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/database.types';
import { logger } from '@/lib/logger';

// ============================================================
// Supabase admin client (service role — bypasses RLS)
// ============================================================

// 🔧 ARCH fix (Round 12 API-19 — env var 用 ! non-null assertion):
//    旧代码: process.env.X! — build 时若 env var undefined, ! 欺骗 TS, 运行时 createClient(undefined,...) 报 confusing error
//    根因修复: 用 || '' 提供空字符串 fallback, getAdminClient 内 null check + 返回 nullable
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

let _adminClient: ReturnType<typeof createClient<Database>> | null = null;

function getAdminClient(): ReturnType<typeof createClient<Database>> | null {
  // 🔧 ARCH fix (Round 12 API-19): 校验 env var 存在, 否则返回 null (调用方 fail-open)
  if (!supabaseUrl || !supabaseServiceKey) {
    logger.warn('[DistributedLock] Supabase env vars not configured — distributed lock disabled (fail-open)');
    return null;
  }
  if (!_adminClient) {
    _adminClient = createClient<Database>(supabaseUrl, supabaseServiceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return _adminClient;
}

// ============================================================
// Table: distributed_locks (created by migration 024)
//
// CREATE TABLE distributed_locks (
//   key TEXT PRIMARY KEY,
//   value JSONB NOT NULL DEFAULT '{}',
//   expires_at TIMESTAMPTZ NOT NULL,
//   created_at TIMESTAMPTZ NOT NULL DEFAULT now()
// );
// ============================================================

/** Clean up expired locks for a given key prefix (lazy GC) */
async function gcExpired(prefix?: string) {
  try {
    const client = getAdminClient();
    if (!client) return; // 🔧 Round 12 API-19: env var 未配, fail-open
    let query = client.from('distributed_locks').delete().lt('expires_at', new Date().toISOString());
    if (prefix) {
      query = query.like('key', `${prefix}%`);
    }
    await query;
  } catch (e) {
    // GC failure is non-critical, but log for debugging
    logger.debug('[distributed-lock] GC failed:', e instanceof Error ? e.message : String(e));
  }
}

/**
 * Acquire a distributed lock.
 *
 * @param key - Lock key (e.g., `scan:${userId}`)
 * @param ttlMs - Lock TTL in milliseconds
 * @param failClosed - If true, return false on DB error (blocks operation).
 *                     If false (default), return true on DB error (allows operation).
 *                     🔧 ARCH fix (H14): 旧代码总是 fail-open → Supabase 抖动时所有并发请求
 *                     都拿到锁 → impulse_events 重复插入 + processReceiptsHealthImpact 双倍扣 vitality。
 *                     对有副作用的操作 (email scan/resync/imap-connect), 应传 failClosed=true。
 * @returns `true` if lock acquired, `false` if already locked or (failClosed && DB error)
 *
 * Usage:
 * ```ts
 * const locked = await acquireLock(`scan:${userId}`, 60_000, true); // failClosed
 * if (!locked) return res.json({ error: 'Already in progress' }, { status: 429 });
 * try { /* do work *\/ } finally { await releaseLock(`scan:${userId}`); }
 * ```
 */
// 🔧 ARCH fix (Round 20 BUG-R19D-H3 — ownership token for releaseLock):
//    模块级 Map 存 key → token, acquireLock 时生成, releaseLock 时读取。
//    每个 Vercel 实例有自己的 Map (进程内一致即可, 跨实例靠 TTL 超时)。
const lockOwnership = new Map<string, string>();

export async function acquireLock(key: string, ttlMs: number, failClosed: boolean = false): Promise<boolean> {
  try {
    const client = getAdminClient();
    if (!client) {
      // 🔧 Round 12 API-19: env var 未配 — failClosed 决定行为
      return !failClosed; // failClosed=true 返回 false (拒绝), false 返回 true (放行)
    }
    const now = new Date();
    const expiresAt = new Date(now.getTime() + ttlMs);
    // 🔧 Round 20 H3: 生成 ownership token
    const ownershipToken = crypto.randomUUID();

    // 1. Delete any expired lock on this key
    await client
      .from('distributed_locks')
      .delete()
      .eq('key', key)
      .lt('expires_at', now.toISOString());

    // 2. Try to insert (will fail if key exists = lock held)
    // 🔧 Round 20 H3: value 中存 ownershipToken, releaseLock 时验证
    const { error } = await client
      .from('distributed_locks')
      .insert({
        key,
        value: { acquiredAt: now.toISOString(), ownershipToken },
        expires_at: expiresAt.toISOString(),
      });

    if (error) {
      // Unique violation = lock already held by another instance
      if (error.code === '23505') {
        return false;
      }
      logger.warn('[DistributedLock] acquireLock error:', error.message);
      // 🔧 ARCH fix (H14): failClosed 时返回 false, 阻止有副作用的操作并发执行
      return !failClosed;
    }

    // 🔧 Round 20 H3: 存 token 到模块级 Map, releaseLock 时读取
    lockOwnership.set(key, ownershipToken);
    return true;
      // safe to ignore: non-critical background operation, error already logged
  } catch (e) {
                // safe to ignore: non-critical background operation, error already logged
    logger.warn('[DistributedLock] acquireLock exception (fail-' + (failClosed ? 'closed' : 'open') + '):', e);
    return !failClosed;
  }
}

/**
 * Release a distributed lock early (before TTL expires).
 *
 * 🔧 ARCH fix (Round 20 BUG-R19D-H3 — releaseLock 无 ownership token):
 *    旧代码: DELETE WHERE key=$key — 删任何持有者的锁。
 *    若进程 A 的锁过期, 进程 B 获取新锁, A 的 finally 调 releaseLock → 删了 B 的锁。
 *    根因修复: acquireLock 返回 ownership token, releaseLock 只删匹配 token 的锁。
 *    向后兼容: 若 token 未提供, 仍用旧行为 (删任何锁) — 但调用方应传 token。
 */
export async function releaseLock(key: string, ownershipToken?: string): Promise<void> {
  try {
    const client = getAdminClient();
    if (!client) return; // 🔧 Round 12 API-19: env var 未配, no-op
    // 🔧 Round 20 H3: 优先用参数传的 token, 否则从模块级 Map 读
    const token = ownershipToken || lockOwnership.get(key);
    if (token) {
      // 只删匹配 ownership token 的锁 (防止删别人的锁)
      await client
        .from('distributed_locks')
        .delete()
        .eq('key', key)
        .eq('value->>ownershipToken', token);
      lockOwnership.delete(key); // 清理 Map
    } else {
      // 旧路径 (无 token) — 删任何锁 (向后兼容, 如外部调用方)
      await client.from('distributed_locks').delete().eq('key', key);
    }
  } catch (e) {
    // Non-critical, but log — consistent failures indicate DB issues
    logger.debug('[distributed-lock] releaseLock failed:', e instanceof Error ? e.message : String(e));
  }
}

/**
 * Check rate limit (N hits per time window).
 *
 * @returns `{ allowed: boolean, remaining: number }`
 *
 * Usage:
 * ```ts
 * const { allowed, remaining } = await checkRateLimit(`ip:${ip}`, 10, 3600_000);
 * if (!allowed) return res.json({ error: 'Too many requests' }, { status: 429 } as never);
 * ```
 */
export async function checkRateLimit(
  key: string,
  maxHits: number,
  windowMs: number,
): Promise<{ allowed: boolean; remaining: number }> {
  try {
    const client = getAdminClient();
    if (!client) {
      // 🔧 Round 12 API-19: env var 未配, fail-open (与现有 catch 块语义一致)
      return { allowed: true, remaining: maxHits };
    }

    // 🔧 ARCH fix (Round 11 API-18 — 非原子 read-modify-write 根因修复):
    //    旧代码: SELECT value → JS+1 → UPDATE, 三步非原子。
    //    并发请求都读 count=5, 都写 6 → rate limit 形同虚设。
    //    根因修复: 调用 increment_rate_limit RPC (migration 050), 用 SELECT FOR UPDATE 原子化。
    const { data, error } = await client
      .rpc('increment_rate_limit', {
        p_key: key,
        p_max_hits: maxHits,
        p_window_ms: windowMs,
      });

    if (error) {
      // 🔧 ARCH fix (Round 20 BUG-R19D-L5 — RPC 失败时 fallback 到非原子 legacy 路径):
      //    旧代码: 任何 RPC error 都 fallback 到 legacyNonAtomicRateLimit (有 race)。
      //    migration 050 已部署多轮, RPC 应可用。transient error (timeout/connection)
      //    不应 fallback 到已知有 bug 的路径。
      //    根因修复: 只在 "function not found" (42883) 时 fallback (migration 未部署),
      //    其他 error fail-closed (deny + 严重告警)。
      const isFunctionMissing = (error as { code?: string }).code === '42883' ||
        error.message?.includes('Could not find the function') ||
        error.message?.includes('does not exist');
      if (isFunctionMissing) {
        logger.warn('[DistributedLock] increment_rate_limit RPC not deployed, falling back to legacy:', error.message);
        return legacyNonAtomicRateLimit(key, maxHits, windowMs);
      }
      // Transient or permission error — fail-closed
      logger.error('[DistributedLock] increment_rate_limit RPC error — DENYING (fail-closed):', error.message, 'code:', (error as { code?: string }).code);
      return { allowed: false, remaining: 0 };
    }

    const result = data as { allowed: boolean; remaining: number; count: number } | null;
    if (!result) {
      // RPC 返回 null (理论不应发生) — fail-closed
      logger.error('[DistributedLock] increment_rate_limit returned null — DENYING (fail-closed)');
      return { allowed: false, remaining: 0 };
    }

    return { allowed: result.allowed, remaining: result.remaining };
      // safe to ignore: non-critical background operation, error already logged
  } catch (e) {
                // safe to ignore: non-critical background operation, error already logged
    // 🔧 Round 20 L5: catch 也 fail-closed (旧代码 fail-open)
    logger.error('[DistributedLock] checkRateLimit exception — DENYING (fail-closed):', e);
    return { allowed: false, remaining: 0 };
  }
}

/**
 * Legacy non-atomic rate limit (used as fallback when RPC not deployed).
 * 🔧 ARCH fix (Round 11): 保留作为 RPC 未部署时的降级路径, 但生产环境应已部署 migration 050。
 */
async function legacyNonAtomicRateLimit(
  key: string,
  maxHits: number,
  windowMs: number,
): Promise<{ allowed: boolean; remaining: number }> {
  const client = getAdminClient();
  if (!client) return { allowed: true, remaining: maxHits }; // 🔧 Round 12 API-19
  const now = new Date();
  const windowStart = new Date(now.getTime() - windowMs);

  await gcExpired(key.split(':')[0]);

  const { data, error } = await client
    .from('distributed_locks')
    .select('value')
    .eq('key', key)
    .maybeSingle();

  if (error) {
    logger.warn('[DistributedLock] legacy read error:', error.message);
    return { allowed: true, remaining: maxHits };
  }

  const existing = (data as Record<string, unknown> | null)?.value as { count?: number; windowStart?: string } | null;

  if (!existing || !existing.windowStart || new Date(existing.windowStart) < windowStart) {
    const expiresAt = new Date(now.getTime() + windowMs + 60_000);
    await client
      .from('distributed_locks')
      .upsert(
        {
          key,
          value: { count: 1, windowStart: now.toISOString() },
          expires_at: expiresAt.toISOString(),
        },
        { onConflict: 'key' },
      );
    return { allowed: true, remaining: maxHits - 1 };
  }

  const currentCount = (existing.count || 0) + 1;
  const allowed = currentCount <= maxHits;
  const expiresAt = new Date(new Date(existing.windowStart).getTime() + windowMs + 60_000);

  await client
    .from('distributed_locks')
    .update({
      value: { ...existing, count: currentCount },
      expires_at: expiresAt.toISOString(),
    })
    .eq('key', key);

  return { allowed, remaining: Math.max(0, maxHits - currentCount) };
}
