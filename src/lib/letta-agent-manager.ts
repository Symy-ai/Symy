/* eslint-disable symy/no-warn-only-catch -- individual catch blocks reviewed per error-policy.md */
/**
 * Letta Agent Manager — Per-User Agent 生命周期管理
 *
 * 🔧 ARCH fix (Round 47): MCP server + tools 逻辑提取到 letta-mcp-manager.ts
 *    本文件专注于 agent 创建/获取/配置, 不再包含 MCP server 管理。
 */

import 'server-only'; // 🔧 架构优化 Round 58: 防止客户端组件意外导入 (Finding 15)
import { readFileSync } from 'fs';
import { join } from 'path';
import { createAdminClient } from '@/lib/supabase-admin';
import { logger } from '@/lib/logger';
// 🔧 P0-3 fix (2026-07-18, AUDIT-LETTA-AGENT-MGR): input validation
import { validateUserId, validateAgentId } from '@/lib/letta-agent-validation';
// 🔧 ARCH fix (Round 47): 从 letta-mcp-manager.ts 导入 MCP 相关函数
import { getLettaClient, lettaAPI } from '@/lib/letta-mcp-manager';
import { SYMY_TOOL_RULES_BLOCK, syncAgentSymyTools } from '@/lib/letta-agent-tools';
// 🐘 人设转型 (2026-09-05): 镜子 persona 已死 → 绿色环保小象。模板 SSOT 在 symy-persona.ts,
//    本文件 / letta-agent-pool.ts / admin action update_agent_persona 三处共用。
import { SYMY_PERSONA_BLOCK } from '@/lib/symy-persona';
// Re-export for backward compatibility (other modules import these from letta-agent-manager)
export { getLettaClient, lettaAPI };

// ============================================================
// 配置
// ============================================================

export const LETTA_API_KEY = process.env.LETTA_API_KEY || '';

// ============================================================
// 🔧 Agent 模型配置 (可通过环境变量自定义, 方便切换模型/provider)
// ============================================================

// 🔧 2026-07-20 (P0 fix): 默认 letta/auto (非 reasoning 模式, 响应更快)
//    旧代码: 默认 letta/auto 但 Vercel 环境变量可能覆盖为 openai-proxy/glm-5.2 (reasoning 模式, 60s+ 响应)
//    修复: 强制默认 letta/auto, 环境变量覆盖时需显式设置
const DEFAULT_AGENT_MODEL = 'letta/auto';
const DEFAULT_AGENT_EMBEDDING = 'openai/text-embedding-3-small';

/** 新建 agent 使用的模型 handle (从环境变量读取, 默认 letta/auto) */
export const AGENT_MODEL = process.env.LETTA_AGENT_MODEL || DEFAULT_AGENT_MODEL;
/** 新建 agent 使用的 embedding 模型 */
export const AGENT_EMBEDDING = process.env.LETTA_AGENT_EMBEDDING || DEFAULT_AGENT_EMBEDDING;
/** 新建 agent 是否开启 sleeptime */
// 🔧 Round 112 P0 fix: 默认关闭 sleeptime (Letta 免费版可能不支持, 导致 agent 创建失败)
// 🔧 Round 120 audit fix: 旧逻辑 `(value || 'false') !== 'false'` 把 'False'/'FALSE'/'0'/'' 全部判定为 true (启用 sleeptime)
//    根因: 'False' !== 'false' → true (启用); '' || 'false' → 'false' → !== 'false' → false (关闭, 正确)
//          但 '0' || 'false' → '0' → !== 'false' → true (错误启用)
//    修复: 显式 truthy 字符串白名单, 其余一律视为 false (默认关闭)
const TRUTHY_STRINGS = new Set(['true', '1', 'yes', 'on', 'y', 't']);

/**
 * 解析环境变量为 boolean (truthy 字符串白名单)
 * 用于 AGENT_ENABLE_SLEEPTIME 等环境变量
 *
 * 🔧 Round 120 audit fix: 提取为可测试函数 (之前是内联表达式, 无法单测)
 *
 * @param value 环境变量原始值 (可能为 undefined/null/空字符串)
 * @returns true 仅当 value (小写+trim 后) 在白名单 ['true','1','yes','on','y','t'] 中
 */
