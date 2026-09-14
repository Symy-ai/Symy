import { AdminCtx, NextResponse, validateActionBody } from './_shared';
import { z } from 'zod';

// ARCH fix Round 73 (Finding 3.1): zod schema replaces `String(ctx.body.server_id || '')` cast.
const schema = z.object({
  server_id: z.union([z.string(), z.number()]).transform((v) => String(v)),
});

// 🔧 ARCH fix: 不再使用全局 LETTA_AGENT_ID, 从 body 获取 agent_id (可选)
export async function handleRefreshMcpServer(ctx: AdminCtx) {
  const result = validateActionBody(schema, ctx);
  if (!result.success) return result.response;
  const serverId = result.data.server_id;

  try {
    // 🔧 ARCH fix: 不传 agent_id — MCP server 是全局的, 不绑定特定 agent
    //    工具挂载由 sync_all / update_all_user_prompts 逐 agent 处理
    const refreshData = await ctx.client.mcpServers.refresh(serverId);
    return NextResponse.json({ success: true, result: refreshData });
      // safe to ignore: non-critical background operation, error already logged
  } catch (err) {
                  // safe to ignore: non-critical background operation, error already logged
    return NextResponse.json(
      { error: `Refresh failed: ${err instanceof Error ? err.message : String(err)}` },
      { status: 500 }
    );
  }
}
