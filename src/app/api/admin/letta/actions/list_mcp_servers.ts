import { AdminCtx, lettaAPI, NextResponse } from './_shared';

export async function handleListMcpServers( _ctx: AdminCtx) {
  const response = await lettaAPI('/mcp-servers/');

  if (!response.ok) {
    return NextResponse.json(
      { error: `Failed to list MCP servers: ${await response.text()}` },
      { status: 500 }
    );
  }

  const servers = await response.json();
  const serverList = Array.isArray(servers) ? servers : [servers];

  // 🔧 2026-07-15 (ARCH-8 #17 修复): 不返回 custom_headers 给客户端 (可能含敏感凭据)
  //    旧代码: 直接返回 Letta API 原始响应, 包含 custom_headers (可能含 Authorization Bearer token)
  //    修复: 剥离 custom_headers 字段, 只返回元数据
  const sanitizedServers = serverList.map((server: Record<string, unknown>) => {
    const { custom_headers, ...rest } = server;
    return {
      ...rest,
      has_custom_headers: Boolean(custom_headers && Object.keys(custom_headers as Record<string, unknown>).length > 0),
    };
  });

  return NextResponse.json({
    success: true,
    servers: sanitizedServers,
  });
}