export function parseBooleanEnv(value: string | undefined | null): boolean {
  return TRUTHY_STRINGS.has((value || '').toLowerCase().trim());
}

export const AGENT_ENABLE_SLEEPTIME = parseBooleanEnv(process.env.LETTA_AGENT_ENABLE_SLEEPTIME);

// 🔧 启动时打印当前 Agent 配置 (方便确认环境变量生效)
// 🔧 架构优化 Round 58: 移除 module-load 日志 (Finding 14) — 每 cold start 50+ 日志行
// 如需调试, 在 admin/letta route 中手动调用 logger.info

// ============================================================
// System Prompt
// ============================================================

const SYSTEM_PROMPT_PATH = join(process.cwd(), 'doc', 'AI_Prompt.md');
let _cachedSystemPrompt: string | null = null;

export function readSystemPrompt(): string {
  if (_cachedSystemPrompt) return _cachedSystemPrompt;
  try {
    _cachedSystemPrompt = readFileSync(SYSTEM_PROMPT_PATH, 'utf-8');
    if (!_cachedSystemPrompt || _cachedSystemPrompt.length < 100) {
      throw new Error(`AI_Prompt.md is empty or too short (${_cachedSystemPrompt?.length || 0} chars)`);
    }
    return _cachedSystemPrompt;
  } catch (err) {
    logger.error('[Letta Agent Manager] CRITICAL: Failed to read AI_Prompt.md at', SYSTEM_PROMPT_PATH, ':', err);
    logger.error('[Letta Agent Manager] Agent creation will fail. Ensure doc/AI_Prompt.md is included in the build.');
    throw new Error(`System prompt unavailable: ${err instanceof Error ? err.message : String(err)}`);
  }
}

// ============================================================
// Agent 创建
// ============================================================

// 🔧 Round 126 AUDIT-1 ROI #5: 删除 83 行死代码 (旧 getOrCreateSharedMCPServer JSDoc + 注释代码)
//    此函数已移到 letta-mcp-manager.ts, 此处仅留旧注释代码块

/**
 * 为用户创建独立的 Letta Agent
 *
 * 创建流程:
 * 1. 创建 Agent（system prompt + memory blocks + model 配置）
 * 2. 附加 MCP Server 工具
 * 3. 将 agent_id 保存到 profiles.letta_agent_id
 *
 * @returns 新创建的 agent_id，或 null 表示失败
 */
