/**
 * MCP Tools API
 *
 * POST /api/mcp — 执行 MCP 工具调用
 * GET  /api/mcp — 获取可用工具列表
 *
 * 认证方式（二选一）:
 * 1. Supabase Auth Cookie — 前端调用 /api/chat 内部使用
 * 2. X-MCP-Secret Header — Letta Custom Tool 回调使用
 *    请求体需包含 user_id 字段
 */

export const dynamic = 'force-dynamic';

export const maxDuration = 120;

import { NextRequest, NextResponse } from 'next/server';
// 🔧 ARCH fix (Round 56 R56-Bug6 — 提取共享 timingSafeCompare helper)
import { timingSafeCompare } from '@/lib/timing-safe-compare';
import { createAuthenticatedClient } from '@/lib/supabase-api';
import {
  MCP_TOOLS,
  executeMCPTools,
  getOpenAITools,
} from '@/lib/mcp-tools';
import { createAdminClient } from '@/lib/supabase-admin';
import { validateBody, isValidationError } from '@/lib/api-validation';
import { checkRateLimit } from '@/lib/distributed-lock';
import { z } from 'zod';

// MCP Secret: Letta Custom Tool 回调时使用的共享密钥
const MCP_API_SECRET = process.env.MCP_API_SECRET || '';

// 🔧 ARCH fix (Round 56 R56-Bug6): timingSafeCompare 已移除, 用共享 timingSafeCompare

/** 检查请求是否携带有效的 MCP Secret */
function hasValidMCPSecret(request: NextRequest): boolean {
  const mcpSecret = request.headers.get('X-MCP-Secret');
  // 也支持 Authorization: Bearer <secret> 格式
  const authHeader = request.headers.get('Authorization');
  const bearerSecret = authHeader?.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
  const providedSecret = mcpSecret || bearerSecret;
  return !!(providedSecret && MCP_API_SECRET && timingSafeCompare(providedSecret, MCP_API_SECRET));
}

// GET: 返回可用工具列表 — 🔧 SEC-5 fix: 需要 MCP Secret 或 Supabase Auth 认证
export async function GET(request: NextRequest) {
  // 检查 MCP Secret 认证
  if (hasValidMCPSecret(request)) {
    return NextResponse.json({
      tools: MCP_TOOLS,
      openai_format: getOpenAITools(),
    });
  }

  // 检查 Supabase Auth Cookie 认证
  const { user } = await createAuthenticatedClient(request);
  if (user) {
    return NextResponse.json({
      tools: MCP_TOOLS,
      openai_format: getOpenAITools(),
    });
  }

  return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
}

// POST: 执行工具调用
  // eslint-disable-next-line require-await -- async for API consistency
export async function POST(request: NextRequest) {
  // === 认证方式 1: MCP Secret（Letta Custom Tool 回调） ===
  if (hasValidMCPSecret(request)) {
    return handleMcpSecretRequest(request);
  }

  // === 认证方式 2: Supabase Auth Cookie（前端/内部调用） ===
  return handleSupabaseAuthRequest(request);
}

/**
 * 🔧 ARCH fix (Round 26 AUDIT-5 HIGH-2): MCP rate limiting helper
 *    旧代码: 无 rate limit → reward farming exploit (add_tokens/add_vitality 每小时 dedup bucket)
 *    根因修复: 按 userId 限流, 100 次/小时 (Letta 正常工具调用远低于此)
 *    MCP Secret 路径用 user_id, Supabase Auth 路径用 user.id
 */
async function checkMcpRateLimit(userId: string): Promise<NextResponse | null> {
  const { allowed } = await checkRateLimit(`mcp:user:${userId}`, 100, 60 * 60 * 1000);
  if (!allowed) {
    return NextResponse.json(
      { error: 'MCP rate limit exceeded. Maximum 100 tool calls per hour.' },
      { status: 429 }
    );
  }
  return null;
}

/**
 * MCP Secret 认证 — Letta Custom Tool 回调
 * 请求体: { toolCalls: [...], user_id: "xxx" }
 */
