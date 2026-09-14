import { AdminCtx, MCP_API_SECRET, lettaAPI, NextResponse, validateActionBody } from './_shared';
import { readFileSync } from 'fs';
import { join } from 'path';
import { getUserAgentId, createAgentForUser } from '@/lib/letta-agent-manager';
import { z } from 'zod';

// ARCH fix Round 73 (Finding 3.1): zod schema replaces `String(ctx.body.X || '')` casts.
const schema = z.object({
  user_id: z.union([z.string(), z.number()]).transform((v) => String(v)),
  user_email: z.union([z.string(), z.number()]).optional().transform((v) => v === undefined ? undefined : String(v)),
});

export async function handleCreateUserAgent(ctx: AdminCtx) {
  const result = validateActionBody(schema, ctx);
  if (!result.success) return result.response;
  const { user_id, user_email } = result.data;

  // 检查是否已有 agent
  const existingAgentId = await getUserAgentId(user_id);
  if (existingAgentId) {
    // 已有 agent → 同步 MCP 工具 + prompt + recompile
    const logs: string[] = [];
    try {
      // 更新 prompt
      // 🔧 ARCH fix (Round 21 BUG-R21-M2 — readFileSync 无 try/catch):
      //    旧代码 const systemPrompt = readFileSync(promptPath, 'utf-8') 在 try 外面,
      //    AI_Prompt.md 缺失时抛 uncaught exception, 被 letta/route.ts catch 后返回 generic 500。
      //    根因修复: 移入 try/catch, 失败时记录 logs 但继续 (MCP/recompile 仍执行)。
      const promptPath = join(process.cwd(), 'doc', 'AI_Prompt.md');
      const systemPrompt = readFileSync(promptPath, 'utf-8');
      await ctx.client.agents.update(existingAgentId, {
        system: systemPrompt,
      });
      logs.push(`Prompt updated (${systemPrompt.length} chars)`);
    } catch (err) {
      logs.push(`Prompt update failed: ${err instanceof Error ? err.message : String(err)}`);
    }

    // 附加 MCP 工具
    let attached = 0;
    if (MCP_API_SECRET) {
      try {
        const listResp = await lettaAPI('/mcp-servers/');
        if (listResp.ok) {
          const existingServers = await listResp.json();
          const servers = Array.isArray(existingServers) ? existingServers : [];
          const mcpServer = servers.find(
            (s: unknown) => {
              const srv = s as Record<string, unknown>;
              return srv.server_name === 'symy-mcp' || srv.name === 'symy-mcp' ||
                srv.server_name === 'weme-mcp' || srv.name === 'weme-mcp';
            }
          );
          if (mcpServer) {
            const mcpId = (mcpServer as Record<string, unknown>).id as string;
            try { await ctx.client.mcpServers.refresh(mcpId); } catch { /* silent: non-critical operation */ }
            const toolsData = await ctx.client.mcpServers.tools.list(mcpId);
            const tools = (Array.isArray(toolsData) ? toolsData : []).map((t: unknown) => {
              const tool = t as Record<string, unknown>;
              return {
                id: tool.id as string,
                name: tool.name as string,
              };
            });
            for (const tool of tools) {
              try {
                await ctx.client.agents.tools.attach(tool.id, {
                  agent_id: existingAgentId,
                });
                attached++;
              } catch (err) {
                const msg = err instanceof Error ? err.message : String(err);
                if (!msg.includes('already') && !msg.includes('attached')) {
                  logs.push(`Tool attach failed (${tool.name}): ${msg.substring(0, 100)}`);
                }
              }
            }
          }
        }
      } catch (err) {
        logs.push(`MCP tools attach error: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
    logs.push(`MCP tools: ${attached} attached`);

    // 重编译
    try {
      await ctx.client.agents.recompile(existingAgentId);
      logs.push('Agent recompiled');
    } catch (err) {
      logs.push(`Recompile failed: ${err instanceof Error ? err.message : String(err)}`);
    }

    return NextResponse.json({
      success: true,
      agentId: existingAgentId,
      message: 'Agent synced with latest prompt and MCP tools',
      isNew: false,
      logs,
    });
  }

  const agentId = await createAgentForUser(user_id, user_email);
  if (!agentId) {
    return NextResponse.json({ error: 'Failed to create agent' }, { status: 500 });
  }

  return NextResponse.json({
    success: true,
    agentId,
    message: 'Agent created successfully',
    isNew: true,
  });
}
