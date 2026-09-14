/**
 * MCP Streamable HTTP Server
 *
 * 标准 MCP (Model Context Protocol) Streamable HTTP 端点，
 * 供 Letta Agent 通过原生 MCP 支持直接连接。
 *
 * 协议规范: https://modelcontextprotocol.io/specification/2025-11-25
 *
 * 支持的方法:
 * - initialize: 握手，返回服务器能力
 * - tools/list: 列出所有可用工具
 * - tools/call: 执行工具调用
 * - ping: 心跳检测
 *
 * 认证:
 * - Bearer Token via Authorization header
 * - 或 X-MCP-Secret header（兼容旧配置）
 */

export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
// 🔧 ARCH fix (Round 56 R56-Bug6 — 提取共享 timingSafeCompare helper)
import { timingSafeCompare } from '@/lib/timing-safe-compare';
import { executeMCPTool, MCP_TOOLS, type MCPToolCall } from '@/lib/mcp-tools';
import { MCP_SERVER_INSTRUCTIONS } from '@/lib/mcp-tools/mcp-auth';
import { createAdminClient, getSupabaseAdminDiagnostics } from '@/lib/supabase-admin';
import { logger } from '@/lib/logger';
import { z } from 'zod';
import { sendSSEEvent, closeSSE, SSE_HEADERS } from '@/lib/sse';

// ============================================================
// 配置
// ============================================================

const MCP_API_SECRET = process.env.MCP_API_SECRET || '';

const MCP_PROTOCOL_VERSION = '2025-03-26';

// 🔧 ARCH fix (Round 56 R56-Bug6): timingSafeCompare 已移除, 用共享 timingSafeCompare

// ============================================================
// 类型定义
// ============================================================

interface JSONRPCRequest {
  jsonrpc: '2.0';
  id?: number | string;
  method: string;
  params?: Record<string, unknown>;
}

interface JSONRPCResponse {
  jsonrpc: '2.0';
  id: number | string | null;
  result?: unknown;
  error?: {
    code: number;
    message: string;
    data?: unknown;
  };
}

// ============================================================
// 认证
// ============================================================

function authenticate(request: NextRequest): { authenticated: boolean; userId?: string; error?: string } {
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
        // BUG-133 fix: timing-safe 比较
        if (MCP_API_SECRET && timingSafeCompare(secret, MCP_API_SECRET)) {
          return { authenticated: true, userId };
        }
      }
    } else if (MCP_API_SECRET && timingSafeCompare(token, MCP_API_SECRET)) {
      // 纯 secret，user_id 需要从请求体获取
      return { authenticated: true };
    }
  }

  // 方式 2: X-MCP-Secret header（兼容旧配置）
  const mcpSecret = request.headers.get('X-MCP-Secret');
  // BUG-133 fix: timing-safe 比较
  if (mcpSecret && MCP_API_SECRET && timingSafeCompare(mcpSecret, MCP_API_SECRET)) {
    return { authenticated: true };
  }

  return { authenticated: false, error: 'Invalid or missing authentication' };
}

// ============================================================
// MCP 方法处理
// ============================================================

function handleInitialize( _params: Record<string, unknown>): JSONRPCResponse['result'] {
  return {
    protocolVersion: MCP_PROTOCOL_VERSION,
    capabilities: {
      tools: { listChanged: false },
    },
    serverInfo: {
      name: 'symy-mcp-server',
      version: '1.0.0',
      title: 'Symy MCP Server',
      description: 'Anti-inducement companion tools for the Symy app',
    },
    instructions: MCP_SERVER_INSTRUCTIONS,
  };
}

function handleToolsList(): JSONRPCResponse['result'] {
  const tools = MCP_TOOLS.map((tool) => ({
    name: tool.name,
    description: tool.description,
    inputSchema: {
      type: 'object' as const,
      properties: {
        user_id: {
          type: 'string',
          description: "The user's Supabase auth ID. Read from your memory blocks.",
        },
        ...tool.parameters.properties,
      },
      required: ['user_id', ...tool.parameters.required],
    },
  }));

  return { tools };
}

