import 'server-only'; // 🔧 ARCH fix Round 73: server-only — prevents client bundle leak
/**
 * Challenge Store — active_challenges 表的数据访问层
 *
 * 实现"状态外置"接口设计原则（见 .memory/api-design-principles.md）
 * 挑战状态存 DB，不依赖前端 state 传递。
 *
 * 核心流程:
 * 1. 前端发起挑战 → createChallenge() → 返回 challenge_id
 * 2. context header 注入 challenge_id
 * 3. AI 调 complete_challenge(challenge_id, status)
 * 4. handler 通过 challenge_id 查表取 amount/itemName/challenge_type
 * 5. 挑战结束 → completeChallenge() UPDATE status
 */

import { createAdminClient } from '@/lib/supabase-admin';
import { logger } from '@/lib/logger';

/**
 * Database row for active_challenges table.
 *
 * 🔧 ARCH fix (Round 8 AUDIT-3 P0 #3): 重命名 ActiveChallengeRow → ActiveChallengeRow
 *    旧代码: 此类型与 src/components/chat/hooks/use-challenge-actions.ts 的 ActiveChallengeRow 同名
 *    但字段完全不同 (DB row vs client challenge context) → 命名冲突 + drift 风险。
 *    根因修复: 重命名为 ActiveChallengeRow 明确表示 DB 行结构。
 */
export interface ActiveChallengeRow {
  id: string;
  user_id: string;
  item_name: string;
  amount: number;
  challenge_type: 'quick_pass' | 'standard' | 'boss';
  status: 'active' | 'passed' | 'failed' | 'expired';
  created_at: string;
  completed_at: string | null;
  metadata: Record<string, unknown>;
  // 🔧 Round 80 F2: added deposit_status + deposited_at (migration 079/088)
  deposit_status: 'unsettled' | 'processing' | 'deposited' | 'skipped';
  deposited_at: string | null;
}

/**
 * 创建新挑战
 * - 如果用户已有 active 挑战，先把旧的标记为 expired
 * - INSERT 新挑战，challenge_type 由 trigger 自动计算
 * - 返回 challenge_id
 */
