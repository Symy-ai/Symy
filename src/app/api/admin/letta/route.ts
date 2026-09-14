/**
 * Admin API: Letta Agent 管理（需鉴权）
 *
 * GET  /api/admin/letta — 读取当前全局 Agent 配置
 * POST /api/admin/letta — 管理操作（handler 注册表分发）
 *
 * 鉴权：需携带 Authorization: Bearer <ADMIN_API_KEY> 或 X-Admin-Key: <ADMIN_API_KEY>
 *
 * 所有 action 的实现已拆分到 actions/ 目录，每个 action 一个文件。
 */

export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { withAdminAudit } from '@/lib/admin-audit';
import { listAllUserAgents } from '@/lib/letta-agent-admin';
import {
  buildAdminCtx,
  buildAdminCtxGet,
  lettaAPI,
  logger,
} from './actions/_shared';
import { handleUpdateSystemPrompt } from './actions/update_system_prompt';
import { handleUpdateMemoryBlock } from './actions/update_memory_block';
import { handleCreateMemoryBlock } from './actions/create_memory_block';
import { handleRecompile } from './actions/recompile';
import { handleRegisterMcpServer } from './actions/register_mcp_server';
import { handleRefreshMcpServer } from './actions/refresh_mcp_server';
import { handleAttachMcpTools } from './actions/attach_mcp_tools';
import { handleListMcpServers } from './actions/list_mcp_servers';
import { handleSyncAll } from './actions/sync_all';
import { handleListUserAgents } from './actions/list_user_agents';
import { handleUpdateAllUserPrompts } from './actions/update_all_user_prompts';
import { handleCreateUserAgent } from './actions/create_user_agent';
import { handleMigrateToPerUser } from './actions/migrate_to_per_user';
import { handleEnableSleeptime } from './actions/enable_sleeptime';
import { handleEnableSleeptimeSingle } from './actions/enable_sleeptime_single';
import { handleListModels } from './actions/list_models';
import { handleCreateTestAgent } from './actions/create_test_agent';
import { handleDeleteAgent } from './actions/delete_agent';
import { handleUpdateAgentModel } from './actions/update_agent_model';
import { handleUpdateAllUserModels } from './actions/update_all_user_models';
import { handleUpdateProviderBaseUrl } from './actions/update_provider_base_url';
import { handleTestAgentMessage } from './actions/test_agent_message';
import { handleGetAgentDetail } from './actions/get_agent_detail';
import { handleUpdateMcpServerUrl } from './actions/update_mcp_server_url';
import { handleUpdateAllAgentEndpoints } from './actions/update_all_agent_endpoints';
import { handleResetAgentMessages } from './actions/reset_agent_messages';
// 🐘 人设转型 (2026-09-05): 存量 agent 迁移 — 镜子 persona → 绿色环保小象
import { handleUpdateAgentPersona } from './actions/update_agent_persona';
// eslint-disable-next-line no-duplicate-imports
import type { AdminCtx } from './actions/_shared';

// ── Handler 注册表 ─────────────────────────────────────────────────

const POST_HANDLERS: Record<string, (ctx: AdminCtx) => Promise<NextResponse>> = {
  update_system_prompt: handleUpdateSystemPrompt,
  update_memory_block: handleUpdateMemoryBlock,
  create_memory_block: handleCreateMemoryBlock,
  recompile: handleRecompile,
  register_mcp_server: handleRegisterMcpServer,
  refresh_mcp_server: handleRefreshMcpServer,
  attach_mcp_tools: handleAttachMcpTools,
  list_mcp_servers: handleListMcpServers,
  sync_all: handleSyncAll,
  list_user_agents: handleListUserAgents,
  update_all_user_prompts: handleUpdateAllUserPrompts,
  update_mcp_server_url: handleUpdateMcpServerUrl,
  create_user_agent: handleCreateUserAgent,
  migrate_to_per_user: handleMigrateToPerUser,
  enable_sleeptime: handleEnableSleeptime,
  enable_sleeptime_single: handleEnableSleeptimeSingle,
  list_models: handleListModels,
  create_test_agent: handleCreateTestAgent,
  delete_agent: handleDeleteAgent,
  update_agent_model: handleUpdateAgentModel,
  update_all_user_models: handleUpdateAllUserModels,
  update_provider_base_url: handleUpdateProviderBaseUrl,
  test_agent_message: handleTestAgentMessage,
  get_agent_detail: handleGetAgentDetail,
  update_all_agent_endpoints: handleUpdateAllAgentEndpoints,
  reset_agent_messages: handleResetAgentMessages,
  update_agent_persona: handleUpdateAgentPersona,
};

