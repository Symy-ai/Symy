import { AdminCtx, MCP_API_SECRET, lettaAPI, NextResponse, logger } from './_shared';
import { readFileSync } from 'fs';
import { join } from 'path';
import { createAdminClient } from '@/lib/supabase-admin';

export async function handleUpdateAllUserPrompts(ctx: AdminCtx) {
  const { supabase: adminSupabase } = createAdminClient();
  const promptPath = join(process.cwd(), 'doc', 'AI_Prompt.md');

  // 🔧 ARCH fix (Round 12 M8): 旧代码 readFileSync 无 try/catch → 文件缺失时 uncaught 500
  let systemPrompt: string;
  try {
    systemPrompt = readFileSync(promptPath, 'utf-8');
      // safe to ignore: non-critical background operation, error already logged
  } catch {
            // safe to ignore: non-critical background operation, error already logged
    logger.error('[Admin] Failed to read AI_Prompt.md at:', promptPath);
    return NextResponse.json(
      { error: 'System prompt file not found. Check deployment.' },
      { status: 500 }
    );
  }

  // 获取 MCP server 和工具
  let mcpTools: Array<{ id: string; name: string }> = [];
  if (MCP_API_SECRET) {
    try {
      // 找到 MCP server
      const listResp = await lettaAPI('/mcp-servers/');
      if (listResp.ok) {
        const existingServers = await listResp.json();
        const servers = Array.isArray(existingServers) ? existingServers : [];
        const existing = servers.find(
          (s: unknown) => {
            const srv = s as Record<string, unknown>;
            return srv.server_name === 'symy-mcp' || srv.name === 'symy-mcp' ||
              srv.server_name === 'weme-mcp' || srv.name === 'weme-mcp';
          }
        );
        if (existing) {
          // 刷新工具列表
          const mcpId = (existing as Record<string, unknown>).id as string;
          try { await ctx.client.mcpServers.refresh(mcpId); } catch { /* silent: non-critical operation */ }
          const toolsData = await ctx.client.mcpServers.tools.list(mcpId);
          mcpTools = (Array.isArray(toolsData) ? toolsData : []).map((t: unknown) => {
            const tool = t as Record<string, unknown>;
            return {
              id: tool.id as string,
              name: tool.name as string,
            };
          });
        }
      }
      // safe to ignore: non-critical background operation, error already logged
    } catch (err) {
                    // safe to ignore: non-critical background operation, error already logged
      logger.warn('[Admin] MCP server/tools lookup failed:', err);
    }
  }

  // 查找所有有 agent 的用户
  const usersWithAgents = adminSupabase
    ? (await adminSupabase.from('profiles').select('id, letta_agent_id').not('letta_agent_id', 'is', null)).data || []
    : [];

  let updated = 0;
  let failed = 0;
  let recompileFailedCount = 0;  // 🔧 Round 12 M9: 跟踪 recompile 失败
  const total = usersWithAgents.length;

  for (const profile of usersWithAgents as Array<{ id: string; letta_agent_id: string }>) {
    try {
      // 1. 更新 system prompt
      await ctx.client.agents.update(profile.letta_agent_id, {
        system: systemPrompt,
      });

      // 2. 附加 MCP 工具
      let attached = 0;
      for (const tool of mcpTools) {
        try {
          await ctx.client.agents.tools.attach(tool.id, {
            agent_id: profile.letta_agent_id,
          });
          attached++;
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          if (!msg.includes('already') && !msg.includes('attached')) {
            logger.warn(`[Admin] Failed to attach tool ${tool.name} to agent ${profile.letta_agent_id}: ${msg}`);
          }
        }
      }

      // 3. 重编译
      // 🔧 ARCH fix (Round 12 M9): 旧代码 silent catch → recompile 失败不可见, agent 用旧 prompt
      let recompileFailed = false;
      try {
        await ctx.client.agents.recompile(profile.letta_agent_id);
      } catch (recompileErr) {
        recompileFailed = true;
        logger.warn(`[Admin] Recompile failed for agent ${profile.letta_agent_id}:`, recompileErr instanceof Error ? recompileErr.message : String(recompileErr));
      }

      logger.info(`[Admin] Agent ${profile.letta_agent_id}: prompt updated, ${attached} tools attached${recompileFailed ? ' (recompile FAILED)' : ''}`);
      updated++;
      if (recompileFailed) recompileFailedCount++;
    } catch (err) {
      logger.error(`[Admin] Failed to update agent ${profile.letta_agent_id}:`, err);
      failed++;
    }
  }

  return NextResponse.json({
    success: true,
    updated,
    failed,
    total,
    mcpToolsAvailable: mcpTools.length,
    recompileFailed: recompileFailedCount,  // 🔧 Round 12 M9
  });
}