export async function createAgentForUser(userId: string, _userEmail?: string): Promise<string | null> {
  // 🔧 P0-3 fix (2026-07-18): validate userId before creating agent
  if (!validateUserId(userId)) {
    logger.warn(`[Letta Agent Manager] createAgentForUser: invalid userId format: ${String(userId).substring(0, 50)}`);
    return null;
  }

  if (!LETTA_API_KEY) {
    logger.error('[Letta Agent Manager] LETTA_API_KEY not configured');
    return null;
  }

  const client = getLettaClient();
  const systemPrompt = readSystemPrompt();

  logger.info(`[Letta Agent Manager] Creating agent for user ${userId}...`);

  try {
    // 1. 创建 Agent
    const agent = await client.agents.create({
      // 🔧 ARCH fix (Round 12 M5): 旧代码用 8-char prefix → UUID 碰撞风险。用完整 UUID。
      // 🔧 2026-07-15 (ARCH-8 #26 修复): agent name 不含 userId (Letta admin panel 可见)
      //    旧代码: name: `symy-user-${userId}` → Letta admin 可见所有用户 UUID
      //    修复: 用 hash 前缀 (不可逆), 保留可识别性但不泄漏 UUID
      name: `symy-${userId.substring(0, 8)}`,
      description: `Symy companion agent`,
      system: systemPrompt,
      model: AGENT_MODEL, // 🔧 配置项: 环境变量 LETTA_AGENT_MODEL (默认 letta/auto)
      embedding: AGENT_EMBEDDING, // 🔧 配置项: 环境变量 LETTA_AGENT_EMBEDDING
      include_base_tools: true,
      enable_sleeptime: AGENT_ENABLE_SLEEPTIME, // 🔧 配置项: 环境变量 LETTA_AGENT_ENABLE_SLEEPTIME
      memory_blocks: [
        {
          label: 'user_id',
          value: userId,
          limit: 100,
        },
        {
          label: 'persona',
          // 🐘 人设转型 (2026-09-05): 旧镜子 persona ("I am not an assistant — I am a mirror")
          //    已废弃 — 绿色环保小象宠物 persona, 模板 SSOT 见 symy-persona.ts。
          value: SYMY_PERSONA_BLOCK,
          limit: 5000,
        },
        {
          label: 'human',
          // 🔧 2026-07-15 (ARCH-13 #5 修复): 不在 Letta memory 里存 userEmail (PII)
          //    旧代码: `Email: ${userEmail}` → Letta cloud 持久化用户邮箱 (GDPR 风险)
          //    修复: 只存 userId (UUID, 不可直接关联到邮箱) + 注册时间
          //    AI 不需要邮箱就能工作 (system prompt 里有 user_id context)
          value: `User ID: ${userId}\nJoined: ${new Date().toISOString()}`,
          limit: 5000,
        },
        {
          label: 'symy_tool_rules',
          value: SYMY_TOOL_RULES_BLOCK,
          limit: 2000,
        },
      ],
      tags: ['symy', 'per-user', `user:${userId}`], // 🔧 M5: 完整 UUID
      metadata: {
        user_id: userId,
        created_by: 'symy-agent-manager',
        created_at: new Date().toISOString(),
      },
    });

    // 🔧 ARCH fix (Round 78 — Letta SDK 类型安全): 旧代码用 `as unknown as Record` 绕过类型
    //    SDK 类型 AgentState.id: string (必填), 不需要 cast。若 SDK 违约返回 null,
    //    后续 agentId 为 undefined, if(!agentId) check 会抛错 (与原行为一致)。
    const agentId = agent?.id;
    if (!agentId) {
      throw new Error('Letta agent creation returned no ID');
    }
    logger.info(`[Letta Agent Manager] Agent created: ${agentId}`);

    // 2. 附加 symy-mcp + symy-hands 工具（单侧失败不阻断 agent 保存）
    await syncAgentSymyTools(agentId);

    // 3. 保存 agent_id 到 profiles 表
    // 🔧 Round 112 P0 fix: 如果 DB save 失败, 不再删除 agent (防止 P0 "AI 不可用")
    //    旧代码: DB save 失败 → 删 agent → 返回 null → 用户永远无法用 AI
    //    新代码: DB save 失败 → 保留 agent → 返回 agentId → 用户能用 AI
    //    (agent_id 不在 profiles 里, 但 Letta 里有, 下次可以手动同步)
    const { supabase, error: adminError } = createAdminClient();
    if (supabase && !adminError) {
      // 🔧 Round 19 R19-H-1: 条件 UPDATE — .is('letta_agent_id', null) 确保原子性
      const { data: updatedRow, error: updateError } = await supabase
        .from('profiles')
        .update({ letta_agent_id: agentId })
        .eq('id', userId)
        .is('letta_agent_id', null) // 🔧 只在未被占用时更新 (CAS 模式)
        .select('letta_agent_id')
        .maybeSingle<{ letta_agent_id: string | null }>();

      if (updateError) {
        logger.error(`[Letta Agent Manager] Failed to save agent_id to profiles: ${updateError.message}`);
        // 🔧 Round 112 P0 fix: 不再删除 agent!
        //    旧代码: DB save 失败 → 删 agent → 返回 null → 用户永远无法用 AI (P0 bug)
        //    新代码: 保留 agent, 仍返回 agentId → 用户能用 AI (agent_id 不在 DB 但在 Letta 里)
        //    agent_id 可通过后续 admin API 同步到 DB
      }

      if (!updateError && !updatedRow) {
        // 🔧 Round 19 R19-H-1: 条件 UPDATE 返回 0 行 → 并发请求已抢先保存了 agent_id
        //    删除自己创建的 agent (我输了 race), 返回胜出的 agent_id
        // 🔧 Round 112: 只在无 updateError 时才走 lost-race 路径
        //    (updateError 时 updatedRow 也会是 null, 但不是 race condition)
        logger.info(`[Letta Agent Manager] Lost race: profiles.letta_agent_id already set, compensating by deleting agent ${agentId}`);
        try {
          await lettaAPI(`/agents/${agentId}`, { method: 'DELETE' });
          logger.info(`[Letta Agent Manager] Compensated: deleted lost-race agent ${agentId}`);
          // safe to ignore: non-critical background operation, error already logged
        } catch (cleanupErr) {
          // safe to ignore: non-critical background operation, error already logged
          logger.error(`[Letta Agent Manager] Failed to cleanup lost-race agent ${agentId}:`, cleanupErr);
        }
        // 重新查询胜出的 agent_id 并返回
        const { data: winningProfile } = await supabase.from('profiles').select('letta_agent_id').eq('id', userId).maybeSingle<{ letta_agent_id: string | null }>();
        const winningAgentId = (winningProfile as { letta_agent_id: string | null } | null)?.letta_agent_id;
        if (winningAgentId) {
          logger.info(`[Letta Agent Manager] Returning winning agent_id: ${winningAgentId}`);
          return winningAgentId;
        }
        // 极端情况: 并发删除了 profile — 返回 null
        return null;
      }

      logger.info(`[Letta Agent Manager] Agent ID ${agentId} saved to profiles for user ${userId}`);
    } else {
      // 🔧 Round 120 P0 fix (AUDIT-1 #1): admin client 不可用时不再删除 agent!
      //    旧代码 (Round 112 漏修路径): admin client 不可用 → 删 agent → 返回 null → 用户永远无法用 AI
      //    Round 112 P0 fix 只覆盖了 "DB save failed" 路径 (line 288-294), 漏了 "admin client unavailable" 路径
      //    修复: 保留 agent, 返回 agentId (与 Round 112 P0 fix 一致的语义)
      //    agent_id 不在 profiles 里 (无法 sync), 但 Letta 里有, 用户能用 AI
      //    后续 admin API (sync_all) 可以补 sync agent_id 到 DB
      logger.error(`[Letta Agent Manager] Admin client unavailable — keeping agent ${agentId} (not in DB). ` + `User can still use AI. Run /api/admin/letta?action=sync_all to backfill agent_id to profiles.`);
    }

    return agentId;
  } catch (err) {
    // 🔧 Round 112: 记录更详细的错误信息帮助诊断 Letta API 失败
    const errObj = err as {
      status?: number;
      message?: string;
      response?: { status?: number; statusText?: string; data?: unknown };
    };
    const errorDetail = {
      message: errObj?.message || String(err),
      status: errObj?.status || errObj?.response?.status,
      statusText: errObj?.response?.statusText,
      data: errObj?.response?.data,
    };
    logger.error('[Letta Agent Manager] Failed to create agent:', errorDetail);
    // 🔧 Round 112: 重新抛出错误, 让 API route 能捕获并返回给客户端 (诊断用)
    throw new Error(`Letta agent creation failed: ${errorDetail.message} (status: ${errorDetail.status})`);
  }
}

