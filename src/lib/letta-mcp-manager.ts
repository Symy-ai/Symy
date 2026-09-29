/* eslint-disable symy/no-warn-only-catch -- individual catch blocks reviewed per error-policy.md */
import 'server-only'; // 🔧 ARCH fix Round 73: server-only — prevents client bundle leak
/**
 * Letta MCP Server Manager — MCP server + tools management
 *
 * 🔧 ARCH fix (Round 47): 提取自 letta-agent-manager.ts (879行)
 *    包含: getOrCreateSharedMCPServer, getMCPTools
 *    这些是纯 Letta API 调用, 不依赖 Supabase 或用户认证。
 *
 * 🔧 架构批1 F1 (09-29): lettaAPI / LettaAPIError / getLettaClient 唯一实现已收敛到
 *    src/lib/letta-http.ts (消 15s/30s 双实现 + client 单例化)。本文件保留 re-export,
 *    既有 `from '@/lib/letta-mcp-manager'` 调用方 (letta-blocks / letta-agent-pool /
 *    letta-agent-manager / letta-facts-sync / admin actions / 相关测试) 零改动。
 */

import { logger } from '@/lib/logger';
import { warnMissingEnvOnce } from '@/lib/env-consumers';
import { lettaAPI, LettaAPIError, getLettaClient } from '@/lib/letta-http';

// Re-export — 共享层实现见 letta-http.ts (兼容层, 见顶部注释)
export { lettaAPI, LettaAPIError, getLettaClient };

// ============================================================
// Environment
// ============================================================

const MCP_API_SECRET = process.env.MCP_API_SECRET || '';
// 🔧 Round 133 fix: MCP_SERVER_URL 优先级:
//   1. NEXT_PUBLIC_APP_URL (用户配置)
//   2. VERCEL_URL (Vercel 自动注入, 格式: project-xxx.vercel.app)
//   3. 'https://symy.ai' (fallback)
const VERCEL_URL = process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : '';
const MCP_SERVER_URL = process.env.NEXT_PUBLIC_APP_URL || VERCEL_URL;

function getMcpServerUrl(): string {
  if (!MCP_SERVER_URL) {
    warnMissingEnvOnce('Letta MCP URL');
    throw new Error('NEXT_PUBLIC_APP_URL or VERCEL_URL is required. Set one in .env or Vercel environment variables.');
  }
  return MCP_SERVER_URL;
}
/**
 * 获取或创建共享 MCP Server
 * 所有用户 Agent 共用同一个 MCP Server 端点（/api/mcp/server）
 */
export async function getOrCreateSharedMCPServer(): Promise<string | null> {
  const serverName = 'symy-mcp';

  try {
    // 1. 检查是否已存在 (每次都查, 不用 cache)
    const listResp = await lettaAPI('/mcp-servers/');
    if (listResp.ok) {
      const existingServers = await listResp.json();
      const servers = Array.isArray(existingServers) ? existingServers : [];
      const existing = servers.find(
        (s: Record<string, unknown>) =>
          s.server_name === serverName || s.name === serverName
      ) || servers.find(
        (s: Record<string, unknown>) =>
          s.server_name === 'weme-mcp' || s.name === 'weme-mcp'
      );
      if (existing) {
        const foundId = existing.id as string;
        logger.info(`[Letta MCP] Found existing MCP server: ${foundId}`);
        return foundId;
      }
    }

    // 2. 不存在则创建
    if (!MCP_API_SECRET) {
      logger.warn('[Letta MCP] MCP_API_SECRET not set, cannot create MCP server');
      return null;
    }

    const mcpEndpoint = `${getMcpServerUrl()}/api/mcp/server`;
    const mcpBearerToken = MCP_API_SECRET;
    const response = await lettaAPI('/mcp-servers/', {
      method: 'POST',
      body: JSON.stringify({
        config: {
          server_url: mcpEndpoint,
          mcp_server_type: 'streamable_http',
          custom_headers: {
            'Authorization': `Bearer ${mcpBearerToken}`,
            'X-MCP-Secret': MCP_API_SECRET,
          },
        },
        server_name: serverName,
      }),
    });

    if (response.ok) {
      const serverData = await response.json();
      const createdId = serverData.id;
      logger.info(`[Letta MCP] Created MCP server: ${createdId}`);
      return createdId;
    } else {
      const errorText = await response.text();
      logger.error(`[Letta MCP] Failed to create MCP server: ${errorText.substring(0, 200)}`);
      return null;
    }
      // safe to ignore: non-critical background operation, error already logged
  } catch (err) {
                  // safe to ignore: non-critical background operation, error already logged
    logger.error('[Letta MCP] MCP server creation error:', err);
    return null;
  }
}

