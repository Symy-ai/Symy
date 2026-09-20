/**
 * Buddy State CRUD API
 *
 * GET  /api/buddy/state — 获取当前用户的 Buddy 伴侣状态
 * PUT  /api/buddy/state — 更新/创建 Buddy 伴侣状态（upsert）
 *
 * 数据持久化到 Supabase buddy_state 表（005 迁移）
 * 前端使用 Dexie (IndexedDB) 做本地缓存 + debounced push
 *
 * 🔧 2026-07-21: Migrated to withAuth HOF (was manual createAuthenticatedClient
 *    with ~10 mergeCookies calls — now handled automatically by withAuth).
 */

export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/with-auth';
import { logger } from '@/lib/logger';
// 🔧 ARCH fix (Round 23 MEDIUM-3): 从 buddy-defaults 导入常量, 替代 magic number
import {
  DEFAULT_VITALITY, DEFAULT_TOKENS, DEFAULT_XP_TO_NEXT,
  parseDailyNeeds, clampIntimacy, isValidGrowthStage, isValidPersonality,
} from '@/lib/buddy-defaults';
import { validateBody, isValidationError } from '@/lib/api-validation';
import { asUpsert } from '@/lib/supabase-type-helpers';
import type { Database } from '@/lib/database.types';
import { z } from 'zod';

type BuddyStateInsert = Database['public']['Tables']['buddy_state']['Insert'];

// GET: 获取 Buddy 状态
export const GET = withAuth(async ({ supabase, user }) => {
  // BUG-98 fix: Use maybeSingle() instead of single() to avoid PGRST116 error
  const { data, error } = await supabase
    .from('buddy_state')
    .select('*')
    .eq('user_id', user.id)
    .maybeSingle();

  if (error) {
    // 🔧 ARCH fix (Round 11 H6 — DB 错误不应返回 200 + null):
    //    旧代码 return NextResponse.json({ buddyState: null }) — 把 DB 错误 (RLS 拒绝 /
    //    连接失败 / 表损坏) 当作 "用户还没数据行" 处理。前端 use-buddy-state 收到 null
    //    后会初始化默认值并尝试 PUT, 但 PUT 也会因同样的 DB 问题失败 → 用户永久卡在
    //    "creating your buddy..." 加载状态, 没有任何错误反馈。
    //    根因修复: DB error 返回 500, 让前端 catch 并显示 error UI; 仅 data === null
    //    (无行) 才返回 200 + null (前端会创建初始行)。
    logger.warn('[Buddy State] GET error:', error.message);
    // 🔧 Round 111: Don't expose DB error details to client (security — could leak schema info)
    return NextResponse.json({ error: 'Failed to load buddy state' }, { status: 500 });
  }

  if (!data) {
    return NextResponse.json({ buddyState: null });
  }

  // 🔧 Round 126 用户决策: 删除 dream_funds JSONB 列, dream_funds 表是唯一 source of truth
  //    旧代码: 先读 JSONB (fallback), 再读表覆盖 — 两个数据源可能 drift
  //    新代码: 只读 dream_funds 表, 无 fallback, 无 drift
  const { data: dfRows, error: dfError } = await supabase
    .from('dream_funds')
    .select('fund_id, name, target, current, emoji, sort_order')
    .eq('user_id', user.id)
    .order('sort_order', { ascending: true });
  if (dfError) {
    logger.error('[Buddy State] dream_funds table query failed:', dfError.message);
    return NextResponse.json({ error: 'Failed to load dream funds. Please refresh.' }, { status: 500 });
  }
  const dreamFunds = (dfRows || []).map(r => ({
    id: r.fund_id,
    name: r.name,
    target: r.target,
    current: r.current,
    emoji: r.emoji,
  }));

  const { count: invitedCount, error: inviteError } = await supabase
    .from('invitations')
    .select('id', { count: 'exact', head: true })
    .eq('referrer_user_id', user.id)
    .eq('status', 'completed');
  if (inviteError) {
    // safe to ignore: covenant badge progress degrades to zero; buddy state remains usable
    logger.warn('[Buddy State] invitations count query failed:', inviteError.message);
  }

  // 转换数据库字段名为前端 camelCase 格式
  const buddyState = {
    vitality: data.vitality,
    tokens: data.tokens,
    health: data.health,
    level: data.level,
    xp: data.xp,
    xpToNext: data.xp_to_next,
    streak: data.streak,
    dreamFunds,
    badges: data.badges,
    invitedCount: invitedCount ?? 0,
    totalSaved: data.total_saved,
    challengesCompleted: data.challenges_completed,
    lastDrainAt: data.last_drain_at,
    lastHealingKitAt: data.last_healing_kit_at,
    updatedAt: data.updated_at,
    // 🔧 TECH-DEBT-B: 返回 version 给客户端用于乐观锁
    version: data.version ?? 1,
    // P1-5: 宠物陪伴感与个性成长系统
    // 🔧 Round 123 audit fix: data.growth_stage 是 string | null, isValidGrowthStage 需要 string
    //    修复: 加 null guard (null → 'baby' default)
    growthStage: data.growth_stage && isValidGrowthStage(data.growth_stage) ? data.growth_stage : 'baby',
    personality: data.personality && isValidPersonality(data.personality) ? data.personality : 'unknown',
    intimacy: clampIntimacy(data.intimacy ?? 0),
    dailyNeeds: parseDailyNeeds(data.daily_needs),
    proactiveMessages: Array.isArray(data.proactive_messages) ? data.proactive_messages : [],
    personalityAwakenedAt: data.personality_awakened_at ?? null,
    lastActiveAt: data.last_active_at ?? null,
  };

  return NextResponse.json({ buddyState }, { headers: { 'x-deploy-tag': 'phase1-fix-v2' } });
});

