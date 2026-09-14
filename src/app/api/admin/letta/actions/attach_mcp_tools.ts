import { AdminCtx, lettaAPI, NextResponse, validateActionBody, logger } from './_shared';
import { z } from 'zod';

// ARCH fix Round 73 (Finding 3.1): zod schema replaces `String(ctx.body.X || '')` casts.
const schema = z.object({
  server_id: z.union([z.string(), z.number()]).transform((v) => String(v)),
  agent_id: z.union([z.string(), z.number()]).transform((v) => String(v)),
});

// 🔧 ARCH fix: 不再使用全局 LETTA_AGENT_ID, 从 body 获取 agent_id
export async function handleAttachMcpTools(ctx: AdminCtx) {
  const result = validateActionBody(schema, ctx);
  if (!result.success) return result.response;
  const { server_id: serverId, agent_id: agentId } = result.data;

  // 先刷新
  try {
    await ctx.client.mcpServers.refresh(serverId);
  } catch (refreshErr) {
    // safe to ignore: non-critical error, logged for observability
    // 🔧 2026-07-15: Log error — admin needs to know refresh failed
    logger.warn('[Admin Letta] MCP refresh failed (continuing to list):', refreshErr instanceof Error ? refreshErr.message : String(refreshErr));
  }

  // 获取工具列表
  let tools: unknown[] = [];
  try {
    const toolsData = await ctx.client.mcpServers.tools.list(serverId);
    tools = Array.isArray(toolsData) ? toolsData : [];
  } catch {
    const toolsResponse = await lettaAPI(`/mcp-servers/${serverId}/tools`);
    if (toolsResponse.ok) {
      const toolsData = await toolsResponse.json();
      tools = Array.isArray(toolsData) ? toolsData : [];
    } else {
      return NextResponse.json(
        { error: `Failed to get tools: ${await toolsResponse.text()}` },
        { status: 500 }
      );
    }
  }

  const attachedTools: string[] = [];
  const failedTools: string[] = [];

  for (const tool of tools) {
    const t = tool as Record<string, unknown>;
    try {
      await ctx.client.agents.tools.attach(t.id as string, {
        agent_id: agentId,
      });
      attachedTools.push(t.name as string);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('already') || msg.includes('attached')) {
        attachedTools.push(t.name as string + ' (already)');
      } else {
        failedTools.push(`${t.name}: ${msg}`);
      }
    }
  }

  return NextResponse.json({
    success: true,
    message: `Attached ${attachedTools.length}/${tools.length} MCP tools to agent ${agentId}`,
    attachedTools,
    failedTools,
  });
}
