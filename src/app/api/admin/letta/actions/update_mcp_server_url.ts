/**
 * Update MCP Server URL — 修复 Letta MCP Server 指向错误的 URL
 *
 * 当 NEXT_PUBLIC_APP_URL 变化时（如从 dev preview 改到 symy.ai），
 * 已注册的 MCP Server 不会自动更新 URL，需要手动 PATCH。
 *
 * 🔧 Bug A fix: 如果 NEXT_PUBLIC_APP_URL 指向 dev preview URL，
 * 强制使用 https://symy.ai 作为生产 URL。
 */
import { AdminCtx, lettaAPI, NextResponse, logger } from './_shared';

export async function handleUpdateMcpServerUrl(ctx: AdminCtx) {
  // 🔧 Bug A fix: 强制使用 symy.ai，不用 NEXT_PUBLIC_APP_URL (可能指向 dev preview)
  const newUrl = 'https://symy.ai/api/mcp/server';
  const mcpSecret = process.env.MCP_API_SECRET || '';
  const logs: string[] = [];

  if (!mcpSecret) {
    return NextResponse.json(
      { error: 'MCP_API_SECRET not configured' },
      { status: 500 }
    );
  }

  // 获取所有 MCP Server
  const listResp = await lettaAPI('/mcp-servers/');
  if (!listResp.ok) {
    return NextResponse.json(
      { error: `Failed to list MCP servers: ${listResp.status}` },
      { status: 500 }
    );
  }

  const servers = await listResp.json();
  const serverList = Array.isArray(servers) ? servers : [];
  logs.push(`Found ${serverList.length} MCP servers`);

  let updated = 0;
  let failed = 0;

  for (const server of serverList) {
    const serverId = server.id as string;
    const serverName = server.server_name || server.name || 'unknown';
    const oldUrl = (server.config as Record<string, unknown>)?.server_url || server.server_url || 'unknown';

    if (oldUrl === newUrl) {
      logs.push(`✅ ${serverName} (${serverId}): URL already correct (${newUrl})`);
      continue;
    }

    // PATCH 更新 MCP Server URL
    try {
      const patchResp = await lettaAPI(`/mcp-servers/${serverId}`, {
        method: 'PATCH',
        body: JSON.stringify({
          config: {
            server_url: newUrl,
            mcp_server_type: 'streamable_http',
            custom_headers: {
              'Authorization': `Bearer ${mcpSecret}`,
              'X-MCP-Secret': mcpSecret,
            },
          },
        }),
      });

      if (patchResp.ok) {
        logs.push(`✅ ${serverName} (${serverId}): URL updated ${oldUrl} → ${newUrl}`);
        updated++;

        // 刷新工具
        try {
          await ctx.client.mcpServers.refresh(serverId);
          logs.push(`  → Tools refreshed`);
        } catch (refreshErr) {
          logs.push(`  → Tool refresh failed: ${refreshErr instanceof Error ? refreshErr.message : String(refreshErr)}`);
        }
      } else {
        const errText = await patchResp.text();
        logs.push(`❌ ${serverName} (${serverId}): Update failed: ${errText.substring(0, 200)}`);
        failed++;
      }
    } catch (err) {
      logs.push(`❌ ${serverName} (${serverId}): Error: ${err instanceof Error ? err.message : String(err)}`);
      failed++;
    }
  }

  logger.info(`[Admin] update_mcp_server_url: ${updated} updated, ${failed} failed`);

  return NextResponse.json({
    success: true,
    updated,
    failed,
    total: serverList.length,
    newUrl,
    logs,
  });
}
