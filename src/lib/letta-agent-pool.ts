/* eslint-disable symy/no-warn-only-catch -- individual catch blocks reviewed per error-policy.md */
/**
 * Letta Agent Pool — 预创建无主 agent 池管理
 *
 * 功能:
 * 1. createPooledAgent() — 创建一个无主 agent, 放入池子
 * 2. assignAgentFromPool(userId) — 从池子原子分配一个 agent 给用户
 * 3. refillPool() — 补满池子 (创建缺少的 agent)
 * 4. checkAndRefill() — cron 检测: 补满 or 翻倍+补满
 *
 * 池子逻辑:
 * - 初始大小 = 1 (方便测试)
 * - 每分钟检测无主 agent 数
 * - 剩余 >= 池子大小 1/4 → 只补满
 * - 剩余 < 池子大小 1/4 → 翻倍池子大小, 再补满
 */

import 'server-only';
import { createAdminClient } from '@/lib/supabase-admin';
import { logger } from '@/lib/logger';
import { getLettaClient, lettaAPI } from '@/lib/letta-mcp-manager';
import { syncAgentSymyTools } from '@/lib/letta-agent-tools';
import { readFileSync } from 'fs';
import { join } from 'path';
import { parseBooleanEnv } from '@/lib/letta-agent-manager';
// 🐘 人设转型 (2026-09-05): 池子 agent 与主创建流程共用同一份小象 persona 模板 (SSOT)
import { SYMY_PERSONA_BLOCK } from '@/lib/symy-persona';

// ============================================================
// 配置
// ============================================================

const LETTA_API_KEY = process.env.LETTA_API_KEY || '';
// 🔧 2026-07-20 (P0 fix): 默认 letta/auto (非 reasoning 模式, 响应更快)
const DEFAULT_AGENT_MODEL = 'letta/auto';
const DEFAULT_AGENT_EMBEDDING = 'openai/text-embedding-3-small';
const AGENT_MODEL = process.env.LETTA_AGENT_MODEL || DEFAULT_AGENT_MODEL;
const AGENT_EMBEDDING = process.env.LETTA_AGENT_EMBEDDING || DEFAULT_AGENT_EMBEDDING;
// 🔧 Round 128 AUDIT-11 BUG #8: 统一用 parseBooleanEnv (与 letta-agent-manager.ts 一致)
const AGENT_ENABLE_SLEEPTIME = parseBooleanEnv(process.env.LETTA_AGENT_ENABLE_SLEEPTIME);

const SYSTEM_PROMPT_PATH = join(process.cwd(), 'doc', 'AI_Prompt.md');
let _cachedSystemPrompt: string | null = null;

function readSystemPrompt(): string {
  if (_cachedSystemPrompt) return _cachedSystemPrompt;
  try {
    _cachedSystemPrompt = readFileSync(SYSTEM_PROMPT_PATH, 'utf-8');
    return _cachedSystemPrompt;
  } catch (err) {
    logger.error('[Agent Pool] CRITICAL: Failed to read AI_Prompt.md:', err);
    throw new Error(`System prompt unavailable: ${err instanceof Error ? err.message : String(err)}`);
  }
}

// ============================================================
// 1. 创建一个无主 agent (放入池子)
// ============================================================

/**
 * 创建一个无主 Letta Agent 并放入池子
 * agent 创建后不绑定任何用户, 等待分配
 *
 * @param poolId 数据库 letta_agent_pool 行的 id (用于状态更新)
 * @returns letta_agent_id 或 null (失败)
 */