// ── GET: 读取当前 Agent 配置 ──────────────────────────────────────

// 🔧 ARCH fix (Round 21 BUG-R21-H4 — admin batch 操作缺 maxDuration):
//    update_all_user_prompts 处理 100 用户 × 5s = 500s, Vercel 默认 60s 必超时。
export const maxDuration = 300;

export async function GET(request: NextRequest) {
  const result = buildAdminCtxGet(request);
  if ('error' in result) return result.error;

  const { client: _client } = result;

  try {
    // 🔧 ADMIN-6 fix: client.agents.list() SDK 调用返回空（可能 SDK 版本/参数问题），
    //    改用 listAllUserAgents() 从 profiles 表查 letta_agent_id（可靠数据源）。
    //    再用 SDK 补充每个 agent 的 model 信息（best-effort，失败不影响列表）。
    const userAgents = await listAllUserAgents();

    // 并行查每个 agent 的详情（model），失败则用 'unknown'
    // 用 lettaAPI（REST）而非 SDK getById，更可靠（与 get_agent_detail action 一致）
    const agents = await Promise.all(
      userAgents.slice(0, 50).map(async (ua) => {
        let model = 'unknown';
        try {
          const resp = await lettaAPI(`/agents/${ua.agentId}`);
          if (resp.ok) {
            const detail = await resp.json();
            const llmConfig = (detail as Record<string, unknown>)?.llm_config as Record<string, unknown> | undefined;
            if (llmConfig?.model) model = String(llmConfig.model);
          }
        } catch (modelErr) {
          // 🔧 2026-07-15: Log error instead of silent catch — could be Letta API outage
          logger.warn('[Admin Letta] Failed to fetch agent model:', modelErr instanceof Error ? modelErr.message : String(modelErr));
        }
        return {
          id: ua.agentId,
          name: ua.agentName || `symy-user-${ua.userId}`,
          model,
          user_id: ua.userId,
        };
      }),
    );

    // 通过 REST API 获取 MCP servers
    let mcpServers: unknown[] = [];
    try {
      const serversResponse = await lettaAPI('/mcp-servers/');
      if (serversResponse.ok) {
        const serversData = await serversResponse.json();
        mcpServers = Array.isArray(serversData) ? serversData : [];
      }
    } catch (mcpErr) {
      // safe to ignore: non-critical error, logged for observability
      // 🔧 2026-07-15: Log error — could be Letta API outage, not just "no servers"
      logger.warn('[Admin Letta] Failed to fetch MCP servers:', mcpErr instanceof Error ? mcpErr.message : String(mcpErr));
    }

    return NextResponse.json({
      agents,
      agentCount: agents.length,
      mcpServers: mcpServers.map((s: unknown) => {
        const server = s as Record<string, unknown>;
        return {
          id: server.id,
          name: server.name,
          server_url: server.server_url || 'N/A',
          server_type: server.mcp_server_type || 'N/A',
        };
      }),
    });
  } catch (err) {
    // 🔧 BUG-268 fix: 不向客户端暴露内部错误详情，仅记录到日志
    const error = err instanceof Error ? err.message : String(err);
    logger.error('[Admin Letta GET] Error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// ── POST: 管理操作 — handler 注册表分发 ───────────────────────────

export async function POST(request: NextRequest) {
  const result = await buildAdminCtx(request);
  if ('error' in result) return result.error;

  const { ctx, authResult } = result;

  // 🔧 ARCH fix (Round 14 BUG-14 + ADV-R14-1 + Round 15 ADV-R14-5): 接入 withAdminAudit 审计日志
  //    传 ctx.action 作为 actionOverride (letta 的 action 在 body 而非 query string)
  //    Round 15: dynamic import → 静态 import (零循环依赖, 已验证)
  return withAdminAudit(request, authResult, async () => {
    try {
      const handler = POST_HANDLERS[ctx.action];
      if (!handler) {
        return NextResponse.json(
          { error: `Unknown action: ${ctx.action}. Available: ${Object.keys(POST_HANDLERS).join(', ')}` },
          { status: 400 },
        );
      }
      return await handler(ctx);
      // safe to ignore: non-critical background operation, error already logged
    } catch (err) {
                    // safe to ignore: non-critical background operation, error already logged
      // BUG-127 fix: 不向客户端暴露内部错误详情
      logger.error('[Admin API] Unhandled error:', err);
      return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
  }, ctx.action); // 🔧 ADV-R14-1: actionOverride
}