async function handleMcpSecretRequest(request: NextRequest) {
  const { supabase: adminSupabase, error: adminError } = createAdminClient();
  if (!adminSupabase) {
    return NextResponse.json(
      { error: adminError || 'Supabase not configured for MCP secret auth' },
      { status: 500 }
    );
  }

  // 🔧 ARCH fix (Round 9 AUDIT-3 P0 #1): 用 zod 替代手写 validation
  //    旧代码: 手写 UUID 正则 + typeof checks — 容易漏字段
  //    根因修复: zod schema 一次性验证 user_id (UUID) + toolCalls (array)
  // 🔧 ARCH fix (Round 11 ADV-REVIEW LOW-4): arguments 改为 required (与 MCPToolCall interface 一致)
  const mcpSecretSchema = z.object({
    toolCalls: z.array(z.object({
      id: z.string().min(1).max(200),
      name: z.string().min(1).max(100),
      arguments: z.record(z.string(), z.unknown()),
    })).min(1, 'Missing toolCalls array'),
    user_id: z.string().uuid('Invalid user_id format — must be a valid UUID'),
  });
  const body = await validateBody(request, mcpSecretSchema);
  if (body instanceof NextResponse) return body;
  // body 已被 zod 验证为 { toolCalls: {id, name, arguments}[], user_id: string }
  // 类型与 MCPToolCall[] 兼容, 无需 cast
  const typedBody = body;

  // 🔧 BUG-242 fix: 验证 user_id 存在于数据库中，防止跨用户数据访问
  // 🔧 架构优化 (2026-06-30): .single() → .maybeSingle()
  // .single() 在无结果时抛 PGRST116 error, .maybeSingle() 返回 null
  const { data: userProfile, error: userDbError } = await adminSupabase
    .from('profiles')
    .select('id')
    .eq('id', typedBody.user_id)
    .maybeSingle();

  if (userDbError) {
    return NextResponse.json(
      { error: 'Failed to verify user identity' },
      { status: 500 }
    );
  }

  if (!userProfile) {
    return NextResponse.json(
      { error: 'User not found — user_id does not correspond to a valid account' },
      { status: 403 }
    );
  }

  // 🔧 ARCH fix (Round 26 AUDIT-5 HIGH-2): Rate limit MCP secret path
  const mcpRateLimit = await checkMcpRateLimit(typedBody.user_id);
  if (mcpRateLimit) return mcpRateLimit;

  const results = await executeMCPTools(typedBody.toolCalls, adminSupabase, typedBody.user_id);

  return NextResponse.json({ results });
}

/**
 * Supabase Auth 认证 — 前端/内部调用
 */
async function handleSupabaseAuthRequest(request: NextRequest) {
  const { supabase, user, error: authError, mergeCookies } =
    await createAuthenticatedClient(request);

  if (authError || !user || !supabase) {
    return mergeCookies(
      NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    );
  }

  // 🔧 ARCH fix (Round 9 AUDIT-3 P0 #1): 用 zod 替代手写 validation
  // 🔧 ARCH fix (Round 11 ADV-REVIEW LOW-4): arguments required + 移除不必要的 cast
  const mcpAuthSchema = z.object({
    toolCalls: z.array(z.object({
      id: z.string().min(1).max(200),
      name: z.string().min(1).max(100),
      arguments: z.record(z.string(), z.unknown()),
    })).min(1, 'Missing toolCalls array'),
  });
  const bodyResult = await validateBody(request, mcpAuthSchema);
  if (isValidationError(bodyResult)) return mergeCookies(bodyResult);
  const typedBody = bodyResult;

  // 🔧 ARCH fix (Round 26 AUDIT-5 HIGH-2): Rate limit Supabase auth path
  const mcpRateLimit = await checkMcpRateLimit(user.id);
  if (mcpRateLimit) return mergeCookies(mcpRateLimit);

  const results = await executeMCPTools(typedBody.toolCalls, supabase, user.id);

  return mergeCookies(
    NextResponse.json({ results })
  );
}