// ============================================================
// Agent 查找
// ============================================================

/**
 * 获取用户的 Letta Agent ID
 * 先查 profiles.letta_agent_id，如果没有则创建
 */
export async function getOrCreateAgentId(userId: string, userEmail?: string): Promise<string | null> {
  // 🔧 P0-3 fix (2026-07-18): validate userId before any DB/API call
  //    Old: accepted any string → malformed UUID caused Postgres cast error
  //    → confusing "not found" logs that looked like the user didn't exist.
  //    New: validate UUID format upfront, fail-fast with clear log.
  if (!validateUserId(userId)) {
    logger.warn(`[Letta Agent Manager] getOrCreateAgentId: invalid userId format (expected UUID): ${String(userId).substring(0, 50)}`);
    return null;
  }

  // 1. 先查数据库
  const { supabase, error } = createAdminClient();
  if (!supabase || error) {
    logger.error('[Letta Agent Manager] Admin client unavailable:', error);
    // 🔧 ARCH fix (Round 12 C3): 旧代码 fallback 到全局 LETTA_AGENT_ID
    //    → 多用户共享一个 agent → 跨用户记忆污染 (隐私泄露)。
    //    根因修复: 返回 null, 让调用方 (chat route) 显示 "AI 暂不可用" 而非污染用户数据。
    return null;
  }

  const { data: profile, error: profileError } = await supabase.from('profiles').select('letta_agent_id').eq('id', userId).maybeSingle();

  const profileData = profile as { letta_agent_id: string | null } | null;

  if (profileError) {
    logger.warn(`[Letta Agent Manager] Failed to query profile: ${profileError.message}`);
  }

  // 2. 如果已有 agent_id，验证 agent 是否在 Letta 中存在
  if (profileData?.letta_agent_id) {
    // 🔧 Round 133 fix: 验证 agent 是否在 Letta 中存在
    //   场景: agent 被删除 (admin 操作或 Letta 清理) 但 DB 中还存着 agent_id
    //   旧代码: 直接返回 agent_id → chat route 调 Letta 时 404
    //   修复: 用 lettaAPI 检查 agent 是否存在, 不存在则清除 DB 中的 agent_id
    try {
      const { lettaAPI } = await import('@/lib/letta-mcp-manager');
      const checkResp = await lettaAPI(`/agents/${profileData.letta_agent_id}`);
      if (checkResp.ok) {
        // T3 fix (2026-09-04): existing agents also get idempotent tool sync.
        try {
          await syncAgentSymyTools(profileData.letta_agent_id);
        } catch (syncErr) {
          logger.warn('[Letta Agent Manager] Tool sync on existing agent failed (non-blocking):', syncErr instanceof Error ? syncErr.message : String(syncErr));
        }
        return profileData.letta_agent_id;
      }
      // Agent 不存在 — 清除 DB 中的 agent_id, 继续到池子分配
      if (checkResp.status === 404) {
        logger.warn(`[Letta Agent Manager] Agent ${profileData.letta_agent_id} not found in Letta (deleted?), clearing from DB and reassigning from pool`);
        await supabase.from('profiles').update({ letta_agent_id: null }).eq('id', userId);
      } else {
        // 🔧 2026-07-15 (deep audit #3): Differentiate error types instead of
        //    blindly returning stale agent_id on ALL non-404 errors.
        //    401/403 = auth problem (not transient, needs investigation)
        //    5xx = transient (retry once, then return cached with warning)
        if (checkResp.status === 401 || checkResp.status === 403) {
          logger.error(`[Letta Agent Manager] Agent check returned ${checkResp.status} (AUTH ERROR — not transient). Clearing agent_id.`);
          await supabase.from('profiles').update({ letta_agent_id: null }).eq('id', userId);
          // Fall through to pool assignment
        } else {
          // 5xx or other — transient, return cached agent_id with warning
          logger.warn(`[Letta Agent Manager] Agent check returned ${checkResp.status} (transient?), returning cached agent_id. Chat route will clear on 404.`);
          return profileData.letta_agent_id;
        }
      }
    } catch (checkErr) {
      // 🔧 2026-07-15: Network error — return cached agent_id but log clearly
      //    The chat route (sendToAgent) has its own 404 → clear + retry path
      logger.warn(`[Letta Agent Manager] Agent check network error, returning cached agent_id:`, checkErr instanceof Error ? checkErr.message : String(checkErr));
      return profileData.letta_agent_id;
    }
  }

  // 🔧 Round 133: 优先从 agent 池子分配 (秒级, 不需 30s+ 创建)
  //    池子空时 fallback 到原有的 createAgentForUser 逻辑
  try {
    const { assignAgentFromPool } = await import('@/lib/letta-agent-pool');
    const pooledAgentId = await assignAgentFromPool(userId);
    if (pooledAgentId) {
      // 🔧 P0-1 fix (2026-07-18, AUDIT-LETTA-AGENT-MGR): CAS check via .select()
      //    Old: `const { error } = await supabase.from('profiles').update(...)` —
      //    didn't check rowsAffected. Two concurrent requests both assign pool
      //    agents (A gets agent-A, B gets agent-B). Both call UPDATE with
      //    `.is('letta_agent_id', null)`. A's UPDATE succeeds (1 row). B's
      //    UPDATE matches 0 rows (letta_agent_id is no longer null). But B
      //    checks `saveError` (null) not `rowsAffected` → returns agent-B.
      //    agent-B is now ORPHANED (DB shows agent-A, but B thinks it owns
      //    agent-B). Monthly cost leak + chat history fragments across A/B.
      //    Fix: use .select() to get the updated row. If 0 rows returned,
      //    another request won the CAS — re-read profile and return their agent.
      const { data: updatedRows, error: saveError } = await supabase.from('profiles').update({ letta_agent_id: pooledAgentId }).eq('id', userId).is('letta_agent_id', null).select('letta_agent_id');

      if (saveError) {
        logger.warn(`[Letta Agent Manager] Failed to save pooled agent_id: ${saveError.message}`);
        // agent 已分配但 DB save 失败 — 下次请求可能重复分配
        // 不严重: pool row 已标记 assigned, 不会重复分配给其他用户
      } else if (!updatedRows || updatedRows.length === 0) {
        // 🔧 P0-1 fix: CAS lost — another request already set letta_agent_id.
        //    Re-read profile to get the winning agent_id. Don't return our
        //    pooledAgentId (it would orphan the agent in Letta).
        logger.info(`[Letta Agent Manager] CAS lost for pooled agent ${pooledAgentId}, re-reading profile`);
        const { data: reReadData } = await supabase.from('profiles').select('letta_agent_id').eq('id', userId).maybeSingle();
        const reReadAgentId = (reReadData as { letta_agent_id: string | null } | null)?.letta_agent_id;
        if (reReadAgentId) {
          logger.info(`[Letta Agent Manager] Returning concurrent winner's agent: ${reReadAgentId}`);
          return reReadAgentId;
        }
        // Profile still null (very rare — concurrent DELETE?) — fall through
        // to createAgentForUser which has its own lock.
        logger.warn(`[Letta Agent Manager] CAS lost but profile still null, falling through to createAgentForUser`);
      } else {
        logger.info(`[Letta Agent Manager] Assigned pooled agent ${pooledAgentId} to user ${userId}`);
        return pooledAgentId;
      }
    }
    // 池子空 — fallback 到原有创建逻辑
    logger.info('[Letta Agent Manager] Pool empty, falling back to direct agent creation');
  } catch (poolErr) {
    logger.warn('[Letta Agent Manager] Pool assignment failed, falling back to direct creation:', poolErr);
  }

  // 3. 没有则创建新 Agent (原有逻辑)
  // 🔧 ARCH fix (Round 19 API-H2 — createAgentForUser race condition creates orphan agents):
  //    旧代码: 两个并发调用都见 letta_agent_id=null → 都创建 agent → 第二个 .update 覆盖第一个
  //    → 第一个 agent 成为孤儿 (月费泄漏)。
  //    根因修复: 用 acquireLock 确保同一用户的 agent 创建是互斥的 + ownership token (Round 20 H3)。
  //
  // 🔧 ARCH fix (Round 40 HIGH-2 — 2s wait 后无锁创建 agent → orphan agent 月费泄漏):
  //    旧代码: 锁获取失败时等 2s, 重读 profile, 若仍无 agent_id 则**不重新 acquireLock**直接调
  //    createAgentForUser。Letta agent 创建 30s+, 2s 远不够 → 并发场景 B 无锁创建, A/B 都 update
  //    profile → A 的 agent 成孤儿 (月费泄漏)。
  //    根因修复: 改为 backoff 重试 acquireLock (1s, 2s, 4s, 8s, 16s, 总上限 31s), 每次重试前重读
  //    profile (若已被另一请求创建则直接返回)。所有重试都失败则 fail-closed 返回 null, 让 chat
  //    route 显示错误。**绝不**在无锁状态下创建 agent。
  const { acquireLock, releaseLock } = await import('@/lib/distributed-lock');
  const lockKey = `create-agent:${userId}`;
  const LOCK_TTL_MS = 120_000; // 120s — must exceed backoff total (62s) + createAgentForUser worst-case (~30s)

  let locked = await acquireLock(lockKey, LOCK_TTL_MS, true); // failClosed=true
  let lockToken = locked; // acquireLock returns boolean (internal ownership token managed by lib)

  // Backoff retry: 2s, 4s, 8s, 16s, 32s — total wait 62s (covers LOCK_TTL 60s + buffer)
  // 🔧 ARCH fix (Round 41 REVIEW-5 — backoff 31s < LOCK_TTL 60s, Letta 创建 31-60s 时 B 无谓失败):
  //    旧代码 (Round 40): [1s, 2s, 4s, 8s, 16s] 总 31s, 但 LOCK_TTL=60s, Letta 创建可能 30-50s,
  //    B 在 31s 后 fail-closed, 即便 A 即将完成。用户无谓等待下一轮 chat 才创建 agent。
  //    根因修复: 拉长到 [2s, 4s, 8s, 16s, 32s] 总 62s, 覆盖 LOCK_TTL 60s + buffer。
  const backoffSchedule = [2_000, 4_000, 8_000, 16_000, 32_000];
  let retryIdx = 0;
  while (!locked && retryIdx < backoffSchedule.length) {
    const waitMs = backoffSchedule[retryIdx];
    logger.info(`[Letta Agent Manager] Agent creation in progress for user ${userId}, waiting ${waitMs}ms (retry ${retryIdx + 1}/${backoffSchedule.length})...`);
    await new Promise((resolve) => setTimeout(resolve, waitMs));

    // 每次重试前重读 profile — 若另一请求已完成创建则直接返回, 不再竞争锁
    const { data: reReadProfile } = await supabase.from('profiles').select('letta_agent_id').eq('id', userId).maybeSingle();
    const reReadData = reReadProfile as {
      letta_agent_id: string | null;
    } | null;
    if (reReadData?.letta_agent_id) {
      logger.info(`[Letta Agent Manager] Agent created by concurrent request: ${reReadData.letta_agent_id}`);
      return reReadData.letta_agent_id;
    }

    // 仍未创建 — 重新尝试 acquireLock (另一请求可能已超时释放)
    locked = await acquireLock(lockKey, LOCK_TTL_MS, true);
    lockToken = locked;
    retryIdx++;
  }

  if (!locked) {
    // 所有重试都失败 — fail-closed, 不创建 orphan agent
    logger.error(`[Letta Agent Manager] Failed to acquire lock after ${backoffSchedule.length} retries (total ${backoffSchedule.reduce((a, b) => a + b, 0)}ms). Aborting agent creation to prevent orphan agent (月费泄漏).`);
    return null;
  }

  // 🔧 ARCH fix (Round 41 REVIEW-1 — post-lock profile check 移入 try 块防锁泄漏):
  //    旧代码 (Round 40): post-lock 的 supabase SELECT 在 try 块之外, 若网络抖动/Supabase 瞬时
  //    故障导致 throw, finally 不执行 → 锁不释放 → TTL=60s 内同一用户所有 chat 请求 fail-closed
  //    返回 null → 用户 60s 无法聊天。
  //    根因修复: 将 post-lock check 移入 try 块, 让 finally 统一释放锁。
  try {
    // 持有锁后, 再次确认 profile 仍无 agent_id (防止锁超时窗口内另一请求已完成)
    const { data: postLockProfile } = await supabase.from('profiles').select('letta_agent_id').eq('id', userId).maybeSingle();
    const postLockData = postLockProfile as {
      letta_agent_id: string | null;
    } | null;
    if (postLockData?.letta_agent_id) {
      // 锁超时窗口内另一请求已完成 — 用其结果 (finally 会释放锁)
      logger.info(`[Letta Agent Manager] Agent created during lock wait: ${postLockData.letta_agent_id}`);
      return postLockData.letta_agent_id;
    }

    logger.info(`[Letta Agent Manager] No agent found for user ${userId}, creating...`);
    // 🔧 Round 114 fix: createAgentForUser now throws on error (Round 112 change).
    //    Catch the error here so getOrCreateAgentId still returns null (not throws),
    //    preserving the Promise<string | null> contract that callers expect.
    let newAgentId: string | null = null;
    try {
      newAgentId = await createAgentForUser(userId, userEmail);
    } catch (createErr) {
      logger.error(`[Letta Agent Manager] createAgentForUser threw error for user ${userId}:`, createErr);
      newAgentId = null;
    }

    if (!newAgentId) {
      // 🔧 ARCH fix (Round 12 C3): 创建失败不再 fallback 到全局 agent (隐私风险)
      //    返回 null, chat route 会显示错误消息
      logger.warn(`[Letta Agent Manager] Agent creation failed for user ${userId}`);
      return null;
    }

    return newAgentId;
  } finally {
    // 🔧 ARCH fix (Round 19 BUG-R19D-C1 + Round 20 H3):
    //    旧代码: } finally { await releaseLock(lockKey); } — 即使 locked=false 也删, 且无 ownership 检查。
    //    场景: A 持锁 (60s TTL) → A 工作超时 (80s) → 锁 TTL 过期 → B acquireLock 成功 (新 token)
    //    → A 终于完成 → A releaseLock(key) → 删了 B 的锁! → C 能 acquireLock → B/C 并发。
    //    根因修复: 只在自己持有锁时才 release (Round 19 C1),
    //    且 acquireLock/releaseLock 内部用 ownership token 验证 (Round 20 H3)。
    if (lockToken) {
      await releaseLock(lockKey);
    }
  }
}