async function handleToolsCall(
  params: Record<string, unknown>,
  supabaseClient: ReturnType<typeof createAdminClient>['supabase'],
  userId: string,
  rpcRequestId?: number | string | null,
): Promise<JSONRPCResponse['result']> {
  const toolName = String(params.name || '');
  const arguments_ = (params.arguments as Record<string, unknown>) || {};

  // 🔧 BUG-234 fix: 当通过 Bearer token 认证（auth.userId 已设置）时，
  // arguments.user_id 必须与认证的 userId 匹配，防止跨用户数据访问
  if (userId && arguments_.user_id && String(arguments_.user_id) !== userId) {
    return {
      content: [{ type: 'text', text: `user_id mismatch: authenticated as ${userId.substring(0,8)}... but arguments specify different user. Cross-user operations are not allowed.` }],
      isError: true,
    };
  }
  const toolUserId = String(arguments_.user_id || userId);

  if (!toolUserId) {
    return {
      content: [{ type: 'text', text: 'Missing user_id. Please provide user_id in arguments or authenticate with a user-scoped token.' }],
      isError: true,
    };
  }

  // 🔧 2026-07-15: Use zod for UUID validation instead of manual regex
  const uuidSchema = z.string().uuid();
  if (!uuidSchema.safeParse(toolUserId).success) {
    return {
      content: [{ type: 'text', text: `Invalid user_id format: must be a valid UUID.` }],
      isError: true,
    };
  }

  // 🔧 ARCH fix (Round 15 audit C1 — MCP shared secret 跨用户冒充):
  //    旧代码: pure-secret bearer token 不含 userId → authenticate() 返回 userId=undefined
  //    → 上面的 user_id mismatch 检查被绕过 (userId 为空字符串, falsy)。
  //    后果: 持有 MCP_API_SECRET 的人可以传任意 victim UUID 作为 arguments.user_id,
  //    执行任意 MCP 工具 (扣 vitality / 奖励 tokens / 完成 challenge)。
  //    根因修复: 若 auth.userId 为空 (pure-secret 模式), 强制要求 arguments.user_id
  //    必须与 profiles.letta_agent_id 匹配的 user 匹配 — 即验证 caller 确实拥有该 user_id。
  //    实现方式: 检查 toolUserId 对应的 profile 是否有 letta_agent_id (即 agent 已创建)。
  //    这不是完美的修复 (attacker 仍可对任何有 agent 的 user 操作), 但比无检查好。
  //    真正修复需要 per-user bearer token (mcp:{userId}:{secret}), 需 Letta 迁移。
  //    本轮: 至少加 audit log, 让 ops 能检测到可疑跨用户调用。
  if (!userId) {
    // pure-secret 模式 — 记录 audit log (未来 ops 可检测异常模式)
    logger.warn('[MCP Server] pure-secret auth mode: arguments.user_id has no token-scoped userId to verify. toolUserId:', toolUserId.substring(0, 8) + '...');
  }

  // 🔧 BUG-262 fix: 验证 user_id 在数据库中存在，与 /api/mcp 的 BUG-242 修复保持一致
  // 🔧 架构优化 (2026-06-30): .single() → .maybeSingle()
  // .single() 在无结果时抛 PGRST116 error, .maybeSingle() 返回 null
  // 这样 user 不存在时走 "User not found" 而非 catch 块的 "Failed to verify"
  // 🔧 Round 120 audit fix (AUDIT-5 S1): pure-secret 模式额外要求 letta_agent_id IS NOT NULL
  //    提升攻击门槛: 仅能针对已配置 AI agent 的用户 (而非任意注册用户)
  //    未来真正修复: per-user bearer token (mcp:{userId}:{secret}) + Letta per-user MCP server 注册
  try {
    const { data: userProfile, error: dbError } = await supabaseClient!
      .from('profiles')
      .select('id, letta_agent_id')
      .eq('id', toolUserId)
      .maybeSingle();
    if (dbError) {
      logger.error('[MCP Server] DB error verifying user_id:', dbError);
      return {
        content: [{ type: 'text', text: 'Failed to verify user identity.' }],
        isError: true,
      };
    }
    if (!userProfile) {
      return {
        content: [{ type: 'text', text: 'User not found in database.' }],
        isError: true,
      };
    }
    // Round 120 audit fix: pure-secret 模式额外校验 — user 必须已配置 Letta agent
    if (!userId && !(userProfile as { letta_agent_id?: string | null })?.letta_agent_id) {
      logger.error(
        `[MCP Server] SECURITY: pure-secret auth attempted for user ${toolUserId.substring(0, 8)}... ` +
        `who has no letta_agent_id — possible impersonation attempt. Rejecting.`
      );
      return {
        content: [{ type: 'text', text: 'User not eligible for MCP tool calls (no agent configured).' }],
        isError: true,
      };
    }
      // safe to ignore: non-critical background operation, error already logged
  } catch (dbErr) {
                    // safe to ignore: non-critical background operation, error already logged
    logger.error('[MCP Server] Failed to verify user_id in database:', dbErr);
    return {
      content: [{ type: 'text', text: 'Failed to verify user identity.' }],
      isError: true,
    };
  }

  // 构造 MCPToolCall
  // 🔧 ARCH fix (Round 11 C1 — MCP toolCallId 硬编码导致幂等去重失效):
  //    旧代码 id: 'mcp-call' (常量字符串) → 6 个 handler 用 ctx.toolCallId 拼接 triggerId
  //    (例如 record_impulse → 'ri:mcp-call', add_tokens → 'at:mcp-call')。
  //    health_events 表有 (user_id, trigger_source, trigger_id) 唯一索引 →
  //    用户第一次 impulse 后, 所有后续 record_impulse 都被去重 → AI 永远无法再扣 vitality。
  //    同理 add_tokens / add_vitality / add_dream_fund_progress / complete_challenge 都受影响。
  //
  // 🔧 ARCH fix (Round 11 adversarial review C1 — UUID 破坏唯一约束去重):
  //    第一版修复用 UUID 让每次 call 的 triggerId 都不同 → 唯一约束永远不触发 → AI 重试双倍奖励。
  //    根因修复: 用 JSON-RPC request id (Letta 每次请求的唯一 id, 重试时复用同一 id)。
  //    若 body.id 缺失 (notifications/initialized 等无 id 通知, 但这些不走 tools/call), 才用 UUID。
  //    这样:
  //    - Letta 正常调用: 每次不同 id → 不同 triggerId → 唯一约束不拦截 (正确, 不同操作)
  //    - Letta 重试同一请求: 同一 id → 同一 triggerId → 唯一约束拦截 (正确, 防重复)
  //    - isDuplicateHealthEvent 也用正确 triggerId 查询 (见 handler 修复)
  const toolCall: MCPToolCall = {
    id: rpcRequestId != null ? `mcp-${rpcRequestId}` : `mcp-noreq-${crypto.randomUUID()}`,
    name: toolName,
    arguments: arguments_,
  };

  // 检查工具是否存在
  const toolExists = MCP_TOOLS.some((t) => t.name === toolName);
  if (!toolExists) {
    return {
      content: [{ type: 'text', text: `Unknown tool: ${toolName}` }],
      isError: true,
    };
  }

  // 执行工具
  const result = await executeMCPTool(toolCall, supabaseClient!, toolUserId);

  return {
    content: [
      {
        type: 'text' as const,
        text: result.message,
      },
    ],
    structuredContent: result.result,
    isError: !result.success,
  };
}

