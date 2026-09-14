import { AdminCtx, MCP_API_SECRET, getMcpServerUrl, lettaAPI, NextResponse, validateActionBody } from './_shared';
import { z } from 'zod';

// ARCH fix Round 73 (Finding 3.1): zod schema replaces `ctx.body.server_name || 'symy-mcp'`.
const schema = z.object({
  server_name: z.string().default('symy-mcp'),
});

// 🔧 ARCH fix: 不再使用全局 LETTA_AGENT_ID, MCP server 是全局的 (不需要 agent_id)
//    旧代码用 LETTA_AGENT_ID 刷新工具到全局 agent, 现在 MCP server 是独立的,
//    工具挂载由 sync_all / update_all_user_prompts 逐 agent 处理
export async function handleRegisterMcpServer(ctx: AdminCtx) {
  if (!MCP_API_SECRET) {
    return NextResponse.json(
      { error: 'MCP_API_SECRET not configured. Required for MCP server authentication.' },
      { status: 400 }
    );
  }

  const result = validateActionBody(schema, ctx);
  if (!result.success) return result.response;
  const serverName = result.data.server_name;

  const mcpEndpoint = `${getMcpServerUrl()}/api/mcp/server`;

  // T5 fix (2026-09-04): symy-hands is the shopping hands service on its own tunnel,
  // not the brain-side endpoint. Register it with its own secret.
  if (serverName === 'symy-hands') {
    const handsUrl = process.env.SYMY_HANDS_URL || 'https://hands.symy.ai/mcp/';
    const handsSecret = process.env.SYMY_HANDS_SECRET || '';
    if (!handsSecret) {
      return NextResponse.json(
        { error: 'SYMY_HANDS_SECRET not configured' },
        { status: 500 }
      );
    }
    const listResp2 = await lettaAPI('/mcp-servers/');
    if (listResp2.ok) {
      const servers2 = await listResp2.json();
      const arr2 = Array.isArray(servers2) ? servers2 : [];
      const existingHands = arr2.find((s: unknown) => (s as Record<string, unknown>).server_name === 'symy-hands');
      if (existingHands) {
        return NextResponse.json({
          success: true,
          message: 'MCP server "symy-hands" already exists.',
          server: { id: existingHands.id, name: 'symy-hands', url: handsUrl },
        });
      }
    }
    const resp2 = await lettaAPI('/mcp-servers/', {
      method: 'POST',
      body: JSON.stringify({
        config: {
          server_url: handsUrl,
          mcp_server_type: 'streamable_http',
          custom_headers: {
            'Authorization': `Bearer ${handsSecret}`,
            'X-MCP-Secret': handsSecret,
          },
        },
        server_name: 'symy-hands',
      }),
    });
    if (!resp2.ok) {
      const t = await resp2.text();
      return NextResponse.json({ error: `Failed to register symy-hands: ${t.substring(0, 200)}` }, { status: 500 });
    }
    const d2 = await resp2.json();
    return NextResponse.json({ success: true, message: 'Registered symy-hands.', server: { id: d2.id, name: 'symy-hands', url: handsUrl } });
  }

  // 检查是否已有同名 MCP Server
  const listResponse = await lettaAPI('/mcp-servers/');
  if (listResponse.ok) {
    const existingServers = await listResponse.json();
    const servers = Array.isArray(existingServers) ? existingServers : [];
    const existing = servers.find((s: unknown) => {
      const srv = s as Record<string, unknown>;
      return srv.server_name === serverName;
    });
    if (existing) {
      const existingId = existing.id as string;
      return NextResponse.json({
        success: true,
        message: `MCP server "${serverName}" already exists (id: ${existingId}).`,
        server: { id: existingId, name: serverName, url: mcpEndpoint },
      });
    }
  }

  // 注册新的 MCP Server
  const response = await lettaAPI('/mcp-servers/', {
    method: 'POST',
    body: JSON.stringify({
      config: {
        server_url: mcpEndpoint,
        mcp_server_type: 'streamable_http',
        custom_headers: {
          'Authorization': `Bearer ${MCP_API_SECRET}`,
          'X-MCP-Secret': MCP_API_SECRET,
        },
      },
      server_name: serverName,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    return NextResponse.json(
      { error: `Failed to register MCP server: ${errorText.substring(0, 200)}` },
      { status: 500 }
    );
  }

  const serverData = await response.json();
  const serverId = serverData.id;

  return NextResponse.json({
    success: true,
    message: `MCP server "${serverName}" registered at ${mcpEndpoint}`,
    server: { id: serverId, name: serverData.name || serverName, url: mcpEndpoint },
  });
}