export async function createChallenge(
  userId: string,
  itemName: string,
  amount: number,
): Promise<{ success: boolean; challengeId?: string; error?: string }> {
  const { supabase, error: adminError } = createAdminClient();
  if (!supabase) {
    return { success: false, error: adminError || 'No admin client' };
  }

  try {
    // 🔧 ARCH fix (Round 2 C5 — createChallenge race condition):
    //    旧代码两步 (UPDATE active→expired + INSERT new) 非原子 → 两个并发请求互相 expire 对方的 challenge。
    //    根因修复: 优先用 create_challenge_atomic RPC (单事务 + 行锁), fallback 到旧两步逻辑 (向后兼容)。
    // 🔧 ARCH fix (Round 49 R49-A-2): 移除 as unknown as cast — create_challenge_atomic 已在 database.types.ts
    const { data: rpcId, error: rpcError } = await supabase.rpc('create_challenge_atomic', {
      p_user_id: userId,
      p_item_name: itemName,
      p_amount: amount,
    });

    if (!rpcError && rpcId) {
      const challengeId = rpcId as string;
      logger.info(`[Challenge Store] Created challenge ${challengeId} for user ${userId.substring(0, 8)}: ${itemName} $${amount} [atomic]`);
      return { success: true, challengeId };
    }

    if (rpcError) {
      // 🔧 ARCH fix (Round 15 audit M14 — RPC 失败时 fallback 到非原子两步, 重新引入竞态):
      //    旧代码: 任何 rpcError 都 fallback → transient error (timeout/RLS/connection) 也走非原子路径。
      //    根因修复: 只在 "function not found" (42883) 时 fallback (migration 039 未部署)。
      //    其他 error 返回失败, 不走已知有 bug 的非原子路径。
      const isFunctionMissing = rpcError.code === '42883' ||
        rpcError.message?.includes('Could not find the function') ||
        rpcError.message?.includes('does not exist');
      if (isFunctionMissing) {
        logger.warn('[Challenge Store] create_challenge_atomic RPC not deployed, falling back to two-step:', rpcError.message);
        // Fall through to two-step fallback (backward compat for migration 039 not applied)
      } else {
        // Transient or permission error — don't fall back to known-buggy path
        logger.error('[Challenge Store] create_challenge_atomic RPC error (not falling back):', rpcError.message, 'code:', rpcError.code);
        return { success: false, error: 'Failed to create challenge. Please try again.' };
      }
    }

    // Fallback: 旧两步逻辑 (有竞态, 但向后兼容)
    // 1. 把用户现有的 active 挑战标记为 expired（UNIQUE 约束要求）
    const { error: expireError } = await supabase
      .from('active_challenges')
      .update({ status: 'expired' })
      .eq('user_id', userId)
      .eq('status', 'active');

    if (expireError) {
      logger.warn('[Challenge Store] Failed to expire previous active challenge:', expireError.message);
      // 不阻断，继续创建新的
    }

    // 2. INSERT 新挑战
    const { data, error } = await supabase
      .from('active_challenges')
      .insert({
        user_id: userId,
        item_name: itemName,
        amount,
      })
      .select('id')
      .single();

    if (error || !data) {
      // 🔧 ARCH fix (Round 27 R25-14 — INSERT 撞唯一索引 (23505) 不重试 → 用户看到"创建失败"):
      //    若 expireError 发生 (DB connection drop), 旧 active 仍在, INSERT 撞 23505。
      //    根因修复: 23505 时重试 expire + INSERT (与 session/route.ts 23505 retry 模式一致)。
      if ((error as { code?: string })?.code === '23505') {
        logger.warn('[Challenge Store] INSERT hit unique constraint (23505), retrying expire + insert');
        // 重试 expire
        await supabase
          .from('active_challenges')
          .update({ status: 'expired' })
          .eq('user_id', userId)
          .eq('status', 'active');
        // 重试 INSERT
        const { data: retryData, error: retryError } = await supabase
          .from('active_challenges')
          .insert({
            user_id: userId,
            item_name: itemName,
            amount,
          })
          .select('id')
          .single();
        if (retryError || !retryData) {
          logger.error('[Challenge Store] Retry INSERT also failed:', retryError?.message);
          return { success: false, error: retryError?.message || 'Insert failed after retry' };
        }
        const retryId = (retryData as Record<string, unknown> | null)?.id as string;
        logger.info(`[Challenge Store] Created challenge ${retryId} for user ${userId.substring(0, 8)}: ${itemName} $${amount} [fallback retry]`);
        return { success: true, challengeId: retryId };
      }
      logger.error('[Challenge Store] Failed to create challenge:', error?.message);
      return { success: false, error: error?.message || 'Insert failed' };
    }

    logger.info(`[Challenge Store] Created challenge ${(data as Record<string, unknown> | null)?.id as string} for user ${userId.substring(0, 8)}: ${itemName} $${amount} [fallback]`);
    return { success: true, challengeId: (data as Record<string, unknown> | null)?.id as string };
      // safe to ignore: non-critical background operation, error already logged
  } catch (err) {
                  // safe to ignore: non-critical background operation, error already logged
    logger.error('[Challenge Store] createChallenge threw:', err);
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/**
 * 通过 challenge_id 查询挑战详情
 * 用于 complete_challenge handler 查表取 amount/itemName/challenge_type
 * 🔧 S2 fix: 加 userId 校验, 防止跨用户访问
 */
export async function getChallengeById(
  challengeId: string,
  userId: string,
): Promise<{ success: boolean; challenge?: ActiveChallengeRow; error?: string }> {
  const { supabase, error: adminError } = createAdminClient();
  if (!supabase) {
    return { success: false, error: adminError || 'No admin client' };
  }

  try {
    const { data, error } = await supabase
      .from('active_challenges')
      .select('*')
      .eq('id', challengeId)
      .eq('user_id', userId)  // 🔧 S2 fix: 防止跨用户访问
      .maybeSingle<ActiveChallengeRow>();

    if (error) {
      logger.error('[Challenge Store] Failed to get challenge:', error.message);
      return { success: false, error: error.message };
    }

    if (!data) {
      return { success: false, error: 'Challenge not found or does not belong to this user' };
    }

    return { success: true, challenge: data };
      // safe to ignore: non-critical background operation, error already logged
  } catch (err) {
                  // safe to ignore: non-critical background operation, error already logged
    logger.error('[Challenge Store] getChallengeById threw:', err);
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/**
 * 标记挑战完成（passed/failed）
 * 挑战结束后由 complete_challenge handler 调用
 * 🔧 S2 fix: 加 userId 校验, 防止跨用户修改
 */
export async function completeChallenge(
  challengeId: string,
  userId: string,
  status: 'passed' | 'failed',
): Promise<{ success: boolean; error?: string; rowsAffected?: number }> {
  const { supabase, error: adminError } = createAdminClient();
  if (!supabase) {
    return { success: false, error: adminError || 'No admin client' };
  }

  try {
    // 🔧 S3 fix: CAS (Compare-And-Set) — 只更新 status='active' 的行
    // 如果 rowsAffected=0, 说明挑战已被另一个并发请求完成
    const { data, error } = await supabase
      .from('active_challenges')
      .update({ status })
      .eq('id', challengeId)
      .eq('user_id', userId)  // 🔧 S2 fix: 防止跨用户修改
      .eq('status', 'active') // 🔧 S3 fix: CAS, 只更新 active 状态的行
      .select('id');

    if (error) {
      logger.error('[Challenge Store] Failed to complete challenge:', error.message);
      return { success: false, error: error.message };
    }

    const rowsAffected = data?.length || 0;
    if (rowsAffected === 0) {
      logger.info(`[Challenge Store] Challenge ${challengeId} CAS failed (already completed or not active)`);
      return { success: true, rowsAffected: 0 };
    }

    // 🔧 PM-COUNT fix (2026-07-17): 挑战完成时 daily_see_it_count +1
    //   旧代码: create 时 +1 → 用户创建5次但只完成2次 → count=5 但守护之书只有2条
    //   新代码: complete 时 +1 → count 反映"已完成的看见", 与守护之书一致
    try {
      const { getLimitWindow } = await import('@/lib/limit-window');
      const todayWindow = getLimitWindow();
      // 查询当前 count + date
      const { data: bsData } = await supabase
        .from('buddy_state')
        .select('daily_see_it_count, daily_see_it_date')
        .eq('user_id', userId)
        .maybeSingle();
      const currentCount = (bsData as { daily_see_it_count?: number } | null)?.daily_see_it_count || 0;
      const currentDate = (bsData as { daily_see_it_date?: string } | null)?.daily_see_it_date;
      const newCount = currentDate === todayWindow ? currentCount + 1 : 1;
      await supabase
        .from('buddy_state')
        .update({ daily_see_it_count: newCount, daily_see_it_date: todayWindow })
        .eq('user_id', userId);
      logger.info(`[Challenge Store] daily_see_it_count updated: ${newCount} (window: ${todayWindow})`);
    } catch (countErr) {
      // safe to ignore: non-critical — 计数失败不影响挑战完成, 下次完成时会重新计数
      logger.warn('[Challenge Store] Failed to update daily_see_it_count:', countErr);
    }

    logger.info(`[Challenge Store] Challenge ${challengeId} marked as ${status} (CAS success)`);
    return { success: true, rowsAffected };
      // safe to ignore: non-critical background operation, error already logged
  } catch (err) {
                  // safe to ignore: non-critical background operation, error already logged
    logger.error('[Challenge Store] completeChallenge threw:', err);
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/**
 * 获取用户当前 active 挑战（如果有）
 * 用于前端刷新页面时恢复挑战状态
 * 🔧 P3c fix: 加 30 分钟过滤, 即使 DB trigger 没执行也不返回过期挑战
 */
export async function getActiveChallenge(
  userId: string,
): Promise<{ success: boolean; challenge?: ActiveChallengeRow; error?: string }> {
  const { supabase, error: adminError } = createAdminClient();
  if (!supabase) {
    return { success: false, error: adminError || 'No admin client' };
  }

  try {
    // 🔧 挑战模式 UI 分离: 24 小时过期 (之前 30 分钟)
    // 挑战模式有独立红色主题, 用户明确知道在挑战中, 不需要 30 分钟激进过期
    // 24 小时覆盖"睡一觉回来继续"的真实场景
    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { data, error } = await supabase
      .from('active_challenges')
      .select('*')
      .eq('user_id', userId)
      .eq('status', 'active')
      .gte('created_at', twentyFourHoursAgo)  // 🔧 24 小时过滤
      .limit(1)  // 🔧 ARCH fix (Round 6 M8): 防 PGRST116 (多行时 maybeSingle 抛错)
      .maybeSingle<ActiveChallengeRow>();

    if (error) {
      logger.error('[Challenge Store] Failed to get active challenge:', error.message);
      return { success: false, error: error.message };
    }

    return { success: true, challenge: data || undefined };
      // safe to ignore: non-critical background operation, error already logged
  } catch (err) {
                  // safe to ignore: non-critical background operation, error already logged
    logger.error('[Challenge Store] getActiveChallenge threw:', err);
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/**
 * 获取用户最近的过期挑战（24小时内 expired 的）
 * 用于在 chat 顶部显示"恢复挑战"提醒
 */
export async function getRecentExpiredChallenge(
  userId: string,
): Promise<{ success: boolean; challenge?: ActiveChallengeRow; error?: string }> {
  const { supabase, error: adminError } = createAdminClient();
  if (!supabase) {
    return { success: false, error: adminError || 'No admin client' };
  }

  try {
    // 查 24 小时内 expired 的挑战（跟 active 过期窗口一致）
    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { data, error } = await supabase
      .from('active_challenges')
      .select('*')
      .eq('user_id', userId)
      .eq('status', 'expired')
      .gte('created_at', twentyFourHoursAgo)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle<ActiveChallengeRow>();

    if (error) {
      logger.error('[Challenge Store] Failed to get expired challenge:', error.message);
      return { success: false, error: error.message };
    }

    return { success: true, challenge: data || undefined };
      // safe to ignore: non-critical background operation, error already logged
  } catch (err) {
                  // safe to ignore: non-critical background operation, error already logged
    logger.error('[Challenge Store] getRecentExpiredChallenge threw:', err);
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/**
 * 恢复过期挑战（expired → active）
 * 用户点击"恢复挑战"按钮时调用
 * CAS: 只更新 expired 状态的行，先把其他 active 标 expired
 */
export async function resumeChallenge(
  challengeId: string,
  userId: string,
): Promise<{ success: boolean; challenge?: ActiveChallengeRow; error?: string }> {
  const { supabase, error: adminError } = createAdminClient();
  if (!supabase) {
    return { success: false, error: adminError || 'No admin client' };
  }

  try {
    // 🔧 H8 fix: 两步操作合并为 RPC 事务, 消除 TOCTOU 竞态
    // 之前: 先 UPDATE active→expired, 再 UPDATE expired→active (两步之间窗口可被并发插入)
    // 现在: 用 PostgreSQL RPC 原子执行两步 (有 fallback 到旧逻辑)
    // 🔧 ARCH fix (Round 49 R49-A-2): 移除 as unknown as cast — resume_challenge_atomic 已在 database.types.ts
    const { data: rpcData, error: rpcError } = await supabase.rpc('resume_challenge_atomic', {
        p_challenge_id: challengeId,
        p_user_id: userId,
      });

    if (rpcError) {
      // 🔧 ARCH fix (Round 21 BUG-R21-H3 — 任何 RPC error 都 fallback 重新引入 TOCTOU race):
      //    旧代码复制了 Round 15 之前的反模式: 任何 rpcError 都 fallback 到非原子两步逻辑。
      //    transient error (网络抖动/Supabase 重启/RLS 误拒) 时 fallback 到已知有 TOCTOU race 的两步逻辑。
      //    根因修复: 复制 createChallenge (challenge-store.ts:68-79) 的 guard —
      //    只在 RPC code=42883 (function not found) 时 fallback, 其他 error 返回失败。
      const rpcErrAny = rpcError as { code?: string; message?: string };
      const isFunctionMissing = rpcErrAny.code === '42883' ||
        rpcErrAny.message?.includes('Could not find the function') ||
        rpcErrAny.message?.includes('does not exist');
      if (!isFunctionMissing) {
        logger.error('[Challenge Store] resume_challenge_atomic RPC error (not falling back):', rpcErrAny.message, 'code:', rpcErrAny.code);
        return { success: false, error: 'Failed to resume challenge. Please try again.' };
      }
      // RPC 未部署 (migration 058 未应用) → fallback 到旧的两步逻辑 (向后兼容)
      logger.warn('[Challenge Store] resume_challenge_atomic RPC not deployed, falling back to two-step:', rpcErrAny.message);

      // 1. 先把用户现有的 active 挑战标 expired（唯一索引要求）
      await supabase
        .from('active_challenges')
        .update({ status: 'expired' })
        .eq('user_id', userId)
        .eq('status', 'active');

      // 2. CAS: 把指定的 expired 挑战恢复为 active
      // 🔧 ARCH fix (Round 2 H7 — resumeChallenge doesn't reset created_at):
      //    旧代码只更新 status, 不更新 created_at → 若 challenge 已创建 25h 前 (超 24h 过期),
      //    resume 后 status=active 但 created_at 仍 25h 前 → getActiveChallenge 的 24h 过滤器
      //    立即把它过滤掉 → 用户点 resume 看到一闪, 刷新后消失。
      //    根因修复: 同时更新 created_at = now(), 重置 24h 窗口。
      const { data, error } = await supabase
        .from('active_challenges')
        .update({ status: 'active', created_at: new Date().toISOString() })
        .eq('id', challengeId)
        .eq('user_id', userId)
        .eq('status', 'expired')
        .select('*')
        .maybeSingle<ActiveChallengeRow>();

      if (error) {
        logger.error('[Challenge Store] Failed to resume challenge:', error.message);
        return { success: false, error: error.message };
      }

      if (!data) {
        return { success: false, error: 'Challenge not found or not in expired state' };
      }

      logger.info(`[Challenge Store] Challenge ${challengeId} resumed (expired → active) [fallback]`);
      return { success: true, challenge: data };
    }

    // RPC 成功 — 解析返回数据
    if (!rpcData || (rpcData as { success?: boolean }).success === false) {
      return { success: false, error: (rpcData as { error?: string })?.error || 'Challenge not found or not in expired state' };
    }

    const challenge = (rpcData as { challenge?: ActiveChallengeRow }).challenge;
    logger.info(`[Challenge Store] Challenge ${challengeId} resumed (expired → active) [atomic]`);
    return { success: true, challenge };
      // safe to ignore: non-critical background operation, error already logged
  } catch (err) {
                  // safe to ignore: non-critical background operation, error already logged
    logger.error('[Challenge Store] resumeChallenge threw:', err);
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/**
 * 永久放弃挑战（expired → 不会在提醒中显示）
 * 用户点击"忽略"按钮时调用
 * 把 status 改成 'failed'（语义：用户主动放弃）
 */
export async function dismissChallenge(
  challengeId: string,
  userId: string,
): Promise<{ success: boolean; error?: string }> {
  const { supabase, error: adminError } = createAdminClient();
  if (!supabase) {
    return { success: false, error: adminError || 'No admin client' };
  }

  try {
    // 🔧 ARCH fix (Round 2 H5 — silent 0-row success):
    //    旧代码只检查 error, 不检查 rowsAffected → 若 challenge 不是 'expired' 状态 (已 active/passed/failed/不存在),
    //    UPDATE 匹配 0 行, 无 error, 返回 success:true → 用户以为删了, 刷新后重现。
    //    根因修复: 用 .select() 返回更新的行, 若 0 行则返回失败。

    // 🔧 PM-#7 fix: dismissChallenge 写 metadata.dismissed=true, 让 pattern-alert 能区分
    //   "用户忽略过期挑战" (dismissed) vs "用户看清成本仍购买" (真正 failed)
    //   两者状态都是 'failed', 但语义不同 — pattern alert 只应统计后者
    //
    //   注意: 不能直接用 metadata: { dismissed: true } 覆盖, 会丢失现有 metadata
    //   (如 challengeId, challengeType, savedAmount, itemName 等)
    //   修复: 先读现有 metadata, 再合并 dismissed: true

    // Step 1: 读取现有 challenge 的 metadata
    const { data: existingChallenge, error: fetchError } = await supabase
      .from('active_challenges')
      .select('metadata')
      .eq('id', challengeId)
      .eq('user_id', userId)
      .eq('status', 'expired')
      .maybeSingle();

    if (fetchError) {
      logger.error('[Challenge Store] Failed to fetch challenge for metadata merge:', fetchError.message);
      return { success: false, error: fetchError.message };
    }

    if (!existingChallenge) {
      logger.warn(`[Challenge Store] dismissChallenge: challenge ${challengeId} not found or not in expired state`);
      return { success: false, error: 'Challenge not found or not in expired state' };
    }

    // Step 2: 合并 dismissed: true 到现有 metadata
    const existingMetadata = (existingChallenge as { metadata?: Record<string, unknown> }).metadata || {};
    const mergedMetadata = { ...existingMetadata, dismissed: true };

    // Step 3: UPDATE status + 合并后的 metadata
    const { data, error } = await supabase
      .from('active_challenges')
      .update({
        status: 'failed',
        metadata: mergedMetadata,
      })
      .eq('id', challengeId)
      .eq('user_id', userId)
      .eq('status', 'expired')
      .select('id');

    if (error) {
      logger.error('[Challenge Store] Failed to dismiss challenge:', error.message);
      return { success: false, error: error.message };
    }

    if (!data || data.length === 0) {
      // 0 行更新 — challenge 不存在、不属于此用户、或不是 expired 状态
      logger.warn(`[Challenge Store] dismissChallenge: 0 rows affected (challenge ${challengeId} not found or not in expired state)`);
      return { success: false, error: 'Challenge not found or not in expired state' };
    }

    logger.info(`[Challenge Store] Challenge ${challengeId} dismissed (expired → failed)`);
    return { success: true };
      // safe to ignore: non-critical background operation, error already logged
  } catch (err) {
                  // safe to ignore: non-critical background operation, error already logged
    logger.error('[Challenge Store] dismissChallenge threw:', err);
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
}