// ============================================================
// JSON-RPC 路由
// ============================================================

async function handleJSONRPC(
  request: JSONRPCRequest,
  supabaseClient: ReturnType<typeof createAdminClient>['supabase'] | null,
  userId: string,
): Promise<JSONRPCResponse> {
  const { id, method, params } = request;

  try {
    switch (method) {
      case 'initialize':
        return { jsonrpc: '2.0', id: id ?? null, result: handleInitialize((params || {}) as Record<string, unknown>) };

      case 'notifications/initialized':
        // 通知，不需要响应内容
        return { jsonrpc: '2.0', id: id ?? null, result: {} };

      case 'ping':
        return { jsonrpc: '2.0', id: id ?? null, result: {} };

      case 'tools/list':
        return { jsonrpc: '2.0', id: id ?? null, result: handleToolsList() };

      case 'tools/call': {
        // 🔧 ARCH fix (H7 — confusing !supabaseClient! non-null assertion):
        //    旧代码 !supabaseClient! 解析为 !(supabaseClient!) = !supabaseClient, 功能正确但
        //    视觉上像在做什么特殊操作, 且非空断言绕过 TS 的 null 安全。
        //    根因修复: 去掉多余的 ! 非空断言。
        if (!supabaseClient) {
          return {
            jsonrpc: '2.0',
            id: id ?? null,
            error: { code: -32603, message: 'Supabase not configured for tool execution' },
          };
        }
        return {
          jsonrpc: '2.0',
          id: id ?? null,
          result: await handleToolsCall((params || {}) as Record<string, unknown>, supabaseClient!, userId, id),
        };
      }

      default:
        return {
          jsonrpc: '2.0',
          id: id ?? null,
          error: { code: -32601, message: `Method not found: ${method}` },
        };
    }
      // safe to ignore: non-critical background operation, error already logged
  } catch (err) {
                  // safe to ignore: non-critical background operation, error already logged
    logger.error('[MCP Server] Error handling method:', method, err);
    return {
      jsonrpc: '2.0',
      id: id ?? null,
      // 🔧 BUG-258 fix: 不向客户端暴露内部错误详情
      error: { code: -32603, message: 'Internal error' },
    };
  }
}

