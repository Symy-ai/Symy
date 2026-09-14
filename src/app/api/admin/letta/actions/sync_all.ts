import { AdminCtx, MCP_API_SECRET, lettaAPI, NextResponse, logger } from './_shared';
import { readFileSync } from 'fs';
import { join } from 'path';
import { createAdminClient } from '@/lib/supabase-admin';

export async function handleSyncAll(ctx: AdminCtx) {
  const logs: string[] = [];

  // 🔧 ARCH fix: sync_all 改为遍历所有 per-user agents (不再操作全局 agent)
  //    旧代码: 用 LETTA_AGENT_ID 操作单个全局 agent
  //    现在: 查 profiles 表获取所有 per-user agent_id, 逐个更新

  // 1. 读取 system prompt
  const promptPath = join(process.cwd(), 'doc', 'AI_Prompt.md');
  let systemPrompt: string;
  try {
    systemPrompt = readFileSync(promptPath, 'utf-8');
    logs.push(`System prompt loaded (${systemPrompt.length} chars)`);
      // safe to ignore: non-critical background operation, error already logged
  } catch {
            // safe to ignore: non-critical background operation, error already logged
    logger.error('[Admin] Failed to read AI_Prompt.md at:', promptPath);
    return NextResponse.json({ error: 'System prompt file not found.' }, { status: 500 });
  }

  // 2. 获取 MCP server 和工具
  let mcpServerId = '';
  let mcpTools: Array<{ id: string; name: string }> = [];
  if (MCP_API_SECRET) {
    try {
      const listResp = await lettaAPI('/mcp-servers/');
      if (listResp.ok) {
        const servers = await listResp.json();
        const existing = (Array.isArray(servers) ? servers : []).find((s: unknown) => {
          const srv = s as Record<string, unknown>;
          return srv.server_name === 'symy-mcp' || srv.server_name === 'weme-mcp';
        });
        if (existing) {
          mcpServerId = (existing as Record<string, unknown>).id as string;
          logs.push(`MCP server found (id: ${mcpServerId})`);
          // 刷新工具
          // 🔧 ARCH fix (Round 5 AUDIT-1 M-3): 旧代码 silent catch → refresh 失败后 AI 用旧 MCP 工具
          //    根因修复: 记录 warning, admin 可在日志中看到 refresh 失败
          try {
            await ctx.client.mcpServers.refresh(mcpServerId);
      // safe to ignore: non-critical background operation, error already logged
          } catch (refreshErr) {
                                 // safe to ignore: non-critical background operation, error already logged
            logger.warn(`[sync_all] MCP refresh failed for server ${mcpServerId}:`, refreshErr instanceof Error ? refreshErr.message : String(refreshErr));
          }
          const toolsData = await ctx.client.mcpServers.tools.list(mcpServerId);
          mcpTools = (Array.isArray(toolsData) ? toolsData : []).map((t: unknown) => {
            const tool = t as Record<string, unknown>;
            return { id: tool.id as string, name: tool.name as string };
          });
          logs.push(`MCP tools: ${mcpTools.length} available`);
        }
      }
    } catch (err) {
      logs.push(`MCP server error: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  // 3. 遍历所有 per-user agents
  const { supabase: adminSupabase } = createAdminClient();
  if (!adminSupabase) {
    return NextResponse.json({ error: 'Admin client unavailable' }, { status: 500 });
  }

  const { data: profiles } = await adminSupabase
    .from('profiles')
    .select('id, letta_agent_id')
    .not('letta_agent_id', 'is', null);

  const usersWithAgents = (profiles || []) as Array<{ id: string; letta_agent_id: string }>;
  let updated = 0;
  let failed = 0;

  for (const profile of usersWithAgents) {
    const agentId = profile.letta_agent_id;
    try {
      // 更新 system prompt
      await ctx.client.agents.update(agentId, { system: systemPrompt });

      // 附加 MCP 工具
      for (const tool of mcpTools) {
        try {
          await ctx.client.agents.tools.attach(tool.id, { agent_id: agentId });
        } catch (attachErr) {
          const msg = attachErr instanceof Error ? attachErr.message : String(attachErr);
          if (!msg.includes('already') && !msg.includes('attached')) {
            logger.warn(`[sync_all] Tool attach failed: ${tool.name} → ${agentId}: ${msg}`);
          }
        }
      }

      // 重编译
      try {
        await ctx.client.agents.recompile(agentId);
      // safe to ignore: non-critical background operation, error already logged
      } catch (recompileErr) {
                               // safe to ignore: non-critical background operation, error already logged
        logger.warn(`[sync_all] Recompile failed for ${agentId}:`, recompileErr instanceof Error ? recompileErr.message : String(recompileErr));
      }

      updated++;
    } catch (err) {
      logger.error(`[sync_all] Failed for agent ${agentId}:`, err);
      failed++;
    }
  }

  logs.push(`Updated ${updated}/${usersWithAgents.length} agents (${failed} failed)`);

  // 🔧 2026-07-15 (ARCH-5 #11 修复): success 基于 failed count (与 update_all_user_models 一致)
  //    旧代码: 永远返回 success: true, 即使 failed > 0 → 客户端以为全部成功
  //    修复: success: failed === 0
  return NextResponse.json({ success: failed === 0, logs, updated, failed, total: usersWithAgents.length });
}
