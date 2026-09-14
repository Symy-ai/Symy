/**
 * MCP Auth Helper — Round 122 (shared between server-v2 and future server)
 *
 * 🔧 Round 122 audit fix (AUDIT-8): 提取 auth + user verification 逻辑
 *    从 server/route.ts (549行) 提取, 供 SDK 版 server-v2 复用
 *
 * 安全防护 (保留所有 Round 120 audit fix):
 * 1. Bearer token: "mcp:{userId}:{secret}" (per-user) 或 "{secret}" (pure-secret)
 * 2. X-MCP-Secret header (legacy 兼容)
 * 3. timingSafeCompare 防 timing attack
 * 4. pure-secret 模式: user_id 必须对应 profiles.letta_agent_id IS NOT NULL
 *    (Round 120 AUDIT-5 S1 — 提升攻击门槛)
 */

import 'server-only'; // 🔧 Round 122: 防止客户端组件意外导入 (此文件用 createAdminClient = admin service)

import { NextRequest } from 'next/server';
import { timingSafeCompare } from '@/lib/timing-safe-compare';
import { createAdminClient } from '@/lib/supabase-admin';
import { logger } from '@/lib/logger';

const MCP_API_SECRET = process.env.MCP_API_SECRET || '';

export interface McpAuthResult {
  authenticated: boolean;
  /** userId from token (per-user mode only); undefined for pure-secret mode */
  tokenUserId?: string;
  error?: string;
}

/**
 * Authenticate MCP request via Bearer token or X-MCP-Secret header.
 * Returns authenticated=true if valid, plus tokenUserId if per-user token.
 */
export function authenticateMcpRequest(request: NextRequest): McpAuthResult {
  // 方式 1: Authorization Bearer Token
  const authHeader = request.headers.get('Authorization');
  if (authHeader?.startsWith('Bearer ')) {
    const token = authHeader.substring(7);
    // Bearer token 格式: "mcp:{user_id}:{secret}" 或直接就是 secret
    if (token.includes(':')) {
      const parts = token.split(':');
      if (parts[0] === 'mcp' && parts.length === 3) {
        const userId = parts[1];
        const secret = parts[2];
        if (MCP_API_SECRET && timingSafeCompare(secret, MCP_API_SECRET)) {
          return { authenticated: true, tokenUserId: userId };
        }
      }
    } else if (MCP_API_SECRET && timingSafeCompare(token, MCP_API_SECRET)) {
      // 纯 secret，user_id 需要从 arguments 获取
      return { authenticated: true };
    }
  }

  // 方式 2: X-MCP-Secret header（兼容旧配置）
  const mcpSecret = request.headers.get('X-MCP-Secret');
  if (mcpSecret && MCP_API_SECRET && timingSafeCompare(mcpSecret, MCP_API_SECRET)) {
    return { authenticated: true };
  }

  return { authenticated: false, error: 'Invalid or missing authentication' };
}

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Verify the target user_id for tool execution.
 * Security checks (preserved from Round 120 AUDIT-5 S1):
 * 1. If tokenUserId is set (per-user token), args.user_id must match
 * 2. UUID format validation (prevent injection)
 * 3. User must exist in profiles table
 * 4. For pure-secret mode (no tokenUserId): user must have letta_agent_id IS NOT NULL
 *
 * @returns { valid: true, userId } if all checks pass, { valid: false, error } otherwise
 */
export async function verifyTargetUser(
  argsUserId: string | undefined,
  tokenUserId: string | undefined,
  supabase: ReturnType<typeof createAdminClient>['supabase'],
): Promise<{ valid: true; userId: string } | { valid: false; error: string }> {
  // Check 1: per-user token → args.user_id must match tokenUserId
  if (tokenUserId && argsUserId && String(argsUserId) !== tokenUserId) {
    return {
      valid: false,
      error: `user_id mismatch: authenticated as ${tokenUserId.substring(0, 8)}... but arguments specify different user. Cross-user operations are not allowed.`,
    };
  }

  const userId = String(argsUserId || tokenUserId);
  if (!userId) {
    return {
      valid: false,
      error: 'Missing user_id. Please provide user_id in arguments or authenticate with a user-scoped token.',
    };
  }

  // Check 2: UUID format
  if (!UUID_REGEX.test(userId)) {
    return { valid: false, error: 'Invalid user_id format: must be a valid UUID.' };
  }

  // Check 3 + 4: DB verification
  if (!supabase) {
    return { valid: false, error: 'Database client unavailable.' };
  }

  try {
    const { data: userProfile, error: dbError } = await supabase
      .from('profiles')
      .select('id, letta_agent_id')
      .eq('id', userId)
      .maybeSingle();

    if (dbError) {
      logger.error('[MCP Auth] DB error verifying user_id:', dbError);
      return { valid: false, error: 'Failed to verify user identity.' };
    }

    if (!userProfile) {
      return { valid: false, error: 'User not found in database.' };
    }

    // Round 120 AUDIT-5 S1: pure-secret mode requires letta_agent_id IS NOT NULL
    if (!tokenUserId && !(userProfile as { letta_agent_id?: string | null })?.letta_agent_id) {
      logger.error(
        `[MCP Auth] SECURITY: pure-secret auth attempted for user ${userId.substring(0, 8)}... ` +
        `who has no letta_agent_id — possible impersonation attempt. Rejecting.`
      );
      return { valid: false, error: 'User not eligible for MCP tool calls (no agent configured).' };
    }
      // safe to ignore: non-critical background operation, error already logged
  } catch (dbErr) {
                    // safe to ignore: non-critical background operation, error already logged
    logger.error('[MCP Auth] Failed to verify user_id in database:', dbErr);
    return { valid: false, error: 'Failed to verify user identity.' };
  }

  return { valid: true, userId };
}

/**
 * Build the MCP server instructions (Symy guardian voice guide for AI).
 */
export const MCP_SERVER_INSTRUCTIONS = `This MCP server provides tools for the Symy companion app.

Symy is a warm little elephant companion who guards the user's wallet AND the planet — an active helper, not a passive mirror.

Each tool requires a user_id parameter — this is the Supabase auth user ID.
When calling tools from a Letta Agent, read the user_id from your memory blocks.

Tool usage guide:
- User resists an inducement → complete_challenge, then celebrate briefly and sincerely: "You held the gate! $X stays — Symy's trunk is up 🐘" plus one short phrase naming where the money goes.
- User returns/refunds → add_tokens(growth) + add_dream_fund_progress
- User is induced into a purchase → record_impulse, then respond warmly without judgment: acknowledge what happened and encourage a brief pause next time.
- User has financial insight → add_tokens(pleasure)
- 7-day streak → add_badge(streak_7)
- Any money saved → add_dream_fund_progress (note where it went in one short phrase, not a paragraph)
- Keep translating meaningful amounts into hours of life. When useful, mention one greener alternative: durable, repairable, reusable, or secondhand first.

⚠️ After calling any tool, keep your response under 40 words (English) / 60 Chinese characters. No shaming. No lecturing. A brief celebration is welcome when the user guards well.`;