export async function createPooledAgent(poolId: string): Promise<{ agentId: string | null; error?: string }> {
  if (!LETTA_API_KEY) {
    logger.error('[Agent Pool] LETTA_API_KEY not configured');
    return { agentId: null, error: 'LETTA_API_KEY not configured' };
  }

  let client;
  try {
    client = getLettaClient();
  } catch (err) {
    logger.error('[Agent Pool] Failed to get Letta client:', err);
    return {
      agentId: null,
      error: `getLettaClient failed: ${err instanceof Error ? err.message : String(err)}`,
    };
  }

  let systemPrompt;
  try {
    systemPrompt = readSystemPrompt();
  } catch (err) {
    logger.error('[Agent Pool] Failed to read system prompt:', err);
    return {
      agentId: null,
      error: `readSystemPrompt failed: ${err instanceof Error ? err.message : String(err)}`,
    };
  }

  // 用随机 ID 作为 agent 名称 (不绑定用户)
  const tempId = crypto.randomUUID().substring(0, 8);

  logger.info(`[Agent Pool] Creating pooled agent ${poolId} (temp: ${tempId})...`);

  try {
    // 1. 创建 Agent (不设 user_id memory block, 分配时再设置)
    const agent = await client.agents.create({
      name: `symy-pool-${tempId}`,
      description: `Symy pooled agent (unassigned)`,
      system: systemPrompt,
      model: AGENT_MODEL,
      embedding: AGENT_EMBEDDING,
      include_base_tools: true,
      enable_sleeptime: AGENT_ENABLE_SLEEPTIME,
      memory_blocks: [
        {
          label: 'persona',
          // 🐘 人设转型 (2026-09-05): 与 letta-agent-manager.ts 共用 SSOT 模板 (绿色环保小象)
          value: SYMY_PERSONA_BLOCK,
          limit: 5000,
        },
        {
          label: 'human',
          value: `Pooled agent — not yet assigned to a user.`,
          limit: 5000,
        },
      ],
      tags: ['symy', 'pooled', 'unassigned'],
      metadata: {
        created_by: 'symy-agent-pool',
        created_at: new Date().toISOString(),
        pool_id: poolId,
      },
    });

    const agentId = agent?.id;
    if (!agentId) {
      throw new Error('Letta agent creation returned no ID');
    }
    logger.info(`[Agent Pool] Agent created: ${agentId}`);

    // 2. 附加 symy-mcp + symy-hands 工具（单侧失败不阻断 agent 保存）
    await syncAgentSymyTools(agentId);

    return { agentId };
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    logger.error(`[Agent Pool] Failed to create pooled agent ${poolId}:`, errMsg);
    return { agentId: null, error: errMsg };
  }
}

// ============================================================
// 2. 从池子分配 agent 给用户
// ============================================================

/**
 * 从池子原子分配一个可用 agent 给用户
 * 调用 SQL 函数 assign_pool_agent (FOR UPDATE SKIP LOCKED)
 *
 * @returns letta_agent_id 或 null (池子空)
 */
export async function assignAgentFromPool(userId: string): Promise<string | null> {
  const { supabase, error } = createAdminClient();
  if (!supabase || error) {
    logger.error('[Agent Pool] Admin client unavailable:', error);
    return null;
  }

  // 调用 SQL 函数原子分配
  const { data, error: rpcError } = await supabase.rpc('assign_pool_agent', {
    p_user_id: userId,
  });

  if (rpcError) {
    logger.error('[Agent Pool] assign_pool_agent RPC failed:', rpcError.message);
    return null;
  }

  const agentId = data as string | null;
  if (!agentId) {
    logger.info('[Agent Pool] Pool empty — no available agent to assign');
    return null;
  }

  logger.info(`[Agent Pool] Assigned agent ${agentId} to user ${userId}`);

  // 更新 agent 的 memory blocks (设置 user_id + human block)
  try {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars -- kept for potential SDK calls
    const client = getLettaClient();
    // 更新 human memory block
    // 🔧 使用 lettaAPI 直接调 REST API (SDK blocks 类型不匹配)
    const blocksResponse = await lettaAPI(`/agents/${agentId}/memory-blocks`);
    const blocksData = await blocksResponse.json();
    const blocks = (blocksData as Array<{ label: string }>) || [];
    for (const block of blocks) {
      if (block.label === 'human') {
        await lettaAPI(`/agents/${agentId}/memory-blocks/${block.label}`, {
          method: 'PATCH',
          body: JSON.stringify({
            value: `User ID: ${userId}\nAssigned from pool at: ${new Date().toISOString()}`,
          }),
        });
      }
    }
    // 添加/更新 user_id block
    const hasUserIdBlock = blocks.some((b) => b.label === 'user_id');
    if (hasUserIdBlock) {
      await lettaAPI(`/agents/${agentId}/memory-blocks/user_id`, {
        method: 'PATCH',
        body: JSON.stringify({ value: userId }),
      });
    } else {
      await lettaAPI(`/agents/${agentId}/memory-blocks`, {
        method: 'POST',
        body: JSON.stringify({ label: 'user_id', value: userId, limit: 100 }),
      });
    }
  } catch (err) {
    // safe to ignore: memory block update failure doesn't block agent usage
    logger.warn(`[Agent Pool] Failed to update memory blocks for agent ${agentId}:`, err);
  }

  // 🔧 Round 133 fix: 确保双 MCP server 工具与规则 block 已附加
  try {
    await syncAgentSymyTools(agentId);
  } catch (mcpErr) {
    // safe to ignore: MCP tool attach failure doesn't block agent assignment
    logger.warn(`[Agent Pool] MCP tool attach during assign failed (non-blocking):`, mcpErr instanceof Error ? mcpErr.message : String(mcpErr));
  }

  return agentId;
}

