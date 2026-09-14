/**
 * MCP Server V2 — Round 122 (production SDK migration)
 *
 * 🔧 Round 122 audit fix (AUDIT-8): 完整迁移 from hand-rolled JSON-RPC (549 lines)
 *    to @modelcontextprotocol/sdk (~200 lines, 64% reduction)
 *
 * 此端点替换 /api/mcp/server 的所有功能:
 * - 6 个工具 (add_tokens, add_vitality, complete_challenge, add_badge,
 *   add_dream_fund_progress, record_impulse)
 * - Bearer token + X-MCP-Secret 认证 (per-user + pure-secret 模式)
 * - user_id verification (UUID format + DB existence + letta_agent_id check)
 * - CORS headers
 * - Magic mirror instructions (initialize handler)
 *
 * 架构改进:
 * - SDK 处理 JSON-RPC 2.0 协议 (initialize/tools-list/tools-call/ping)
 * - SDK 处理 zod schema 验证 (不再手写 JSON Schema → zod 转换)
 * - SDK 处理 error codes (-32601 method not found, -32603 internal, etc.)
 * - 我们只负责: auth + tool handler 业务逻辑
 *
 * 安全防护 (全部保留):
 * - timingSafeCompare (防 timing attack)
 * - per-user token: arguments.user_id 必须与 token userId 匹配
 * - pure-secret mode: user 必须有 letta_agent_id (Round 120 AUDIT-5 S1)
 * - UUID format validation
 * - DB user existence check
 *
 * 迁移路径:
 * 1. 此端点 (server-v2) 并行运行, 不影响现有 /api/mcp/server
 * 2. Letta Dashboard 切换 MCP server URL 到 /api/mcp/server-v2
 * 3. 验证 1-2 周后, 删除旧 /api/mcp/server, 把 server-v2 改名为 server
 */

export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';
import { z } from 'zod';
import { logger } from '@/lib/logger';
import { createAdminClient } from '@/lib/supabase-admin';
import { executeMCPTool, MCP_TOOLS } from '@/lib/mcp-tools';
import {
  authenticateMcpRequest,
  verifyTargetUser,
  MCP_SERVER_INSTRUCTIONS,
} from '@/lib/mcp-tools/mcp-auth';

// 🔧 SDK 需要 Node.js runtime (不是 Edge) — 用了 crypto, stream 等 Node API
export const runtime = 'nodejs';
export const maxDuration = 60;

/**
 * Create a fresh McpServer instance with all 6 tools registered.
 * Stateless mode — each request gets a new server instance.
 *
 * The authUserId is passed through authInfo.extra.userId to each tool handler,
 * enabling per-user token verification (arguments.user_id must match).
 */
function createMcpServer(authUserId?: string): McpServer {
  const server = new McpServer(
    {
      name: 'symy-mcp-server',
      version: '1.0.0',
      title: 'Symy MCP Server',
      description: 'Anti-inducement companion tools for the Symy app',
    },
    {
      capabilities: { tools: { listChanged: false } },
      instructions: MCP_SERVER_INSTRUCTIONS,
    }
  );

  // Register all 6 tools from MCP_TOOLS definition
  // 🔧 SDK 的 registerTool 接受 zod schema (inputSchema), 自动生成 JSON Schema
  //    我们从 MCP_TOOLS 的 JSON Schema 定义转换为 zod schema
  for (const tool of MCP_TOOLS) {
    registerToolFromDefinition(server, tool, authUserId);
  }

  return server;
}

/**
 * Register a single tool on the McpServer, converting our JSON Schema definition
 * to a zod schema that the SDK can validate + serialize.
 *
 * The handler:
 * 1. Extracts user_id from args (or falls back to authUserId from token)
 * 2. Verifies user_id (UUID + DB + letta_agent_id check)
 * 3. Calls executeMCPTool (existing dispatch logic, unchanged)
 * 4. Returns MCP-formatted content response
 */
function registerToolFromDefinition(
  server: McpServer,
  tool: (typeof MCP_TOOLS)[number],
  authUserId?: string,
): void {
  // Build zod schema from JSON Schema
  // 🔧 SDK registerTool 的 inputSchema 接受 zod object schema
  //    所有工具都有 user_id (string UUID) + 工具特定参数
  const inputSchema = buildZodSchema(tool);

  server.registerTool(
    tool.name,
    {
      description: tool.description,
      inputSchema,
    },
    async (args, extra) => {
      // Extract user_id: prefer args.user_id, fall back to authUserId from token
      const argsUserId = (args as Record<string, unknown>).user_id as string | undefined;
      const tokenUserId = authUserId || (extra.authInfo?.extra?.userId as string | undefined);

      // Get supabase admin client for DB verification + tool execution
      const { supabase, error: adminError } = createAdminClient();
      if (adminError || !supabase) {
        logger.error('[MCP V2] Admin client unavailable:', adminError);
        return {
          content: [{ type: 'text' as const, text: 'Internal server error — database unavailable.' }],
          isError: true,
        };
      }

      // Verify target user (all security checks in mcp-auth.ts)
      const verification = await verifyTargetUser(argsUserId, tokenUserId, supabase);
      if (!verification.valid) {
        return {
          content: [{ type: 'text' as const, text: verification.error }],
          isError: true,
        };
      }

      // Build toolCallId from JSON-RPC request id (for dedup)
      // SDK passes the request id through extra.requestId? Actually, we use a UUID fallback
      const toolCallId = `mcp-${extra.requestId ?? crypto.randomUUID()}`;

      // Execute the tool via existing dispatch
      const result = await executeMCPTool(
        {
          id: toolCallId,
          name: tool.name,
          arguments: args as Record<string, unknown>,
        },
        supabase,
        verification.userId,
      );

      // Return MCP-formatted response
      return {
        content: [{ type: 'text' as const, text: result.message }],
        structuredContent: result.result,
        isError: !result.success,
      };
    }
  );
}