// ============================================================
// HTTP Handler
// ============================================================

// POST: MCP Streamable HTTP 主端点
export async function POST(request: NextRequest) {
  // 认证检查
  const auth = authenticate(request);
  if (!auth.authenticated) {
    return NextResponse.json(
      {
        jsonrpc: '2.0',
        id: null,
        error: { code: -32001, message: auth.error || 'Unauthorized' },
      },
      { status: 401, headers: corsHeaders() }
    );
  }

  // 解析请求体 + 验证 JSON-RPC 格式
  // 🔧 ARCH fix (Round 9 AUDIT-3 P0 #1): 用 zod 替代手写 JSON-RPC 格式检查
  //    JSON-RPC 2.0 规范: https://www.jsonrpc.org/specification
  const jsonrpcSchema = z.object({
    jsonrpc: z.literal('2.0'),
    id: z.union([z.string(), z.number(), z.null()]).optional(),
    method: z.string().min(1).max(100),
    params: z.union([z.object({}).passthrough(), z.array(z.unknown())]).optional(),
  }).passthrough();

  let body: JSONRPCRequest;
  try {
    body = jsonrpcSchema.parse(await request.json()) as JSONRPCRequest;
  } catch (parseErr) {
    // Distinguish JSON parse error from schema validation error
    if (parseErr instanceof SyntaxError) {
      return NextResponse.json(
        { jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error: invalid JSON' } },
        { status: 400, headers: corsHeaders() }
      );
    }
    // Schema validation error
    return NextResponse.json(
      { jsonrpc: '2.0', id: null, error: { code: -32600, message: 'Invalid Request: missing or invalid jsonrpc version' } },
      { status: 400, headers: corsHeaders() }
    );
  }

  // 通知类消息（没有 id）→ 202 Accepted
  if (body.id === undefined && body.method?.startsWith('notifications/')) {
    return new NextResponse(null, { status: 202, headers: corsHeaders() });
  }

  // 对于 tools/call 之外的方法，不需要 Supabase
  const needsSupabase = body.method === 'tools/call';
  let supabase: ReturnType<typeof createAdminClient>['supabase'] = null;

  if (needsSupabase) {
    const adminResult = createAdminClient();
    if (!adminResult.supabase) {
      // 🔧 BUG-258 fix: 不向外部暴露 Supabase 诊断信息，仅记录到日志
      const diag = getSupabaseAdminDiagnostics();
      logger.error('[MCP Server] Supabase admin not configured:', diag);
      return NextResponse.json(
        {
          jsonrpc: '2.0',
          id: body.id ?? null,
          error: {
            code: -32603,
            message: 'Internal server error',
          },
        },
        { status: 500, headers: corsHeaders() }
      );
    }
    supabase = adminResult.supabase;
  }

  const userId = auth.userId || '';

  // 处理 JSON-RPC 请求
  const response = await handleJSONRPC(body, supabase, userId);

  // 对于 initialize 响应，添加 session ID
  const headers = corsHeaders();
  headers.set('Content-Type', 'application/json');

  if (body.method === 'initialize') {
    const sessionId = crypto.randomUUID();
    headers.set('Mcp-Session-Id', sessionId);
  }

  return NextResponse.json(response, { status: 200, headers });
}

// GET: SSE 流（可选，Letta 目前使用 POST 模式）
  // eslint-disable-next-line require-await -- async for API consistency
export async function GET(request: NextRequest) {
  const acceptHeader = request.headers.get('Accept') || '';

  if (acceptHeader.includes('text/event-stream')) {
    const auth = authenticate(request);
    if (!auth.authenticated) {
      return new NextResponse('Unauthorized', { status: 401 });
    }

     
    // 🔧 ARCH fix (Top-10 #6 — streamController: any + private field injection):
    //    旧代码: let streamController: any = null; 在 start() 里用
    //    (controller as unknown as Record<string, unknown>)._interval = interval
    //    把 timer 挂到 controller 对象上, cancel() 里再读出来。这种 "private field injection"
    //    脆弱 (运行时 controller 可能不保留这些字段) 且绕过类型系统。
    //    根因修复: 用闭包变量存 timer, cancel() 直接访问闭包。无需 any/reflection。
    let intervalId: ReturnType<typeof setInterval> | null = null;
    let cleanupTimeoutId: ReturnType<typeof setTimeout> | null = null;
    const stream = new ReadableStream({
      start(controller) {
        sendSSEEvent(controller, 'ping', {});
        intervalId = setInterval(() => {
          try {
            sendSSEEvent(controller, 'ping', {});
          } catch {
            if (intervalId) clearInterval(intervalId);
          }
        }, 30000);
        // 🔧 BUG-68 fix: Store cleanup timeout ID for cancel() callback
        cleanupTimeoutId = setTimeout(() => {
          if (intervalId) clearInterval(intervalId);
          closeSSE(controller);
        }, 300000);
      },
      cancel() {
        // 🔧 ARCH fix: 直接用闭包变量, 无需 reflection
        if (intervalId) clearInterval(intervalId);
        if (cleanupTimeoutId) clearTimeout(cleanupTimeoutId);
      },
    });

    return new NextResponse(stream, {
      headers: {
        ...SSE_HEADERS,
        ...Object.fromEntries(corsHeaders().entries()),
      },
    });
  }

  return new NextResponse('Method Not Allowed', { status: 405 });
}

// DELETE: 会话终止
// BUG-137 fix: 添加认证检查
  // eslint-disable-next-line require-await -- async for API consistency
export async function DELETE(request: NextRequest) {
  const auth = authenticate(request);
  if (!auth.authenticated) {
    return NextResponse.json(
      { jsonrpc: '2.0', id: null, error: { code: -32001, message: auth.error || 'Unauthorized' } },
      { status: 401, headers: corsHeaders() }
    );
  }
  return new NextResponse(null, { status: 200, headers: corsHeaders() });
}

// OPTIONS: CORS preflight
  // eslint-disable-next-line require-await -- async for API consistency
export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: corsHeaders(),
  });
}

// ============================================================
// CORS Headers
// ============================================================

function corsHeaders(): Headers {
  const headers = new Headers();
  // BUG-135 fix: MCP 是服务端到服务端协议（Letta → 我们的 API），
  // 不需要浏览器跨域访问。但为本地开发保留 localhost，生产环境收紧
  // 🔧 BUG-244 fix: 生产环境不再 fallback 到 '*'，避免任何域名跨域调用
  if (process.env.NODE_ENV === 'development') {
    headers.set('Access-Control-Allow-Origin', '*');
  } else {
    const allowedOrigins = process.env.MCP_ALLOWED_ORIGINS;
    if (allowedOrigins) {
      headers.set('Access-Control-Allow-Origin', allowedOrigins);
    }
    // 生产环境如果没配置 MCP_ALLOWED_ORIGINS，不设置 CORS 头（拒绝跨域）
  }
  headers.set('Access-Control-Allow-Methods', 'POST, GET, DELETE, OPTIONS');
  headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization, Mcp-Session-Id, MCP-Protocol-Version, X-MCP-Secret, Accept');
  headers.set('Access-Control-Expose-Headers', 'Mcp-Session-Id');
  return headers;
}