// ============================================================
// 3. 补满池子
// ============================================================

/**
 * 补满池子到当前 pool_size
 * 创建缺少的 agent (status='available' 的数量不足 pool_size)
 */
export async function refillPool(): Promise<{
  created: number;
  failed: number;
  targetSize: number;
}> {
  const { supabase, error } = createAdminClient();
  if (!supabase || error) {
    logger.error('[Agent Pool] Admin client unavailable:', error);
    return { created: 0, failed: 0, targetSize: 0 };
  }

  // 1. 获取当前池子大小 + 可用 agent 数
  const { data: config } = await supabase.from('letta_agent_pool_config').select('pool_size').eq('id', 1).maybeSingle<{ pool_size: number }>();

  const targetSize = config?.pool_size ?? 1;

  const { count: availableCount } = await supabase.from('letta_agent_pool').select('*', { count: 'exact', head: true }).eq('status', 'available');

  const available = availableCount ?? 0;
  const need = targetSize - available;

  logger.info(`[Agent Pool] Refill: target=${targetSize}, available=${available}, need=${need}`);

  if (need <= 0) {
    return { created: 0, failed: 0, targetSize };
  }

  // 2. 创建缺少的 agent
  let created = 0;
  let failed = 0;

  for (let i = 0; i < need; i++) {
    // 先插入 'creating' 行
    const { data: poolRow, error: insertError } = await supabase
      .from('letta_agent_pool')
      .insert({
        status: 'creating',
        letta_agent_id: `pending-${crypto.randomUUID().substring(0, 8)}`,
      })
      .select('id')
      .maybeSingle<{ id: string }>();

    if (insertError || !poolRow) {
      logger.error('[Agent Pool] Failed to insert creating row:', insertError?.message);
      failed++;
      continue;
    }

    const poolId = poolRow.id;

    // 创建 Letta agent
    const result = await createPooledAgent(poolId);

    if (result.agentId) {
      const agentId = result.agentId;
      // 更新行: letta_agent_id + status='available'
      const { error: updateError } = await supabase
        .from('letta_agent_pool')
        .update({
          letta_agent_id: agentId,
          status: 'available',
        })
        .eq('id', poolId);

      if (updateError) {
        logger.error(`[Agent Pool] Failed to update pool row ${poolId}:`, updateError.message);
        // agent 已创建但 DB 更新失败 — agent 成为孤儿
        // 尝试删除 agent 防止月费泄漏
        try {
          await lettaAPI(`/agents/${agentId}`, { method: 'DELETE' });
        } catch (delErr) {
          logger.error('[Agent Pool] CRITICAL: Failed to delete orphan agent ' + agentId + ' — may incur monthly cost:', delErr);
        }
        // 标记为 failed
        await supabase
          .from('letta_agent_pool')
          .update({
            status: 'failed',
            failure_reason: `DB update failed: ${updateError.message}`,
          })
          .eq('id', poolId);
        failed++;
      } else {
        created++;
        logger.info(`[Agent Pool] Pooled agent ${agentId} ready (pool row ${poolId})`);
      }
    } else {
      // 创建失败 — 标记为 failed, 记录具体错误
      const failReason = result.error || 'createPooledAgent returned null (unknown reason)';
      logger.error(`[Agent Pool] Pool row ${poolId} failed: ${failReason}`);
      await supabase.from('letta_agent_pool').update({ status: 'failed', failure_reason: failReason }).eq('id', poolId);
      failed++;
    }
  }

  // 3. 更新 last_refill_at
  await supabase
    .from('letta_agent_pool_config')
    .update({
      last_refill_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', 1);

  logger.info(`[Agent Pool] Refill complete: created=${created}, failed=${failed}, target=${targetSize}`);
  return { created, failed, targetSize };
}

// ============================================================
// 4. Cron 检测: 补满 or 翻倍+补满
// ============================================================

/**
 * 每分钟 cron 调用:
 * 1. 检测无主 agent 数
 * 2. 剩余 >= 池子大小 1/4 → 只补满
 * 3. 剩余 < 池子大小 1/4 → 翻倍池子大小, 再补满
 */
export async function checkAndRefill(): Promise<{
  action: 'refill' | 'double_and_refill' | 'skip';
  poolSize: number;
  available: number;
  created: number;
  failed: number;
}> {
  // 🔧 2026-07-15 (ARCH-3 #1 修复): 分布式锁防止并发 checkAndRefill
  //    旧代码无锁 → Vercel cron (maxDuration=60s) 可能在下一次 tick 触发时
  //    前一次还没执行完 → 两个并发 checkAndRefill 都读到 pool_size=N,
  //    都翻倍到 2N, 都创建 agent → 2× Letta agent 创建 ($ cost leak)
  //    修复: 用 distributed_lock, TTL=90s (> maxDuration=60s), failClosed=true
  //    (锁获取失败 = 另一个实例在跑, 直接 skip)
  const { acquireLock, releaseLock } = await import('@/lib/distributed-lock');
  const LOCK_KEY = 'cron-agent-pool-checkAndRefill';
  const LOCK_TTL = 90_000; // 90s — 覆盖 Vercel maxDuration=60s + buffer

  const lockAcquired = await acquireLock(LOCK_KEY, LOCK_TTL, true);
  if (!lockAcquired) {
    logger.info('[Agent Pool] Cron: another instance is running checkAndRefill, skipping');
    return { action: 'skip', poolSize: 0, available: 0, created: 0, failed: 0 };
  }

  try {
    const result = await checkAndRefillInner();
    return result;
  } finally {
    // 🔧 2026-07-15: 释放锁 (让下一次 cron 立即可执行, 不用等 TTL 超时)
    await releaseLock(LOCK_KEY).catch((err: unknown) => {
      logger.warn('[Agent Pool] Failed to release cron lock:', err);
    });
  }
}

/** 内部实现 — 由 checkAndRefill 在锁保护下调用 */
async function checkAndRefillInner(): Promise<{
  action: 'refill' | 'double_and_refill' | 'skip';
  poolSize: number;
  available: number;
  created: number;
  failed: number;
}> {
  const { supabase, error } = createAdminClient();
  if (!supabase || error) {
    logger.error('[Agent Pool] Admin client unavailable:', error);
    return { action: 'skip', poolSize: 0, available: 0, created: 0, failed: 0 };
  }

  // 1. 获取当前池子大小 + 可用 agent 数 + 已分配 agent 数
  const { data: config } = await supabase.from('letta_agent_pool_config').select('pool_size, initial_pool_size').eq('id', 1).maybeSingle<{ pool_size: number; initial_pool_size: number }>();

  const poolSize = config?.pool_size ?? 1;

  const { count: availableCount } = await supabase.from('letta_agent_pool').select('*', { count: 'exact', head: true }).eq('status', 'available');

  const available = availableCount ?? 0;

  // 🔧 2026-07-15 (ARCH-12 #5 修复): 清理 stale 'creating' pool agents
  //    场景: createPooledAgent 中途超时/Vercel kill → pool row 留在 'creating' 状态
  //    → 永远不会被分配, 占用 pool_size 配额 (孤儿行)
  //    修复: 删除 created_at > 5 分钟前的 'creating' 行 (agent 创建最多 60s)
  try {
    const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
    const { data: staleRows, error: staleErr } = await supabase.from('letta_agent_pool').delete().eq('status', 'creating').lt('created_at', fiveMinAgo).select('id, letta_agent_id');

    if (staleErr) {
      logger.warn('[Agent Pool] Failed to clean stale creating rows:', staleErr.message);
    } else if (staleRows && staleRows.length > 0) {
      logger.info(`[Agent Pool] Cleaned ${staleRows.length} stale 'creating' rows (orphaned > 5min)`);
    }
  } catch (staleCleanupErr) {
    logger.warn('[Agent Pool] Stale cleanup exception (non-blocking):', staleCleanupErr);
  }

  // pool_size 只通过翻倍或 admin API setPoolSize 修改, 不需要自动保护
  const quarter = Math.max(1, Math.floor(poolSize / 4)); // 至少 1

  // 2. 更新 last_cron_check
  await supabase
    .from('letta_agent_pool_config')
    .update({
      last_cron_check: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', 1);

  // 3. 判断: 补满 or 翻倍+补满
  if (available >= quarter) {
    // 剩余 >= 1/4 → 只补满
    logger.info(`[Agent Pool] Cron: available=${available} >= quarter=${quarter}, refilling (size=${poolSize})`);
    const result = await refillPool();
    return {
      action: 'refill',
      poolSize: result.targetSize,
      available,
      ...result,
    };
  } else {
    // 剩余 < 1/4 → 翻倍池子大小, 再补满
    const newSize = poolSize * 2;
    logger.info(`[Agent Pool] Cron: available=${available} < quarter=${quarter}, doubling pool size ${poolSize}→${newSize}, then refilling`);

    await supabase
      .from('letta_agent_pool_config')
      .update({
        pool_size: newSize,
        last_doubled_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', 1);

    const result = await refillPool();
    return {
      action: 'double_and_refill',
      poolSize: result.targetSize,
      available,
      ...result,
    };
  }
}

// ============================================================
// 5. 获取池子状态 (用于 admin API)
// ============================================================

export async function getPoolStatus(): Promise<{
  poolSize: number;
  initialPoolSize: number;
  available: number;
  assigned: number;
  creating: number;
  failed: number;
  lastCronCheck: string | null;
  lastRefillAt: string | null;
  lastDoubledAt: string | null;
} | null> {
  const { supabase, error } = createAdminClient();
  if (!supabase || error) return null;

  const { data: config } = await supabase.from('letta_agent_pool_config').select('*').eq('id', 1).maybeSingle();

  const { data: stats } = await supabase.from('letta_agent_pool').select('status').order('created_at', { ascending: false }).limit(1000);

  const statusCounts = (stats || []).reduce(
    (acc, row) => {
      const s = (row as { status: string }).status;
      acc[s] = (acc[s] || 0) + 1;
      return acc;
    },
    {} as Record<string, number>,
  );

  return {
    poolSize: config?.pool_size ?? 1,
    initialPoolSize: config?.initial_pool_size ?? 1,
    available: statusCounts['available'] ?? 0,
    assigned: statusCounts['assigned'] ?? 0,
    creating: statusCounts['creating'] ?? 0,
    failed: statusCounts['failed'] ?? 0,
    lastCronCheck: config?.last_cron_check ?? null,
    lastRefillAt: config?.last_refill_at ?? null,
    lastDoubledAt: config?.last_doubled_at ?? null,
  };
}