/**
 * 获取 MCP Server 的工具列表
 *
 * 🔧 2026-07-15 (deep audit #5): Changed from silent [] return to throwing on
 *    final exhaustion. Old code caught ALL errors and returned [], which masked
 *    real failures (MCP server misconfigured, Letta API down). Callers treated
 *    [] as "MCP server has no tools" instead of "check failed" → agents created
 *    with 0 tools → users get chat but no token rewards (silent feature loss).
 *    Fix: throw on exhaustion, let caller decide. 404 (server deleted) returns [].
 */
export async function getMCPTools(serverId: string): Promise<Array<{ id: string; name: string }>> {
  let lastError: Error | null = null;

  // 1. 先直接 list (不 refresh) — 拿缓存的工具
  try {
    const resp = await lettaAPI(`/mcp-servers/${serverId}/tools`);
    if (resp.ok) {
      const toolsData = await resp.json();
      const tools = Array.isArray(toolsData) ? toolsData : [];
      if (tools.length > 0) {
        logger.info(`[Letta MCP] Got ${tools.length} tools from cache (no refresh needed)`);
        return tools.map((t: Record<string, unknown>) => ({
          id: t.id as string,
          name: t.name as string,
        }));
      }
    } else if (resp.status === 404) {
      // MCP server deleted in Letta — return empty (legitimate, not an error)
      logger.info(`[Letta MCP] Server ${serverId} not found (404) — returning empty tools`);
      return [];
    }
  } catch (listErr) {
    lastError = listErr instanceof Error ? listErr : new Error(String(listErr));
    logger.warn('[Letta MCP] REST API tools list failed, trying SDK:', lastError.message);
  }

  // 2. 缓存为空 — 尝试 refresh + list
  const client = getLettaClient();
  try {
    await client.mcpServers.refresh(serverId);
  } catch (refreshErr) {
    // Refresh failure is expected if MCP server URL is unreachable
    // Continue to list (may have cached tools from a previous refresh)
    logger.warn('[Letta MCP] MCP refresh failed (continuing to list):', refreshErr instanceof Error ? refreshErr.message : String(refreshErr));
  }

  try {
    const toolsData = await client.mcpServers.tools.list(serverId);
    const tools = Array.isArray(toolsData) ? toolsData : [];
    logger.info(`[Letta MCP] Got ${tools.length} tools from SDK after refresh`);
    return tools.map((t: unknown) => {
      const tool = t as Record<string, unknown>;
      return {
        id: tool.id as string,
        name: tool.name as string,
      };
    });
  } catch (listErr) {
    lastError = listErr instanceof Error ? listErr : new Error(String(listErr));
    logger.warn('[Letta MCP] SDK tools.list failed, trying REST API:', lastError.message);
    try {
      const resp = await lettaAPI(`/mcp-servers/${serverId}/tools`);
      if (resp.ok) {
        const toolsData = await resp.json();
        const tools = Array.isArray(toolsData) ? toolsData : [];
        return tools.map((t: Record<string, unknown>) => ({
          id: t.id as string,
          name: t.name as string,
        }));
      }
    } catch (restErr) {
      lastError = restErr instanceof Error ? restErr : new Error(String(restErr));
      logger.error('[Letta MCP] All tool listing paths failed:', lastError.message);
    }
  }

  // 🔧 2026-07-15: All paths exhausted — THROW instead of returning []
  //    Caller (letta-agent-manager/pool) will catch and decide what to do
  //    (skip saving agent, raise ops alert, etc.)
  throw new Error(`Failed to get MCP tools for server ${serverId}: ${lastError?.message || 'all paths exhausted'}`);
}