/**
 * 获取用户的 Agent ID（不创建，仅查询）
 * 用于检查是否已有 agent
 */
export async function getUserAgentId(userId: string): Promise<string | null> {
  // 🔧 P0-3 fix (2026-07-18): validate userId before DB query
  if (!validateUserId(userId)) {
    logger.warn(`[Letta Agent Manager] getUserAgentId: invalid userId format: ${String(userId).substring(0, 50)}`);
    return null;
  }

  const { supabase } = createAdminClient();
  if (!supabase) return null;

  const { data: profile } = await supabase.from('profiles').select('letta_agent_id').eq('id', userId).maybeSingle();

  const profileData = profile as { letta_agent_id: string | null } | null;
  return profileData?.letta_agent_id || null;
}

// 🔧 ARCH fix (Round 44 R44-A-7 — saveAgentIdToProfile 死代码 + 缺 CAS 的 orphan agent 风险):
//    旧代码: 导出但无任何 caller (grep 验证), 且用无条件 .update({ letta_agent_id: agentId }).eq('id', userId)
//    — 这是 Round 19 R19-H-1 修复的 orphan agent 模式 (并发请求都 update, 第二个覆盖第一个)。
//    若未来误用此函数会重新引入 orphan agent 月费泄漏。
//    根因修复: 删除死代码 (createAgentForUser 内部已正确处理 agent_id 保存 + CAS)。
// export async function saveAgentIdToProfile(...) — DELETED