/**
 * Build a zod schema from our JSON Schema tool definition.
 * All tools have user_id (required) + tool-specific params.
 *
 * 🔧 Round 122 AUDIT-10 BUG #1 fix: 旧代码把所有参数都设为 required (zod 默认)
 *    但 JSON Schema 的 required 数组只列出必填字段, 其余应该 .optional()
 *    修复: 检查 tool.parameters.required, 非必填字段加 .optional()
 */
function buildZodSchema(tool: (typeof MCP_TOOLS)[number]): Record<string, z.ZodType> {
  const schema: Record<string, z.ZodType> = {
    user_id: z.string().uuid().describe("The user's Supabase auth ID. Read from your memory blocks."),
  };

  // 🔧 Round 122 AUDIT-10 fix: 获取 required 字段列表, 非必填字段加 .optional()
  const requiredFields = new Set(tool.parameters.required || []);

  // Convert JSON Schema properties to zod
  const props = tool.parameters.properties as Record<string, { type?: string; description?: string; enum?: string[]; default?: unknown }>;
  for (const [key, prop] of Object.entries(props)) {
    if (key === 'user_id') continue; // already added
    let zodType = jsonSchemaToZod(prop);
    // 🔧 AUDIT-10 fix: 非必填字段加 .optional() (zod 默认 required, 需显式 optional)
    if (!requiredFields.has(key)) {
      zodType = zodType.optional();
    }
    schema[key] = zodType;
  }

  return schema;
}

/**
 * Convert a single JSON Schema property to a zod type.
 * Handles: string, number, enum, with optional description.
 */
function jsonSchemaToZod(prop: { type?: string; description?: string; enum?: string[]; default?: unknown }): z.ZodType {
  const desc = prop.description;
  let zodType: z.ZodType;

  if (prop.enum) {
    zodType = z.enum(prop.enum as [string, ...string[]]);
  } else if (prop.type === 'number') {
    zodType = z.number();
  } else if (prop.type === 'string') {
    zodType = z.string();
  } else {
    zodType = z.unknown();
  }

  if (desc) {
    zodType = zodType.describe(desc);
  }

  return zodType;
}

// ============================================================
// HTTP Handlers
// ============================================================

export async function POST(request: NextRequest) {
  // 1. Auth
  const authResult = authenticateMcpRequest(request);
  if (!authResult.authenticated) {
    return NextResponse.json(
      {
        jsonrpc: '2.0',
        id: null,
        error: { code: -32001, message: authResult.error || 'Unauthorized' },
      },
      { status: 401, headers: corsHeaders() }
    );
  }

  try {
    // 2. Create transport (stateless — no session persistence)
    const transport = new WebStandardStreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
    });

    // 3. Create server with authUserId passed through to tool handlers
    const server = createMcpServer(authResult.tokenUserId);

    // 4. Connect server ↔ transport
    await server.connect(transport);

    // 5. Handle request — SDK returns standard Response
    const response = await transport.handleRequest(request as unknown as Request, {
      authInfo: {
        token: process.env.MCP_API_SECRET || '',
        clientId: 'letta-agent',
        scopes: [],
        extra: { userId: authResult.tokenUserId },
      },
    });

    // 🔧 Round 122 AUDIT-10 BUG #7 fix: 不调用 server.close()
    //    旧代码: await server.close() — 会关闭 transport 的 stream controllers
    //    → 如果 response 是 SSE 流 (enableJsonResponse: false 默认), 流被提前终止
    //    修复: 不主动 close — Vercel serverless 函数结束后会自动 GC
    //    (stateless 模式, server 实例不会跨请求复用)

    return response;
      // safe to ignore: non-critical background operation, error already logged
  } catch (err) {
                  // safe to ignore: non-critical background operation, error already logged
    logger.error('[MCP V2] Error handling request:', err);
    return NextResponse.json(
      { jsonrpc: '2.0', id: null, error: { code: -32603, message: 'Internal error' } },
      { status: 500, headers: corsHeaders() }
    );
  }
}

// 🔧 stateless mode: GET/DELETE return 405 (SDK doesn't support stateful SSE in serverless)
  // eslint-disable-next-line require-await -- async for API consistency
export async function GET() {
  return new NextResponse('Method Not Allowed', { status: 405, headers: corsHeaders() });
}

  // eslint-disable-next-line require-await -- async for API consistency
export async function DELETE() {
  return new NextResponse(null, { status: 200, headers: corsHeaders() });
}

// OPTIONS: CORS preflight
  // eslint-disable-next-line require-await -- async for API consistency
export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: corsHeaders() });
}

// ============================================================
// CORS Headers (preserved from original server/route.ts)
// ============================================================

function corsHeaders(): Headers {
  const headers = new Headers();
  if (process.env.NODE_ENV === 'development') {
    headers.set('Access-Control-Allow-Origin', '*');
  } else {
    const allowedOrigins = process.env.MCP_ALLOWED_ORIGINS;
    if (allowedOrigins) {
      headers.set('Access-Control-Allow-Origin', allowedOrigins);
    }
  }
  headers.set('Access-Control-Allow-Methods', 'POST, GET, DELETE, OPTIONS');
  headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization, Mcp-Session-Id, MCP-Protocol-Version, X-MCP-Secret, Accept');
  headers.set('Access-Control-Expose-Headers', 'Mcp-Session-Id');
  return headers;
}