// PUT: 更新/创建 Buddy 状态 (upsert with optimistic locking)
// 🔧 TECH-DEBT-B: Optimistic locking via version column
export const PUT = withAuth(async ({ supabase, user, request }) => {
  // 🔧 ARCH fix (Round 6 AUDIT-3 P0 #1): 用 zod 验证 top-level shape, 拒绝 prototype pollution / 非法输入
  //    旧代码: body as { buddyState?: Record<string, unknown> } — cast 无运行时验证
  //    根因修复: zod schema 严格验证 top-level, 后续 clamp 逻辑保留 (clamp 比拒绝更友好)
  const putSchema = z.object({
    buddyState: z.record(z.string(), z.unknown()),
  });
  const bodyResult = await validateBody(request, putSchema);
  if (isValidationError(bodyResult)) return bodyResult;
  const buddyState = bodyResult.buddyState;

  // BUG-92 fix: Server-side validation — clamp all values to valid ranges
  // Prevents users from giving themselves unlimited tokens, max vitality, etc.

  // BUG-155 fix: health 字段只允许合法枚举值
  const VALID_HEALTH = ['thriving', 'healthy', 'weak', 'critical', 'dormant'] as const;
  const rawHealth = String(buddyState.health ?? 'healthy');
  const health = VALID_HEALTH.includes(rawHealth as typeof VALID_HEALTH[number]) ? rawHealth : 'healthy';

  // 🔧 ARCH fix (Round 5 H2): NaN injection 防护 — Number("abc") → NaN → Math.max/min 仍为 NaN
  // 用 clampNum 辅助函数: 非有限数 fallback 到默认值
  const clampNum = (v: unknown, min: number, max: number, fallback: number): number => {
    const n = Number(v);
    return Number.isFinite(n) ? Math.max(min, Math.min(max, n)) : fallback;
  };

  // 🔧 2026-07-15 (ARCH-10 P0-7 修复): 服务端管理字段 — 客户端永远不能写入
  //    此前客户端可 PUT { lastHealingKitAt: "1970-01-01" } 重置 healing kit 每日限制
  //    或 PUT { totalSaved: 1_000_000_000 } 伪造存款总额
  //    修复: 这些字段只由 RPC (use_healing_kit / apply_buddy_state_delta / complete_challenge_atomic) 写入
  //    PUT 完全忽略客户端传入的值, 保留 DB 现值 (通过不写入 row 对象实现)
  //
  //  受保护字段 (server-only):
  //    - lastHealingKitAt: use_healing_kit RPC 独占 (防止每日限制绕过)
  //    - totalSaved: dream fund 操作 + apply_buddy_state_delta RPC 独占 (防止伪造存款)
  //    - challengesCompleted: complete_challenge_atomic RPC 独占 (防止伪造完成数)
  //    - badges: 各种 RPC (record_impulse / refund_boost 等) 独占 (防止伪造徽章)
  //  允许客户端写入的字段 (UX/timer 需要):
  //    - vitality, tokens, xp, xpToNext, level, streak, health (timer drain/bonus 计算)
  //    - version (乐观锁), lastDrainAt (drain 时间戳), updatedAt (自动)

  const clientVersion = Number.isFinite(Number(buddyState.version)) ? Number(buddyState.version) : 0;

  // 🔧 ARCH fix (Round 17 audit H5 — version=-1 绕过乐观锁):
  //    旧代码: clientVersion < 0 既不 === 0 也不 > 0, fall through 到 upsert (无 version 检查)。
  //    后果: 客户端发 version=-1 可绕过 CAS, 覆盖 MCP 工具的写入 (如把 record_impulse 扣的 vitality 恢复)。
  //    根因修复: 负数 version 视为 0 (first write 语义), 走 version===0 路径 (检查行是否存在)。
  const normalizedVersion = clientVersion < 0 ? 0 : clientVersion;

  // 🔧 Round 123 audit fix: 用 typed object 替代 Record<string, unknown>
  //    旧代码: const row: Record<string, unknown> = {...} → Supabase typed insert 拒绝
  //    新代码: 用 typed object (toJson 不再需要 — badges 列已移除)
  // 🔧 2026-07-15 (ARCH-10 P0-7 + migration 111 兼容修复):
  //    row 对象不包含 user_id — migration 111 的 column-level GRANT 不包含 user_id
  //    旧代码: row 包含 user_id: user.id → CAS update 的 SET 子句包含 user_id
  //    → PostgREST 报 42501 (insufficient_privilege) because authenticated
  //      role doesn't have GRANT UPDATE(user_id)
  //    修复: 移除 user_id from row (WHERE 子句 .eq('user_id', user.id) 已经处理)
  const row: {
    vitality: number;
    tokens: number;
    health: string;
    level: number;
    xp: number;
    xp_to_next: number;
    streak: number;
    last_drain_at: string;
    updated_at: string;
  } = {
    vitality: clampNum(buddyState.vitality, 0, 100, DEFAULT_VITALITY),
    tokens: clampNum(buddyState.tokens, 0, 500, DEFAULT_TOKENS),
    health,
    level: clampNum(buddyState.level, 1, 100, 1),
    xp: clampNum(buddyState.xp, 0, 1_000_000, 0),
    xp_to_next: clampNum(buddyState.xpToNext, 1, 1_000_000, DEFAULT_XP_TO_NEXT),
    streak: clampNum(buddyState.streak, 0, 365, 0),
    last_drain_at: typeof buddyState.lastDrainAt === 'string' && !isNaN(Date.parse(buddyState.lastDrainAt))
      ? buddyState.lastDrainAt
      : new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  // upsert 路径需要 user_id (作为 onConflict key)
  const upsertRow = { user_id: user.id, ...row };
  // P1-5: 宠物陪伴感与个性成长系统字段不通过 PUT 写入
  // 原因: 这些字段是服务端管理字段, 必须通过 RPC 写入:
  //   - growth_stage: 通过 update_buddy_growth_stage RPC (level 变化时)
  //   - personality: 通过 awaken_buddy_personality RPC (觉醒时)
  //   - intimacy: 通过 bump_intimacy RPC (行为触发时)
  //   - daily_needs: 通过 replenish_daily_need / decay_daily_needs RPC
  //   - proactive_messages: 通过 add_proactive_message / mark_proactive_message_read RPC
  //   - personality_awakened_at: 通过 awaken_buddy_personality RPC
  //   - last_active_at: 通过后台 cron 或 API 中间件更新
  // 这样设计的好处:
  //   1. backward compatible — migration 089 执行前 PUT 不会因列不存在而 500
  //   2. 安全 — 客户端无法伪造 growth_stage / personality 等
  //   3. 审计 — 所有变更都走 RPC, 有原子操作 + 日志

  // 🔧 2026-07-15 (ARCH-10 P0-7 完整修复): last_healing_kit_at 完全不接受客户端写入
  //    旧代码 (Round 12 - Round 28): 接受客户端 string 时间戳 → 可设 "1970-01-01" 绕过每日限制
  //    根因修复: last_healing_kit_at 是服务端独占字段, 只有 use_healing_kit RPC 可以设。
  //    PUT 完全忽略客户端传入, DB 保留 RPC 写入的现值。
  //    (migration 018 已在生产应用, 不需要兼容性 fallback)

  // 🔧 TECH-DEBT-B: Optimistic locking with version column
  // 🔧 ARCH fix (Round 5 H1): version=0 绕过乐观锁 — 先检查行是否存在, 若存在则拒绝 version=0
  // 1. If client provides version > 0, use CAS (update only if version matches)
  // 2. If client provides version = 0 AND row exists, return 409 (force client to re-read)
  // 3. If client provides version = 0 AND row doesn't exist, allow upsert (first write)

  // 先检查行是否存在 (Round 5 H1 fix)
  if (normalizedVersion === 0) {
    const { data: existing } = await supabase
      .from('buddy_state')
      .select('version')
      .eq('user_id', user.id)
      .maybeSingle();

    if (existing) {
      // 行已存在但客户端 version=0 → 拒绝, 要求客户端重新读取
      logger.info(`[Buddy State] version=0 but row exists (server version=${existing.version}), returning 409`);
      return NextResponse.json(
        { error: 'Conflict: version mismatch. Please refresh buddy state.', conflict: true, serverVersion: existing.version },
        { status: 409 },
      );
    }
    // 行不存在 → 首次写入, 允许 upsert with version=1
  }

  if (normalizedVersion > 0) {
    // CAS: update only if current version matches client's expected version
    const { data, error } = await supabase
      .from('buddy_state')
      .update({ ...row, version: normalizedVersion + 1 })
      .eq('user_id', user.id)
      .eq('version', normalizedVersion)
      .select()
      .maybeSingle();

    if (error) {
      // 🔧 ARCH fix (Round 12 audit H3 — CAS error fallback 到 upsert 绕过乐观锁):
      //    旧代码: 任何 CAS UPDATE error 都 fall through 到 upsert (无 version 检查)。
      //    问题: transient DB error (timeout/RLS denial/connection reset) 也 fall through,
      //    upsert 用旧 row 覆盖并发 CAS 写入的结果, 客户端看到"成功"但数据丢失。
      //    根因修复: 只在 schema-missing error (PGRST code 42703 = undefined column) 时 fall through。
      //    其他 error (transient/RLS/perms) 返回 500, 让客户端知道写入失败可重试。
      const isSchemaError = error.code === '42703' || // undefined column
                            error.message?.includes('column') && error.message?.includes('does not exist');
      if (isSchemaError) {
        logger.warn('[Buddy State] CAS update failed (version column missing, migration 025 not applied), falling through to upsert:', error.message);
        // Fall through to upsert (schema migration pending)
      } else {
        // Transient or permission error — don't silently overwrite via upsert
        logger.error('[Buddy State] CAS update failed (transient/permission error), NOT falling through to upsert:', error.message, 'code:', error.code);
        return NextResponse.json({ error: 'Failed to save buddy state. Please try again.' }, { status: 500 });
      }
    } else if (!data) {
      // Version mismatch — another write happened since client last read
      // Return 409 Conflict so client can re-read and retry
      logger.info(`[Buddy State] Version conflict: client=${normalizedVersion}, server has newer`);
      return NextResponse.json(
        { error: 'Conflict: buddy state was modified by another session. Please refresh.', conflict: true },
        { status: 409 },
      );
    } else {
      // CAS success
      return NextResponse.json({ success: true, updatedAt: data.updated_at, version: data.version });
    }
  }

  // Fallback: upsert without version check (legacy client or first write)
  // 🔧 2026-07-15: upsert 路径用 upsertRow (含 user_id, 因为 upsert 需要 onConflict key)
  //    注意: upsert 也受 migration 111 column-level GRANT 限制
  //    但 upsert 对新行 INSERT 时, 所有列都需要 INSERT 权限 (authenticated 默认有)
  //    对已存在行 UPDATE 时, 只更新 GRANT 允许的列
  const { data, error } = await supabase
    .from('buddy_state')
    .upsert(asUpsert<BuddyStateInsert>(upsertRow), { onConflict: 'user_id' })
    .select()
    .maybeSingle();

  if (error) {
    logger.warn('[Buddy State] PUT upsert error:', error.message);
    return NextResponse.json({ error: 'Failed to save buddy state' }, { status: 500 });
  }

  return NextResponse.json({ success: true, updatedAt: data?.updated_at, version: (data as Record<string, unknown>)?.version ?? 1 });
});