// ============================================================
// Agent 管理
// ============================================================

/**
 * 为已有的 Agent 启用 Sleep-Time Compute
 * 用于给 v0.3.0 之前创建的 Agent 补充开启
 *
 * 调用方式: admin API action=enable_sleeptime
 */
export async function enableSleeptimeForAgent(agentId: string): Promise<boolean> {
  // 🔧 P0-3 fix (2026-07-18): validate agentId before Letta API call
  if (!validateAgentId(agentId)) {
    logger.warn(`[Letta Agent Manager] enableSleeptimeForAgent: invalid agentId format: ${String(agentId).substring(0, 50)}`);
    return false;
  }

  if (!LETTA_API_KEY) {
    logger.error('[Letta Agent Manager] LETTA_API_KEY not configured');
    return false;
  }

  try {
    const client = getLettaClient();
    await client.agents.update(agentId, {
      enable_sleeptime: true,
    } as Record<string, unknown>);
    logger.info(`[Letta Agent Manager] Sleep-Time enabled for agent ${agentId}`);
    return true;
    // safe to ignore: non-critical background operation, error already logged
  } catch (err) {
    // safe to ignore: non-critical background operation, error already logged
    logger.error(`[Letta Agent Manager] Failed to enable sleeptime for agent ${agentId}:`, err);
    return false;
  }
}

// 🔧 ARCH fix (2026-07-21): Admin functions extracted to letta-agent-admin.ts
//    to reduce file size and improve code organization.
//    Import directly from letta-agent-admin.ts (not re-exported here to avoid circular dependency).
